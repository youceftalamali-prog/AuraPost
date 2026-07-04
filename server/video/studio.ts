import {
  ContentGenerationRecord,
  NormalizedProduct,
  ProductAnalysis,
  ProviderHealthMetric,
  VideoGenerationRecord,
  VideoInputMode,
  VideoOutputType,
  VideoProviderName,
  VideoStudioAnalytics,
  VideoTemplateName,
} from "../../src/types.ts";
import { v4 as uuidv4 } from "uuid";
import { DatabaseManager } from "../db.ts";
import {
  completeVideoRender,
  getDefaultFallbackChain,
  getProviderByName,
  getVideoProviders,
} from "./provider.ts";

interface CreateVideoDraftInput {
  workspaceId: string;
  product: NormalizedProduct;
  analysis: ProductAnalysis | null;
  latestContent: ContentGenerationRecord | null;
  template: VideoTemplateName;
  outputType: VideoOutputType;
  inputMode: VideoInputMode;
  prompt: string;
  durationSeconds: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  provider?: VideoProviderName;
  sourceImageUrls: string[];
}

const TEMPLATE_TITLES: Record<VideoTemplateName, string> = {
  product_showcase: "Product Showcase",
  ugc_testimonial: "UGC Testimonial",
  problem_solution: "Problem / Solution",
  before_after: "Before / After",
  unboxing: "Unboxing",
  luxury_brand_ad: "Luxury Brand Ad",
  storytelling_ad: "Storytelling Ad",
};

function estimateCredits(durationSeconds: number, outputType: VideoOutputType): number {
  const base = outputType === "long_form_promotional" ? 20 : 10;
  return base + Math.max(0, Math.round(durationSeconds / 15));
}

function buildPromptSummary(input: CreateVideoDraftInput): string {
  const productLine = `${input.product.title} by ${input.product.vendor}`;
  const positioning = input.analysis?.brandIntelligence.brandPositioning.valueProposition || "";
  return `${productLine}. Template: ${TEMPLATE_TITLES[input.template]}. ${input.prompt}${positioning ? ` Positioning: ${positioning}.` : ""}`;
}

export async function createVideoDraft(
  db: DatabaseManager,
  input: CreateVideoDraftInput
): Promise<VideoGenerationRecord> {
  const fallbackChain = getDefaultFallbackChain();
  const primaryProvider = input.provider || fallbackChain[0];
  const provider = getProviderByName(primaryProvider);
  const estimatedRenderSeconds = provider.getEstimatedRenderSeconds({
    title: `${input.product.title} ${TEMPLATE_TITLES[input.template]}`,
    prompt: buildPromptSummary(input),
    template: input.template,
    outputType: input.outputType,
    inputMode: input.inputMode,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    sourceImageUrls: input.sourceImageUrls,
    product: input.product,
    analysis: input.analysis,
  });
  const creditsUsed = estimateCredits(input.durationSeconds, input.outputType);

  return db.saveVideoGeneration(input.workspaceId, input.product.id || "", {
    id: uuidv4(),
    productId: input.product.id || "",
    workspaceId: input.workspaceId,
    template: input.template,
    outputType: input.outputType,
    inputMode: input.inputMode,
    prompt: buildPromptSummary(input),
    provider: primaryProvider,
    providerFallbackChain: fallbackChain,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    status: "queued",
    progress: 5,
    creditsUsed,
    estimatedRenderSeconds,
    sourceGenerationId: input.latestContent?.id,
    sourceAnalysisId: input.analysis?.id,
    sourceImageUrls: input.sourceImageUrls,
    title: `${input.product.title} ${TEMPLATE_TITLES[input.template]}`,
    videoUrl: undefined,
    thumbnailUrl: input.sourceImageUrls[0],
    downloadUrl: undefined,
    errorMessage: undefined,
    scenes: [],
    completedAt: undefined,
  });
}

