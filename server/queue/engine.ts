import { DatabaseManager } from "../db.ts";
import { ExtractorFactory } from "../extractors/factory.ts";
import { ContentGenerator } from "../ai/content-generator.ts";
import { ProductAnalyzer } from "../ai/analyzer.ts";
import { publishQueuedSocialPost } from "../social/queue.ts";
import { createVideoDraft, renderQueuedVideo } from "../video/studio.ts";
import {
  enqueueStoreSync,
  processShopifySyncQueue,
  queueShopifyAutomationTasks,
  refreshShopifyAccessToken,
} from "../shopify/live-sync.ts";
import {
  QueueJobKind,
  QueueJobRecord,
  QueueOverview,
  QueueWorkerName,
  WorkerHealthSnapshot,
} from "../../src/types.ts";

type WorkerHandler = (job: QueueJobRecord) => Promise<void>;

interface WorkerRuntimeState {
  processedJobs: number;
  failedJobs: number;
  averageProcessingTimeMs: number;
}

const WORKER_KINDS: Record<QueueWorkerName, QueueJobKind[]> = {
  "import-worker": ["product_import"],
  "shopify-worker": ["shopify_sync"],
  "content-worker": ["ai_content_generation"],
  "video-worker": ["ai_video_rendering"],
  "publishing-worker": ["social_publishing"],
  "automation-worker": ["automation_execution", "competitor_monitoring"],
};

const RETENTION_POLICY = {
  completedHours: 24,
  failedHours: 72,
  logsHours: 72,
};

export class QueueEngine {
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private tickInFlight = false;
  private cleanupInFlight = false;
  private readonly workerState = new Map<QueueWorkerName, WorkerRuntimeState>();

  constructor(private readonly db: DatabaseManager) {}

