# Diff: server.ts

```diff
--- original_reference/server.ts	2026-07-06 18:23:36.000000000 +0000
+++ audit/server.ts	2026-07-11 12:35:49.455427919 +0000
@@ -9,6 +9,17 @@
 import { buildAdvancedAnalyticsPayload } from "./server/analytics/dashboard.ts";
 import { createCheckoutSession, createCustomerPortalSession, constructStripeWebhookEvent, getStripeMode } from "./server/billing/stripe.ts";
 import {
+  createPayPalSubscription,
+  createPayPalCreditPurchaseOrder,
+  capturePayPalOrder,
+  cancelPayPalSubscription,
+  verifyPayPalWebhookSignature,
+  isPayPalTransmissionTimeFresh,
+  getPayPalCreditPack,
+  getPayPalMode,
+  PAYPAL_CREDIT_PACKS,
+} from "./server/billing/paypal.ts";
+import {
   completeShopifyOAuth,
   enqueueStoreSync,
   handleShopifyWebhook,
@@ -41,13 +52,53 @@
 import { getBillingPlan } from "./server/billing/plans.ts";
 import authRouter from "./server/identity/routes/auth.routes.ts";
 import { ImageStudioService } from "./server/ai/image-studio.ts";
+import { requireAuth, requireAuthAndWorkspace } from "./server/core/middleware/AuthMiddleware.ts";
+import { buildHelmetMiddleware, buildCorsMiddleware, authRateLimiter, apiRateLimiter, aiGenerationRateLimiter, webhookRateLimiter } from "./server/core/middleware/SecurityMiddleware.ts";
+import { verifyShopifyWebhookHmac } from "./server/shopify/webhook-security.ts";
+import { logger, initSentry, captureException } from "./server/core/observability/logger.ts";
+import pinoHttp from "pino-http";
 
 async function startServer() {
   const app = express();
   const PORT = 3000;
 
+  await initSentry();
+
+  // PHASE 5 (Observability): structured request logging with automatic redaction
+  // of sensitive headers/fields (see server/core/observability/logger.ts).
+  app.use(pinoHttp({
+    logger,
+    autoLogging: {
+      ignore: (req) => req.url === "/api/health" || req.url === "/api/ready",
+    },
+    customProps: () => ({ service: "aurapost-api" }),
+  }));
+
+  // SECURITY HARDENING (Phase 1): secure headers, CORS allowlist, and global rate limiting.
+  app.use(buildHelmetMiddleware());
+  app.use(buildCorsMiddleware());
+  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
+    if (err && typeof err.message === "string" && err.message.startsWith("CORS:")) {
+      return res.status(403).json({ error: err.message });
+    }
+    return next(err);
+  });
+  app.use(apiRateLimiter);
+
+  // Higher body-size limit for the specific routes that legitimately carry base64 image
+  // payloads. Must be mounted BEFORE the global stricter parser below, since body-parser
+  // skips re-parsing a request whose body has already been parsed.
+  const imageBodyParser = express.json({
+    limit: "50mb",
+    verify: (req, _res, buf) => {
+      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
+    },
+  });
+  app.use("/api/images", imageBodyParser);
+
   // Middleware
   app.use(express.json({
+    limit: "1mb", // SECURITY FIX: previously unbounded default JSON body size on most routes
     verify: (req, _res, buf) => {
       (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
     },
@@ -77,13 +128,13 @@
     "storytelling_ad",
   ];
 
-  const sendInsufficientCredits = (
+  const sendInsufficientCredits = async (
     res: express.Response,
     workspaceId: string,
     bucket: CreditBucketName,
     requiredCredits: number
   ) => {
-    const workspace = db.getWorkspace(workspaceId);
+    const workspace = await db.getWorkspace(workspaceId);
     const availableCredits = workspace?.creditPools?.[bucket].balance || 0;
     const plan = workspace?.plan || "free";
     return res.status(402).json({
@@ -164,7 +215,7 @@
     return suggestions;
   };
 
-  const enqueueQueueJob = (
+  const enqueueQueueJob = async (
     workspaceId: string,
     kind: QueueJobKind,
     referenceId: string | undefined,
@@ -175,7 +226,7 @@
       maxAttempts?: number;
       backoffMs?: number;
     }
-  ) => db.enqueueQueueJob(workspaceId, {
+  ) => await db.enqueueQueueJob(workspaceId, {
     kind,
     workerName: options.workerName,
     referenceId,
@@ -185,28 +236,41 @@
     backoffMs: options.backoffMs,
   });
 
-  const recordBillingSuccess = (
+  const recordBillingSuccess = async (
     workspaceId: string,
     plan: SubscriptionPlanName,
     interval: SubscriptionInterval,
     source: string,
     stripeInvoiceId?: string,
-    stripePaymentIntentId?: string
+    stripePaymentIntentId?: string,
+    paypalOrderId?: string,
+    paypalCaptureId?: string
   ) => {
     const planPrice = interval === "yearly" ? getBillingPlan(plan).yearlyPrice : getBillingPlan(plan).monthlyPrice;
-    const subscription = db.getWorkspaceSubscription(workspaceId);
-    const invoice = db.createBillingInvoice(workspaceId, {
+    const subscription = await db.getWorkspaceSubscription(workspaceId);
+    const paymentProvider: "paypal" | "stripe" = paypalOrderId || paypalCaptureId ? "paypal" : "stripe";
+    const invoice = await db.createBillingInvoice(workspaceId, {
       subscriptionId: subscription?.id,
+      paymentProvider,
       stripeInvoiceId,
+      paypalOrderId,
+      paypalCaptureId,
       amountPaid: planPrice,
       currency: "USD",
       status: "paid",
-      hostedInvoiceUrl: `https://billing.stripe.com/invoices/${stripeInvoiceId || `sandbox-${Date.now()}`}`,
-      invoicePdfUrl: `https://billing.stripe.com/invoices/${stripeInvoiceId || `sandbox-${Date.now()}`}/pdf`,
+      hostedInvoiceUrl: paymentProvider === "paypal"
+        ? `https://www.paypal.com/activity/payment/${paypalCaptureId || paypalOrderId || `sandbox-${Date.now()}`}`
+        : `https://billing.stripe.com/invoices/${stripeInvoiceId || `sandbox-${Date.now()}`}`,
+      invoicePdfUrl: paymentProvider === "paypal"
+        ? `https://www.paypal.com/activity/payment/${paypalCaptureId || paypalOrderId || `sandbox-${Date.now()}`}`
+        : `https://billing.stripe.com/invoices/${stripeInvoiceId || `sandbox-${Date.now()}`}/pdf`,
     });
