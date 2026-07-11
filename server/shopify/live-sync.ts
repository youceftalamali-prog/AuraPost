import { v4 as uuidv4 } from "uuid";
import {
  NormalizedProduct,
  ShopifyAutomationSettings,
  ShopifyStoreConnection,
  ShopifySyncJob,
  ShopifySyncOverview,
  ShopifySyncScope,
  ShopifyWebhookTopic,
} from "../../src/types.ts";
import { DatabaseManager } from "../db.ts";
import { createVideoDraft, processVideoQueue } from "../video/studio.ts";

interface ShopifyOAuthStartResult {
  state: string;
  authUrl: string;
  mode: "sandbox" | "live";
}

interface ShopifyOAuthCallbackInput {
  workspaceId: string;
  shopDomain: string;
  code?: string;
  state?: string;
}

type SyntheticCollection = {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
};

type SyntheticOrder = {
  id: string;
  orderNumber: string;
  customerEmail: string;
  totalPrice: number;
  currency: string;
  status: string;
};

type SyntheticCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function getShopifyConnectionMode(): "sandbox" | "live" {
  return process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET ? "live" : "sandbox";
}

function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function buildShopName(shopDomain: string): string {
  return shopDomain
    .replace(".myshopify.com", "")
    .replace(/\.[a-z]+$/, "")
    .split(/[-.]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function isTestMode(): boolean {
  return process.env.NODE_ENV === "test" || process.env.SHOPIFY_SYNC_TEST_MODE === "true";
}

const SHOPIFY_API_VERSION = "2024-01";

export function startShopifyOAuth(shopDomain: string, redirectUri: string): ShopifyOAuthStartResult {
  const normalized = normalizeShopDomain(shopDomain);
  const state = uuidv4();
  const mode = getShopifyConnectionMode();

  if (mode === "live") {
    const scopes = ["read_products", "read_orders", "read_customers", "read_inventory", "read_content"].join(",");
    const authUrl =
      `https://${normalized}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(process.env.SHOPIFY_API_KEY as string)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;
    return { state, authUrl, mode };
  }

  if (!isTestMode()) {
    throw new Error(
      "Shopify integration is not configured: SHOPIFY_API_KEY and SHOPIFY_API_SECRET environment " +
      "variables must be set to connect a real store. Sandbox mode is only available when " +
      "SHOPIFY_SYNC_TEST_MODE=true or NODE_ENV=test."
    );
  }
  const authUrl = `https://${normalized}/admin/oauth/authorize?mode=sandbox&state=${state}`;
  return { state, authUrl, mode };
}

/**
 * PRODUCTION FIX (Phase 3): previously fabricated a fake access token (`shpat_live_${uuid}`)
 * without ever contacting Shopify. This now performs the real OAuth code exchange against
 * Shopify's Admin API (`POST /admin/oauth/access_token`), per
 * https://shopify.dev/docs/apps/auth/oauth/getting-started
 */
export async function completeShopifyOAuth(
  db: DatabaseManager,
  input: ShopifyOAuthCallbackInput
): Promise<ShopifyStoreConnection> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const mode = getShopifyConnectionMode();

  let accessToken: string;
  let scopes: string[];
  let tokenExpiresAt: string | undefined;

  if (mode === "live") {
    if (!input.code) {
      throw new Error("Missing OAuth 'code' parameter from Shopify's redirect - cannot exchange for an access token.");
    }
    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code: input.code,
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`Shopify OAuth token exchange failed (HTTP ${tokenResponse.status}): ${errBody || tokenResponse.statusText}`);
    }

    const tokenJson = await tokenResponse.json() as { access_token: string; scope: string };
    accessToken = tokenJson.access_token;
    scopes = tokenJson.scope ? tokenJson.scope.split(",") : [];
    // Shopify offline access tokens (the default for this flow) do not expire; there is no
    // real expiry to store, so we do not fabricate one.
    tokenExpiresAt = undefined;
  } else {
    if (!isTestMode()) {
      throw new Error(
        "Shopify integration is not configured: SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set " +
        "to complete a real OAuth flow. Refusing to fabricate an access token outside of test mode."
      );
    }
    // Sandbox/test-mode only: a clearly-labeled placeholder token for local development against
    // Shopify's own dev-store sandbox, never used against real store data outside test mode.
    accessToken = `shpat_sandbox_test_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    scopes = ["read_products", "read_orders", "read_customers", "read_inventory", "read_content"];
  }

  const store = await db.saveShopifyStore(input.workspaceId, {
    shopDomain,
    shopName: buildShopName(shopDomain) || "Shopify Store",
    accessToken,
    refreshToken: undefined,
    tokenExpiresAt,
    lastTokenRefreshAt: nowIso(),
    scopes,
    status: "connected",
    connectionMode: mode,
    lastSyncedAt: undefined,
  });

  await db.logAudit(
    input.workspaceId,
    "SHOPIFY_OAUTH_COMPLETED",
    `Completed real Shopify OAuth for ${shopDomain} in ${mode} mode.`
  );

  return store;
}

/**
 * PRODUCTION FIX (Phase 3): Shopify offline access tokens issued via the standard OAuth flow
 * do not expire, so there is no legitimate "refresh" operation to fabricate. If a token is
 * revoked (e.g. app uninstalled), the store must go through OAuth again. This function now
 * only marks the store as needing re-authorization instead of minting a fake replacement token.
 */
export async function refreshShopifyAccessToken(db: DatabaseManager, workspaceId: string, storeId: string): Promise<ShopifyStoreConnection> {
  const store = await db.getShopifyStoreById(workspaceId, storeId);
  if (!store) {
    throw new Error("Shopify store not found.");
  }
  await db.logAudit(
    workspaceId,
    "SHOPIFY_REAUTH_REQUIRED",
    `Shopify access for ${store.shopDomain} requires re-authorization; offline tokens do not expire ` +
    `so no token was fabricated. Please reconnect the store via OAuth.`
  );
  return await db.updateShopifyStore(workspaceId, storeId, {
    status: "needs_reauth",
  }) as ShopifyStoreConnection;
}

function maybeRefreshToken(db: DatabaseManager, store: ShopifyStoreConnection): ShopifyStoreConnection {
  // PRODUCTION FIX (Phase 3): real Shopify offline tokens don't expire, so there is nothing to
  // proactively refresh. We only flag re-auth when Shopify itself rejects a request (see the
  // 401 handling in fetchShopifyAdminApi below).
  return store;
}

export async function enqueueStoreSync(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  scope?: ShopifySyncScope
): Promise<ShopifySyncJob[]> {
  const scopes: ShopifySyncScope[] = scope
    ? [scope]
    : ["products", "collections", "inventory", "orders", "customers"];
  return Promise.all(scopes.map((item) =>
    db.enqueueShopifySyncJob(
      workspaceId,
      storeId,
      item,
      "manual",
      `Queued ${item} synchronization.`
    )
  ));
}

/**
 * PRODUCTION FIX (Phase 3): the previous `buildImageUrl` sent every synced product's name to an
 * undisclosed third-party image-generation endpoint and passed the *result* off as the
 * product's real Shopify photo. Product images must come from Shopify itself.
 */

async function fetchShopifyAdminApi<T>(
  db: DatabaseManager,
  workspaceId: string,
  store: ShopifyStoreConnection,
  path: string
): Promise<T> {
  if (!store.accessToken) {
    throw new Error(`Shopify store ${store.shopDomain} has no access token. Please reconnect via OAuth.`);
  }
  const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${path}`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": store.accessToken,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    await db.updateShopifyStore(workspaceId, store.id, { status: "needs_reauth" });
    throw new Error(`Shopify rejected the access token for ${store.shopDomain} (HTTP ${response.status}). Store needs re-authorization.`);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Shopify Admin API request to ${path} failed (HTTP ${response.status}): ${errBody || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

interface ShopifyRestProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  handle: string;
  variants: Array<{ id: number; title: string; sku: string; price: string; inventory_quantity?: number; compare_at_price?: string | null }>;
  images: Array<{ src: string }>;
  status: string;
}

function mapShopifyProductToNormalized(shopProduct: ShopifyRestProduct, storeDomain: string): {
  shopifyProductId: string;
  handle: string;
  inventoryQuantity: number;
  product: NormalizedProduct;
} {
  const primaryVariant = shopProduct.variants?.[0];
  const inventoryQuantity = (shopProduct.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
  const images = (shopProduct.images || []).map((img) => img.src);

  return {
    shopifyProductId: String(shopProduct.id),
    handle: shopProduct.handle,
    inventoryQuantity,
    product: {
      title: shopProduct.title,
      description: shopProduct.body_html || "",
      images: images[0] || "",
      gallery: images.slice(1),
      variants: (shopProduct.variants || []).map((v) => ({
        id: String(v.id),
        title: v.title,
        sku: v.sku,
        price: v.price,
        inventory: v.inventory_quantity ?? 0,
      })),
      specifications: { syncSource: storeDomain, shopifyStatus: shopProduct.status },
      vendor: shopProduct.vendor,
      price: primaryVariant ? parseFloat(primaryVariant.price) : 0,
      compare_at_price: primaryVariant?.compare_at_price ? parseFloat(primaryVariant.compare_at_price) : undefined,
      currency: "USD",
      availability: shopProduct.status === "active",
    },
  };
}

async function fetchRealShopifyProducts(
  db: DatabaseManager,
  workspaceId: string,
  store: ShopifyStoreConnection
): Promise<Array<{ shopifyProductId: string; handle: string; inventoryQuantity: number; product: NormalizedProduct }>> {
  const data = await fetchShopifyAdminApi<{ products: ShopifyRestProduct[] }>(
    db, workspaceId, store, "products.json?limit=50"
  );
  return (data.products || []).map((p) => mapShopifyProductToNormalized(p, store.shopDomain));
}

async function fetchRealShopifyCollections(
  db: DatabaseManager,
  workspaceId: string,
  store: ShopifyStoreConnection
): Promise<SyntheticCollection[]> {
  const data = await fetchShopifyAdminApi<{ custom_collections: Array<{ id: number; title: string; handle: string; products_count?: number }> }>(
    db, workspaceId, store, "custom_collections.json?limit=50"
  );
  return (data.custom_collections || []).map((c) => ({
    id: String(c.id),
    title: c.title,
    handle: c.handle,
    productsCount: c.products_count ?? 0,
  }));
}

async function fetchRealShopifyOrders(
  db: DatabaseManager,
  workspaceId: string,
  store: ShopifyStoreConnection
): Promise<SyntheticOrder[]> {
  const data = await fetchShopifyAdminApi<{
    orders: Array<{ id: number; order_number: number; email?: string; total_price: string; currency: string; financial_status: string }>;
  }>(db, workspaceId, store, "orders.json?status=any&limit=50");
  return (data.orders || []).map((o) => ({
    id: String(o.id),
    orderNumber: String(o.order_number),
    customerEmail: o.email || "",
    totalPrice: parseFloat(o.total_price),
    currency: o.currency,
    status: o.financial_status,
  }));
}

async function fetchRealShopifyCustomers(
  db: DatabaseManager,
  workspaceId: string,
  store: ShopifyStoreConnection
): Promise<SyntheticCustomer[]> {
  const data = await fetchShopifyAdminApi<{
    customers: Array<{ id: number; email: string; first_name?: string; last_name?: string; orders_count: number; total_spent: string }>;
  }>(db, workspaceId, store, "customers.json?limit=50");
  return (data.customers || []).map((c) => ({
    id: String(c.id),
    email: c.email,
    firstName: c.first_name || "",
    lastName: c.last_name || "",
    ordersCount: c.orders_count,
    totalSpent: parseFloat(c.total_spent),
  }));
}

export interface ShopifyAutomationTask {
  action:
    | "auto_sync"
    | "auto_publish_generated_content"
    | "auto_create_social_posts"
    | "auto_generate_videos"
    | "auto_competitor_monitoring";
  storeId: string;
  productId?: string;
  detail: string;
}

async function runProductAutomations(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  products: NormalizedProduct[],
  settings: ShopifyAutomationSettings | null
): Promise<number> {
  if (!settings || products.length === 0) {
    return 0;
  }

  let executions = 0;

  for (const product of products.slice(0, 2)) {
    const latestContent = await db.getLatestContentGeneration(product.id || "");
    const latestAnalysis = await db.getLatestProductAnalysis(product.id || "");

    if (settings.autoPublishGeneratedContent) {
      await db.saveShopifyAutomationRun(
        workspaceId,
        storeId,
        "auto_publish_generated_content",
        latestContent ? "completed" : "failed",
        latestContent
          ? `Marked generated content package ${latestContent.id} as ready for publishing for ${product.title}.`
          : `Skipped auto publish for ${product.title} because no content generation exists.`,
        product.id
      );
      executions += 1;
    }

    if (settings.autoCreateSocialPosts) {
      await db.saveSocialPosts(workspaceId, product.id || "", [
        {
          platform: "instagram",
          title: `${product.title} Social Launch`,
          caption: `Freshly synced from Shopify: ${product.title}. ${latestContent?.headline || "New product drop now live."}`,
          hashtags: ["#shopify", "#productlaunch", "#socialautomation"],
          mediaUrls: [product.images, ...product.gallery].filter(Boolean).slice(0, 2),
          status: "draft",
          previewText: `${product.title} social launch draft`,
          sourceType: "shopify_sync_automation",
          sourceGenerationId: latestContent?.id,
        },
      ]);
      await db.saveShopifyAutomationRun(
        workspaceId,
        storeId,
        "auto_create_social_posts",
        "completed",
        `Created automated social draft for ${product.title}.`,
        product.id
      );
      executions += 1;
    }

    if (settings.autoGenerateVideos) {
      await createVideoDraft(db, {
        workspaceId,
        product,
        analysis: latestAnalysis,
        latestContent,
        template: "product_showcase",
        outputType: "short_form_vertical",
        inputMode: "product_images",
        prompt: `Create an automated Shopify sync promo video for ${product.title}.`,
        durationSeconds: 20,
        aspectRatio: "9:16",
        sourceImageUrls: [product.images, ...product.gallery].filter(Boolean),
      });
      await processVideoQueue(db, workspaceId, product.id);
      await db.saveShopifyAutomationRun(
        workspaceId,
        storeId,
        "auto_generate_videos",
        "completed",
        `Created automated video draft for ${product.title}.`,
        product.id
      );
      executions += 1;
    }

    if (settings.autoCompetitorMonitoring) {
      await db.saveShopifyAutomationRun(
        workspaceId,
        storeId,
        "auto_competitor_monitoring",
        "completed",
        `Queued competitor monitoring refresh for ${product.title}.`,
        product.id
      );
      await db.logAudit(workspaceId, "SHOPIFY_AUTO_COMPETITOR_MONITORING", `Triggered competitor monitoring automation for ${product.title}.`);
      executions += 1;
    }
  }

  if (settings.autoSyncEveryHour) {
    await db.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: nowIso(),
    });
  }

  return executions;
}

export async function queueShopifyAutomationTasks(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  products: NormalizedProduct[],
  settings: ShopifyAutomationSettings | null,
  onTask: (task: ShopifyAutomationTask) => void | Promise<void>
): Promise<number> {
  if (!settings || products.length === 0) {
    return 0;
  }

  let executions = 0;
  for (const product of products.slice(0, 2)) {
    const latestContent = await db.getLatestContentGeneration(product.id || "");

    if (settings.autoPublishGeneratedContent) {
      await onTask({
        action: "auto_publish_generated_content",
        storeId,
        productId: product.id,
        detail: latestContent
          ? `Prepare generated content ${latestContent.id} for ${product.title}.`
          : `No generated content available yet for ${product.title}.`,
      });
      executions += 1;
    }

    if (settings.autoCreateSocialPosts) {
      await onTask({
        action: "auto_create_social_posts",
        storeId,
        productId: product.id,
        detail: `Create automated social posts for ${product.title}.`,
      });
      executions += 1;
    }

    if (settings.autoGenerateVideos) {
      await onTask({
        action: "auto_generate_videos",
        storeId,
        productId: product.id,
        detail: `Create automated Shopify sync promo video for ${product.title}.`,
      });
      executions += 1;
    }

    if (settings.autoCompetitorMonitoring) {
      await onTask({
        action: "auto_competitor_monitoring",
        storeId,
        productId: product.id,
        detail: `Queue competitor monitoring refresh for ${product.title}.`,
      });
      executions += 1;
    }
  }

  if (settings.autoSyncEveryHour) {
    await db.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: nowIso(),
    });
  }

  return executions;
}

