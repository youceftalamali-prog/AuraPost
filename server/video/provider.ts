import {
  NormalizedProduct,
  ProductAnalysis,
  VideoAspectRatio,
  VideoGenerationRecord,
  VideoInputMode,
  VideoOutputType,
  VideoProviderName,
  VideoScene,
  VideoTemplateName,
} from "../../src/types.ts";

export interface VideoRenderRequest {
  title: string;
  prompt: string;
  template: VideoTemplateName;
  outputType: VideoOutputType;
  inputMode: VideoInputMode;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  sourceImageUrls: string[];
  product?: NormalizedProduct;
  analysis?: ProductAnalysis | null;
}

export interface VideoProvider {
  name: VideoProviderName;
  label: string;
  mode: "sandbox" | "live";
  isAvailable(): boolean;
  getEstimatedRenderSeconds(request: VideoRenderRequest): number;
  render(request: VideoRenderRequest): Promise<{
    videoUrl: string;
    thumbnailUrl?: string;
    downloadUrl: string;
    scenes: VideoScene[];
  }>;
}

function buildScenes(request: VideoRenderRequest): VideoScene[] {
  const hook = request.analysis?.creativeIntelligence.hooks[0] || "A bold opening line introduces the product.";
  const benefit = request.analysis?.marketingIntelligence.benefits[0] || "Highlight the strongest customer-facing benefit.";
  const proof = request.analysis?.brandIntelligence.brandPositioning.reasonToBelieve[0] || "Show a proof point that builds trust.";
  const cta = request.analysis?.brandIntelligence.brandPositioning.brandPromise || "End with a clear action-oriented close.";

  return [
    {
      title: "Hook",
      visual: request.sourceImageUrls[0] ? `Open with product image: ${request.sourceImageUrls[0]}` : "Open with bold branded motion graphics.",
      narration: hook,
      durationSeconds: Math.max(3, Math.round(request.durationSeconds * 0.2)),
    },
    {
      title: "Problem / Benefit",
      visual: "Show the core problem and transition into the product solution.",
      narration: benefit,
      durationSeconds: Math.max(4, Math.round(request.durationSeconds * 0.35)),
    },
    {
      title: "Proof",
      visual: "Display trust signals, social proof, or brand polish.",
      narration: proof,
      durationSeconds: Math.max(4, Math.round(request.durationSeconds * 0.25)),
    },
    {
      title: "CTA",
      visual: "Close with product hero shot and strong CTA card.",
      narration: cta,
      durationSeconds: Math.max(3, request.durationSeconds - (
        Math.max(3, Math.round(request.durationSeconds * 0.2))
        + Math.max(4, Math.round(request.durationSeconds * 0.35))
        + Math.max(4, Math.round(request.durationSeconds * 0.25))
      )),
    },
  ];
}

/**
 * PRODUCTION FIX (Phase 3): the previous implementation always returned one of four
 * hardcoded public Google demo-bucket stock videos, regardless of which provider was
 * selected or whether real API keys were configured. That function has been removed.
 * Each provider below now makes a real API call to its respective video-generation
 * service and fails with an honest error if it cannot.
 *
 * NOTE ON VERIFICATION: real end-to-end calls to Google Veo / RunwayML / Kling AI
 * could not be executed from the environment this fix was authored in (no outbound
 * network access to these vendor domains, no live API keys available). The request/
 * response shapes below are implemented against each vendor's published API
 * documentation and are type-checked, but they have NOT been exercised against a
 * live account. Before shipping, run a real end-to-end test against each vendor
 * with a valid API key (see TEST_RESULTS.md for the full disclosure).
 */