  private async hydrateWorkerState(): Promise<void> {
    const workers = await this.db.getQueueWorkers();
    workers.forEach((worker) => {
      this.workerState.set(worker.workerName, {
        processedJobs: worker.processedJobs,
        failedJobs: worker.failedJobs,
        averageProcessingTimeMs: worker.averageProcessingTimeMs,
      });
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.hydrateWorkerState();
    this.running = true;
    await this.seedWorkerHeartbeats();
    this.timers.push(setInterval(() => void this.runTick(), 1000));
    this.timers.push(setInterval(() => void this.runCleanup(), 5 * 60 * 1000));
  }

  public stop(): void {
    this.running = false;
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [];
  }

  public async getOverview(workspaceId?: string): Promise<QueueOverview> {
    return await this.db.getQueueOverview(workspaceId);
  }

  private async seedWorkerHeartbeats(): Promise<void> {
    for (const workerName of Object.keys(WORKER_KINDS) as QueueWorkerName[]) {
      await this.persistWorker(workerName, {
        status: "idle",
      });
    }
  }

  private async persistWorker(
    workerName: QueueWorkerName,
    patch: Partial<Omit<WorkerHealthSnapshot, "workerName" | "lastHeartbeatAt">> & { status: WorkerHealthSnapshot["status"] }
  ): Promise<void> {
    const state = this.workerState.get(workerName) || {
      processedJobs: 0,
      failedJobs: 0,
      averageProcessingTimeMs: 0,
    };
    const matchingJobs = await this.db.getQueueJobs(undefined, {
      statuses: ["pending", "queued", "retrying"],
      kinds: WORKER_KINDS[workerName],
      includeCompleted: true,
    });
    const queueLength = matchingJobs.length;
    await this.db.heartbeatWorker(workerName, {
      status: patch.status,
      activeJobId: patch.activeJobId,
      memoryUsageMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      queueLength,
      failedJobs: patch.failedJobs ?? state.failedJobs,
      processedJobs: patch.processedJobs ?? state.processedJobs,
      averageProcessingTimeMs: patch.averageProcessingTimeMs ?? state.averageProcessingTimeMs,
      lastHeartbeatAt: new Date().toISOString(),
    });
  }

  private async runTick(): Promise<void> {
    if (!this.running || this.tickInFlight) {
      return;
    }
    this.tickInFlight = true;
    try {
      await this.scheduleRecurringJobs();
      for (const workerName of Object.keys(WORKER_KINDS) as QueueWorkerName[]) {
        await this.processWorker(workerName);
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.cleanupInFlight) {
      return;
    }
    this.cleanupInFlight = true;
    try {
      await this.db.cleanupQueueRecords(
        RETENTION_POLICY.completedHours,
        RETENTION_POLICY.failedHours,
        RETENTION_POLICY.logsHours
      );
    } finally {
      this.cleanupInFlight = false;
    }
  }

  private async scheduleRecurringJobs(): Promise<void> {
    const activeReferenceJobs = await this.db.getQueueJobs(undefined, {
      statuses: ["pending", "queued", "retrying", "processing"],
      includeCompleted: true,
    });

    for (const workspace of await this.db.getAllWorkspaces()) {
      const allSocialPosts = await this.db.getSocialPosts(workspace.id, { includeAll: true });
      const scheduledPosts = allSocialPosts.filter((post) =>
        post.status === "scheduled"
        && post.scheduledAt
        && new Date(post.scheduledAt).getTime() <= Date.now()
      );

      for (const post of scheduledPosts) {
        const existing = activeReferenceJobs.find((job) =>
          job.kind === "social_publishing"
          && job.referenceId === post.id
        );
        if (!existing) {
          await this.db.enqueueQueueJob(workspace.id, {
            kind: "social_publishing",
            workerName: "publishing-worker",
            referenceId: post.id,
            payload: {
              postId: post.id,
              workspaceId: workspace.id,
            },
            priority: 9,
            maxAttempts: 4,
            backoffMs: 2000,
          });
        }
      }

      const allStores = await this.db.getShopifyStores(workspace.id);
      const connectedStores = allStores.filter((item) => item.status === "connected");
      for (const store of connectedStores) {
        const settings = await this.db.getShopifyAutomationSettings(workspace.id, store.id);
        if (!settings?.autoSyncEveryHour) {
          continue;
        }
        const last = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;
        if (Date.now() - last < 60 * 60 * 1000) {
          continue;
        }
        const existing = activeReferenceJobs.find((job) =>
          job.kind === "automation_execution"
          && job.referenceId === `auto-sync:${store.id}`
          && (job.status === "pending" || job.status === "queued" || job.status === "retrying" || job.status === "processing")
        );
        if (existing) {
          continue;
        }
        await this.db.saveShopifyAutomationSettings(workspace.id, store.id, {
          lastAutoSyncAt: new Date().toISOString(),
        });
        await this.db.enqueueQueueJob(workspace.id, {
          kind: "automation_execution",
          workerName: "automation-worker",
          referenceId: `auto-sync:${store.id}`,
          payload: {
            action: "auto_sync",
            storeId: store.id,
            workspaceId: workspace.id,
            detail: `Hourly automated sync scheduled for ${store.shopDomain}.`,
          },
          priority: 8,
          maxAttempts: 3,
          backoffMs: 5000,
        });
      }
    }
  }

  private async processWorker(workerName: QueueWorkerName): Promise<void> {
    const job = await this.db.claimNextQueueJob(workerName, WORKER_KINDS[workerName]);
    if (!job) {
      await this.persistWorker(workerName, { status: "idle" });
      return;
    }

    const started = Date.now();
    await this.persistWorker(workerName, { status: "running", activeJobId: job.id });

    try {
      await this.executeJob(job);
      const elapsed = Date.now() - started;
      const state = this.updateWorkerState(workerName, elapsed, false);
      await this.db.updateQueueJob(job.id, {
        status: "completed",
        lockedAt: undefined,
        lastError: undefined,
        processingTimeMs: elapsed,
        completedAt: new Date().toISOString(),
      });
      await this.db.addQueueJobLog(job.workspaceId, job.id, workerName, "completed", `Completed ${job.kind} job in ${elapsed}ms.`);
      await this.persistWorker(workerName, {
        status: "idle",
        activeJobId: undefined,
        processedJobs: state.processedJobs,
        failedJobs: state.failedJobs,
        averageProcessingTimeMs: state.averageProcessingTimeMs,
      });
    } catch (error: any) {
      const elapsed = Date.now() - started;
      const state = this.updateWorkerState(workerName, elapsed, true);
      const latest = await this.db.getQueueJobById(job.id) || job;
      const attemptsUsed = latest.attemptCount;
      const message = error?.message || "Queue worker execution failed.";

      if (attemptsUsed < latest.maxAttempts) {
        const nextBackoff = latest.backoffMs * Math.pow(2, Math.max(0, attemptsUsed - 1));
        await this.db.updateQueueJob(job.id, {
          status: "retrying",
          lockedAt: undefined,
          lastError: message,
          processingTimeMs: elapsed,
          nextRunAt: new Date(Date.now() + nextBackoff).toISOString(),
        });
        await this.db.addQueueJobLog(job.workspaceId, job.id, workerName, "retrying", `Retrying in ${nextBackoff}ms: ${message}`);
      } else {
        await this.db.moveQueueJobToDeadLetter(job.id, message);
        if (job.kind === "product_import" && job.payload && typeof job.payload === "object" && "operationId" in job.payload) {
          const opId = String(job.payload.operationId);
          const extractorName = (job.payload as any).extractor || "Unknown";
          const fullError = `[${extractorName}] ${message}`;
          await this.db.completeImportFailure(opId, job.workspaceId, fullError);
        }
      }

      await this.persistWorker(workerName, {
        status: "idle",
        activeJobId: undefined,
        processedJobs: state.processedJobs,
        failedJobs: state.failedJobs,
        averageProcessingTimeMs: state.averageProcessingTimeMs,
      });
    }
  }

  private updateWorkerState(workerName: QueueWorkerName, elapsedMs: number, failed: boolean): WorkerRuntimeState {
    const current = this.workerState.get(workerName) || {
      processedJobs: 0,
      failedJobs: 0,
      averageProcessingTimeMs: 0,
    };
    const processedJobs = current.processedJobs + 1;
    const averageProcessingTimeMs = current.averageProcessingTimeMs === 0
      ? elapsedMs
      : Math.round(((current.averageProcessingTimeMs * current.processedJobs) + elapsedMs) / processedJobs);
    const next = {
      processedJobs,
      failedJobs: current.failedJobs + (failed ? 1 : 0),
      averageProcessingTimeMs,
    };
    this.workerState.set(workerName, next);
    return next;
  }

  private async executeJob(job: QueueJobRecord): Promise<void> {
    const handlers: Record<QueueJobKind, WorkerHandler> = {
      product_import: async (queuedJob) => this.handleProductImport(queuedJob),
      shopify_sync: async (queuedJob) => this.handleShopifySync(queuedJob),
      ai_content_generation: async (queuedJob) => this.handleContentGeneration(queuedJob),
      ai_video_rendering: async (queuedJob) => this.handleVideoRendering(queuedJob),
      social_publishing: async (queuedJob) => this.handleSocialPublishing(queuedJob),
      automation_execution: async (queuedJob) => this.handleAutomationExecution(queuedJob),
      competitor_monitoring: async (queuedJob) => this.handleCompetitorMonitoring(queuedJob),
    };
    await handlers[job.kind](job);
  }

  private async handleProductImport(job: QueueJobRecord): Promise<void> {
    const { url, customPrompt, rawHtml, operationId, extractor: extractorName } = job.payload as {
      url: string;
      customPrompt?: string;
      rawHtml?: string;
      operationId: string;
      extractor?: string;
    };
    const extractor = ExtractorFactory.getExtractor(url);
    const provider = extractor.providerName;
    const start = Date.now();
    try {
      const extractedProduct = await extractor.extract(url, rawHtml, customPrompt);
      const { isValid, errors } = extractor.validate(extractedProduct);
      if (!isValid) {
        throw new Error(`Data schema validation failed: [${errors.join(", ")}]`);
      }
      const elapsed = Date.now() - start;
      
      const dbSaveStart = Date.now();
      const productWithId = await this.db.completeImportSuccess(operationId, job.workspaceId, extractedProduct, elapsed);
      const dbSaveMs = Date.now() - dbSaveStart;

      let telemetryObj = {
        urlDetection: 0.0,
        jsonFetch: 0.0,
        imageDownload: 0.0,
        variantExtraction: 0.0,
        descriptionExtraction: 0.0,
        databaseSave: 0.0,
        aiAnalysis: 0.0,
        brandIntelligence: 0.0,
        navigationToCatalog: 0.0
      };

      if (extractedProduct.telemetry) {
        try {
          telemetryObj = { ...telemetryObj, ...JSON.parse(extractedProduct.telemetry) };
        } catch (e) {
          console.error("Failed to parse extractedProduct telemetry:", e);
        }
      }

      telemetryObj.databaseSave = Number((dbSaveMs / 1000).toFixed(3));
      
      // Explicitly separate/exclude automatic AI analysis and brand intelligence during standard import flow
      telemetryObj.aiAnalysis = 0.0;
      telemetryObj.brandIntelligence = 0.0;
      telemetryObj.navigationToCatalog = 0.0;

      const telemetryStr = JSON.stringify(telemetryObj);
      await this.db.updateImportOperationTelemetry(operationId, telemetryStr);

    } catch (error: any) {
      const elapsed = Date.now() - start;
      const errorMsg = `[${provider}] ${error.message || "Unknown extraction error"}`;
      await this.db.completeImportFailure(operationId, job.workspaceId, errorMsg, elapsed);
      throw error;
    }
  }

  private async handleShopifySync(job: QueueJobRecord): Promise<void> {
    const { storeId } = job.payload as { storeId: string };
    await processShopifySyncQueue(this.db, job.workspaceId, storeId, {
      scheduleAutomations: false,
      enqueueAutomationTask: async (task) => {
        await this.db.enqueueQueueJob(job.workspaceId, {
          kind: "automation_execution",
          workerName: "automation-worker",
          referenceId: `${task.action}:${task.storeId}:${task.productId || "store"}`,
          payload: {
            workspaceId: job.workspaceId,
            ...task,
          },
          priority: 7,
          maxAttempts: 3,
          backoffMs: 2000,
        });
      },
    });
  }

  private async handleContentGeneration(job: QueueJobRecord): Promise<void> {
    const { productId, contentType = "package", languageCode = "en", creditsRequired } = job.payload as {
      productId: string;
      contentType: "hooks" | "scripts" | "package";
      languageCode?: string;
      creditsRequired: number;
    };
    const workspaceProducts = await this.db.getProducts(job.workspaceId);
    const product = workspaceProducts.find((item) => item.id === productId);
    if (!product) {
      throw new Error("Product not found or access denied.");
    }
    const analysis = await this.db.getLatestProductAnalysis(productId);
    const payload = await ContentGenerator.generate(product, analysis, contentType, languageCode);
    await this.db.saveContentGeneration(productId, job.workspaceId, contentType, creditsRequired, payload);
  }

  private async handleVideoRendering(job: QueueJobRecord): Promise<void> {
    const { generationId } = job.payload as { generationId: string };
    await renderQueuedVideo(this.db, job.workspaceId, generationId);
  }

  private async handleSocialPublishing(job: QueueJobRecord): Promise<void> {
    const { postId } = job.payload as { postId: string };
    await publishQueuedSocialPost(this.db, job.workspaceId, postId);
  }

  private async handleAutomationExecution(job: QueueJobRecord): Promise<void> {
    const { action, storeId, productId, detail } = job.payload as {
      action: "auto_sync" | "auto_publish_generated_content" | "auto_create_social_posts" | "auto_generate_videos" | "auto_competitor_monitoring";
      storeId: string;
      productId?: string;
      detail: string;
    };

    if (action === "auto_sync") {
      await refreshShopifyAccessToken(this.db, job.workspaceId, storeId);
      const syncJobs = await enqueueStoreSync(this.db, job.workspaceId, storeId);
      for (const syncJob of syncJobs) {
        await this.db.enqueueQueueJob(job.workspaceId, {
          kind: "shopify_sync",
          workerName: "shopify-worker",
          referenceId: syncJob.id,
          payload: {
            workspaceId: job.workspaceId,
            storeId,
          },
          priority: 8,
          maxAttempts: 4,
          backoffMs: 2000,
        });
      }
      await this.db.saveShopifyAutomationRun(job.workspaceId, storeId, "auto_sync", "completed", detail);
      return;
    }

    if (!productId) {
      throw new Error("Automation productId is required.");
    }

    const workspaceProducts = await this.db.getProducts(job.workspaceId);
    const product = workspaceProducts.find((item) => item.id === productId);
    if (!product) {
      throw new Error("Automation product not found.");
    }

    const latestContent = await this.db.getLatestContentGeneration(productId);
    const latestAnalysis = await this.db.getLatestProductAnalysis(productId);

    if (action === "auto_publish_generated_content") {
      const status = latestContent ? "completed" : "failed";
      await this.db.saveShopifyAutomationRun(job.workspaceId, storeId, action, status, detail, productId);
      if (!latestContent) {
        throw new Error("No generated content available for auto publish.");
      }
      return;
    }

    if (action === "auto_create_social_posts") {
      await this.db.saveSocialPosts(job.workspaceId, productId, [
        {
          platform: "instagram",
          title: `${product.title} Social Launch`,
          caption: `Freshly synced from Shopify: ${product.title}. ${detail}`,
          hashtags: ["#shopify", "#productlaunch", "#socialautomation"],
          mediaUrls: [product.images, ...product.gallery].filter(Boolean).slice(0, 2),
          status: "draft",
          previewText: `${product.title} social launch draft`,
          sourceType: "queue_automation",
          sourceGenerationId: latestContent?.id,
        },
      ]);
      await this.db.saveShopifyAutomationRun(job.workspaceId, storeId, action, "completed", detail, productId);
      return;
    }

    if (action === "auto_generate_videos") {
      const draft = await createVideoDraft(this.db, {
        workspaceId: job.workspaceId,
        product,
        analysis: latestAnalysis,
        latestContent,
        template: "product_showcase",
        outputType: "short_form_vertical",
        inputMode: "product_images",
        prompt: detail,
        durationSeconds: 20,
        aspectRatio: "9:16",
        sourceImageUrls: [product.images, ...product.gallery].filter(Boolean),
      });
      await this.db.enqueueQueueJob(job.workspaceId, {
        kind: "ai_video_rendering",
        workerName: "video-worker",
        referenceId: draft.id,
        payload: {
          workspaceId: job.workspaceId,
          generationId: draft.id,
        },
        priority: 8,
        maxAttempts: 4,
        backoffMs: 2500,
      });
      await this.db.saveShopifyAutomationRun(job.workspaceId, storeId, action, "completed", detail, productId);
      return;
    }

    if (action === "auto_competitor_monitoring") {
      await this.db.enqueueQueueJob(job.workspaceId, {
        kind: "competitor_monitoring",
        workerName: "automation-worker",
        referenceId: productId,
        payload: {
          workspaceId: job.workspaceId,
          productId,
          storeId,
          detail,
        },
        priority: 6,
        maxAttempts: 3,
        backoffMs: 5000,
      });
      await this.db.saveShopifyAutomationRun(job.workspaceId, storeId, action, "completed", detail, productId);
    }
  }

  private async handleCompetitorMonitoring(job: QueueJobRecord): Promise<void> {
    const { productId, storeId, detail } = job.payload as {
      productId: string;
      storeId?: string;
      detail?: string;
    };
    const workspaceProducts = await this.db.getProducts(job.workspaceId);
    const product = workspaceProducts.find((item) => item.id === productId);
    if (!product) {
      throw new Error("Competitor monitoring product not found.");
    }
    await ProductAnalyzer.analyze(product, "en", job.workspaceId);
    if (storeId) {
      await this.db.saveShopifyAutomationRun(
        job.workspaceId,
        storeId,
        "auto_competitor_monitoring",
        "completed",
        detail || `Completed competitor monitoring refresh for ${product.title}.`,
        productId
      );
    }
  }
}