export async function processScheduledShopifyAutomations(db: DatabaseManager, workspaceId: string): Promise<void> {
  const allStores = await db.getShopifyStores(workspaceId);
  const stores = allStores.filter((store) => store.status === "connected");
  for (const store of stores) {
    const settings = await db.getShopifyAutomationSettings(workspaceId, store.id);
    if (!settings?.autoSyncEveryHour) {
      continue;
    }
    const last = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;
    const due = Date.now() - last >= 60 * 60 * 1000;
    if (!due) {
      continue;
    }
    for (const scope of ["products", "collections", "inventory", "orders", "customers"]) {
      await db.enqueueShopifySyncJob(workspaceId, store.id, scope as ShopifySyncScope, "automation", `Hourly automated ${scope} sync queued.`);
    }
    await db.saveShopifyAutomationRun(workspaceId, store.id, "auto_sync", "completed", `Queued hourly automated sync for ${store.shopDomain}.`);
    await db.saveShopifyAutomationSettings(workspaceId, store.id, {
      lastAutoSyncAt: nowIso(),
    });
  }
}

function inferWebhookScope(topic: ShopifyWebhookTopic): ShopifySyncScope {
  if (topic.startsWith("products/")) {
    return "products";
  }
  if (topic.startsWith("orders/")) {
    return "orders";
  }
  return "webhook";
}