async function pollLongRunningOperation<T>(
  fetchStatus: () => Promise<{ done: boolean; result?: T; error?: string }>,
  timeoutMs: number,
  intervalMs: number = 4000
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await fetchStatus();
    if (status.error) {
      throw new Error(status.error);
    }
    if (status.done && status.result) {
      return status.result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Video generation timed out waiting for the provider to finish rendering.");
}

function getThumbnail(request: VideoRenderRequest): string | undefined {
  return request.sourceImageUrls[0];
}

abstract class BaseVideoProvider implements VideoProvider {
  public abstract name: VideoProviderName;
  public abstract label: string;
  public mode: "sandbox" | "live";

  constructor(mode: "sandbox" | "live") {
    this.mode = mode;
  }

  public isAvailable(): boolean {
    return this.getApiKey() !== undefined;
  }

  public getEstimatedRenderSeconds(request: VideoRenderRequest): number {
    return Math.max(18, Math.round(request.durationSeconds * 1.4));
  }

  protected abstract getApiKey(): string | undefined;

  public abstract render(request: VideoRenderRequest): Promise<{
    videoUrl: string;
    thumbnailUrl?: string;
    downloadUrl: string;
    scenes: VideoScene[];
  }>;

  protected requireApiKey(envVarName: string): string {
    const key = this.getApiKey();
    if (!key) {
      throw new Error(
        `Missing API key for ${this.label}. Please configure ${envVarName} (or a workspace-level ` +
        `key in AI Providers settings) to generate real ${this.label} videos.`
      );
    }
    return key;
  }
}

class GoogleVeoProvider extends BaseVideoProvider {
  public name: VideoProviderName = "google_veo";
  public label = "Google Veo";

  protected getApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  public async render(request: VideoRenderRequest) {
    const apiKey = this.requireApiKey("GEMINI_API_KEY");
    const scenes = buildScenes(request);

    // Google Veo is exposed through the Gemini API as a long-running video generation
    // operation. See https://ai.google.dev/gemini-api/docs/video
    const startResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: request.prompt }],
          parameters: { aspectRatio: request.aspectRatio, durationSeconds: request.durationSeconds },
        }),
      }
    );

    if (!startResponse.ok) {
      const errBody = await startResponse.text();
      throw new Error(`Google Veo request failed (HTTP ${startResponse.status}): ${errBody || startResponse.statusText}`);
    }

    const operation = await startResponse.json() as { name: string };

    const result = await pollLongRunningOperation<{ videoUrl: string }>(
      async () => {
        const pollResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${operation.name}?key=${apiKey}`
        );
        if (!pollResponse.ok) {
          return { done: false, error: `Google Veo polling failed (HTTP ${pollResponse.status}).` };
        }
        const pollJson = await pollResponse.json() as {
          done?: boolean;
          error?: { message?: string };
          response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
        };
        if (pollJson.error) {
          return { done: true, error: pollJson.error.message || "Google Veo generation failed." };
        }
        const uri = pollJson.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (pollJson.done && uri) {
          return { done: true, result: { videoUrl: uri } };
        }
        return { done: false };
      },
      180000
    );

    return {
      videoUrl: result.videoUrl,
      thumbnailUrl: getThumbnail(request),
      downloadUrl: result.videoUrl,
      scenes,
    };
  }
}

class RunwayProvider extends BaseVideoProvider {
  public name: VideoProviderName = "runwayml";
  public label = "RunwayML";

  protected getApiKey(): string | undefined {
    return process.env.RUNWAY_API_KEY;
  }

  public async render(request: VideoRenderRequest) {
    const apiKey = this.requireApiKey("RUNWAY_API_KEY");
    const scenes = buildScenes(request);

    // RunwayML Gen-3 Alpha Turbo image-to-video API.
    // See https://docs.dev.runwayml.com/
    const startResponse = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({
        promptImage: request.sourceImageUrls[0],
        promptText: request.prompt,
        model: "gen3a_turbo",
        duration: Math.min(10, Math.max(5, request.durationSeconds)),
        ratio: request.aspectRatio === "9:16" ? "768:1280" : "1280:768",
      }),
    });

    if (!startResponse.ok) {
      const errBody = await startResponse.text();
      throw new Error(`RunwayML request failed (HTTP ${startResponse.status}): ${errBody || startResponse.statusText}`);
    }

    const task = await startResponse.json() as { id: string };

    const result = await pollLongRunningOperation<{ videoUrl: string }>(
      async () => {
        const pollResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
          headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
        });
        if (!pollResponse.ok) {
          return { done: false, error: `RunwayML polling failed (HTTP ${pollResponse.status}).` };
        }
        const pollJson = await pollResponse.json() as { status: string; output?: string[]; failure?: string };
        if (pollJson.status === "FAILED") {
          return { done: true, error: pollJson.failure || "RunwayML generation failed." };
        }
        if (pollJson.status === "SUCCEEDED" && pollJson.output?.[0]) {
          return { done: true, result: { videoUrl: pollJson.output[0] } };
        }
        return { done: false };
      },
      180000
    );

    return {
      videoUrl: result.videoUrl,
      thumbnailUrl: getThumbnail(request),
      downloadUrl: result.videoUrl,
      scenes,
    };
  }
}

class KlingProvider extends BaseVideoProvider {
  public name: VideoProviderName = "kling_ai";
  public label = "Kling AI";

  protected getApiKey(): string | undefined {
    return process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY
      ? `${process.env.KLING_ACCESS_KEY}:${process.env.KLING_SECRET_KEY}`
      : undefined;
  }

  private async getBearerToken(): Promise<string> {
    // Kling AI authenticates via a short-lived JWT signed with the account's access/secret
    // key pair. See https://docs.qingque.cn/d/home/eZQCTS3vHOBAnHZKplHVGWG_Q (Kling API docs).
    const jwt = await import("jsonwebtoken");
    const accessKey = process.env.KLING_ACCESS_KEY as string;
    const secretKey = process.env.KLING_SECRET_KEY as string;
    return jwt.default.sign(
      { iss: accessKey, exp: Math.floor(Date.now() / 1000) + 1800, nbf: Math.floor(Date.now() / 1000) - 5 },
      secretKey,
      { algorithm: "HS256", header: { alg: "HS256", typ: "JWT" } }
    );
  }

  public async render(request: VideoRenderRequest) {
    this.requireApiKey("KLING_ACCESS_KEY / KLING_SECRET_KEY");
    const scenes = buildScenes(request);
    const token = await this.getBearerToken();

    const startResponse = await fetch("https://api.klingai.com/v1/videos/text2video", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: "kling-v1",
        prompt: request.prompt,
        duration: String(Math.min(10, Math.max(5, request.durationSeconds))),
        aspect_ratio: request.aspectRatio,
      }),
    });

    if (!startResponse.ok) {
      const errBody = await startResponse.text();
      throw new Error(`Kling AI request failed (HTTP ${startResponse.status}): ${errBody || startResponse.statusText}`);
    }

    const task = await startResponse.json() as { data: { task_id: string } };

    const result = await pollLongRunningOperation<{ videoUrl: string }>(
      async () => {
        const pollResponse = await fetch(`https://api.klingai.com/v1/videos/text2video/${task.data.task_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!pollResponse.ok) {
          return { done: false, error: `Kling AI polling failed (HTTP ${pollResponse.status}).` };
        }
        const pollJson = await pollResponse.json() as {
          data: { task_status: string; task_result?: { videos?: Array<{ url: string }> } };
        };
        if (pollJson.data.task_status === "failed") {
          return { done: true, error: "Kling AI generation failed." };
        }
        const url = pollJson.data.task_result?.videos?.[0]?.url;
        if (pollJson.data.task_status === "succeed" && url) {
          return { done: true, result: { videoUrl: url } };
        }
        return { done: false };
      },
      180000
    );

    return {
      videoUrl: result.videoUrl,
      thumbnailUrl: getThumbnail(request),
      downloadUrl: result.videoUrl,
      scenes,
    };
  }
}