export async function processVideoQueue(
  db: DatabaseManager,
  workspaceId: string,
  productId?: string
): Promise<VideoGenerationRecord[]> {
  const items = db.getWorkspaceVideoGenerations(workspaceId, productId);
  const now = Date.now();

  for (const item of items) {
    if (item.status === "completed" || item.status === "failed") {
      continue;
    }

    const elapsedSeconds = Math.max(0, (now - new Date(item.createdAt).getTime()) / 1000);

    if (item.status === "queued" && elapsedSeconds >= 1) {
      db.updateVideoGeneration(workspaceId, item.id, {
        status: "rendering",
        progress: 20,
      });
      continue;
    }

    if (item.status === "rendering") {
      const progress = Math.min(95, Math.round((elapsedSeconds / Math.max(1, item.estimatedRenderSeconds)) * 100));
      db.updateVideoGeneration(workspaceId, item.id, {
        progress: Math.max(item.progress, progress),
      });

      if (elapsedSeconds >= item.estimatedRenderSeconds) {
        try {
          const result = await completeVideoRender(item, {
            title: item.title,
            prompt: item.prompt,
            template: item.template,
            outputType: item.outputType,
            inputMode: item.inputMode,
            aspectRatio: item.aspectRatio,
            durationSeconds: item.durationSeconds,
            sourceImageUrls: item.sourceImageUrls,
          });
          db.updateVideoGeneration(workspaceId, item.id, {
            provider: result.provider,
            status: "completed",
            progress: 100,
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            downloadUrl: result.downloadUrl,
            scenes: result.scenes,
            completedAt: new Date().toISOString(),
            errorMessage: undefined,
          });
          db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
        } catch (error: any) {
          db.updateVideoGeneration(workspaceId, item.id, {
            status: "failed",
            progress: item.progress,
            errorMessage: error.message || "AI video rendering failed.",
          });
          db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
        }
      }
    }
  }

  return db.getWorkspaceVideoGenerations(workspaceId, productId);
}

export async function renderQueuedVideo(
  db: DatabaseManager,
  workspaceId: string,
  videoId: string
): Promise<VideoGenerationRecord> {
  const item = db.getVideoGenerationById(workspaceId, videoId);
  if (!item) {
    throw new Error("AI video generation not found.");
  }

  if (item.status === "completed") {
    return item;
  }

  db.updateVideoGeneration(workspaceId, item.id, {
    status: "rendering",
    progress: Math.max(item.progress, 20),
  });

  try {
    const result = await completeVideoRender(item, {
      title: item.title,
      prompt: item.prompt,
      template: item.template,
      outputType: item.outputType,
      inputMode: item.inputMode,
      aspectRatio: item.aspectRatio,
      durationSeconds: item.durationSeconds,
      sourceImageUrls: item.sourceImageUrls,
    });
    const updated = db.updateVideoGeneration(workspaceId, item.id, {
      provider: result.provider,
      status: "completed",
      progress: 100,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      downloadUrl: result.downloadUrl,
      scenes: result.scenes,
      completedAt: new Date().toISOString(),
      errorMessage: undefined,
    });
    db.logAudit(workspaceId, "VIDEO_RENDER_COMPLETED", `Completed AI video render ${item.id} with ${result.provider}.`);
    if (!updated) {
      throw new Error("Failed to persist AI video completion.");
    }
    return updated;
  } catch (error: any) {
    db.updateVideoGeneration(workspaceId, item.id, {
      status: "failed",
      progress: item.progress,
      errorMessage: error.message || "AI video rendering failed.",
    });
    db.logAudit(workspaceId, "VIDEO_RENDER_FAILED", `Failed AI video render ${item.id}: ${error.message || "Unknown error"}`);
    throw error;
  }
}

export function buildVideoAnalytics(records: VideoGenerationRecord[]): VideoStudioAnalytics {
  const completed = records.filter((record) => record.status === "completed");
  const failed = records.filter((record) => record.status === "failed");
  const providerPerformance: ProviderHealthMetric[] = getVideoProviders().map((provider) => {
    const subset = records.filter((record) => record.provider === provider.name);
    const completedSubset = subset.filter((record) => record.status === "completed");
    const totalRenderTime = completedSubset.reduce((sum, record) => {
      const start = new Date(record.createdAt).getTime();
      const end = new Date(record.completedAt || record.updatedAt).getTime();
      return sum + Math.max(0, Math.round((end - start) / 1000));
    }, 0);

    return {
      provider: provider.name,
      status: subset.some((record) => record.status === "failed") ? "degraded" : "available",
      averageRenderTime: completedSubset.length > 0 ? Math.round(totalRenderTime / completedSubset.length) : 0,
      successRate: subset.length > 0 ? Math.round((completedSubset.length / subset.length) * 100) : 100,
      mode: provider.mode,
    };
  });

  const averageRenderTime = completed.length > 0
    ? Math.round(
        completed.reduce((sum, record) => {
          const start = new Date(record.createdAt).getTime();
          const end = new Date(record.completedAt || record.updatedAt).getTime();
          return sum + Math.max(0, Math.round((end - start) / 1000));
        }, 0) / completed.length
      )
    : 0;

  return {
    generatedVideos: records.length,
    completedVideos: completed.length,
    failedVideos: failed.length,
    averageRenderTime,
    creditsUsed: records.reduce((sum, record) => sum + record.creditsUsed, 0),
    providerPerformance,
  };
}
