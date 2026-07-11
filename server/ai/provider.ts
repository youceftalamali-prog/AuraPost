import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { DatabaseManager } from "../db.ts";
import { AIProviderName, AIProviderConfig } from "../../src/types.ts";

export type { AIProviderName, AIProviderConfig };
export type AIWorkflow = "standard" | "advanced_reasoning" | "video" | "image";

export interface ProviderResponse {
  rawContent: string;
  provider: AIProviderName;
  modelUsed: string;
  tokensConsumed?: {
    prompt: number;
    completion: number;
  };
  latencyMs: number;
}

// Track failures for Circuit-Breaker
const providerFailures: Record<AIProviderName, { consecutive: number; lastFailureTime: number }> = {
  deepseek: { consecutive: 0, lastFailureTime: 0 },
  gemini: { consecutive: 0, lastFailureTime: 0 },
  openai: { consecutive: 0, lastFailureTime: 0 },
  claude: { consecutive: 0, lastFailureTime: 0 },
  flux: { consecutive: 0, lastFailureTime: 0 },
  gemini_images: { consecutive: 0, lastFailureTime: 0 },
  openai_images: { consecutive: 0, lastFailureTime: 0 },
  stability_ai: { consecutive: 0, lastFailureTime: 0 },
  kling: { consecutive: 0, lastFailureTime: 0 },
  veo: { consecutive: 0, lastFailureTime: 0 },
  runway: { consecutive: 0, lastFailureTime: 0 },
  pika: { consecutive: 0, lastFailureTime: 0 },
};
const BREAKER_RESET_MS = 120000; // 2 minutes

function markProviderSuccess(provider: AIProviderName): void {
  const state = providerFailures[provider];
  if (state) {
    state.consecutive = 0;
    state.lastFailureTime = 0;
  }
}

function markProviderFailure(provider: AIProviderName): void {
  const state = providerFailures[provider];
  if (state) {
    state.consecutive += 1;
    state.lastFailureTime = Date.now();
  }
}

function isProviderCircuitOpen(provider: AIProviderName): boolean {
  const state = providerFailures[provider];
  if (!state) return false;
  if (state.consecutive < 3) {
    return false;
  }
  return Date.now() - state.lastFailureTime < BREAKER_RESET_MS;
}

function isProviderConfigured(provider: AIProviderName): boolean {
  switch (provider) {
    case "deepseek":
      return Boolean(process.env.DEEPSEEK_API_KEY);
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "claude":
      return Boolean(process.env.CLAUDE_API_KEY);
    case "flux":
      return Boolean(process.env.FLUX_API_KEY);
    case "gemini_images":
      return Boolean(process.env.GEMINI_API_KEY);
    case "openai_images":
      return Boolean(process.env.OPENAI_API_KEY);
    case "stability_ai":
      return Boolean(process.env.STABILITY_API_KEY);
    case "kling":
      return Boolean(process.env.KLING_API_KEY);
    case "veo":
      return Boolean(process.env.VEO_API_KEY);
    case "runway":
      return Boolean(process.env.RUNWAY_API_KEY);
    case "pika":
      return Boolean(process.env.PIKA_API_KEY);
    default:
      return false;
  }
}

export class AIProviderService {
  private static getDefaultModel(provider: AIProviderName): string {
    switch (provider) {
      case "deepseek":
        return process.env.DEEPSEEK_MODEL || "deepseek-chat";
      case "gemini":
        return process.env.GEMINI_MODEL || "gemini-2.5-flash";
      case "openai":
        return process.env.OPENAI_MODEL || "gpt-4o-mini";
      case "claude":
        return "claude-3-5-sonnet-latest";
      case "flux":
        return "flux-1-schnell";
      case "gemini_images":
        return "imagen-3.0-generate-002";
      case "openai_images":
        return "dall-e-3";
      case "stability_ai":
        return "stable-diffusion-xl";
      case "kling":
        return "kling-v1.5";
      case "veo":
        return "veo-2";
      case "runway":
        return "gen-3-alpha";
      case "pika":
        return "pika-1.5";
      default:
        return "default-model";
    }
  }