class PikaProvider extends BaseVideoProvider {
  public name: VideoProviderName = "pika_labs";
  public label = "Pika Labs";

  protected getApiKey(): string | undefined {
    return process.env.PIKA_API_KEY;
  }

  public async render(_request: VideoRenderRequest): Promise<never> {
    // HONESTY FIX (Phase 3): Pika Labs does not currently expose a stable, publicly
    // documented generation API that this codebase can integrate against with
    // confidence. Rather than guess at an endpoint (which would risk silently calling
    // the wrong URL and either failing opaquely or, worse, appearing to "work" against
    // an unintended service), this provider is explicitly disabled until Pika's
    // official API is confirmed and integrated.
    throw new Error(
      "Pika Labs video generation is not currently supported: no verified public API integration exists yet. " +
      "Please select Google Veo, RunwayML, or Kling AI instead."
    );
  }
}

export function getVideoProviders(): VideoProvider[] {
  const liveMode = process.env.VIDEO_PROVIDER_LIVE === "true";
  const mode: "sandbox" | "live" = liveMode ? "live" : "sandbox";
  return [
    new GoogleVeoProvider(mode),
    new RunwayProvider(mode),
    new KlingProvider(mode),
    new PikaProvider(mode),
  ];
}

export function getProviderByName(name: VideoProviderName): VideoProvider {
  const provider = getVideoProviders().find((item) => item.name === name);
  if (!provider) {
    throw new Error(`Unknown video provider: ${name}`);
  }
  return provider;
}

export function getDefaultFallbackChain(): VideoProviderName[] {
  return ["google_veo", "runwayml", "kling_ai", "pika_labs"];
}

export async function completeVideoRender(
  record: VideoGenerationRecord,
  request: VideoRenderRequest
): Promise<{
  provider: VideoProviderName;
  videoUrl: string;
  thumbnailUrl?: string;
  downloadUrl: string;
  scenes: VideoScene[];
}> {
  let lastError: unknown = null;

  for (const providerName of record.providerFallbackChain) {
    try {
      const provider = getProviderByName(providerName);
      if (!provider.isAvailable()) {
        continue;
      }
      const result = await provider.render(request);
      return {
        provider: provider.name,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        downloadUrl: result.downloadUrl,
        scenes: result.scenes,
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw lastError || new Error("No video providers were available.");
}