export async function handleShopifyWebhook(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  topic: ShopifyWebhookTopic,
  payload: Record<string, unknown>
): Promise<ShopifySyncJob> {
  const scope = inferWebhookScope(topic);
  const entityId = typeof payload.id === "number" || typeof payload.id === "string" ? String(payload.id) : undefined;
  const job = await db.enqueueShopifySyncJob(
    workspaceId,
    storeId,
    scope,
    "webhook",
    `Received Shopify webhook ${topic}.`,
    topic,
    entityId
  );
  await db.saveShopifyWebhookEvent(workspaceId, storeId, topic, payload, job.id);
  return job;
}

export async function processShopifySyncQueue(
  db: DatabaseManager,
  workspaceId: string,
  storeId?: string,
  options?: {
    scheduleAutomations?: boolean;
    enqueueAutomationTask?: (task: ShopifyAutomationTask) => void;
  }
): Promise<ShopifySyncOverview> {
  if (options?.scheduleAutomations !== false) {
    processScheduledShopifyAutomations(db, workspaceId);
  }
  const jobs = await db.getShopifySyncJobs(workspaceId, { storeId, status: "pending" });

  for (const job of jobs) {
    const store = await db.getShopifyStoreById(workspaceId, job.storeId);
    if (!store || store.status === "disconnected") {
      await db.updateShopifySyncJob(workspaceId, job.id, {
        status: "failed",
        errorMessage: "Store is disconnected.",
        completedAt: nowIso(),
      });
      continue;
    }

    const readyStore = maybeRefreshToken(db, store);
    await db.updateShopifySyncJob(workspaceId, job.id, {
      status: "syncing",
      startedAt: nowIso(),
      summary: `Synchronizing ${job.scope} for ${readyStore.shopDomain}.`,
    });

    try {
      let syncedProducts = 0;
      let syncedCollections = 0;
      let syncedInventory = 0;
      let importedOrders = 0;
      let importedCustomers = 0;
      let revenueImported = 0;
      let automationExecutions = 0;

      if (job.webhookTopic === "app/uninstalled") {
        await db.disconnectShopifyStore(workspaceId, job.storeId);
      } else if (job.scope === "products") {
        const fetchedProducts = await fetchRealShopifyProducts(db, workspaceId, readyStore);
        const products = await Promise.all(fetchedProducts.map((entry) =>
          db.upsertShopifyProductRecord(
            workspaceId,
            job.storeId,
            entry.shopifyProductId,
            entry.handle,
            entry.inventoryQuantity,
            entry.product
          )
        ));
        syncedProducts = products.length;
        const settings = await db.getShopifyAutomationSettings(workspaceId, job.storeId);
        automationExecutions = options?.enqueueAutomationTask
          ? await queueShopifyAutomationTasks(
              db,
              workspaceId,
              job.storeId,
              products,
              settings,
              options.enqueueAutomationTask
            )
          : await runProductAutomations(
              db,
              workspaceId,
              job.storeId,
              products,
              settings
            );
      } else if (job.scope === "collections") {
        const collections = await fetchRealShopifyCollections(db, workspaceId, readyStore);
        for (const collection of collections) {
          await db.upsertShopifyCollectionRecord(
            workspaceId,
            job.storeId,
            collection.id,
            collection.title,
            collection.handle,
            collection.productsCount
          );
        }
        syncedCollections = collections.length;
      } else if (job.scope === "inventory") {
        const fetchedProducts = await fetchRealShopifyProducts(db, workspaceId, readyStore);
        syncedInventory = fetchedProducts.reduce((sum, item) => sum + item.inventoryQuantity, 0);
      } else if (job.scope === "orders") {
        const orders = await fetchRealShopifyOrders(db, workspaceId, readyStore);
        for (const order of orders) {
          await db.upsertShopifyOrderRecord(
            workspaceId,
            job.storeId,
            order.id,
            order.orderNumber,
            order.customerEmail,
            order.totalPrice,
            order.currency,
            order.status
          );
        }
        importedOrders = orders.length;
        revenueImported = orders.reduce((sum, order) => sum + order.totalPrice, 0);
      } else if (job.scope === "customers") {
        const customers = await fetchRealShopifyCustomers(db, workspaceId, readyStore);
        for (const customer of customers) {
          await db.upsertShopifyCustomerRecord(
            workspaceId,
            job.storeId,
            customer.id,
            customer.email,
            customer.firstName,
            customer.lastName,
            customer.ordersCount,
            customer.totalSpent
          );
        }
        importedCustomers = customers.length;
      }

      await db.markShopifyStoreSynced(workspaceId, job.storeId);
      await db.updateShopifySyncJob(workspaceId, job.id, {
        status: "completed",
        summary: `Completed ${job.scope} synchronization for ${readyStore.shopDomain}.`,
        syncedProducts,
        syncedCollections,
        syncedInventory,
        importedOrders,
        importedCustomers,
        revenueImported,
        automationExecutions,
        completedAt: nowIso(),
      });
    } catch (error: any) {
      await db.updateShopifySyncJob(workspaceId, job.id, {
        status: "failed",
        errorMessage: error?.message || "Shopify synchronization failed.",
        completedAt: nowIso(),
      });
    }
  }

  return await db.getShopifySyncOverview(workspaceId);
}
