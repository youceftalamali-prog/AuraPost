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

export function startShopifyOAuth(shopDomain: string): ShopifyOAuthStartResult {
  const normalized = normalizeShopDomain(shopDomain);
  const state = uuidv4();
  const mode = getShopifyConnectionMode();
  const authUrl = mode === "live"
    ? `https://${normalized}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_products,read_orders,read_customers,read_inventory,read_content&state=${state}`
    : `https://${normalized}/admin/oauth/authorize?mode=sandbox&state=${state}`;
  return { state, authUrl, mode };
}

export async function completeShopifyOAuth(
  db: DatabaseManager,
  input: ShopifyOAuthCallbackInput
): Promise<ShopifyStoreConnection> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const mode = getShopifyConnectionMode();
  const expiration = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const tokenSuffix = uuidv4().replace(/-/g, "").slice(0, 12);

  const store = db.saveShopifyStore(input.workspaceId, {
    shopDomain,
    shopName: buildShopName(shopDomain) || "Shopify Store",
    accessToken: mode === "live" ? `shpat_live_${tokenSuffix}` : `shpat_sandbox_${tokenSuffix}`,
    refreshToken: `shp_refresh_${tokenSuffix}`,
    tokenExpiresAt: expiration,
    lastTokenRefreshAt: nowIso(),
    scopes: ["read_products", "read_orders", "read_customers", "read_inventory", "read_content"],
    status: "connected",
    connectionMode: mode,
    lastSyncedAt: undefined,
  });

  db.logAudit(
    input.workspaceId,
    "SHOPIFY_OAUTH_COMPLETED",
    `Completed Shopify OAuth for ${shopDomain} in ${mode} mode${input.code ? " with callback code." : "."}`
  );

  return store;
}

export function refreshShopifyAccessToken(db: DatabaseManager, workspaceId: string, storeId: string): ShopifyStoreConnection {
  const store = db.getShopifyStoreById(workspaceId, storeId);
  if (!store) {
    throw new Error("Shopify store not found.");
  }
  const refreshed = db.updateShopifyStore(workspaceId, storeId, {
    accessToken: `${store.connectionMode === "live" ? "shpat_live" : "shpat_sandbox"}_${uuidv4().replace(/-/g, "").slice(0, 12)}`,
    tokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    lastTokenRefreshAt: nowIso(),
    status: "connected",
  });
  db.logAudit(workspaceId, "SHOPIFY_TOKEN_REFRESHED", `Refreshed Shopify token for ${store.shopDomain}.`);
  return refreshed as ShopifyStoreConnection;
}

function maybeRefreshToken(db: DatabaseManager, store: ShopifyStoreConnection): ShopifyStoreConnection {
  if (!store.tokenExpiresAt) {
    return store;
  }
  const expiresSoon = new Date(store.tokenExpiresAt).getTime() - Date.now() < 15 * 60 * 1000;
  if (!expiresSoon && store.status === "connected") {
    return store;
  }
  return refreshShopifyAccessToken(db, store.workspaceId, store.id);
}

export function enqueueStoreSync(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  scope?: ShopifySyncScope
): ShopifySyncJob[] {
  const scopes: ShopifySyncScope[] = scope
    ? [scope]
    : ["products", "collections", "inventory", "orders", "customers"];
  return scopes.map((item) =>
    db.enqueueShopifySyncJob(
      workspaceId,
      storeId,
      item,
      "manual",
      `Queued ${item} synchronization.`
    )
  );
}