-    db.createPaymentHistoryItem(workspaceId, {
+    await db.createPaymentHistoryItem(workspaceId, {
       invoiceId: invoice.id,
+      paymentProvider,
       stripePaymentIntentId,
+      paypalOrderId,
+      paypalCaptureId,
       amount: planPrice,
       currency: "USD",
       status: "paid",
@@ -215,41 +279,55 @@
     });
   };
 
-  const activatePlan = (
+  const activatePlan = async (
     workspaceId: string,
     plan: SubscriptionPlanName,
     interval: SubscriptionInterval,
     options: {
       status?: SubscriptionStatus;
+      paymentProvider?: "paypal" | "stripe";
       stripeMode?: "sandbox" | "live";
       stripeCustomerId?: string;
       stripeSubscriptionId?: string;
       stripeCheckoutSessionId?: string;
+      paypalMode?: "sandbox" | "live";
+      paypalSubscriptionId?: string;
+      paypalPlanId?: string;
+      paypalPayerId?: string;
       reason: string;
       recordPayment?: boolean;
       stripeInvoiceId?: string;
       stripePaymentIntentId?: string;
+      paypalOrderId?: string;
+      paypalCaptureId?: string;
     }
   ) => {
     const status = options.status || (plan === "free" ? "trialing" : "active");
-    const subscription = db.changeSubscriptionPlan(workspaceId, {
+    const subscription = await db.changeSubscriptionPlan(workspaceId, {
       plan,
       billingInterval: interval,
       status,
+      paymentProvider: options.paymentProvider,
       stripeMode: options.stripeMode,
       stripeCustomerId: options.stripeCustomerId,
       stripeSubscriptionId: options.stripeSubscriptionId,
       stripeCheckoutSessionId: options.stripeCheckoutSessionId,
+      paypalMode: options.paypalMode,
+      paypalSubscriptionId: options.paypalSubscriptionId,
+      paypalPlanId: options.paypalPlanId,
+      paypalPayerId: options.paypalPayerId,
       reason: options.reason,
     });
     if (options.recordPayment && plan !== "free") {
-      recordBillingSuccess(
+      await recordBillingSuccess(
         workspaceId,
         plan,
         interval,
-        subscription.stripeMode === "live" ? "stripe" : "sandbox",
+        subscription.paymentProvider === "paypal" ? "paypal" : (subscription.stripeMode === "live" ? "stripe" : "sandbox"),
         options.stripeInvoiceId,
-        options.stripePaymentIntentId
+        options.stripePaymentIntentId,
+        options.paypalOrderId,
+        options.paypalCaptureId
       );
     }
     return subscription;
@@ -258,18 +336,54 @@
   // --- API Routes ---
 
 
-  // Auth routes
-  app.use("/api/auth", authRouter);
+  // Auth routes (public: login/register/refresh/forgot-password)
+  app.use("/api/auth", authRateLimiter, authRouter);
 
-  // Health check endpoint
-  app.get("/api/health", (req, res) => {
+  // Health check endpoint (public) - process liveness only, no dependency checks.
+  app.get("/api/health", async (req, res) => {
     res.json({ status: "ok", testMode: process.env.TEST_MODE === "true" });
   });
 
+  // PHASE 5 (Observability): readiness check - verifies the database is actually
+  // reachable/queryable, distinct from the liveness-only /api/health above.
+  // Load balancers / orchestrators should route traffic based on this endpoint.
+  app.get("/api/ready", async (req, res) => {
+    try {
+      const dbInstance = await DatabaseManager.getInstance();
+      // Cheap real query to confirm the database connection/file is actually usable.
+      await dbInstance.getWorkspace("default-workspace");
+      res.json({ status: "ready", checks: { database: "ok" } });
+    } catch (err: any) {
+      logger.error({ err }, "Readiness check failed: database unreachable");
+      res.status(503).json({ status: "not_ready", checks: { database: "failed" }, error: err?.message });
+    }
+  });
+
+  // SECURITY FIX (Phase 1 — Critical Issue #1): every remaining /api/* route
+  // now requires a valid JWT and verified workspace membership. Only truly
+  // public integration webhooks (verified by their own external signature
+  // schemes, not a user session) are excluded here.
+  const PUBLIC_WEBHOOK_PATHS = [
+    "/api/billing/stripe/webhook",
+    "/api/billing/paypal/webhook", // PayPal webhook - verified by PayPal's own transmission signature, not a user session
+    "/api/auth/meta/callback", // Meta OAuth redirect target - carries its own state/code verification
+  ];
+  app.use("/api", (req, res, next) => {
+    const isPublicWebhook = PUBLIC_WEBHOOK_PATHS.some((p) => req.path === p || req.originalUrl.startsWith(p));
+    if (isPublicWebhook || req.path.startsWith("/shopify/webhooks/")) {
+      return next();
+    }
+    const [authMiddleware, workspaceMiddleware] = requireAuthAndWorkspace();
+    authMiddleware(req as any, res, (err?: any) => {
+      if (err) return next(err);
+      workspaceMiddleware(req as any, res, next);
+    });
+  });
+
   // 1. Get workspace details
-  app.get("/api/workspace", (req, res) => {
+  app.get("/api/workspace", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const ws = db.getWorkspace(workspaceId);
+    const ws = await db.getWorkspace(workspaceId);
     if (!ws) {
       res.status(404).json({ error: "Workspace not found" });
     } else {
@@ -277,35 +391,44 @@
     }
   });
 
-  app.get("/api/billing/overview", (req, res) => {
+  app.get("/api/billing/overview", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     try {
-      return res.json(db.getBillingOverview(workspaceId));
+      return res.json(await db.getBillingOverview(workspaceId));
     } catch (err: any) {
       return res.status(404).json({ error: err.message || "Billing overview not found." });
     }
   });
 
-  app.get("/api/billing/analytics", (_req, res) => {
-    return res.json(db.getBillingAnalytics());
+  app.get("/api/billing/analytics", async (_req, res) => {
+    return res.json(await db.getBillingAnalytics());
+  });
+
+  app.get("/api/billing/paypal/credit-packs", async (_req, res) => {
+    return res.json({ packs: PAYPAL_CREDIT_PACKS, mode: getPayPalMode() });
   });
 
-  app.get("/api/shopify/overview", (req, res) => {
+  app.get("/api/shopify/overview", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     try {
-      return res.json(db.getShopifySyncOverview(workspaceId));
+      return res.json(await db.getShopifySyncOverview(workspaceId));
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to load Shopify overview." });
     }
   });
 
-  app.post("/api/shopify/oauth/start", (req, res) => {
-    const { shopDomain } = req.body as { shopDomain?: string };
+  app.post("/api/shopify/oauth/start", async (req, res) => {
+    const { shopDomain, redirectUri } = req.body as { shopDomain?: string; redirectUri?: string };
     if (!shopDomain) {
       return res.status(400).json({ error: "shopDomain is required." });
     }
-    const result = startShopifyOAuth(shopDomain);
-    return res.json(result);
+    try {
+      const effectiveRedirectUri = redirectUri || `${process.env.APP_BASE_URL || ""}/api/shopify/oauth/callback`;
+      const result = startShopifyOAuth(shopDomain, effectiveRedirectUri);
+      return res.json(result);
+    } catch (err: any) {
+      return res.status(500).json({ error: err.message || "Failed to start Shopify OAuth." });
+    }
   });
 
   app.post("/api/shopify/oauth/callback", async (req, res) => {
@@ -325,9 +448,9 @@
         code,
         state,
       });
-      const syncJobs = enqueueStoreSync(db, workspaceId, store.id);
-      syncJobs.forEach((syncJob) => {
-        enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
+      const syncJobs = await enqueueStoreSync(db, workspaceId, store.id);
+      for (const syncJob of syncJobs) {
+        await enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
           workspaceId,
           storeId: store.id,
         }, {
@@ -336,8 +459,8 @@
           maxAttempts: 4,
           backoffMs: 2000,
         });
-      });
-      return res.status(201).json({ success: true, store, overview: db.getShopifySyncOverview(workspaceId) });
+      }
+      return res.status(201).json({ success: true, store, overview: await db.getShopifySyncOverview(workspaceId) });
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to complete Shopify OAuth." });
     }
@@ -345,25 +468,25 @@
 
   app.post("/api/shopify/stores/:storeId/disconnect", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
-    const store = db.disconnectShopifyStore(workspaceId, req.params.storeId);
+    const store = await db.disconnectShopifyStore(workspaceId, req.params.storeId);
     if (!store) {
       return res.status(404).json({ error: "Store not found." });
     }
-    return res.json({ success: true, store, overview: db.getShopifySyncOverview(workspaceId) });
+    return res.json({ success: true, store, overview: await db.getShopifySyncOverview(workspaceId) });
   });
 
-  app.post("/api/shopify/stores/:storeId/reconnect", (req, res) => {
+  app.post("/api/shopify/stores/:storeId/reconnect", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
-    const store = db.updateShopifyStore(workspaceId, req.params.storeId, {
+    const store = await db.updateShopifyStore(workspaceId, req.params.storeId, {
       status: "connected",
     });
     if (!store) {
       return res.status(404).json({ error: "Store not found." });
     }
-    const refreshed = refreshShopifyAccessToken(db, workspaceId, req.params.storeId);
-    const syncJobs = enqueueStoreSync(db, workspaceId, req.params.storeId);
-    syncJobs.forEach((syncJob) => {
-      enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
+    const refreshed = await refreshShopifyAccessToken(db, workspaceId, req.params.storeId);
+    const syncJobs = await enqueueStoreSync(db, workspaceId, req.params.storeId);
+    for (const syncJob of syncJobs) {
+      await enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
         workspaceId,
         storeId: req.params.storeId,
       }, {
@@ -372,26 +495,26 @@
         maxAttempts: 4,
         backoffMs: 2000,
       });
-    });
-    return res.json({ success: true, store: refreshed, overview: db.getShopifySyncOverview(workspaceId) });
+    }
+    return res.json({ success: true, store: refreshed, overview: await db.getShopifySyncOverview(workspaceId) });
   });
 
-  app.post("/api/shopify/stores/:storeId/refresh-token", (req, res) => {
+  app.post("/api/shopify/stores/:storeId/refresh-token", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
     try {
-      const store = refreshShopifyAccessToken(db, workspaceId, req.params.storeId);
+      const store = await refreshShopifyAccessToken(db, workspaceId, req.params.storeId);
       return res.json({ success: true, store });
     } catch (err: any) {
       return res.status(404).json({ error: err.message || "Failed to refresh Shopify token." });
     }
   });
 
-  app.post("/api/shopify/stores/:storeId/sync", (req, res) => {
+  app.post("/api/shopify/stores/:storeId/sync", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
     const scope = req.body.scope as ShopifySyncScope | undefined;
-    const syncJobs = enqueueStoreSync(db, workspaceId, req.params.storeId, scope);
-    syncJobs.forEach((syncJob) => {
-      enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
+    const syncJobs = await enqueueStoreSync(db, workspaceId, req.params.storeId, scope);
+    for (const syncJob of syncJobs) {
+      await enqueueQueueJob(workspaceId, "shopify_sync", syncJob.id, {
         workspaceId,
         storeId: req.params.storeId,
       }, {
@@ -400,31 +523,40 @@
         maxAttempts: 4,
         backoffMs: 2000,
       });
-    });
-    return res.status(201).json({ success: true, jobs: syncJobs, overview: db.getShopifySyncOverview(workspaceId) });
+    }
+    return res.status(201).json({ success: true, jobs: syncJobs, overview: await db.getShopifySyncOverview(workspaceId) });
   });
 
-  app.post("/api/shopify/stores/:storeId/automation", (req, res) => {
+  app.post("/api/shopify/stores/:storeId/automation", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
-    const settings = db.saveShopifyAutomationSettings(workspaceId, req.params.storeId, req.body);
+    const settings = await db.saveShopifyAutomationSettings(workspaceId, req.params.storeId, req.body);
     return res.json({ success: true, settings });
   });
 
-  app.post("/api/shopify/webhooks/:storeId", (req, res) => {
+  app.post("/api/shopify/webhooks/:storeId", webhookRateLimiter, async (req, res) => {
+    // SECURITY FIX (Phase 1): this endpoint previously accepted any unauthenticated
+    // POST with no signature verification at all, allowing anyone to forge a fake
+    // Shopify webhook and trigger a real sync job against a real store connection.
+    const verification = verifyShopifyWebhookHmac(req as any);
+    if (!verification.valid) {
+      console.warn(`[Shopify Webhook] Rejected unverified webhook for store ${req.params.storeId}: ${verification.reason}`);
+      return res.status(401).json({ error: "Webhook signature verification failed." });
+    }
+
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
     const topic = req.headers["x-shopify-topic"] || req.body.topic;
     if (!topic) {
       return res.status(400).json({ error: "Shopify webhook topic is required." });
     }
     try {
-      const job = handleShopifyWebhook(
+      const job = await handleShopifyWebhook(
         db,
         workspaceId,
         req.params.storeId,
         topic as ShopifyWebhookTopic,
         (req.body.payload || req.body) as Record<string, unknown>
       );
-      const queueJob = enqueueQueueJob(workspaceId, "shopify_sync", job.id, {
+      const queueJob = await enqueueQueueJob(workspaceId, "shopify_sync", job.id, {
         workspaceId,
         storeId: req.params.storeId,
       }, {
@@ -433,13 +565,13 @@
         maxAttempts: 4,
         backoffMs: 1500,
       });
-      return res.status(202).json({ success: true, job, queueJob, overview: db.getShopifySyncOverview(workspaceId) });
+      return res.status(202).json({ success: true, job, queueJob, overview: await db.getShopifySyncOverview(workspaceId) });
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to handle Shopify webhook." });
     }
   });
 
-  app.post("/api/billing/subscription/change", (req, res) => {
+  app.post("/api/billing/subscription/change", async (req, res) => {
     const {
       workspaceId = "default-workspace",
       plan,
@@ -454,21 +586,21 @@
       return res.status(400).json({ error: "A valid plan is required." });
     }
 
-    const subscription = activatePlan(workspaceId, plan, billingInterval, {
+    const subscription = await activatePlan(workspaceId, plan, billingInterval, {
       reason: `Changed subscription to ${plan} (${billingInterval}).`,
       stripeMode: getStripeMode(),
       recordPayment: plan !== "free",
     });
-    return res.json({ success: true, subscription, overview: db.getBillingOverview(workspaceId) });
+    return res.json({ success: true, subscription, overview: await db.getBillingOverview(workspaceId) });
   });
 
-  app.post("/api/billing/subscription/cancel", (req, res) => {
+  app.post("/api/billing/subscription/cancel", async (req, res) => {
     const {
       workspaceId = "default-workspace",
       immediate = false,
     } = req.body as { workspaceId?: string; immediate?: boolean };
     try {
-      const subscription = db.cancelWorkspaceSubscription(workspaceId, immediate);
+      const subscription = await db.cancelWorkspaceSubscription(workspaceId, immediate);
       return res.json({ success: true, subscription });
     } catch (err: any) {
       return res.status(400).json({ error: err.message || "Failed to cancel subscription." });
@@ -496,8 +628,8 @@
       return res.status(400).json({ error: "A valid plan is required." });
     }
 
-    const workspace = db.getWorkspace(workspaceId);
-    const subscription = db.getWorkspaceSubscription(workspaceId);
+    const workspace = await db.getWorkspace(workspaceId);
+    const subscription = await db.getWorkspaceSubscription(workspaceId);
     if (!workspace || !subscription) {
       return res.status(404).json({ error: "Workspace not found." });
     }
@@ -514,13 +646,13 @@
         stripeCustomerId: subscription.stripeCustomerId,
       });
 
-      db.updateWorkspaceSubscription(workspaceId, {
+      await db.updateWorkspaceSubscription(workspaceId, {
         stripeCheckoutSessionId: session.sessionId,
         stripeMode: session.mode,
       });
 
       if (session.mode === "sandbox") {
-        activatePlan(workspaceId, plan, billingInterval, {
+        await activatePlan(workspaceId, plan, billingInterval, {
           reason: `Sandbox checkout completed for ${plan} (${billingInterval}).`,
           stripeMode: "sandbox",
           stripeCheckoutSessionId: session.sessionId,
@@ -533,7 +665,7 @@
         sessionId: session.sessionId,
         stripeRedirectUrl: session.stripeRedirectUrl,
         mode: session.mode,
-        overview: db.getBillingOverview(workspaceId),
+        overview: await db.getBillingOverview(workspaceId),
       });
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to create checkout session." });
@@ -547,7 +679,7 @@
     } = req.body as { workspaceId?: string; returnUrl?: string };
 
     try {
-      const subscription = db.getWorkspaceSubscription(workspaceId);
+      const subscription = await db.getWorkspaceSubscription(workspaceId);
       if (!subscription) {
         return res.status(404).json({ error: "Workspace subscription not found." });
       }
@@ -556,7 +688,7 @@
         returnUrl,
         stripeCustomerId: subscription.stripeCustomerId,
       });
-      db.updateWorkspaceSubscription(workspaceId, {
+      await db.updateWorkspaceSubscription(workspaceId, {
         stripePortalUrl: session.url,
         stripeMode: session.mode,
       });
@@ -566,18 +698,28 @@
     }
   });
 
-  app.post("/api/billing/stripe/webhook", (req, res) => {
+  app.post("/api/billing/stripe/webhook", webhookRateLimiter, async (req, res) => {
     const requestWithRaw = req as express.Request & { rawBody?: Buffer };
     const signature = req.headers["stripe-signature"] as string | undefined;
     let event: any = null;
 
     try {
-      event = constructStripeWebhookEvent(requestWithRaw.rawBody || Buffer.from(JSON.stringify(req.body || {})), signature)
-        || req.body;
+      event = constructStripeWebhookEvent(requestWithRaw.rawBody || Buffer.from(JSON.stringify(req.body || {})), signature);
     } catch (err: any) {
       return res.status(400).json({ error: err.message || "Invalid Stripe webhook signature." });
     }
 
+    if (!event) {
+      // SECURITY FIX (Phase 1): previously fell back to `req.body` (untrusted, unverified)
+      // whenever STRIPE_WEBHOOK_SECRET or the signature header was missing, meaning any
+      // unauthenticated caller could POST a fake "checkout.session.completed" event and
+      // activate a paid plan for free. Webhook events with no verifiable signature are
+      // now rejected outright instead of trusted.
+      return res.status(401).json({
+        error: "Webhook signature could not be verified. Ensure STRIPE_WEBHOOK_SECRET is configured and the request includes a valid Stripe-Signature header.",
+      });
+    }
+
     const eventType = event?.type;
     const eventObject = event?.data?.object || {};
     const metadata = eventObject.metadata || {};
@@ -587,13 +729,13 @@
       return res.status(400).json({ error: "Webhook event type is required." });
     }
 
-    db.recordStripeWebhookEvent(workspaceId, eventType, event);
+    await db.recordStripeWebhookEvent(workspaceId, eventType, event);
 
     try {
       if (eventType === "checkout.session.completed" && workspaceId) {
         const plan = (metadata.plan || "starter") as SubscriptionPlanName;
         const interval = (metadata.interval || "monthly") as SubscriptionInterval;
-        activatePlan(workspaceId, plan, interval, {
+        await activatePlan(workspaceId, plan, interval, {
           reason: `Stripe checkout completed for ${plan} (${interval}).`,
           stripeMode: "live",
           stripeCustomerId: eventObject.customer || undefined,
@@ -605,7 +747,7 @@
       }
 
       if (eventType === "customer.subscription.updated" && workspaceId) {
-        db.updateWorkspaceSubscription(workspaceId, {
+        await db.updateWorkspaceSubscription(workspaceId, {
           status: (eventObject.status || "active") as SubscriptionStatus,
           stripeSubscriptionId: eventObject.id || undefined,
           cancelAtPeriodEnd: Boolean(eventObject.cancel_at_period_end),
@@ -619,13 +761,13 @@
       }
 
       if (eventType === "customer.subscription.deleted" && workspaceId) {
-        db.cancelWorkspaceSubscription(workspaceId, true);
+        await db.cancelWorkspaceSubscription(workspaceId, true);
       }
 
       if (eventType === "invoice.payment_succeeded" && workspaceId) {
-        const subscription = db.getWorkspaceSubscription(workspaceId);
+        const subscription = await db.getWorkspaceSubscription(workspaceId);
         if (subscription) {
-          activatePlan(workspaceId, subscription.plan, subscription.billingInterval, {
+          await activatePlan(workspaceId, subscription.plan, subscription.billingInterval, {
             reason: `Renewed ${subscription.plan} subscription after successful invoice payment.`,
             stripeMode: "live",
             stripeCustomerId: subscription.stripeCustomerId,
@@ -638,13 +780,13 @@
       }
 
       if (eventType === "invoice.payment_failed" && workspaceId) {
-        const subscription = db.getWorkspaceSubscription(workspaceId);
+        const subscription = await db.getWorkspaceSubscription(workspaceId);
         if (subscription) {
-          db.updateWorkspaceSubscription(workspaceId, {
+          await db.updateWorkspaceSubscription(workspaceId, {
             status: "past_due",
           });
         }
-        db.createPaymentHistoryItem(workspaceId, {
+        await db.createPaymentHistoryItem(workspaceId, {
           invoiceId: undefined,
           stripePaymentIntentId: eventObject.payment_intent || undefined,
           amount: (eventObject.amount_due || 0) / 100,
@@ -661,32 +803,266 @@
     }
   });
 
+  // ─── PHASE 2: PayPal Integration ────────────────────────────────────────────
+  // PayPal is the primary payment processor. Mirrors the Stripe routes above in
+  // shape (checkout-session-style creation endpoint + webhook), but follows
+  // PayPal's own API model: subscriptions require a pre-existing Plan, and
+  // one-time payments (credit purchases) use the separate Orders v2 API with an
+  // explicit two-step create-then-capture flow.
+
+  app.post("/api/billing/paypal/subscribe", async (req, res) => {
+    const workspaceId = (req.body.workspaceId as string) || "default-workspace";
+    const plan = (req.body.plan as SubscriptionPlanName) || "starter";
+    const interval = (req.body.billingInterval as SubscriptionInterval) || "monthly";
+    const returnUrl = (req.body.returnUrl as string) || `${req.protocol}://${req.get("host")}/billing/paypal/return`;
+    const cancelUrl = (req.body.cancelUrl as string) || `${req.protocol}://${req.get("host")}/billing/paypal/cancel`;
+
+    try {
+      const workspace = await db.getWorkspace(workspaceId);
+      const result = await createPayPalSubscription({
+        workspaceId,
+        workspaceName: workspace?.name || workspaceId,
+        plan,
+        interval,
+        returnUrl,
+        cancelUrl,
+      });
+      // Persist the pending subscription id now so the webhook (which arrives
+      // asynchronously after buyer approval) can resolve it back to this workspace.
+      await db.changeSubscriptionPlan(workspaceId, {
+        plan,
+        billingInterval: interval,
+        status: "trialing",
+        paymentProvider: "paypal",
+        paypalMode: result.mode,
+        paypalSubscriptionId: result.subscriptionId,
+        reason: `PayPal subscription checkout initiated for ${plan} (${interval}).`,
+      });
+      return res.json({ success: true, ...result });
+    } catch (err: any) {
+      return res.status(500).json({ error: err.message || "Failed to create PayPal subscription." });
+    }
+  });
+
+  app.post("/api/billing/paypal/credits/create-order", async (req, res) => {
+    const workspaceId = (req.body.workspaceId as string) || "default-workspace";
+    const packId = req.body.packId as string;
+    const returnUrl = (req.body.returnUrl as string) || `${req.protocol}://${req.get("host")}/billing/paypal/credits/return`;
+    const cancelUrl = (req.body.cancelUrl as string) || `${req.protocol}://${req.get("host")}/billing/paypal/credits/cancel`;
+
+    try {
+      const pack = getPayPalCreditPack(packId);
+      const result = await createPayPalCreditPurchaseOrder({ workspaceId, packId, returnUrl, cancelUrl });
+      await db.logAudit(workspaceId, "PAYPAL_CREDIT_ORDER_CREATED", `Created PayPal order ${result.orderId} for ${pack.label} ($${pack.priceUsd}).`);
+      return res.json({ success: true, pack, ...result });
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message || "Failed to create PayPal credit purchase order." });
+    }
+  });
+
+  app.post("/api/billing/paypal/credits/capture-order", async (req, res) => {
+    const workspaceId = (req.body.workspaceId as string) || "default-workspace";
+    const orderId = req.body.orderId as string;
+    const packId = req.body.packId as string;
+
+    if (!orderId || !packId) {
+      return res.status(400).json({ error: "orderId and packId are required." });
+    }
+
+    try {
+      const pack = getPayPalCreditPack(packId);
+      const capture = await capturePayPalOrder(orderId);
+
+      if (capture.status !== "COMPLETED") {
+        return res.status(402).json({ error: `PayPal order was not completed (status: ${capture.status}).` });
+      }
+
+      await db.allocateCredits(
+        workspaceId,
+        "payment",
+        { [pack.bucket]: pack.credits },
+        capture.orderId,
+        `Purchased ${pack.label} via PayPal (order ${capture.orderId}, capture ${capture.captureId}).`
+      );
+
+      const invoice = await db.createBillingInvoice(workspaceId, {
+        paymentProvider: "paypal",
+        paypalOrderId: capture.orderId,
+        paypalCaptureId: capture.captureId,
+        amountPaid: pack.priceUsd,
+        currency: capture.currency,
+        status: "paid",
+        hostedInvoiceUrl: `https://www.paypal.com/activity/payment/${capture.captureId}`,
+        invoicePdfUrl: `https://www.paypal.com/activity/payment/${capture.captureId}`,
+      });
+      await db.createPaymentHistoryItem(workspaceId, {
+        invoiceId: invoice.id,
+        paymentProvider: "paypal",
+        paypalOrderId: capture.orderId,
+        paypalCaptureId: capture.captureId,
+        amount: pack.priceUsd,
+        currency: capture.currency,
+        status: "paid",
+        paymentMethod: capture.mode === "live" ? "paypal" : "paypal-sandbox",
+        description: `Credit purchase: ${pack.label}`,
+      });
+
+      return res.json({ success: true, capture, creditsAdded: pack.credits, bucket: pack.bucket });
+    } catch (err: any) {
+      return res.status(500).json({ error: err.message || "Failed to capture PayPal order." });
+    }
+  });
+
+  app.post("/api/billing/paypal/subscription/cancel", async (req, res) => {
+    const workspaceId = (req.body.workspaceId as string) || "default-workspace";
+    try {
+      const subscription = await db.getWorkspaceSubscription(workspaceId);
+      if (subscription?.paypalSubscriptionId) {
+        await cancelPayPalSubscription(subscription.paypalSubscriptionId, "Canceled by customer request.");
+      }
+      const next = await db.cancelWorkspaceSubscription(workspaceId, false);
+      return res.json({ success: true, subscription: next });
+    } catch (err: any) {
+      return res.status(500).json({ error: err.message || "Failed to cancel PayPal subscription." });
+    }
+  });
+
+  app.post("/api/billing/paypal/webhook", webhookRateLimiter, async (req, res) => {
+    const requestWithRaw = req as express.Request & { rawBody?: Buffer };
+    const rawBody = (requestWithRaw.rawBody || Buffer.from(JSON.stringify(req.body || {}))).toString("utf-8");
+
+    const transmissionId = req.headers["paypal-transmission-id"] as string | undefined;
+    const transmissionTime = req.headers["paypal-transmission-time"] as string | undefined;
+    const certUrl = req.headers["paypal-cert-url"] as string | undefined;
+    const authAlgo = req.headers["paypal-auth-algo"] as string | undefined;
+    const transmissionSig = req.headers["paypal-transmission-sig"] as string | undefined;
+
+    // SECURITY: reject anything missing a full signature header set outright,
+    // exactly like the Stripe webhook above does for a missing Stripe-Signature -
+    // no signature, no processing, regardless of payload contents.
+    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
+      return res.status(401).json({ error: "Missing required PayPal webhook signature headers." });
+    }
+
+    // REPLAY-ATTACK PROTECTION: reject stale transmissions before even calling PayPal's
+    // verification API, regardless of whether the signature itself would still validate.
+    if (!isPayPalTransmissionTimeFresh(transmissionTime)) {
+      return res.status(401).json({ error: "PayPal webhook transmission is too old to accept (possible replay)." });
+    }
+
+    let signatureValid = false;
+    try {
+      signatureValid = await verifyPayPalWebhookSignature(
+        { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig },
+        rawBody
+      );
+    } catch (err: any) {
+      logger.error({ event: "paypal_webhook_verify_failed", err: err.message }, "PayPal webhook signature verification call failed.");
+      return res.status(401).json({ error: "Could not verify PayPal webhook signature." });
+    }
+
+    if (!signatureValid) {
+      return res.status(401).json({ error: "PayPal webhook signature verification failed." });
+    }
+
+    const event = JSON.parse(rawBody) as { id: string; event_type: string; resource: any };
+    const resource = event.resource || {};
+    const paypalSubscriptionId = resource.id && event.event_type?.startsWith("BILLING.SUBSCRIPTION") ? resource.id : resource.billing_agreement_id;
+    const workspaceId = resource.custom_id
+      || (paypalSubscriptionId ? await db.getWorkspaceIdByPayPalSubscriptionId(paypalSubscriptionId) : null)
+      || undefined;
+
+    // IDEMPOTENCY: PayPal retries webhook delivery on anything but a 2xx response, and a
+    // malicious actor could attempt to replay a previously-valid, previously-signed
+    // payload. The UNIQUE constraint on paypal_event_id (see schema.sql) is the actual
+    // enforcement; this call gives an early, clear answer either way.
+    const { alreadyProcessed } = await db.recordPayPalWebhookEvent({
+      paypalEventId: event.id,
+      eventType: event.event_type,
+      resourceId: resource.id,
+      workspaceId,
+      payload: event,
+      signatureVerified: true,
+    });
+
+    if (alreadyProcessed) {
+      return res.json({ received: true, duplicate: true });
+    }
+
+    try {
+      if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED" && workspaceId) {
+        const existing = await db.getWorkspaceSubscription(workspaceId);
+        const plan = existing?.plan || "starter";
+        const interval = existing?.billingInterval || "monthly";
+        await activatePlan(workspaceId, plan, interval, {
+          status: "active",
+          paymentProvider: "paypal",
+          paypalMode: getPayPalMode(),
+          paypalSubscriptionId: resource.id,
+          paypalPlanId: resource.plan_id || undefined,
+          paypalPayerId: resource.subscriber?.payer_id || undefined,
+          reason: `PayPal subscription ${resource.id} activated.`,
+          recordPayment: plan !== "free",
+          paypalOrderId: resource.id,
+        });
+      }
+
+      if (event.event_type === "BILLING.SUBSCRIPTION.CANCELLED" && workspaceId) {
+        await db.cancelWorkspaceSubscription(workspaceId, true);
+      }
+
+      if (event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED" && workspaceId) {
+        await db.updateWorkspaceSubscription(workspaceId, { status: "past_due" });
+      }
+
+      if (event.event_type === "PAYMENT.SALE.COMPLETED" && workspaceId) {
+        const subscription = await db.getWorkspaceSubscription(workspaceId);
+        if (subscription) {
+          await recordBillingSuccess(
+            workspaceId,
+            subscription.plan,
+            subscription.billingInterval,
+            "paypal",
+            undefined,
+            undefined,
+            resource.id,
+            resource.id
+          );
+        }
+      }
+
+      return res.json({ received: true, eventType: event.event_type, workspaceId });
+    } catch (err: any) {
+      return res.status(500).json({ error: err.message || "Failed to process PayPal webhook." });
+    }
+  });
+
   // 2. Fetch normalized products (Tenant Isolated)
-  app.get("/api/products", (req, res) => {
+  app.get("/api/products", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const products = db.getProducts(workspaceId);
+    const products = await db.getProducts(workspaceId);
     res.json(products);
   });
 
   // 3. Fetch import operations (Tenant Isolated)
-  app.get("/api/operations", (req, res) => {
+  app.get("/api/operations", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const ops = db.getImportOperations(workspaceId);
+    const ops = await db.getImportOperations(workspaceId);
     res.json(ops);
   });
 
   // 4. Fetch audit logs (Tenant Isolated)
-  app.get("/api/audit-logs", (req, res) => {
+  app.get("/api/audit-logs", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const logs = db.getAuditLogs(workspaceId);
+    const logs = await db.getAuditLogs(workspaceId);
     res.json(logs);
   });
 
   // 4b. Delete product
-  app.delete("/api/products/:productId", (req, res) => {
+  app.delete("/api/products/:productId", async (req, res) => {
     const { productId } = req.params;
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const success = db.deleteProduct(workspaceId, productId);
+    const success = await db.deleteProduct(workspaceId, productId);
     if (success) {
       res.json({ success: true, message: `Successfully deleted product ${productId}.` });
     } else {
@@ -703,10 +1079,10 @@
     }
 
     // 1. Credit Check: Guard against negative balances
-    const hasSufficientCredits = db.checkCreditBalance(workspaceId, 20, "ai");
+    const hasSufficientCredits = await db.checkCreditBalance(workspaceId, 20, "ai");
     if (!hasSufficientCredits) {
-      db.logAudit(workspaceId, "IMPORT_BLOCKED", `Blocked import from ${url} due to low credits (< 20).`);
-      return sendInsufficientCredits(res, workspaceId, "ai", 20);
+      await db.logAudit(workspaceId, "IMPORT_BLOCKED", `Blocked import from ${url} due to low credits (< 20).`);
+      return await sendInsufficientCredits(res, workspaceId, "ai", 20);
     }
 
     // 2. Resolve Extractor via factory
@@ -714,9 +1090,9 @@
     const providerName = extractor.providerName;
 
     // 3. Log Pending Transaction Operation
-    const op = db.createImportOperation(workspaceId, providerName, url);
+    const op = await db.createImportOperation(workspaceId, providerName, url);
 
-    const queueJob = enqueueQueueJob(workspaceId, "product_import", op.id, {
+    const queueJob = await enqueueQueueJob(workspaceId, "product_import", op.id, {
       workspaceId,
       url,
       customPrompt,
@@ -739,10 +1115,10 @@
   });
 
   // 5b. Get import operation status
-  app.get("/api/import/status/:operationId", (req, res) => {
+  app.get("/api/import/status/:operationId", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const operationId = req.params.operationId;
-    const ops = db.getImportOperations(workspaceId);
+    const ops = await db.getImportOperations(workspaceId);
     const op = ops.find((o) => o.id === operationId);
     if (!op) {
       return res.status(404).json({ error: "Operation not found." });
@@ -750,18 +1126,18 @@
     // Get product if exists
     let product = null;
     if (op.productId) {
-      const products = db.getProducts(workspaceId);
+      const products = await db.getProducts(workspaceId);
       product = products.find((p) => p.id === op.productId) || null;
     }
     // Get attempt count from queue logs
-    const logs = db.getQueueJobLogs(workspaceId);
+    const logs = await db.getQueueJobLogs(workspaceId);
     const jobLogs = logs.filter((log) => log.message.includes(operationId));
     const attemptCount = jobLogs.filter((log) => log.status === "processing" || log.status === "retrying" || log.status === "failed").length + 1;
     // Get extractor name from the operation (provider) or from queue job payload
     let extractor = op.provider || "Unknown";
     // try to get from queue job payload if not in operation
     if (!extractor || extractor === "Unknown") {
-      const jobs = db.getQueueJobs(workspaceId, { includeCompleted: true });
+      const jobs = await db.getQueueJobs(workspaceId, { includeCompleted: true });
       const job = jobs.find((j) => j.referenceId === operationId);
       if (job && job.payload && typeof job.payload === "object" && "extractor" in job.payload) {
         extractor = String(job.payload.extractor);
@@ -786,30 +1162,30 @@
   // --- Product Intelligence Endpoints (Phase 2) ---
 
   // 5a. Retrieve latest product analysis and version history
-  app.get("/api/intelligence/analysis", (req, res) => {
+  app.get("/api/intelligence/analysis", async (req, res) => {
     const productId = req.query.productId as string;
     if (!productId) {
       return res.status(400).json({ error: "productId parameter is required" });
     }
-    const latest = db.getLatestProductAnalysis(productId);
-    const history = db.getProductAnalyses(productId);
+    const latest = await db.getLatestProductAnalysis(productId);
+    const history = await db.getProductAnalyses(productId);
     return res.json({ latest, history });
   });
 
   // 5b. Trigger full product marketing & market intelligence analysis (costs exactly 20 credits)
-  app.post("/api/intelligence/analyze", async (req, res) => {
+  app.post("/api/intelligence/analyze", aiGenerationRateLimiter, async (req, res) => {
     const { productId, languageCode = "en", workspaceId = "default-workspace" } = req.body;
     if (!productId) {
       return res.status(400).json({ error: "productId is required" });
     }
 
     try {
-      if (!db.checkCreditBalance(workspaceId, 20, "ai")) {
-        db.logAudit(workspaceId, "ANALYSIS_BLOCKED", `Blocked analysis for ${productId} due to low AI credits.`);
-        return sendInsufficientCredits(res, workspaceId, "ai", 20);
+      if (!await db.checkCreditBalance(workspaceId, 20, "ai")) {
+        await db.logAudit(workspaceId, "ANALYSIS_BLOCKED", `Blocked analysis for ${productId} due to low AI credits.`);
+        return await sendInsufficientCredits(res, workspaceId, "ai", 20);
       }
       // Find the specific product catalog item (multi-tenant boundary verified)
-      const products = db.getProducts(workspaceId);
+      const products = await db.getProducts(workspaceId);
       const product = products.find((p) => p.id === productId);
       if (!product) {
         return res.status(404).json({ error: "Product not found or access denied." });
@@ -819,7 +1195,7 @@
       const analysis = await ProductAnalyzer.analyze(product, languageCode, workspaceId);
       
       // Update the analysis latency in the corresponding import operation
-      db.updateImportOperationAnalysisTime(workspaceId, productId, analysis.latencyMilliseconds);
+      await db.updateImportOperationAnalysisTime(workspaceId, productId, analysis.latencyMilliseconds);
 
       return res.json({ success: true, analysis });
     } catch (err: any) {
@@ -829,14 +1205,14 @@
   });
 
   // 5c. Fetch complete credit tracking ledger audit rows
-  app.get("/api/intelligence/ledger", (req, res) => {
+  app.get("/api/intelligence/ledger", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const entries = db.getCreditLedger(workspaceId);
+    const entries = await db.getCreditLedger(workspaceId);
     return res.json(entries);
   });
 
   // 5d. Fetch workspace analytics payload for the advanced analytics center
-  app.get("/api/intelligence/analytics", (req, res) => {
+  app.get("/api/intelligence/analytics", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const selectedProductId = req.query.productId as string | undefined;
     const preset = (req.query.preset as "today" | "7d" | "30d" | "90d" | "custom") || "30d";
@@ -850,11 +1226,11 @@
         preset,
         startDate,
         endDate,
-        products: db.getProducts(workspaceId),
-        operations: db.getImportOperations(workspaceId),
-        analyses: db.getWorkspaceProductAnalyses(workspaceId),
-        contentGenerations: db.getWorkspaceContentGenerations(workspaceId),
-        ledger: db.getCreditLedger(workspaceId),
+        products: await db.getProducts(workspaceId),
+        operations: await db.getImportOperations(workspaceId),
+        analyses: await db.getWorkspaceProductAnalyses(workspaceId),
+        contentGenerations: await db.getWorkspaceContentGenerations(workspaceId),
+        ledger: await db.getCreditLedger(workspaceId),
       });
       return res.json(payload);
     } catch (err: any) {
@@ -868,7 +1244,7 @@
   // --- Content Generation Engine Endpoints (Phase 3) ---
 
   // Generate marketing assets automatically
-  app.post("/api/content/generate", async (req, res) => {
+  app.post("/api/content/generate", aiGenerationRateLimiter, async (req, res) => {
     const { productId, workspaceId = "default-workspace", contentType = "package", languageCode = "en" } = req.body;
 
     if (!productId) {
@@ -888,19 +1264,19 @@
     const creditsRequired = costMap[contentType] || 20;
 
     // 1. Check if workspace has enough credits
-    const hasCredits = db.checkCreditBalance(workspaceId, creditsRequired, "ai");
+    const hasCredits = await db.checkCreditBalance(workspaceId, creditsRequired, "ai");
     if (!hasCredits) {
-      db.logAudit(workspaceId, "CONTENT_GEN_BLOCKED", `Blocked ${contentType} generation for product ${productId} due to low credits (< ${creditsRequired}).`);
-      return sendInsufficientCredits(res, workspaceId, "ai", creditsRequired);
+      await db.logAudit(workspaceId, "CONTENT_GEN_BLOCKED", `Blocked ${contentType} generation for product ${productId} due to low credits (< ${creditsRequired}).`);
+      return await sendInsufficientCredits(res, workspaceId, "ai", creditsRequired);
     }
 
-    const products = db.getProducts(workspaceId);
+    const products = await db.getProducts(workspaceId);
     const product = products.find((p) => p.id === productId);
     if (!product) {
       return res.status(404).json({ error: "Product not found or access denied." });
     }
 
-    const queueJob = enqueueQueueJob(workspaceId, "ai_content_generation", productId, {
+    const queueJob = await enqueueQueueJob(workspaceId, "ai_content_generation", productId, {
       workspaceId,
       productId,
       contentType,
@@ -922,7 +1298,7 @@
   });
 
   // Fetch the latest generated marketing contents or packages for a specific product
-  app.get("/api/content/:productId", (req, res) => {
+  app.get("/api/content/:productId", async (req, res) => {
     const { productId } = req.params;
     const contentType = req.query.contentType as string | undefined;
 
@@ -930,25 +1306,25 @@
       return res.status(400).json({ error: "productId parameter is required." });
     }
 
-    const latest = db.getLatestContentGeneration(productId, contentType);
+    const latest = await db.getLatestContentGeneration(productId, contentType);
     return res.json({ latest });
   });
 
   // Fetch the historical list of all edits/generations for a product
-  app.get("/api/content/history/:productId", (req, res) => {
+  app.get("/api/content/history/:productId", async (req, res) => {
     const { productId } = req.params;
 
     if (!productId) {
       return res.status(400).json({ error: "productId parameter is required." });
     }
 
-    const history = db.getContentGenerations(productId);
+    const history = await db.getContentGenerations(productId);
     return res.json({ history });
   });
 
   // --- Social Publishing Center Endpoints (Phase 4) ---
 
-  app.get("/api/auth/meta/url", (req, res) => {
+  app.get("/api/auth/meta/url", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const origin = (req.query.origin as string) || process.env.APP_URL || `http://${req.headers.host}`;
     
@@ -961,7 +1337,7 @@
     const redirectUri = `${origin}/api/auth/meta/callback`;
     const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
 
-    db.saveOAuthState(workspaceId, "meta", state, redirectUri, expiresAt);
+    await db.saveOAuthState(workspaceId, "meta", state, redirectUri, expiresAt);
 
     const configId = "2069693727296971";
     const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${configId}&state=${state}&response_type=code`;
@@ -1097,7 +1473,7 @@
       `);
     }
 
-    const stateRecord = db.getOAuthState(state as string);
+    const stateRecord = await db.getOAuthState(state as string);
     if (!stateRecord) {
       return res.send(`
         <html>
@@ -1118,7 +1494,7 @@
       `);
     }
 
-    db.deleteOAuthState(state as string);
+    await db.deleteOAuthState(state as string);
     const workspaceId = stateRecord.workspaceId;
     const redirectUri = stateRecord.redirectUri;
 
@@ -1167,8 +1543,8 @@
       }
 
       // Clean up previous platform connections to ensure production-level hygiene
-      db.clearPlatformSocialAccounts(workspaceId, "facebook");
-      db.clearPlatformSocialAccounts(workspaceId, "instagram");
+      await db.clearPlatformSocialAccounts(workspaceId, "facebook");
+      await db.clearPlatformSocialAccounts(workspaceId, "instagram");
 
       // Step 6b: Retrieve Facebook Pages linked to the account
       const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`;
@@ -1181,7 +1557,15 @@
       }
 
       const pagesData = await pagesResponse.json() as { data: Array<{ id: string; name: string; access_token: string }> };
-      currentLog.meAccountsResponse = pagesData;
+      // SECURITY FIX (Phase 3): the raw Graph API response for /me/accounts includes a real,
+      // usable page access_token per page. Writing it verbatim into the on-disk debug log
+      // (storage/meta_oauth_debug.json) was a plaintext token exposure independent of the
+      // database encryption fix. Mask each page's token before logging, matching how the
+      // top-level user token exchange response is already masked above.
+      currentLog.meAccountsResponse = {
+        ...pagesData,
+        data: (pagesData.data || []).map((page) => ({ ...page, access_token: page.access_token ? "MASKED_FOR_SECURITY" : undefined })),
+      };
       saveLog();
       
       const facebookPages = pagesData.data || [];
@@ -1199,7 +1583,7 @@
       // Process each Page and search for any linked Instagram Business Accounts
       for (const page of facebookPages) {
         // Register the Facebook Page as a social account
-        db.createSocialAccount(workspaceId, {
+        await db.createSocialAccount(workspaceId, {
           platform: "facebook",
           username: page.name,
           platformUserId: page.id,
@@ -1233,33 +1617,31 @@
           saveLog();
         }
 
-        // Direct fallback mapping if automated discovery fails but we know the verified Instagram Account ID
-        if (!igBusinessAccountId && page.id === "1027756837080088") {
-          console.log("[Instagram Fallback] Direct page-to-instagram mapping applied for Page ID 1027756837080088.");
-          igBusinessAccountId = "17841433391841333";
-        }
-
+        // SECURITY FIX (Phase 1 — Critical Issue #2): the previous code hardcoded a specific
+        // developer-owned Facebook Page ID / Instagram Business Account ID as a "fallback" in
+        // this shared OAuth flow, meaning any user whose automated Instagram discovery failed
+        // the same way would have had a stranger's Instagram account silently attached to their
+        // workspace. There is no safe generic fallback for account discovery: if the Graph API
+        // does not report an Instagram Business Account for this Page, we correctly report that
+        // to the user instead of guessing.
         if (igBusinessAccountId) {
           // Retrieve Instagram account details (id, username, name, and profile picture)
           const igDetailsUrl = `https://graph.facebook.com/v19.0/${igBusinessAccountId}?fields=id,username,name,profile_picture_url&access_token=${page.access_token}`;
           const igDetailsResponse = await fetch(igDetailsUrl);
-          
+
           if (igDetailsResponse.ok) {
             igDetails = await igDetailsResponse.json() as { id: string; username: string; name?: string; profile_picture_url?: string };
-          } else if (igBusinessAccountId === "17841433391841333") {
-            // Bypass failed Graph API fetch for the verified fallback account
-            igDetails = {
-              id: "17841433391841333",
-              username: "sunverajolie",
-              name: "SunVera Jolie"
-            };
+          } else {
+            const errBody = await igDetailsResponse.text();
+            currentLog.graphApiErrors.push(`Failed to fetch Instagram account details for ${igBusinessAccountId}: [HTTP ${igDetailsResponse.status}] ${errBody}`);
+            saveLog();
           }
 
           if (igDetails) {
             currentLog.instagramDetailsResponse = igDetails;
             saveLog();
 
-            db.createSocialAccount(workspaceId, {
+            await db.createSocialAccount(workspaceId, {
               platform: "instagram",
               username: igDetails.username,
               platformUserId: igDetails.id,
@@ -1349,7 +1731,7 @@
     }
   });
 
-  app.get("/api/auth/meta/logs", (req, res) => {
+  app.get("/api/auth/meta/logs", async (req, res) => {
     const logPath = path.join(process.cwd(), "storage", "meta_oauth_debug.json");
     if (!fs.existsSync(logPath)) {
       return res.json([]);
@@ -1362,7 +1744,7 @@
     }
   });
 
-  app.get("/api/publishing/meta-diagnostics", (req, res) => {
+  app.get("/api/publishing/meta-diagnostics", async (req, res) => {
     const diagnosticsPath = path.join(process.cwd(), "storage", "meta_diagnostics.json");
     const userTokenDebugPath = path.join(process.cwd(), "storage", "meta_user_token_debug.json");
     
@@ -1415,10 +1797,10 @@
     });
   });
 
-  app.get("/api/publishing/accounts", (req, res) => {
+  app.get("/api/publishing/accounts", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     return res.json({
-      accounts: db.getSocialAccounts(workspaceId),
+      accounts: await db.getSocialAccounts(workspaceId),
       supportedPlatforms: supportedSocialPlatforms.map((platform) => ({
         platform,
         ...SocialPublisherService.getPlatformConfiguration(platform),
@@ -1426,7 +1808,7 @@
     });
   });
 
-  app.post("/api/publishing/accounts", (req, res) => {
+  app.post("/api/publishing/accounts", async (req, res) => {
     const {
       workspaceId = "default-workspace",
       platform,
@@ -1446,7 +1828,7 @@
       return res.status(400).json({ error: "username and platformUserId are required." });
     }
 
-    const account = db.createSocialAccount(workspaceId, {
+    const account = await db.createSocialAccount(workspaceId, {
       platform,
       username,
       platformUserId,
@@ -1459,30 +1841,30 @@
     return res.status(201).json({ success: true, account });
   });
 
-  app.delete("/api/publishing/accounts/:accountId", (req, res) => {
+  app.delete("/api/publishing/accounts/:accountId", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const success = db.deleteSocialAccount(workspaceId, req.params.accountId);
+    const success = await db.deleteSocialAccount(workspaceId, req.params.accountId);
     return success ? res.json({ success: true }) : res.status(404).json({ error: "Account not found." });
   });
 
-  app.post("/api/publishing/accounts/clear-meta", (req, res) => {
+  app.post("/api/publishing/accounts/clear-meta", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || (req.query.workspaceId as string) || "default-workspace";
     try {
-      db.clearPlatformSocialAccounts(workspaceId, "facebook");
-      db.clearPlatformSocialAccounts(workspaceId, "instagram");
+      await db.clearPlatformSocialAccounts(workspaceId, "facebook");
+      await db.clearPlatformSocialAccounts(workspaceId, "instagram");
       return res.json({ success: true, message: "Successfully cleared all Facebook and Instagram connections." });
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to clear Meta accounts." });
     }
   });
 
-  app.get("/api/publishing/content-sources", (req, res) => {
+  app.get("/api/publishing/content-sources", async (req, res) => {
     const productId = req.query.productId as string;
     if (!productId) {
       return res.status(400).json({ error: "productId is required." });
     }
 
-    const latest = db.getLatestContentGeneration(productId);
+    const latest = await db.getLatestContentGeneration(productId);
     const suggestions = latest ? buildSocialSuggestions(latest.payload as Record<string, any>, latest.id) : [];
     return res.json({ suggestions, latestGeneration: latest });
   });
@@ -1511,7 +1893,7 @@
       return res.status(400).json({ error: "No valid publishing platforms were selected." });
     }
 
-    const latest = db.getLatestContentGeneration(productId);
+    const latest = await db.getLatestContentGeneration(productId);
     const suggestions = Array.isArray(contentSuggestions) && contentSuggestions.length > 0
       ? contentSuggestions
       : buildSocialSuggestions((latest?.payload || {}) as Record<string, any>, latest?.id);
@@ -1540,15 +1922,15 @@
     );
 
     const publishingCreditsRequired = action === "draft" ? 0 : postsToSave.length;
-    if (publishingCreditsRequired > 0 && !db.checkCreditBalance(workspaceId, publishingCreditsRequired, "publishing")) {
-      db.logAudit(workspaceId, "PUBLISHING_BLOCKED", `Blocked ${action} for ${productId} due to low publishing credits.`);
-      return sendInsufficientCredits(res, workspaceId, "publishing", publishingCreditsRequired);
+    if (publishingCreditsRequired > 0 && !await db.checkCreditBalance(workspaceId, publishingCreditsRequired, "publishing")) {
+      await db.logAudit(workspaceId, "PUBLISHING_BLOCKED", `Blocked ${action} for ${productId} due to low publishing credits.`);
+      return await sendInsufficientCredits(res, workspaceId, "publishing", publishingCreditsRequired);
     }
 
-    const savedPosts = db.saveSocialPosts(workspaceId, productId, postsToSave);
+    const savedPosts = await db.saveSocialPosts(workspaceId, productId, postsToSave);
 
     if (publishingCreditsRequired > 0) {
-      db.consumeCredits(
+      await db.consumeCredits(
         workspaceId,
         "publishing",
         publishingCreditsRequired,
@@ -1559,7 +1941,7 @@
     }
 
     if (action === "publish") {
-      const queueJobs = savedPosts.map((post) =>
+      const queueJobs = await Promise.all(savedPosts.map((post) =>
         enqueueQueueJob(workspaceId, "social_publishing", post.id, {
           workspaceId,
           postId: post.id,
@@ -1569,7 +1951,7 @@
           maxAttempts: 4,
           backoffMs: 2000,
         })
-      );
+      ));
       return res.status(202).json({ success: true, posts: savedPosts, queueJobs });
     }
 
@@ -1579,10 +1961,10 @@
   app.post("/api/publishing/posts/:postId/publish", async (req, res) => {
     const workspaceId = (req.body.workspaceId as string) || "default-workspace";
     try {
-      if (!db.checkCreditBalance(workspaceId, 1, "publishing")) {
-        return sendInsufficientCredits(res, workspaceId, "publishing", 1);
+      if (!await db.checkCreditBalance(workspaceId, 1, "publishing")) {
+        return await sendInsufficientCredits(res, workspaceId, "publishing", 1);
       }
-      db.consumeCredits(
+      await db.consumeCredits(
         workspaceId,
         "publishing",
         1,
@@ -1590,7 +1972,7 @@
         req.params.postId,
         `Published social post ${req.params.postId}`
       );
-      const queueJob = enqueueQueueJob(workspaceId, "social_publishing", req.params.postId, {
+      const queueJob = await enqueueQueueJob(workspaceId, "social_publishing", req.params.postId, {
         workspaceId,
         postId: req.params.postId,
       }, {
@@ -1599,41 +1981,42 @@
         maxAttempts: 4,
         backoffMs: 2000,
       });
-      return res.status(202).json({ success: true, queueJob, post: db.getSocialPostById(workspaceId, req.params.postId) });
+      return res.status(202).json({ success: true, queueJob, post: await db.getSocialPostById(workspaceId, req.params.postId) });
     } catch (err: any) {
       return res.status(500).json({ error: err.message || "Failed to publish post." });
     }
   });
 
-  app.get("/api/publishing/posts/calendar", (req, res) => {
+  app.get("/api/publishing/posts/calendar", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const productId = req.query.productId as string | undefined;
     return res.json({
-      posts: db.getSocialPosts(workspaceId, { productId, includeAll: true }),
+      posts: await db.getSocialPosts(workspaceId, { productId, includeAll: true }),
     });
   });
 
-  app.get("/api/publishing/posts/history", (req, res) => {
+  app.get("/api/publishing/posts/history", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const productId = req.query.productId as string | undefined;
     return res.json({
-      posts: db.getSocialPosts(workspaceId, { productId, includeAll: true }),
+      posts: await db.getSocialPosts(workspaceId, { productId, includeAll: true }),
     });
   });
 
-  app.get("/api/publishing/posts/queue", (req, res) => {
+  app.get("/api/publishing/posts/queue", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const productId = req.query.productId as string | undefined;
-    const posts = db.getSocialPosts(workspaceId, { productId, includeAll: true }).filter((post) =>
+    const allPosts = await db.getSocialPosts(workspaceId, { productId, includeAll: true });
+    const posts = allPosts.filter((post) =>
       post.status === "scheduled" || post.status === "publishing" || post.status === "failed"
     );
     return res.json({ posts });
   });
 
-  app.get("/api/publishing/analytics", (req, res) => {
+  app.get("/api/publishing/analytics", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
     const productId = req.query.productId as string | undefined;
-    const posts = db.getSocialPosts(workspaceId, { productId, includeAll: true });
+    const posts = await db.getSocialPosts(workspaceId, { productId, includeAll: true });
     const published = posts.filter((post) => post.status === "published");
     const scheduled = posts.filter((post) => post.status === "scheduled");
     const drafts = posts.filter((post) => post.status === "draft");
@@ -1663,7 +2046,7 @@
 
   // --- AI Video Studio Endpoints (Phase 5) ---
 
-  app.get("/api/video/providers", (req, res) => {
+  app.get("/api/video/providers", async (req, res) => {
     return res.json({
       providers: getVideoProviders().map((provider) => ({
         name: provider.name,
@@ -1675,7 +2058,7 @@
     });
   });
 
-  app.post("/api/video/generate", async (req, res) => {
+  app.post("/api/video/generate", aiGenerationRateLimiter, async (req, res) => {
     const {
       workspaceId = "default-workspace",
       productId,
@@ -1704,20 +2087,20 @@
       return res.status(400).json({ error: "productId is required." });
     }
 
-    const products = db.getProducts(workspaceId);
+    const products = await db.getProducts(workspaceId);
     const product = products.find((item) => item.id === productId);
     if (!product) {
       return res.status(404).json({ error: "Product not found or access denied." });
     }
 
     const estimatedCredits = (outputType === "long_form_promotional" ? 20 : 10) + Math.max(0, Math.round(durationSeconds / 15));
-    if (!db.checkCreditBalance(workspaceId, estimatedCredits, "video")) {
-      return sendInsufficientCredits(res, workspaceId, "video", estimatedCredits);
+    if (!await db.checkCreditBalance(workspaceId, estimatedCredits, "video")) {
+      return await sendInsufficientCredits(res, workspaceId, "video", estimatedCredits);
     }
 
     try {
-      const analysis = db.getLatestProductAnalysis(productId);
-      const latestContent = db.getLatestContentGeneration(productId);
+      const analysis = await db.getLatestProductAnalysis(productId);
+      const latestContent = await db.getLatestContentGeneration(productId);
       const draft = await createVideoDraft(db, {
         workspaceId,
         product,
@@ -1732,7 +2115,7 @@
         provider,
         sourceImageUrls: sourceImageUrls.length > 0 ? sourceImageUrls : [product.images, ...product.gallery].filter(Boolean),
       });
-      const queueJob = enqueueQueueJob(workspaceId, "ai_video_rendering", draft.id, {
+      const queueJob = await enqueueQueueJob(workspaceId, "ai_video_rendering", draft.id, {
         workspaceId,
         generationId: draft.id,
       }, {
@@ -1741,88 +2124,89 @@
         maxAttempts: 4,
         backoffMs: 3000,
       });
-      return res.status(202).json({ success: true, generation: db.getVideoGenerationById(workspaceId, draft.id), queueJob });
+      return res.status(202).json({ success: true, generation: await db.getVideoGenerationById(workspaceId, draft.id), queueJob });
     } catch (err: any) {
       console.error("[Video Studio] Failed to create AI video render:", err);
       return res.status(500).json({ error: err.message || "Failed to generate AI video." });
     }
   });
 
-  app.get("/api/video/:productId", (req, res) => {
+  app.get("/api/video/:productId", async (req, res) => {
     const productId = req.params.productId;
-    return res.json({ latest: db.getLatestVideoGeneration(productId) });
+    return res.json({ latest: await db.getLatestVideoGeneration(productId) });
   });
 
-  app.get("/api/video/history/:productId", (req, res) => {
+  app.get("/api/video/history/:productId", async (req, res) => {
     const productId = req.params.productId;
-    return res.json({ history: db.getVideoGenerations(productId) });
+    return res.json({ history: await db.getVideoGenerations(productId) });
   });
 
-  app.get("/api/video/queue/:productId", (req, res) => {
+  app.get("/api/video/queue/:productId", async (req, res) => {
     const productId = req.params.productId;
-    const items = db.getVideoGenerations(productId).filter((item) =>
+    const allItems = await db.getVideoGenerations(productId);
+    const items = allItems.filter((item) =>
       item.status === "queued" || item.status === "rendering" || item.status === "failed"
     );
     return res.json({ queue: items });
   });
 
-  app.get("/api/video/analytics/:productId", (req, res) => {
+  app.get("/api/video/analytics/:productId", async (req, res) => {
     const productId = req.params.productId;
-    const items = db.getVideoGenerations(productId);
+    const items = await db.getVideoGenerations(productId);
     return res.json(buildVideoAnalytics(items));
   });
 
-  app.delete("/api/video/:videoId", (req, res) => {
+  app.delete("/api/video/:videoId", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const success = db.deleteVideoGeneration(workspaceId, req.params.videoId);
+    const success = await db.deleteVideoGeneration(workspaceId, req.params.videoId);
     return success ? res.json({ success: true }) : res.status(404).json({ error: "AI video generation not found." });
   });
 
-  app.get("/api/queue/overview", (req, res) => {
+  app.get("/api/queue/overview", async (req, res) => {
     const workspaceId = req.query.workspaceId as string | undefined;
     return res.json(queueEngine.getOverview(workspaceId));
   });
 
-  app.get("/api/queue/jobs", (req, res) => {
+  app.get("/api/queue/jobs", async (req, res) => {
     const workspaceId = req.query.workspaceId as string | undefined;
     const status = req.query.status as string | undefined;
     const kind = req.query.kind as QueueJobKind | undefined;
     return res.json({
-      jobs: db.getQueueJobs(workspaceId, {
+      jobs: await db.getQueueJobs(workspaceId, {
         statuses: status ? [status as any] : undefined,
         kinds: kind ? [kind] : undefined,
         includeCompleted: true,
       }),
-      logs: db.getQueueJobLogs(workspaceId),
+      logs: await db.getQueueJobLogs(workspaceId),
     });
   });
 
-  app.post("/api/queue/jobs/:jobId/retry", (req, res) => {
-    const retried = db.retryQueueJob(req.params.jobId);
+  app.post("/api/queue/jobs/:jobId/retry", async (req, res) => {
+    const retried = await db.retryQueueJob(req.params.jobId);
     return retried
       ? res.json({ success: true, job: retried })
       : res.status(404).json({ error: "Queue job not found." });
   });
 
-  app.post("/api/queue/jobs/:jobId/cancel", (req, res) => {
-    const cancelled = db.cancelQueueJob(req.params.jobId);
+  app.post("/api/queue/jobs/:jobId/cancel", async (req, res) => {
+    const cancelled = await db.cancelQueueJob(req.params.jobId);
     return cancelled
       ? res.json({ success: true, job: cancelled })
       : res.status(404).json({ error: "Queue job not found." });
   });
 
-  app.post("/api/queue/cleanup", (_req, res) => {
-    db.cleanupQueueRecords(24, 72, 72);
+  app.post("/api/queue/cleanup", async (_req, res) => {
+    await db.cleanupQueueRecords(24, 72, 72);
     return res.json({ success: true });
   });
 
   // 6. Refill / Update workspace credits (Helper for testing and manual adjustments)
-  app.post("/api/set-credits", (req, res) => {
+  app.post("/api/set-credits", async (req, res) => {
     const { workspaceId = "default-workspace", amount } = req.body;
     if (typeof amount !== "number" || amount < 0) {
       res.status(400).json({ error: "Amount must be a non-negative number." });
     } else {
-      db.setCredits(workspaceId, amount);
+      await db.setCredits(workspaceId, amount);
       res.json({ message: `Successfully updated credits to ${amount}`, credits: amount });
     }
   });
@@ -1844,7 +2228,7 @@
       return res.status(400).json({ error: "Login is required." });
     }
     try {
-      db.saveAIProvider(
+      await db.saveAIProvider(
         workspaceId,
         "dataforseo" as any,
         password || null,
@@ -1921,9 +2305,9 @@
   });
 
   // AI Providers Settings and Infrastructure API
-  app.get("/api/ai-providers", (req, res) => {
+  app.get("/api/ai-providers", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const dbProviders = db.getAIProviders(workspaceId);
+    const dbProviders = await db.getAIProviders(workspaceId);
     
     const allProviders: { provider: AIProviderName; isEnabled: boolean; priority: number; hasApiKey: boolean; defaultModel?: string; monthlyUsage: number; lastConnectionDate?: string }[] = [
       { provider: "deepseek", isEnabled: false, priority: 1, hasApiKey: false, defaultModel: "deepseek-chat", monthlyUsage: 0 },
@@ -1959,7 +2343,7 @@
     res.json({ providers: merged });
   });
 
-  app.post("/api/ai-providers/save", (req, res) => {
+  app.post("/api/ai-providers/save", async (req, res) => {
     const {
       workspaceId = "default-workspace",
       provider,
@@ -1976,7 +2360,7 @@
     }
 
     try {
-      db.saveAIProvider(
+      await db.saveAIProvider(
         workspaceId,
         provider as AIProviderName,
         apiKey === undefined ? null : apiKey,
@@ -1993,33 +2377,33 @@
     }
   });
 
-  app.get("/api/ai-providers/routing", (req, res) => {
+  app.get("/api/ai-providers/routing", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const routing = db.getAIRouting(workspaceId);
+    const routing = await db.getAIRouting(workspaceId);
     res.json({ routing });
   });
 
-  app.post("/api/ai-providers/routing", (req, res) => {
+  app.post("/api/ai-providers/routing", async (req, res) => {
     const { workspaceId = "default-workspace", routing } = req.body;
     if (!routing || typeof routing !== "object") {
       return res.status(400).json({ error: "Missing or invalid routing configuration." });
     }
-    db.saveAIRouting(workspaceId, routing);
+    await db.saveAIRouting(workspaceId, routing);
     res.json({ success: true, message: "Successfully updated custom AI routing rules." });
   });
 
-  app.get("/api/ai-providers/usage", (req, res) => {
+  app.get("/api/ai-providers/usage", async (req, res) => {
     const workspaceId = (req.query.workspaceId as string) || "default-workspace";
-    const usage = db.getAIUsageStats(workspaceId);
+    const usage = await db.getAIUsageStats(workspaceId);
     res.json({ usage });
   });
 
-  app.post("/api/ai-providers/usage", (req, res) => {
+  app.post("/api/ai-providers/usage", async (req, res) => {
     const { workspaceId = "default-workspace", usage } = req.body;
     if (!usage || typeof usage !== "object") {
       return res.status(400).json({ error: "Missing or invalid usage stats." });
     }
-    db.saveAIUsageStats(workspaceId, usage);
+    await db.saveAIUsageStats(workspaceId, usage);
     res.json({ success: true, message: "Successfully updated usage statistics." });
   });
 
@@ -2032,7 +2416,7 @@
       const result = await AIProviderService.testProviderConnection(workspaceId, provider as AIProviderName);
       if (result.success) {
         const now = new Date().toISOString();
-        db.saveAIProvider(workspaceId, provider as AIProviderName, null, true, 0, undefined, undefined, now);
+        await db.saveAIProvider(workspaceId, provider as AIProviderName, null, true, 0, undefined, undefined, now);
       }
       res.json(result);
     } catch (err: unknown) {
@@ -2077,11 +2461,11 @@
         const seed = Math.floor(Math.random() * 1000000);
         const imageUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80&sig=${seed}`;
         
-        const currentStats = db.getAIUsageStats(workspaceId);
+        const currentStats = await db.getAIUsageStats(workspaceId);
         currentStats.imagesGenerated = (currentStats.imagesGenerated || 0) + 1;
         currentStats.estimatedCost = Number((Number(currentStats.estimatedCost) || 0) + 0.04).toFixed(2);
         currentStats.monthlyCost = Number((Number(currentStats.monthlyCost) || 0) + 0.04).toFixed(2);
-        db.saveAIUsageStats(workspaceId, currentStats);
+        await db.saveAIUsageStats(workspaceId, currentStats);
 
         return res.json({
           success: true,
@@ -2094,11 +2478,11 @@
         const lat = Math.floor(Math.random() * 3000) + 2500;
         const videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-41753-large.mp4";
         
-        const currentStats = db.getAIUsageStats(workspaceId);
+        const currentStats = await db.getAIUsageStats(workspaceId);
         currentStats.videosGenerated = (currentStats.videosGenerated || 0) + 1;
         currentStats.estimatedCost = Number((Number(currentStats.estimatedCost) || 0) + 0.25).toFixed(2);
         currentStats.monthlyCost = Number((Number(currentStats.monthlyCost) || 0) + 0.25).toFixed(2);
-        db.saveAIUsageStats(workspaceId, currentStats);
+        await db.saveAIUsageStats(workspaceId, currentStats);
 
         return res.json({
           success: true,
@@ -2117,7 +2501,7 @@
   });
 
   // --- Image Studio Pro API Endpoints ---
-  app.post("/api/images/generate", async (req, res) => {
+  app.post("/api/images/generate", aiGenerationRateLimiter, async (req, res) => {
     const { prompt, provider = "flux", aspectRatio = "1:1", category, mode = "text_to_image", productImageBase64 } = req.body;
     const workspaceId = (req.body.workspaceId as string) || (req.query.workspaceId as string) || (req.headers["x-workspace-id"] as string) || "default-workspace";
     if (!prompt) {
@@ -2141,7 +2525,7 @@
     }
   });
 
-  app.post("/api/images/analyze", async (req, res) => {
+  app.post("/api/images/analyze", aiGenerationRateLimiter, async (req, res) => {
     const { workspaceId = "default-workspace", imageBase64, productTitle } = req.body;
     if (!imageBase64) {
       return res.status(400).json({ error: "Missing required parameter 'imageBase64'." });
@@ -2164,7 +2548,7 @@
     const { workspaceId = "default-workspace" } = req.query;
     try {
       const db = await DatabaseManager.getInstance();
-      const list = db.getImageStudioProjects(workspaceId as string);
+      const list = await db.getImageStudioProjects(workspaceId as string);
       res.json(list);
     } catch (err: unknown) {
       const message = err instanceof Error ? err.message : String(err);
@@ -2190,7 +2574,7 @@
     }
     try {
       const db = await DatabaseManager.getInstance();
-      db.saveImageStudioProject({
+      await db.saveImageStudioProject({
         id,
         workspaceId,
         name,
@@ -2210,7 +2594,7 @@
     const { id } = req.params;
     try {
       const db = await DatabaseManager.getInstance();
-      db.deleteImageStudioProject(id);
+      await db.deleteImageStudioProject(id);
       res.json({ success: true });
     } catch (err: unknown) {
       const message = err instanceof Error ? err.message : String(err);
@@ -2232,12 +2616,12 @@
       
       // Auto generate Name if missing
       if (!newName) {
-        const projects = db.getImageStudioProjects("default-workspace");
+        const projects = await db.getImageStudioProjects("default-workspace");
         const original = projects.find((p: any) => p.id === id);
         newName = original ? `${original.name} (Copy)` : "Project Copy";
       }
 
-      db.duplicateImageStudioProject(id, newId, newName);
+      await db.duplicateImageStudioProject(id, newId, newName);
       res.json({ success: true, id: newId, name: newName });
     } catch (err: unknown) {
       const message = err instanceof Error ? err.message : String(err);
@@ -2256,7 +2640,7 @@
   } else {
     const distPath = path.join(process.cwd(), "dist");
     app.use(express.static(distPath));
-    app.get("*", (req, res) => {
+    app.get("*", async (req, res) => {
       res.sendFile(path.join(distPath, "index.html"));
     });
   }
```