  private static getBaseProviderOrder(workflow: AIWorkflow, preferred?: AIProviderName): AIProviderName[] {
    if (workflow === "image" || (preferred && ["flux", "gemini_images", "openai_images", "stability_ai"].includes(preferred))) {
      return ["flux", "gemini_images", "openai_images", "stability_ai"];
    }
    if (workflow === "video" || (preferred && ["kling", "veo", "runway", "pika"].includes(preferred))) {
      return ["kling", "veo", "runway", "pika"];
    }
    switch (workflow) {
      case "advanced_reasoning":
        return ["deepseek", "gemini", "openai", "claude"];
      case "standard":
      default:
        return ["deepseek", "gemini", "openai", "claude"];
    }
  }

  private static async resolveProviderOrderWithWorkspace(
    config: AIProviderConfig,
    workspaceId?: string
  ): Promise<AIProviderName[]> {
    const workflow = config.workflow || "standard";
    const db = await DatabaseManager.getInstance();
    
    let preferredProvider = config.preferredProvider;
    if (workspaceId && config.taskName) {
      try {
        const routing = await db.getAIRouting(workspaceId);
        if (routing && routing[config.taskName]) {
          preferredProvider = routing[config.taskName] as AIProviderName;
        }
      } catch (e) {
        console.warn("[AIProviderService] Error fetching custom routing:", e);
      }
    }

    const baseOrder = this.getBaseProviderOrder(workflow, preferredProvider);

    if (!preferredProvider) {
      return config.allowFallbacks === false ? [baseOrder[0]] : baseOrder;
    }

    const ordered = [
      preferredProvider,
      ...baseOrder.filter((provider) => provider !== preferredProvider),
    ];
    return config.allowFallbacks === false ? [ordered[0]] : ordered;
  }

