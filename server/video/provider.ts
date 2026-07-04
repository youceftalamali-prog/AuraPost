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

function getSampleVideoUrl(provider: VideoProviderName): string {
  const urls: Record<VideoProviderName, string> = {
    google_veo: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    runwayml: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    kling_ai: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    pika_labs: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  };
  return urls[provider];
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
    return true;
  }

  public getEstimatedRenderSeconds(request: VideoRenderRequest): number {
    return Math.max(18, Math.round(request.durationSeconds * 1.4));
  }

  public async render(request: VideoRenderRequest) {
    const scenes = buildScenes(request);
    return {
      videoUrl: getSampleVideoUrl(this.name),
      thumbnailUrl: getThumbnail(request),
      downloadUrl: getSampleVideoUrl(this.name),
      scenes,
    };
  }
}

class GoogleVeoProvider extends BaseVideoProvider {
  public name: VideoProviderName = "google_veo";
  public label = "Google Veo";
}

class RunwayProvider extends BaseVideoProvider {
  public name: VideoProviderName = "runwayml";
  public label = "RunwayML";
}

class KlingProvider extends BaseVideoProvider {
  public name: VideoProviderName = "kling_ai";
  public label = "Kling AI";
}

class PikaProvider extends BaseVideoProvider {
  public name: VideoProviderName = "pika_labs";
  public label = "Pika Labs";
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