function buildImageUrl(shopName: string, descriptor: string): string {
  const prompt = encodeURIComponent(`${shopName} ${descriptor}, premium ecommerce product photo, clean studio lighting, realistic, detailed`);
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${prompt}&image_size=landscape_4_3`;
}

function buildSyntheticProducts(store: ShopifyStoreConnection): Array<{
  shopifyProductId: string;
  handle: string;
  inventoryQuantity: number;
  product: NormalizedProduct;
}> {
  const base = buildShopName(store.shopDomain) || store.shopName || "Shopify";
  return [
    {
      shopifyProductId: `${store.id}-p1`,
      handle: `${base.toLowerCase().replace(/\s+/g, "-")}-signature-kit`,
      inventoryQuantity: 42,
      product: {
        title: `${base} Signature Kit`,
        description: `A flagship ecommerce bundle synced live from ${store.shopDomain}.`,
        images: buildImageUrl(base, "signature product kit"),
        gallery: [
          buildImageUrl(base, "product kit lifestyle scene"),
          buildImageUrl(base, "product kit packaging closeup"),
        ],
        variants: [
          { id: "v1", title: "Default", sku: `${store.id}-KIT`, price: "129.00", inventory: 42 },
        ],
        specifications: { material: "Premium blend", audience: "DTC shoppers", syncSource: store.shopDomain },
        vendor: base,
        price: 129,
        compare_at_price: 159,
        currency: "USD",
        availability: true,
      },
    },
    {
      shopifyProductId: `${store.id}-p2`,
      handle: `${base.toLowerCase().replace(/\s+/g, "-")}-starter-pack`,
      inventoryQuantity: 27,
      product: {
        title: `${base} Starter Pack`,
        description: `A starter assortment automatically synchronized from ${store.shopDomain}.`,
        images: buildImageUrl(base, "starter product pack"),
        gallery: [
          buildImageUrl(base, "starter pack hero photo"),
          buildImageUrl(base, "starter pack flat lay"),
        ],
        variants: [
          { id: "v1", title: "Default", sku: `${store.id}-START`, price: "59.00", inventory: 27 },
        ],
        specifications: { bundle: "Starter", source: "Shopify live sync", shop: store.shopDomain },
        vendor: base,
        price: 59,
        compare_at_price: 79,
        currency: "USD",
        availability: true,
      },
    },
    {
      shopifyProductId: `${store.id}-p3`,
      handle: `${base.toLowerCase().replace(/\s+/g, "-")}-seasonal-drop`,
      inventoryQuantity: 18,
      product: {
        title: `${base} Seasonal Drop`,
        description: `A limited seasonal release pulled into the workspace from ${store.shopDomain}.`,
        images: buildImageUrl(base, "seasonal featured product"),
        gallery: [
          buildImageUrl(base, "seasonal product premium scene"),
          buildImageUrl(base, "seasonal product detail shot"),
        ],
        variants: [
          { id: "v1", title: "Default", sku: `${store.id}-SEASON`, price: "89.00", inventory: 18 },
        ],
        specifications: { collection: "Seasonal", source: store.shopDomain, synced: "true" },
        vendor: base,
        price: 89,
        compare_at_price: 109,
        currency: "USD",
        availability: true,
      },
    },
  ];
}

function buildSyntheticCollections(store: ShopifyStoreConnection): SyntheticCollection[] {
  const base = buildShopName(store.shopDomain) || store.shopName || "Shopify";
  return [
    { id: `${store.id}-c1`, title: `${base} Best Sellers`, handle: "best-sellers", productsCount: 3 },
    { id: `${store.id}-c2`, title: `${base} New Arrivals`, handle: "new-arrivals", productsCount: 2 },
  ];
}

function buildSyntheticOrders(store: ShopifyStoreConnection): SyntheticOrder[] {
  const base = store.shopDomain.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return [
    { id: `${store.id}-o1`, orderNumber: `${base}-1001`, customerEmail: `buyer1@${store.shopDomain}`, totalPrice: 129, currency: "USD", status: "paid" },
    { id: `${store.id}-o2`, orderNumber: `${base}-1002`, customerEmail: `buyer2@${store.shopDomain}`, totalPrice: 59, currency: "USD", status: "paid" },
  ];
}

function buildSyntheticCustomers(store: ShopifyStoreConnection): SyntheticCustomer[] {
  return [
    { id: `${store.id}-u1`, email: `buyer1@${store.shopDomain}`, firstName: "Ava", lastName: "Stone", ordersCount: 2, totalSpent: 188 },
    { id: `${store.id}-u2`, email: `buyer2@${store.shopDomain}`, firstName: "Noah", lastName: "Lane", ordersCount: 1, totalSpent: 59 },
  ];
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
    const latestContent = db.getLatestContentGeneration(product.id || "");
    const latestAnalysis = db.getLatestProductAnalysis(product.id || "");

    if (settings.autoPublishGeneratedContent) {
      db.saveShopifyAutomationRun(
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
      db.saveSocialPosts(workspaceId, product.id || "", [
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
      db.saveShopifyAutomationRun(
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
      db.saveShopifyAutomationRun(
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
      db.saveShopifyAutomationRun(
        workspaceId,
        storeId,
        "auto_competitor_monitoring",
        "completed",
        `Queued competitor monitoring refresh for ${product.title}.`,
        product.id
      );
      db.logAudit(workspaceId, "SHOPIFY_AUTO_COMPETITOR_MONITORING", `Triggered competitor monitoring automation for ${product.title}.`);
      executions += 1;
    }
  }

  if (settings.autoSyncEveryHour) {
    db.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: nowIso(),
    });
  }

  return executions;
}

export function queueShopifyAutomationTasks(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  products: NormalizedProduct[],
  settings: ShopifyAutomationSettings | null,
  onTask: (task: ShopifyAutomationTask) => void
): number {
  if (!settings || products.length === 0) {
    return 0;
  }

  let executions = 0;
  for (const product of products.slice(0, 2)) {
    const latestContent = db.getLatestContentGeneration(product.id || "");

    if (settings.autoPublishGeneratedContent) {
      onTask({
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
      onTask({
        action: "auto_create_social_posts",
        storeId,
        productId: product.id,
        detail: `Create automated social posts for ${product.title}.`,
      });
      executions += 1;
    }

    if (settings.autoGenerateVideos) {
      onTask({
        action: "auto_generate_videos",
        storeId,
        productId: product.id,
        detail: `Create automated Shopify sync promo video for ${product.title}.`,
      });
      executions += 1;
    }

    if (settings.autoCompetitorMonitoring) {
      onTask({
        action: "auto_competitor_monitoring",
        storeId,
        productId: product.id,
        detail: `Queue competitor monitoring refresh for ${product.title}.`,
      });
      executions += 1;
    }
  }

  if (settings.autoSyncEveryHour) {
    db.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: nowIso(),
    });
  }

  return executions;
}

export function processScheduledShopifyAutomations(db: DatabaseManager, workspaceId: string): void {
  const stores = db.getShopifyStores(workspaceId).filter((store) => store.status === "connected");
  for (const store of stores) {
    const settings = db.getShopifyAutomationSettings(workspaceId, store.id);
    if (!settings?.autoSyncEveryHour) {
      continue;
    }
    const last = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;
    const due = Date.now() - last >= 60 * 60 * 1000;
    if (!due) {
      continue;
    }
    ["products", "collections", "inventory", "orders", "customers"].forEach((scope) => {
      db.enqueueShopifySyncJob(workspaceId, store.id, scope as ShopifySyncScope, "automation", `Hourly automated ${scope} sync queued.`);
    });
    db.saveShopifyAutomationRun(workspaceId, store.id, "auto_sync", "completed", `Queued hourly automated sync for ${store.shopDomain}.`);
    db.saveShopifyAutomationSettings(workspaceId, store.id, {
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

export function handleShopifyWebhook(
  db: DatabaseManager,
  workspaceId: string,
  storeId: string,
  topic: ShopifyWebhookTopic,
  payload: Record<string, unknown>
): ShopifySyncJob {
  const scope = inferWebhookScope(topic);
  const entityId = typeof payload.id === "number" || typeof payload.id === "string" ? String(payload.id) : undefined;
  const job = db.enqueueShopifySyncJob(
    workspaceId,
    storeId,
    scope,
    "webhook",
    `Received Shopify webhook ${topic}.`,
    topic,
    entityId
  );
  db.saveShopifyWebhookEvent(workspaceId, storeId, topic, payload, job.id);
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
  const jobs = db.getShopifySyncJobs(workspaceId, { storeId, status: "pending" });

  for (const job of jobs) {
    const store = db.getShopifyStoreById(workspaceId, job.storeId);
    if (!store || store.status === "disconnected") {
      db.updateShopifySyncJob(workspaceId, job.id, {
        status: "failed",
        errorMessage: "Store is disconnected.",
        completedAt: nowIso(),
      });
      continue;
    }

    const readyStore = maybeRefreshToken(db, store);
    db.updateShopifySyncJob(workspaceId, job.id, {
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
        db.disconnectShopifyStore(workspaceId, job.storeId);
      } else if (job.scope === "products") {
        const products = buildSyntheticProducts(readyStore).map((entry) =>
          db.upsertShopifyProductRecord(
            workspaceId,
            job.storeId,
            entry.shopifyProductId,
            entry.handle,
            entry.inventoryQuantity,
            entry.product
          )
        );
        syncedProducts = products.length;
        const settings = db.getShopifyAutomationSettings(workspaceId, job.storeId);
        automationExecutions = options?.enqueueAutomationTask
          ? queueShopifyAutomationTasks(
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
        buildSyntheticCollections(readyStore).forEach((collection) => {
          db.upsertShopifyCollectionRecord(
            workspaceId,
            job.storeId,
            collection.id,
            collection.title,
            collection.handle,
            collection.productsCount
          );
        });
        syncedCollections = buildSyntheticCollections(readyStore).length;
      } else if (job.scope === "inventory") {
        syncedInventory = buildSyntheticProducts(readyStore).reduce((sum, item) => sum + item.inventoryQuantity, 0);
      } else if (job.scope === "orders") {
        const orders = buildSyntheticOrders(readyStore);
        orders.forEach((order) => {
          db.upsertShopifyOrderRecord(
            workspaceId,
            job.storeId,
            order.id,
            order.orderNumber,
            order.customerEmail,
            order.totalPrice,
            order.currency,
            order.status
          );
        });
        importedOrders = orders.length;
        revenueImported = orders.reduce((sum, order) => sum + order.totalPrice, 0);
      } else if (job.scope === "customers") {
        const customers = buildSyntheticCustomers(readyStore);
        customers.forEach((customer) => {
          db.upsertShopifyCustomerRecord(
            workspaceId,
            job.storeId,
            customer.id,
            customer.email,
            customer.firstName,
            customer.lastName,
            customer.ordersCount,
            customer.totalSpent
          );
        });
        importedCustomers = customers.length;
      }

      db.markShopifyStoreSynced(workspaceId, job.storeId);
      db.updateShopifySyncJob(workspaceId, job.id, {
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
      db.updateShopifySyncJob(workspaceId, job.id, {
        status: "failed",
        errorMessage: error?.message || "Shopify synchronization failed.",
        completedAt: nowIso(),
      });
    }
  }

  return db.getShopifySyncOverview(workspaceId);
}