  /**
   * Resolve the API key for a given provider.
   * Tries workspace-specific key first, then falls back to environment variable.
   */
  private static async getProviderApiKey(
    workspaceId: string | undefined,
    provider: AIProviderName,
    mustBeEnabled: boolean = true
  ): Promise<string | null> {
    if (workspaceId) {
      try {
        const db = await DatabaseManager.getInstance();
        const key = await db.getAIProviderApiKey(workspaceId, provider, mustBeEnabled);
        if (key) {
          return key;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[AIProviderService] Failed to fetch key from DB for ${provider}:`, message);
      }
    }

    // Fallback to environment variables
    switch (provider) {
      case "deepseek":
        return process.env.DEEPSEEK_API_KEY || null;
      case "gemini":
        return process.env.GEMINI_API_KEY || null;
      case "openai":
        return process.env.OPENAI_API_KEY || null;
      case "claude":
        return process.env.CLAUDE_API_KEY || null;
      case "flux":
        return process.env.FLUX_API_KEY || null;
      case "gemini_images":
        return process.env.GEMINI_API_KEY || process.env.GEMINI_IMAGES_API_KEY || null;
      case "openai_images":
        return process.env.OPENAI_API_KEY || process.env.OPENAI_IMAGES_API_KEY || null;
      case "stability_ai":
        return process.env.STABILITY_API_KEY || null;
      case "kling":
        return process.env.KLING_API_KEY || null;
      case "veo":
        return process.env.VEO_API_KEY || null;
      case "runway":
        return process.env.RUNWAY_API_KEY || null;
      case "pika":
        return process.env.PIKA_API_KEY || null;
      default:
        return null;
    }
  }

  private static async generateWithDeepSeek(
    prompt: string,
    systemInstruction: string,
    schemaDescription: string,
    modelUsed: string,
    temperature: number,
    start: number,
    apiKey: string
  ): Promise<ProviderResponse> {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    console.log(`[AI Provider Layer] Calling Primary Provider: DeepSeek (${modelUsed})`);

    const completion = await client.chat.completions.create({
      model: modelUsed,
      messages: [
        { role: "system", content: `${systemInstruction}\n\nSchema expectations:\n${schemaDescription}` },
        { role: "user", content: prompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    });

    return {
      rawContent: completion.choices[0]?.message?.content || "",
      provider: "deepseek",
      modelUsed,
      tokensConsumed: completion.usage
        ? {
            prompt: completion.usage.prompt_tokens,
            completion: completion.usage.completion_tokens,
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  }

  private static async generateWithGemini(
    prompt: string,
    systemInstruction: string,
    modelUsed: string,
    temperature: number,
    start: number,
    apiKey: string
  ): Promise<ProviderResponse> {
    const client = new GoogleGenAI({ apiKey });
    console.log(`[AI Provider Layer] Calling Fallback Provider: Gemini (${modelUsed})`);

    const response = await client.models.generateContent({
      model: modelUsed,
      contents: prompt,
      config: {
        systemInstruction,
        temperature,
        responseMimeType: "application/json",
      },
    });

    return {
      rawContent: response.text || "",
      provider: "gemini",
      modelUsed,
      tokensConsumed: response.usageMetadata
        ? {
            prompt: response.usageMetadata.promptTokenCount || 0,
            completion: response.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  }

  private static async generateWithOpenAI(
    prompt: string,
    systemInstruction: string,
    schemaDescription: string,
    modelUsed: string,
    temperature: number,
    start: number,
    apiKey: string
  ): Promise<ProviderResponse> {
    const client = new OpenAI({ apiKey });
    console.log(`[AI Provider Layer] Calling Fallback Provider: OpenAI (${modelUsed})`);

    const completion = await client.chat.completions.create({
      model: modelUsed,
      messages: [
        { role: "system", content: `${systemInstruction}\n\nSchema expectations:\n${schemaDescription}` },
        { role: "user", content: prompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    });

    return {
      rawContent: completion.choices[0]?.message?.content || "",
      provider: "openai",
      modelUsed,
      tokensConsumed: completion.usage
        ? {
            prompt: completion.usage.prompt_tokens,
            completion: completion.usage.completion_tokens,
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Run JSON generation with adaptive failover.
   * Standard commerce workflows default to DeepSeek -> Gemini -> OpenAI.
   * Advanced reasoning, video, and image workflows stay on Gemini/OpenAI.
   *
   * @param workspaceId Optional workspace ID to use database‑stored API key.
   *                    If omitted, falls back to environment variables.
   */
  public static async generateJSON<T>(
    prompt: string,
    systemInstruction: string,
    schemaDescription: string,
    config: AIProviderConfig = {},
    workspaceId?: string
  ): Promise<ProviderResponse> {
    const start = Date.now();
    const providerOrder = await this.resolveProviderOrderWithWorkspace(config, workspaceId);
    const temperature = config.temperature ?? 0.2;
    let lastError: unknown = null;

    for (let attemptIndex = 0; attemptIndex < providerOrder.length; attemptIndex++) {
      const providerName = providerOrder[attemptIndex];

      // Resolve API key (DB first, then environment)
      const apiKey = await this.getProviderApiKey(workspaceId, providerName);
      if (!apiKey) {
        console.warn(`[AI Provider Layer] Skipping ${providerName}: no API key available.`);
        continue;
      }

      if (isProviderCircuitOpen(providerName)) {
        console.warn(`[AI Provider Layer] Circuit-breaker active for ${providerName}. Skipping provider.`);
        continue;
      }

      const modelUsed = attemptIndex === 0 && config.modelName
        ? config.modelName
        : this.getDefaultModel(providerName);

      try {
        let response: ProviderResponse;
        if (providerName === "deepseek") {
          response = await this.generateWithDeepSeek(
            prompt,
            systemInstruction,
            schemaDescription,
            modelUsed,
            temperature,
            start,
            apiKey
          );
        } else if (providerName === "gemini") {
          response = await this.generateWithGemini(
            prompt,
            systemInstruction,
            modelUsed,
            temperature,
            start,
            apiKey
          );
        } else if (providerName === "openai") {
          response = await this.generateWithOpenAI(
            prompt,
            systemInstruction,
            schemaDescription,
            modelUsed,
            temperature,
            start,
            apiKey
          );
        } else {
          // Kling or other providers – not supported for generation in this version.
          throw new Error(`Provider ${providerName} is not supported for JSON generation.`);
        }

        markProviderSuccess(providerName);
        return response;
      } catch (err: unknown) {
        markProviderFailure(providerName);
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[AI Provider Layer] Error in generation with ${providerName}:`, message);
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("No configured AI providers were available for this request.");
  }

  /**
   * Safe JSON Parser & Healing Engine
   */
  public static cleanAndParseJSON<T>(rawContent: string): T {
    let sanitized = rawContent.trim();

    // 1. Remove markdown code fences if they wrap the content
    if (sanitized.startsWith("```")) {
      sanitized = sanitized.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    try {
      return JSON.parse(sanitized) as T;
    } catch (err) {
      console.warn(`[AI Provider Layer] Standard JSON parse failed. Running regex extract healing...`);

      // 2. Fallback Regex Extraction to pull the outer-most matching curly braces object
      const jsonRegex = /{[\s\S]*}/;
      const match = sanitized.match(jsonRegex);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch (innerErr) {
          console.error(`[AI Provider Layer] Regex extraction healing failed:`, innerErr);
        }
      }

      throw new Error(`Failed to parse AI output into valid JSON. Content was: ${rawContent.substring(0, 200)}...`);
    }
  }

  /**
   * Test the connection to a specific AI provider.
   * Returns success status, provider name, and a message.
   * Supports DeepSeek, OpenAI, Gemini, and Kling.
   */
  public static async testProviderConnection(
    workspaceId: string,
    provider: AIProviderName
  ): Promise<{ success: boolean; provider: AIProviderName; message: string }> {
    try {
      const apiKey = await this.getProviderApiKey(workspaceId, provider, false);
      if (!apiKey) {
        return {
          success: false,
          provider,
          message: `No API key found for ${provider}.`,
        };
      }

      let testFn: () => Promise<boolean>;

      switch (provider) {
        case "deepseek": {
          testFn = async () => {
            const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com/v1" });
            const res = await client.models.list();
            return res.data && res.data.length > 0;
          };
          break;
        }
        case "openai": {
          testFn = async () => {
            const client = new OpenAI({ apiKey });
            const res = await client.models.list();
            return res.data && res.data.length > 0;
          };
          break;
        }
        case "gemini": {
          testFn = async () => {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );
            return response.ok;
          };
          break;
        }
        case "claude": {
          testFn = async () => {
            // INTEGRITY FIX (Phase 2): previously only checked string shape/length rather than
            // actually verifying the key against Anthropic's API.
            const response = await fetch("https://api.anthropic.com/v1/models", {
              headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            });
            return response.ok;
          };
          break;
        }
        case "flux": {
          testFn = async () => {
            // INTEGRITY FIX (Phase 2): previously `return apiKey.length > 8` - no real
            // verification. Now makes a real, lightweight authenticated request to BFL.
            const response = await fetch("https://api.bfl.ai/v1/get_result?id=connection-test", {
              headers: { "X-Key": apiKey },
            });
            // BFL returns 404/400 for an unknown task id with a VALID key, and 401/403 with an invalid key.
            return response.status !== 401 && response.status !== 403;
          };
          break;
        }
        case "stability_ai": {
          testFn = async () => {
            const response = await fetch("https://api.stability.ai/v1/user/account", {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            return response.ok;
          };
          break;
        }
        case "gemini_images": {
          testFn = async () => {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );
            return response.ok;
          };
          break;
        }
        case "openai_images": {
          testFn = async () => {
            const client = new OpenAI({ apiKey });
            const res = await client.models.list();
            return res.data && res.data.length > 0;
          };
          break;
        }
        case "veo":
        case "runway":
        case "pika":
        case "kling": {
          testFn = async () => {
            // INTEGRITY FIX (Phase 2): these video providers have no real generation
            // integration yet (see Phase 3 of the Production Hardening Plan). We no longer
            // report a fake "connected" status for a key we cannot actually verify -
            // connection testing is explicitly unsupported until real integration exists.
            throw new Error(
              `Connection testing for '${provider}' is not yet supported: this provider has no real ` +
              `generation integration implemented (tracked in Phase 3 of the hardening plan).`
            );
          };
          break;
        }
        default:
          return {
            success: false,
            provider,
            message: `Unsupported provider: ${provider}`,
          };
      }

      const result = await testFn();
      if (result) {
        const customMsg = ["deepseek", "openai", "gemini"].includes(provider)
          ? `${provider} connection successful. Active and routing.`
          : `${provider} API key format validated and secure connection established.`;
        return { success: true, provider, message: customMsg };
      } else {
        return { success: false, provider, message: `${provider} connection test failed. Please verify API key.` };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        provider,
        message: `Connection test error: ${message}`,
      };
    }
  }
}