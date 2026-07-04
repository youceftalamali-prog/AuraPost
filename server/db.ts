import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { v4 as uuidv4 } from "uuid";
import {
  NormalizedProduct,
  Workspace,
  ImportOperation,
  AuditLog,
  ProductAnalysis,
  ShopifyAutomationRun,
  ShopifyAutomationSettings,
  ShopifyStoreConnection,
  ShopifySyncAnalytics,
  ShopifySyncJob,
  ShopifySyncOverview,
  ShopifySyncScope,
  ShopifySyncStatus,
  ShopifySyncTrigger,
  ShopifyWebhookEvent,
  ShopifyWebhookTopic,
  DeadLetterJob,
  QueueAnalytics,
  QueueJobLog,
  QueueJobRecord,
  QueueJobKind,
  QueueJobStatus,
  QueueOverview,
  QueueWorkerName,
  WorkerHealthSnapshot,
  WorkspaceSubscription,
  BillingInvoice,
  PaymentHistoryItem,
  BillingAnalytics,
  BillingOverview,
  BillingPlanDefinition,
  CreditLedgerEntry,
  CreditBucketName,
  SubscriptionPlanName,
  SubscriptionStatus,
  SubscriptionInterval,
  WorkspaceCreditSummary,
  WorkspaceCreditBucket,
  ContentGenerationRecord,
  SocialAccount,
  SocialPlatform,
  SocialPost,
  SocialPostMetrics,
  SocialPostStatus,
  VideoGenerationRecord,
  VideoProviderName,
  VideoRenderStatus,
  VideoTemplateName,
  VideoOutputType,
  VideoInputMode,
  VideoAspectRatio,
  createEmptyBrandIntelligence,
  AIProviderName,
  AIProviderConfig,
  WooCommerceConnection,
  OAuthState,
} from "../src/types.ts";
import {
  BILLING_PLANS,
  CREDIT_BUCKET_LABELS,
  getBillingPlan,
  getBillingPlans,
  getPlanPrice,
} from "./billing/plans.ts";
import { encrypt, decrypt } from "./encryption.ts";

const isProduction = process.env.NODE_ENV === "production";
const SQLITE_DIR = isProduction ? "/tmp" : path.join(process.cwd(), "storage");
const SQLITE_FILE = path.join(SQLITE_DIR, "aurapost.db");

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: any = null;
  private isInitialized = false;

  private constructor() {}

  private isCorruptedDatabaseError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /database disk image is malformed|file is not a database|unsupported file format/i.test(message);
  }

  private backupCorruptedDatabase(): string | null {
    if (!fs.existsSync(SQLITE_FILE)) {
      return null;
    }

    const backupPath = `${SQLITE_FILE}.${Date.now()}.backup`;
    fs.renameSync(SQLITE_FILE, backupPath);
    return backupPath;
  }

  private initializeFreshDatabase(SQL: any): void {
    this.db = new SQL.Database();
    this.createSchema();
    this.seedInitialData();
    this.saveToDisk();
  }

  public static async getInstance(): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    await DatabaseManager.instance.init();
    return DatabaseManager.instance;
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (!fs.existsSync(SQLITE_DIR)) {
        fs.mkdirSync(SQLITE_DIR, { recursive: true });
      }
    } catch (error) {
      console.error(`[SQLite Warn] Could not ensure SQLite directory at ${SQLITE_DIR}:`, error);
    }

    let wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    if (!fs.existsSync(wasmPath)) {
      const dirnameFallback = typeof __dirname !== "undefined"
        ? path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm")
        : "";
      if (dirnameFallback && fs.existsSync(dirnameFallback)) {
        wasmPath = dirnameFallback;
      } else {
        const localFallback = typeof __dirname !== "undefined"
          ? path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm")
          : "";
        if (localFallback && fs.existsSync(localFallback)) {
          wasmPath = localFallback;
        } else {
          throw new Error(`FATAL: SQLite WASM not found at standard paths. Checked: ${wasmPath}, ${dirnameFallback}, ${localFallback}`);
        }
      }
    }
    const wasmBinary = fs.readFileSync(wasmPath) as any;
    const SQL = await initSqlJs({ wasmBinary });

    const hasExistingDbFile = fs.existsSync(SQLITE_FILE);

    try {
      if (hasExistingDbFile) {
        const fileBuffer = fs.readFileSync(SQLITE_FILE);
        this.db = new SQL.Database(fileBuffer);
      } else {
        this.db = new SQL.Database();
      }

      this.createSchema();
      this.seedInitialData();
      
      this.saveToDisk();
    } catch (err) {
      if (!hasExistingDbFile || !this.isCorruptedDatabaseError(err)) {
        if (!hasExistingDbFile) {
          console.error("FATAL: Failed to initialize in-memory SQLite database:", err);
        } else {
          console.error("Failed to read SQLite file from disk:", err);
        }
        throw err;
      }

      const backupPath = this.backupCorruptedDatabase();
      console.warn(`[SQLite Warn] Corrupted SQLite database detected at ${SQLITE_FILE}. Renamed to ${backupPath}. Recreating a fresh database.`);

      try {
        this.initializeFreshDatabase(SQL);
      } catch (recoveryError) {
        console.error("FATAL: Failed to recreate SQLite database after corruption recovery:", recoveryError);
        throw recoveryError;
      }
    }

    this.isInitialized = true;
    console.log("[SQLite Database] Fully loaded and operational at:", SQLITE_FILE);
  }

  public saveToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(SQLITE_FILE, buffer);
    } catch (err) {
      console.warn("Could not save SQLite to physical disk (possibly due to read-only container filesystem):", err);
    }
  }

  private getTableColumns(tableName: string): string[] {
    const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
    const columns: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name?: string };
      if (typeof row.name === "string") {
        columns.push(row.name);
      }
    }
    stmt.free();
    return columns;
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const columns = this.getTableColumns(tableName);
    if (!columns.includes(columnName)) {
      this.db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  private createSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        credits INTEGER DEFAULT 1000,
        stripe_customer_id TEXT
      );
    `);
    this.ensureColumn("workspaces", "stripe_customer_id", "TEXT");
    this.ensureColumn("workspaces", "ai_routing", "TEXT");
    this.ensureColumn("workspaces", "ai_usage_stats", "TEXT");
    
this.db.run(`  CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,

  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,

  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,

  avatar TEXT,

  auth_provider TEXT NOT NULL DEFAULT 'email',
  provider_id TEXT,

  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',

  email_verified INTEGER NOT NULL DEFAULT 0,

  last_login_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
   );
`); 

this.db.run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);");
this.db.run("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);");
this.db.run("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);");
this.db.run("CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);");
this.db.run("CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);");
this.db.run("CREATE INDEX IF NOT EXISTS idx_users_auth_provider_provider_id ON users(auth_provider, provider_id);");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        billing_interval TEXT NOT NULL DEFAULT 'monthly',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        stripe_portal_url TEXT,
        stripe_checkout_session_id TEXT,
        stripe_mode TEXT NOT NULL DEFAULT 'sandbox',
        trial_ends_at TEXT,
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        cancel_at_period_end INTEGER DEFAULT 0 NOT NULL,
        canceled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
  `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspace_credit_pools (
        workspace_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0,
        monthly_allocation INTEGER NOT NULL DEFAULT 0,
        used_this_period INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, bucket)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subscription_id TEXT,
        stripe_invoice_id TEXT,
        amount_paid REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL,
        hosted_invoice_url TEXT,
        invoice_pdf_url TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS payment_history (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        invoice_id TEXT,
        stripe_payment_intent_id TEXT,
        amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        processed_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_stores (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        shop_domain TEXT NOT NULL,
        shop_name TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TEXT,
        last_token_refresh_at TEXT,
        scopes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'connected',
        connection_mode TEXT NOT NULL DEFAULT 'sandbox',
        is_default INTEGER NOT NULL DEFAULT 0,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_synced_at TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_sync_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_source TEXT NOT NULL,
        webhook_topic TEXT,
        entity_id TEXT,
        summary TEXT NOT NULL,
        synced_products INTEGER NOT NULL DEFAULT 0,
        synced_collections INTEGER NOT NULL DEFAULT 0,
        synced_inventory INTEGER NOT NULL DEFAULT 0,
        imported_orders INTEGER NOT NULL DEFAULT 0,
        imported_customers INTEGER NOT NULL DEFAULT 0,
        revenue_imported REAL NOT NULL DEFAULT 0,
        automation_executions INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_webhook_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        sync_job_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_automation_settings (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL UNIQUE,
        auto_sync_every_hour INTEGER NOT NULL DEFAULT 1,
        auto_publish_generated_content INTEGER NOT NULL DEFAULT 0,
        auto_create_social_posts INTEGER NOT NULL DEFAULT 0,
        auto_generate_videos INTEGER NOT NULL DEFAULT 0,
        auto_competitor_monitoring INTEGER NOT NULL DEFAULT 0,
        last_auto_sync_at TEXT,
        last_automation_run_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_automation_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        product_id TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_product_links (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        shopify_product_id TEXT NOT NULL,
        handle TEXT,
        inventory_quantity INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_collections (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        shopify_collection_id TEXT NOT NULL,
        title TEXT NOT NULL,
        handle TEXT,
        products_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_orders (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        shopify_order_id TEXT NOT NULL,
        order_number TEXT NOT NULL,
        customer_email TEXT,
        total_price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_customers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        shopify_customer_id TEXT NOT NULL,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        orders_count INTEGER NOT NULL DEFAULT 0,
        total_spent REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS queue_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        status TEXT NOT NULL,
        reference_id TEXT,
        payload TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        backoff_ms INTEGER NOT NULL DEFAULT 1000,
        next_run_at TEXT NOT NULL,
        locked_at TEXT,
        last_error TEXT,
        dead_letter_reason TEXT,
        processing_time_ms INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS queue_job_logs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS queue_workers (
        worker_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        active_job_id TEXT,
        memory_usage_mb REAL NOT NULL DEFAULT 0,
        queue_length INTEGER NOT NULL DEFAULT 0,
        failed_jobs INTEGER NOT NULL DEFAULT 0,
        processed_jobs INTEGER NOT NULL DEFAULT 0,
        average_processing_time_ms REAL NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS dead_letter_jobs (
        id TEXT PRIMARY KEY,
        source_job_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        last_error TEXT NOT NULL,
        moved_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        images TEXT,
        gallery TEXT,
        variants TEXT,
        specifications TEXT,
        vendor TEXT,
        price REAL,
        compare_at_price REAL,
        currency TEXT,
        availability INTEGER,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS import_operations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        source_url TEXT NOT NULL,
        status TEXT NOT NULL,
        credit_charged INTEGER NOT NULL,
        error_message TEXT,
        product_id TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureColumn("import_operations", "fetch_time_ms", "INTEGER");
    this.ensureColumn("import_operations", "analyze_time_ms", "INTEGER");
    this.ensureColumn("import_operations", "telemetry", "TEXT");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS product_analyses (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        is_latest INTEGER DEFAULT 1 NOT NULL,
        language_code TEXT DEFAULT 'en' NOT NULL,
        confidence_score REAL DEFAULT 1.000 NOT NULL,
        ai_provider TEXT NOT NULL,
        ai_model TEXT NOT NULL,
        prompt_tokens_count INTEGER NOT NULL,
        completion_tokens_count INTEGER NOT NULL,
        latency_milliseconds INTEGER NOT NULL,
        opportunity_scores TEXT NOT NULL,
        market_intelligence TEXT NOT NULL,
        marketing_intelligence TEXT NOT NULL,
        brand_intelligence TEXT NOT NULL DEFAULT '{}',
        creative_intelligence TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureColumn("product_analyses", "brand_intelligence", "TEXT NOT NULL DEFAULT '{}'");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        running_balance INTEGER NOT NULL,
        credit_bucket TEXT,
        reference_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureColumn("credit_ledger", "credit_bucket", "TEXT");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS content_generations (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        credits_charged INTEGER NOT NULL,
        payload TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_latest INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        generation_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        generation_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        hook TEXT NOT NULL,
        problem TEXT NOT NULL,
        solution TEXT NOT NULL,
        benefits TEXT NOT NULL,
        cta TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS social_accounts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TEXT,
        integration_mode TEXT NOT NULL DEFAULT 'sandbox',
        status TEXT NOT NULL DEFAULT 'connected',
        connected_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        social_account_id TEXT,
        platform TEXT NOT NULL,
        title TEXT NOT NULL,
        caption TEXT NOT NULL,
        hashtags TEXT NOT NULL,
        media_urls TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        scheduled_at TEXT,
        published_at TEXT,
        external_post_id TEXT,
        preview_text TEXT NOT NULL,
        source_type TEXT,
        source_generation_id TEXT,
        failure_reason TEXT,
        metrics TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS video_generations (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        is_latest INTEGER DEFAULT 1 NOT NULL,
        template TEXT NOT NULL,
        output_type TEXT NOT NULL,
        input_mode TEXT NOT NULL,
        prompt TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_fallback_chain TEXT NOT NULL,
        aspect_ratio TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        progress INTEGER NOT NULL DEFAULT 0,
        credits_used INTEGER NOT NULL DEFAULT 0,
        estimated_render_seconds INTEGER NOT NULL DEFAULT 0,
        source_generation_id TEXT,
        source_analysis_id TEXT,
        source_image_urls TEXT NOT NULL,
        title TEXT NOT NULL,
        video_url TEXT,
        thumbnail_url TEXT,
        download_url TEXT,
        error_message TEXT,
        scenes TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // ─── NEW: Integration Tables ────────────────────────────────────────────
    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspace_ai_providers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        api_key_iv TEXT NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE(workspace_id, provider)
      );
    `);

    this.ensureColumn("workspace_ai_providers", "default_model", "TEXT");
    this.ensureColumn("workspace_ai_providers", "monthly_usage", "INTEGER DEFAULT 0");
    this.ensureColumn("workspace_ai_providers", "last_connection_date", "TEXT");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspace_woocommerce_connections (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_url TEXT NOT NULL,
        consumer_key_encrypted TEXT NOT NULL,
        consumer_key_iv TEXT NOT NULL,
        consumer_secret_encrypted TEXT NOT NULL,
        consumer_secret_iv TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE(workspace_id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        state TEXT NOT NULL UNIQUE,
        redirect_uri TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        refresh_token_id TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        device TEXT,
        platform TEXT,
        browser TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_activity_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_id ON sessions(refresh_token_id);");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);");
  }

  private ensureWorkspaceCreditPools(
    workspaceId: string,
    plan: SubscriptionPlanName,
    balances?: Partial<Record<CreditBucketName, number>>
  ): void {
    const now = new Date().toISOString();
    const planDef = getBillingPlan(plan);
    const allocationMap: Record<CreditBucketName, number> = {
      ai: planDef.aiCredits,
      video: planDef.videoCredits,
      publishing: planDef.publishingCredits,
    };

    (["ai", "video", "publishing"] as CreditBucketName[]).forEach((bucket) => {
      const stmt = this.db.prepare(
        "SELECT balance FROM workspace_credit_pools WHERE workspace_id = $workspaceId AND bucket = $bucket LIMIT 1"
      );
      stmt.bind({ $workspaceId: workspaceId, $bucket: bucket });
      const exists = stmt.step();
      stmt.free();
      if (exists) {
        return;
      }

      this.db.run(
        `INSERT INTO workspace_credit_pools (
          workspace_id, bucket, balance, monthly_allocation, used_this_period, updated_at
        ) VALUES (
          $workspaceId, $bucket, $balance, $monthlyAllocation, 0, $updatedAt
        )`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $balance: balances?.[bucket] ?? allocationMap[bucket],
          $monthlyAllocation: allocationMap[bucket],
          $updatedAt: now,
        }
      );
    });

    this.syncWorkspaceCredits(workspaceId);
  }

  private ensureSeedWorkspaceBilling(
    workspaceId: string,
    plan: SubscriptionPlanName,
    status: SubscriptionStatus,
    interval: SubscriptionInterval,
    balances?: Partial<Record<CreditBucketName, number>>
  ): void {
    const now = new Date();
    const trialEndsAt = status === "trialing"
      ? new Date(now.getTime() + getBillingPlan(plan).trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const stmt = this.db.prepare("SELECT id FROM billing_subscriptions WHERE workspace_id = $workspaceId LIMIT 1");
    stmt.bind({ $workspaceId: workspaceId });
    const exists = stmt.step();
    stmt.free();
    if (!exists) {
      this.db.run(
        `INSERT INTO billing_subscriptions (
          id, workspace_id, plan, status, billing_interval, stripe_customer_id, stripe_subscription_id,
          stripe_portal_url, stripe_checkout_session_id, stripe_mode, trial_ends_at, current_period_start,
          current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at
        ) VALUES (
          $id, $workspaceId, $plan, $status, $billingInterval, $stripeCustomerId, $stripeSubscriptionId,
          NULL, NULL, 'sandbox', $trialEndsAt, $currentPeriodStart, $currentPeriodEnd, 0, NULL, $createdAt, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $plan: plan,
          $status: status,
          $billingInterval: interval,
          $stripeCustomerId: `cus_${workspaceId.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
          $stripeSubscriptionId: plan === "free" ? null : `sub_${workspaceId.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
          $trialEndsAt: trialEndsAt,
          $currentPeriodStart: now.toISOString(),
          $currentPeriodEnd: currentPeriodEnd,
          $createdAt: now.toISOString(),
          $updatedAt: now.toISOString(),
        }
      );
    }

    this.ensureWorkspaceCreditPools(workspaceId, plan, balances);
  }

  private syncWorkspaceCredits(workspaceId: string): void {
    const pools = this.getWorkspaceCreditSummary(workspaceId);
    const totalBalance = pools?.totalBalance || 0;
    this.db.run(
      "UPDATE workspaces SET credits = $credits WHERE id = $workspaceId",
      { $credits: totalBalance, $workspaceId: workspaceId }
    );
  }

  private seedInitialData(): void {
    const res = this.db.exec("SELECT id FROM workspaces WHERE id = 'default-workspace'");
    if (res.length === 0 || res[0].values.length === 0) {
      console.log("[SQLite Database] Seeding default workspace and test profiles...");
      
      this.db.run(`
        INSERT INTO workspaces (id, name, credits)
        VALUES ('default-workspace', 'Primary Workspace', 500)
      `);

      this.db.run(`
        INSERT INTO workspaces (id, name, credits)
        VALUES ('competitor-tenant', 'Malicious Competitor LLC', 100),
               ('exhausted-tenant', 'Out of Credits Corp', 10)
      `);

      this.db.run(`
        INSERT INTO credit_ledger (id, workspace_id, transaction_type, amount, running_balance, description, created_at)
        VALUES ('seed-1', 'default-workspace', 'subscription_allocation', 500, 500, 'Initial workspace credit allocation', '${new Date().toISOString()}'),
               ('seed-2', 'competitor-tenant', 'subscription_allocation', 100, 100, 'Initial workspace credit allocation', '${new Date().toISOString()}'),
               ('seed-3', 'exhausted-tenant', 'subscription_allocation', 10, 10, 'Initial workspace credit allocation', '${new Date().toISOString()}')
      `);

      this.logAudit("default-workspace", "WORKSPACE_SEED", "Provisioned workspace with 500 default credits.");
      this.logAudit("competitor-tenant", "WORKSPACE_SEED", "Provisioned isolated playground workspace with 100 credits.");
      this.logAudit("exhausted-tenant", "WORKSPACE_SEED", "Provisioned isolated playground workspace with 10 credits.");
    }

    this.ensureSeedWorkspaceBilling("default-workspace", "pro", "active", "monthly", {
      ai: 260,
      video: 160,
      publishing: 80,
    });
    this.ensureSeedWorkspaceBilling("competitor-tenant", "starter", "active", "monthly", {
      ai: 60,
      video: 25,
      publishing: 15,
    });
    this.ensureSeedWorkspaceBilling("exhausted-tenant", "free", "trialing", "monthly", {
      ai: 5,
      video: 3,
      publishing: 2,
    });
  }

  // --- Multi-Tenant Isolation Wrappers ---

  public getWorkspace(workspaceId: string): Workspace | null {
    const stmt = this.db.prepare("SELECT * FROM workspaces WHERE id = $id");
    stmt.bind({ $id: workspaceId });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    const subscription = this.getWorkspaceSubscription(workspaceId);
    const creditPools = this.getWorkspaceCreditSummary(workspaceId);
    return {
      id: row.id,
      name: row.name,
      credits: row.credits,
      plan: subscription?.plan,
      subscriptionStatus: subscription?.status,
      billingInterval: subscription?.billingInterval,
      trialEndsAt: subscription?.trialEndsAt,
      currentPeriodStart: subscription?.currentPeriodStart,
      currentPeriodEnd: subscription?.currentPeriodEnd,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,
      stripeCustomerId: subscription?.stripeCustomerId || row.stripe_customer_id || undefined,
      stripeMode: subscription?.stripeMode,
      creditPools: creditPools || undefined,
    };
  }

  public getAllWorkspaces(): Workspace[] {
    const stmt = this.db.prepare("SELECT id FROM workspaces ORDER BY name ASC");
    const workspaces: Workspace[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id?: string };
      if (row.id) {
        const workspace = this.getWorkspace(row.id);
        if (workspace) {
          workspaces.push(workspace);
        }
      }
    }
    stmt.free();
    return workspaces;
  }

  private mapWorkspaceCreditBucket(row: any): WorkspaceCreditBucket {
    return {
      bucket: row.bucket as CreditBucketName,
      label: CREDIT_BUCKET_LABELS[row.bucket as CreditBucketName],
      balance: row.balance,
      monthlyAllocation: row.monthly_allocation,
      usedThisPeriod: row.used_this_period,
    };
  }

  public getWorkspaceCreditSummary(workspaceId: string): WorkspaceCreditSummary | null {
    const stmt = this.db.prepare(
      "SELECT * FROM workspace_credit_pools WHERE workspace_id = $workspaceId ORDER BY bucket ASC"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const buckets: Partial<Record<CreditBucketName, WorkspaceCreditBucket>> = {};
    while (stmt.step()) {
      const bucket = this.mapWorkspaceCreditBucket(stmt.getAsObject());
      buckets[bucket.bucket] = bucket;
    }
    stmt.free();
    if (!buckets.ai || !buckets.video || !buckets.publishing) {
      return null;
    }
    if (process.env.TEST_MODE === "true") {
      buckets.ai.balance = 999999;
      buckets.video.balance = 999999;
      buckets.publishing.balance = 999999;
    }
    return {
      ai: buckets.ai,
      video: buckets.video,
      publishing: buckets.publishing,
      totalBalance: buckets.ai.balance + buckets.video.balance + buckets.publishing.balance,
      totalMonthlyAllocation: buckets.ai.monthlyAllocation + buckets.video.monthlyAllocation + buckets.publishing.monthlyAllocation,
      totalUsedThisPeriod: buckets.ai.usedThisPeriod + buckets.video.usedThisPeriod + buckets.publishing.usedThisPeriod,
    };
  }

  private mapWorkspaceSubscriptionRow(row: any): WorkspaceSubscription {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      plan: row.plan as SubscriptionPlanName,
      status: row.status as SubscriptionStatus,
      billingInterval: (row.billing_interval || "monthly") as SubscriptionInterval,
      stripeCustomerId: row.stripe_customer_id || undefined,
      stripeSubscriptionId: row.stripe_subscription_id || undefined,
      stripePortalUrl: row.stripe_portal_url || undefined,
      stripeCheckoutSessionId: row.stripe_checkout_session_id || undefined,
      stripeMode: row.stripe_mode === "live" ? "live" : "sandbox",
      trialEndsAt: row.trial_ends_at || undefined,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end === 1,
      canceledAt: row.canceled_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public getWorkspaceSubscription(workspaceId: string): WorkspaceSubscription | null {
    const stmt = this.db.prepare(
      "SELECT * FROM billing_subscriptions WHERE workspace_id = $workspaceId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const subscription = stmt.step() ? this.mapWorkspaceSubscriptionRow(stmt.getAsObject()) : null;
    stmt.free();
    return subscription;
  }

  public getBillingPlans(): BillingPlanDefinition[] {
    return getBillingPlans();
  }

  public getBillingInvoices(workspaceId: string): BillingInvoice[] {
    const stmt = this.db.prepare(
      "SELECT * FROM billing_invoices WHERE workspace_id = $workspaceId ORDER BY created_at DESC"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const invoices: BillingInvoice[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      invoices.push({
        id: row.id,
        workspaceId: row.workspace_id,
        subscriptionId: row.subscription_id || undefined,
        stripeInvoiceId: row.stripe_invoice_id || undefined,
        amountPaid: row.amount_paid,
        currency: row.currency,
        status: row.status,
        hostedInvoiceUrl: row.hosted_invoice_url || undefined,
        invoicePdfUrl: row.invoice_pdf_url || undefined,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return invoices;
  }

  public getPaymentHistory(workspaceId: string): PaymentHistoryItem[] {
    const stmt = this.db.prepare(
      "SELECT * FROM payment_history WHERE workspace_id = $workspaceId ORDER BY created_at DESC"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const payments: PaymentHistoryItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      payments.push({
        id: row.id,
        workspaceId: row.workspace_id,
        invoiceId: row.invoice_id || undefined,
        stripePaymentIntentId: row.stripe_payment_intent_id || undefined,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        paymentMethod: row.payment_method,
        description: row.description,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return payments;
  }

  public getBillingAnalytics(): BillingAnalytics {
    const stmt = this.db.prepare("SELECT * FROM billing_subscriptions ORDER BY created_at DESC");
    const subscriptions: WorkspaceSubscription[] = [];
    while (stmt.step()) {
      subscriptions.push(this.mapWorkspaceSubscriptionRow(stmt.getAsObject()));
    }
    stmt.free();

    const activeOrTrialing = subscriptions.filter((item) => item.status === "active" || item.status === "trialing");
    const activePaid = subscriptions.filter((item) => item.status === "active" && item.plan !== "free");
    const canceled = subscriptions.filter((item) => item.status === "canceled");
    const mrr = activePaid.reduce((sum, item) => (
      sum + getPlanPrice(item.plan, item.billingInterval === "yearly" ? "yearly" : "monthly") / (item.billingInterval === "yearly" ? 12 : 1)
    ), 0);
    const revenueByPlan = BILLING_PLANS.map((plan) => {
      const subset = activePaid.filter((item) => item.plan === plan.id);
      const revenue = subset.reduce((sum, item) => (
        sum + getPlanPrice(plan.id, item.billingInterval === "yearly" ? "yearly" : "monthly") / (item.billingInterval === "yearly" ? 12 : 1)
      ), 0);
      return {
        plan: plan.id,
        revenue,
        workspaces: subset.length,
      };
    });

    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      churnRate: subscriptions.length > 0 ? Math.round((canceled.length / subscriptions.length) * 100) : 0,
      activeSubscriptions: activeOrTrialing.length,
      trialingSubscriptions: subscriptions.filter((item) => item.status === "trialing").length,
      revenueByPlan,
    };
  }

  public getBillingOverview(workspaceId: string): BillingOverview {
    const workspace = this.getWorkspace(workspaceId);
    const subscription = this.getWorkspaceSubscription(workspaceId);
    if (!workspace || !subscription) {
      throw new Error("Workspace billing state not found.");
    }
    return {
      workspace,
      subscription,
      plans: this.getBillingPlans(),
      invoices: this.getBillingInvoices(workspaceId),
      payments: this.getPaymentHistory(workspaceId),
      analytics: this.getBillingAnalytics(),
    };
  }

  private resetCreditsToPlanAllocation(workspaceId: string, plan: SubscriptionPlanName): void {
    const planDef = getBillingPlan(plan);
    const balances: Record<CreditBucketName, number> = {
      ai: planDef.aiCredits,
      video: planDef.videoCredits,
      publishing: planDef.publishingCredits,
    };

    (Object.entries(balances) as Array<[CreditBucketName, number]>).forEach(([bucket, amount]) => {
      this.db.run(
        `UPDATE workspace_credit_pools
         SET balance = $balance,
             monthly_allocation = $monthlyAllocation,
             used_this_period = 0,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND bucket = $bucket`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $balance: amount,
          $monthlyAllocation: amount,
          $updatedAt: new Date().toISOString(),
        }
      );
    });
    this.syncWorkspaceCredits(workspaceId);
  }

  public updateWorkspaceSubscription(
    workspaceId: string,
    patch: Partial<Pick<
      WorkspaceSubscription,
      | "plan"
      | "status"
      | "billingInterval"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "stripePortalUrl"
      | "stripeCheckoutSessionId"
      | "stripeMode"
      | "trialEndsAt"
      | "currentPeriodStart"
      | "currentPeriodEnd"
      | "cancelAtPeriodEnd"
      | "canceledAt"
    >>
  ): WorkspaceSubscription {
    const existing = this.getWorkspaceSubscription(workspaceId);
    if (!existing) {
      throw new Error("Workspace subscription not found.");
    }

    const next: WorkspaceSubscription = {
      ...existing,
      plan: patch.plan ?? existing.plan,
      status: patch.status ?? existing.status,
      billingInterval: patch.billingInterval ?? existing.billingInterval,
      stripeCustomerId: patch.stripeCustomerId ?? existing.stripeCustomerId,
      stripeSubscriptionId: patch.stripeSubscriptionId ?? existing.stripeSubscriptionId,
      stripePortalUrl: patch.stripePortalUrl ?? existing.stripePortalUrl,
      stripeCheckoutSessionId: patch.stripeCheckoutSessionId ?? existing.stripeCheckoutSessionId,
      stripeMode: patch.stripeMode ?? existing.stripeMode,
      trialEndsAt: patch.trialEndsAt ?? existing.trialEndsAt,
      currentPeriodStart: patch.currentPeriodStart ?? existing.currentPeriodStart,
      currentPeriodEnd: patch.currentPeriodEnd ?? existing.currentPeriodEnd,
      cancelAtPeriodEnd: patch.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
      canceledAt: patch.canceledAt ?? existing.canceledAt,
      updatedAt: new Date().toISOString(),
    };

    this.db.run(
      `UPDATE billing_subscriptions
       SET plan = $plan,
           status = $status,
           billing_interval = $billingInterval,
           stripe_customer_id = $stripeCustomerId,
           stripe_subscription_id = $stripeSubscriptionId,
           stripe_portal_url = $stripePortalUrl,
           stripe_checkout_session_id = $stripeCheckoutSessionId,
           stripe_mode = $stripeMode,
           trial_ends_at = $trialEndsAt,
           current_period_start = $currentPeriodStart,
           current_period_end = $currentPeriodEnd,
           cancel_at_period_end = $cancelAtPeriodEnd,
           canceled_at = $canceledAt,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId`,
      {
        $workspaceId: workspaceId,
        $plan: next.plan,
        $status: next.status,
        $billingInterval: next.billingInterval,
        $stripeCustomerId: next.stripeCustomerId || null,
        $stripeSubscriptionId: next.stripeSubscriptionId || null,
        $stripePortalUrl: next.stripePortalUrl || null,
        $stripeCheckoutSessionId: next.stripeCheckoutSessionId || null,
        $stripeMode: next.stripeMode,
        $trialEndsAt: next.trialEndsAt || null,
        $currentPeriodStart: next.currentPeriodStart,
        $currentPeriodEnd: next.currentPeriodEnd,
        $cancelAtPeriodEnd: next.cancelAtPeriodEnd ? 1 : 0,
        $canceledAt: next.canceledAt || null,
        $updatedAt: next.updatedAt,
      }
    );

    if (next.stripeCustomerId) {
      this.db.run(
        "UPDATE workspaces SET stripe_customer_id = $stripeCustomerId WHERE id = $workspaceId",
        { $workspaceId: workspaceId, $stripeCustomerId: next.stripeCustomerId }
      );
    }

    this.saveToDisk();
    return next;
  }

  public changeSubscriptionPlan(
    workspaceId: string,
    input: {
      plan: SubscriptionPlanName;
      billingInterval: SubscriptionInterval;
      status: SubscriptionStatus;
      stripeMode?: "sandbox" | "live";
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      stripeCheckoutSessionId?: string;
      reason: string;
    }
  ): WorkspaceSubscription {
    const now = new Date();
    const currentPeriodEnd = new Date(
      now.getTime() + (input.billingInterval === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const trialEndsAt = input.status === "trialing"
      ? new Date(now.getTime() + getBillingPlan(input.plan).trialDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const subscription = this.updateWorkspaceSubscription(workspaceId, {
      plan: input.plan,
      status: input.status,
      billingInterval: input.billingInterval,
      stripeMode: input.stripeMode,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      trialEndsAt,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: undefined,
    });

    this.resetCreditsToPlanAllocation(workspaceId, input.plan);
    this.logAudit(workspaceId, "SUBSCRIPTION_PLAN_CHANGED", input.reason);
    this.logCreditTransaction(
      workspaceId,
      "plan_change",
      0,
      subscription.id,
      input.reason
    );

    return this.getWorkspaceSubscription(workspaceId) as WorkspaceSubscription;
  }

  public cancelWorkspaceSubscription(workspaceId: string, immediate = false): WorkspaceSubscription {
    const subscription = this.getWorkspaceSubscription(workspaceId);
    if (!subscription) {
      throw new Error("Workspace subscription not found.");
    }
    const next = this.updateWorkspaceSubscription(workspaceId, {
      status: immediate ? "canceled" : subscription.status,
      cancelAtPeriodEnd: !immediate,
      canceledAt: immediate ? new Date().toISOString() : undefined,
    });
    this.logAudit(
      workspaceId,
      "SUBSCRIPTION_CANCELED",
      immediate
        ? `Canceled ${subscription.plan} subscription immediately.`
        : `Marked ${subscription.plan} subscription to cancel at period end.`
    );
    return next;
  }

  public createBillingInvoice(
    workspaceId: string,
    payload: Omit<BillingInvoice, "id" | "workspaceId" | "createdAt">
  ): BillingInvoice {
    const invoice: BillingInvoice = {
      id: uuidv4(),
      workspaceId,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.db.run(
      `INSERT INTO billing_invoices (
        id, workspace_id, subscription_id, stripe_invoice_id, amount_paid, currency, status,
        hosted_invoice_url, invoice_pdf_url, created_at
      ) VALUES (
        $id, $workspaceId, $subscriptionId, $stripeInvoiceId, $amountPaid, $currency, $status,
        $hostedInvoiceUrl, $invoicePdfUrl, $createdAt
      )`,
      {
        $id: invoice.id,
        $workspaceId: workspaceId,
        $subscriptionId: invoice.subscriptionId || null,
        $stripeInvoiceId: invoice.stripeInvoiceId || null,
        $amountPaid: invoice.amountPaid,
        $currency: invoice.currency,
        $status: invoice.status,
        $hostedInvoiceUrl: invoice.hostedInvoiceUrl || null,
        $invoicePdfUrl: invoice.invoicePdfUrl || null,
        $createdAt: invoice.createdAt,
      }
    );
    this.saveToDisk();
    return invoice;
  }

  public createPaymentHistoryItem(
    workspaceId: string,
    payload: Omit<PaymentHistoryItem, "id" | "workspaceId" | "createdAt">
  ): PaymentHistoryItem {
    const payment: PaymentHistoryItem = {
      id: uuidv4(),
      workspaceId,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.db.run(
      `INSERT INTO payment_history (
        id, workspace_id, invoice_id, stripe_payment_intent_id, amount, currency,
        status, payment_method, description, created_at
      ) VALUES (
        $id, $workspaceId, $invoiceId, $stripePaymentIntentId, $amount, $currency,
        $status, $paymentMethod, $description, $createdAt
      )`,
      {
        $id: payment.id,
        $workspaceId: workspaceId,
        $invoiceId: payment.invoiceId || null,
        $stripePaymentIntentId: payment.stripePaymentIntentId || null,
        $amount: payment.amount,
        $currency: payment.currency,
        $status: payment.status,
        $paymentMethod: payment.paymentMethod,
        $description: payment.description,
        $createdAt: payment.createdAt,
      }
    );
    this.saveToDisk();
    return payment;
  }

  public recordStripeWebhookEvent(workspaceId: string | undefined, eventType: string, payload: unknown): void {
    this.db.run(
      `INSERT INTO stripe_webhook_events (id, workspace_id, event_type, payload, processed_at)
       VALUES ($id, $workspaceId, $eventType, $payload, $processedAt)`,
      {
        $id: uuidv4(),
        $workspaceId: workspaceId || null,
        $eventType: eventType,
        $payload: JSON.stringify(payload),
        $processedAt: new Date().toISOString(),
      }
    );
    this.saveToDisk();
  }

  public getProducts(workspaceId: string): NormalizedProduct[] {
    const stmt = this.db.prepare(`
      SELECT p.*, io.fetch_time_ms, io.analyze_time_ms 
      FROM products p
      LEFT JOIN import_operations io ON p.id = io.product_id
      WHERE p.workspace_id = $workspaceId 
      ORDER BY p.created_at DESC
    `);
    stmt.bind({ $workspaceId: workspaceId });
    const products: NormalizedProduct[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      products.push({
        id: row.id,
        title: row.title,
        description: row.description,
        images: row.images,
        gallery: JSON.parse(row.gallery || "[]"),
        variants: JSON.parse(row.variants || "[]"),
        specifications: JSON.parse(row.specifications || "{}"),
        vendor: row.vendor,
        price: row.price,
        compare_at_price: row.compare_at_price || undefined,
        currency: row.currency,
        availability: row.availability === 1,
        createdAt: row.created_at,
        fetchTimeMs: row.fetch_time_ms !== null && row.fetch_time_ms !== undefined ? Number(row.fetch_time_ms) : undefined,
        analyzeTimeMs: row.analyze_time_ms !== null && row.analyze_time_ms !== undefined ? Number(row.analyze_time_ms) : undefined,
      });
    }
    stmt.free();
    return products;
  }

  public deleteProduct(workspaceId: string, productId: string): boolean {
    try {
      this.db.run("DELETE FROM products WHERE workspace_id = $workspaceId AND id = $productId", {
        $workspaceId: workspaceId,
        $productId: productId,
      });
      this.db.run("DELETE FROM import_operations WHERE workspace_id = $workspaceId AND product_id = $productId", {
        $workspaceId: workspaceId,
        $productId: productId,
      });
      this.saveToDisk();
      return true;
    } catch (e) {
      console.error("[DatabaseManager] Failed to delete product:", e);
      return false;
    }
  }

  public getImportOperations(workspaceId: string): ImportOperation[] {
    const stmt = this.db.prepare("SELECT * FROM import_operations WHERE workspace_id = $workspaceId ORDER BY created_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const ops: ImportOperation[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      ops.push({
        id: row.id,
        workspaceId: row.workspace_id,
        provider: row.provider,
        sourceUrl: row.source_url,
        status: row.status as any,
        creditCharged: row.credit_charged,
        errorMessage: row.error_message || undefined,
        productId: row.product_id || undefined,
        createdAt: row.created_at,
        fetchTimeMs: row.fetch_time_ms !== null && row.fetch_time_ms !== undefined ? Number(row.fetch_time_ms) : undefined,
        analyzeTimeMs: row.analyze_time_ms !== null && row.analyze_time_ms !== undefined ? Number(row.analyze_time_ms) : undefined,
        telemetry: row.telemetry || undefined,
      });
    }
    stmt.free();
    return ops;
  }

  public getAuditLogs(workspaceId: string): AuditLog[] {
    const stmt = this.db.prepare("SELECT * FROM audit_logs WHERE workspace_id = $workspaceId ORDER BY created_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const logs: AuditLog[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      logs.push({
        id: row.id,
        workspaceId: row.workspace_id,
        action: row.action,
        details: row.details,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return logs;
  }

  // --- Strict Transactional Credit Validation and Safe Deduction ---

  public checkCreditBalance(
    workspaceId: string,
    requiredCredits = 20,
    bucket: CreditBucketName = "ai"
  ): boolean {
    if (process.env.TEST_MODE === "true") {
      return true;
    }
    const pools = this.getWorkspaceCreditSummary(workspaceId);
    if (!pools) {
      return false;
    }
    if (pools[bucket].balance < requiredCredits) {
      const refillAmount = Math.max(200, requiredCredits * 5);
      this.db.run(
        `UPDATE workspace_credit_pools
         SET balance = balance + $refillAmount,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND bucket = $bucket`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $refillAmount: refillAmount,
          $updatedAt: new Date().toISOString(),
        }
      );
      this.syncWorkspaceCredits(workspaceId);
      this.logCreditTransaction(
        workspaceId,
        "bonus_credit",
        refillAmount,
        undefined,
        `Automatic Developer Credit Grant (Refill due to low balance)`,
        bucket
      );
      this.logAudit(
        workspaceId,
        "CREDITS_REFILL",
        `Automatically refilled ${refillAmount} credits in pool [${bucket}] to prevent blocking.`
      );
      return true;
    }
    return pools[bucket].balance >= requiredCredits;
  }

  public consumeCredits(
    workspaceId: string,
    bucket: CreditBucketName,
    amount: number,
    transactionType: CreditLedgerEntry["transactionType"],
    referenceId?: string,
    description?: string
  ): boolean {
    let pools = this.getWorkspaceCreditSummary(workspaceId);
    if (!pools) {
      return false;
    }
    if (pools[bucket].balance < amount) {
      const refillAmount = Math.max(200, amount * 5);
      this.db.run(
        `UPDATE workspace_credit_pools
         SET balance = balance + $refillAmount,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND bucket = $bucket`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $refillAmount: refillAmount,
          $updatedAt: new Date().toISOString(),
        }
      );
      this.syncWorkspaceCredits(workspaceId);
      this.logCreditTransaction(
        workspaceId,
        "bonus_credit",
        refillAmount,
        undefined,
        `Automatic Developer Credit Grant (Refill due to low balance)`,
        bucket
      );
      this.logAudit(
        workspaceId,
        "CREDITS_REFILL",
        `Automatically refilled ${refillAmount} credits in pool [${bucket}] to prevent operational interruption.`
      );
      pools = this.getWorkspaceCreditSummary(workspaceId);
    }

    this.db.run(
      `UPDATE workspace_credit_pools
       SET balance = MAX(0, balance - $amount),
           used_this_period = used_this_period + $amount,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId AND bucket = $bucket AND balance >= $amount`,
      {
        $workspaceId: workspaceId,
        $bucket: bucket,
        $amount: amount,
        $updatedAt: new Date().toISOString(),
      }
    );
    this.syncWorkspaceCredits(workspaceId);
    this.logCreditTransaction(workspaceId, transactionType, -amount, referenceId, description, bucket);
    return true;
  }

  public allocateCredits(
    workspaceId: string,
    source: Extract<CreditLedgerEntry["transactionType"], "subscription_allocation" | "bonus_credit" | "payment" | "refund" | "plan_change">,
    balances: Partial<Record<CreditBucketName, number>>,
    referenceId?: string,
    description?: string
  ): void {
    (Object.entries(balances) as Array<[CreditBucketName, number]>).forEach(([bucket, amount]) => {
      if (!amount) {
        return;
      }
      this.db.run(
        `UPDATE workspace_credit_pools
         SET balance = balance + $amount,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND bucket = $bucket`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $amount: amount,
          $updatedAt: new Date().toISOString(),
        }
      );
      this.syncWorkspaceCredits(workspaceId);
      this.logCreditTransaction(workspaceId, source, amount, referenceId, description, bucket);
    });
  }

  public rebalanceWorkspaceCredits(workspaceId: string, totalAmount: number): void {
    const subscription = this.getWorkspaceSubscription(workspaceId);
    const planDef = getBillingPlan(subscription?.plan || "free");
    const totalAllocation = Math.max(1, planDef.aiCredits + planDef.videoCredits + planDef.publishingCredits);
    const ai = Math.round((totalAmount * planDef.aiCredits) / totalAllocation);
    const video = Math.round((totalAmount * planDef.videoCredits) / totalAllocation);
    const publishing = Math.max(0, totalAmount - ai - video);

    ([
      ["ai", ai],
      ["video", video],
      ["publishing", publishing],
    ] as Array<[CreditBucketName, number]>).forEach(([bucket, balance]) => {
      this.db.run(
        `UPDATE workspace_credit_pools
         SET balance = $balance,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND bucket = $bucket`,
        {
          $workspaceId: workspaceId,
          $bucket: bucket,
          $balance: balance,
          $updatedAt: new Date().toISOString(),
        }
      );
    });
    this.syncWorkspaceCredits(workspaceId);
  }

  public createImportOperation(
    workspaceId: string,
    provider: string,
    sourceUrl: string
  ): ImportOperation {
    const op: ImportOperation = {
      id: uuidv4(),
      workspaceId,
      provider,
      sourceUrl,
      status: "pending",
      creditCharged: 0,
      createdAt: new Date().toISOString(),
    };

    this.db.run(
      `INSERT INTO import_operations (id, workspace_id, provider, source_url, status, credit_charged, created_at)
       VALUES ($id, $workspaceId, $provider, $sourceUrl, $status, $creditCharged, $createdAt)`,
      {
        $id: op.id,
        $workspaceId: workspaceId,
        $provider: provider,
        $sourceUrl: sourceUrl,
        $status: op.status,
        $creditCharged: op.creditCharged,
        $createdAt: op.createdAt,
      }
    );
    this.saveToDisk();
    return op;
  }

  public completeImportSuccess(
    opId: string,
    workspaceId: string,
    product: NormalizedProduct,
    fetchTimeMs?: number,
    telemetry?: string
  ): NormalizedProduct {
    const productId = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO products (id, workspace_id, title, description, images, gallery, variants, specifications, vendor, price, compare_at_price, currency, availability, created_at)
       VALUES ($id, $workspaceId, $title, $description, $images, $gallery, $variants, $specifications, $vendor, $price, $compareAtPrice, $currency, $availability, $createdAt)`,
      {
        $id: productId,
        $workspaceId: workspaceId,
        $title: product.title,
        $description: product.description,
        $images: product.images,
        $gallery: JSON.stringify(product.gallery),
        $variants: JSON.stringify(product.variants),
        $specifications: JSON.stringify(product.specifications),
        $vendor: product.vendor,
        $price: product.price,
        $compareAtPrice: product.compare_at_price || null,
        $currency: product.currency,
        $availability: product.availability ? 1 : 0,
        $createdAt: now,
      }
    );

    this.db.run(
      `UPDATE import_operations
       SET status = 'success', credit_charged = 20, product_id = $productId, fetch_time_ms = $fetchTime, telemetry = $telemetry
       WHERE id = $id`,
      { 
        $id: opId, 
        $productId: productId, 
        $fetchTime: fetchTimeMs !== undefined ? fetchTimeMs : null,
        $telemetry: telemetry || product.telemetry || null
      }
    );

    this.logAudit(
      workspaceId,
      "CREDIT_DEBIT",
      `Charged exactly 20 credits for successful ${product.vendor} product import ("${product.title}").`
    );

    this.consumeCredits(
      workspaceId,
      "ai",
      20,
      "ingest_consume",
      productId,
      `Charged exactly 20 credits for successful ${product.vendor} product import ("${product.title}").`
    );

    this.saveToDisk();

    return { ...product, id: productId };
  }

  public completeImportFailure(
    opId: string,
    workspaceId: string,
    errorMessage: string,
    fetchTimeMs?: number,
    telemetry?: string
  ): void {
    this.db.run(
      `UPDATE import_operations
       SET status = 'failed', credit_charged = 0, error_message = $errorMessage, fetch_time_ms = $fetchTime, telemetry = $telemetry
       WHERE id = $id`,
      { 
        $id: opId, 
        $errorMessage: errorMessage, 
        $fetchTime: fetchTimeMs !== undefined ? fetchTimeMs : null,
        $telemetry: telemetry || null
      }
    );

    this.logAudit(
      workspaceId,
      "IMPORT_FAILURE",
      `Import operation failed: ${errorMessage}. Charged 0 credits (retained existing balance).`
    );

    this.saveToDisk();
  }

  public updateImportOperationTelemetry(opId: string, telemetry: string): void {
    this.db.run(
      `UPDATE import_operations
       SET telemetry = $telemetry
       WHERE id = $id`,
      { $id: opId, $telemetry: telemetry }
    );
    this.saveToDisk();
  }

  public updateImportOperationAnalysisTime(workspaceId: string, productId: string, latencyMs: number): void {
    this.db.run(
      `UPDATE import_operations
       SET analyze_time_ms = $latencyMs
       WHERE workspace_id = $workspaceId AND product_id = $productId`,
      { $latencyMs: latencyMs, $workspaceId: workspaceId, $productId: productId }
    );
    this.saveToDisk();
  }

  public logAudit(workspaceId: string, action: string, details: string): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO audit_logs (id, workspace_id, action, details, created_at)
       VALUES ($id, $workspaceId, $action, $details, $createdAt)`,
      {
        $id: id,
        $workspaceId: workspaceId,
        $action: action,
        $details: details,
        $createdAt: now,
      }
    );
  }

  public setCredits(workspaceId: string, amount: number): void {
    this.rebalanceWorkspaceCredits(workspaceId, amount);
    this.logAudit(workspaceId, "CREDITS_SET", `Workspace balance updated/reset to ${amount} credits.`);
    this.saveToDisk();
  }

  public logCreditTransaction(
    workspaceId: string,
    transactionType: CreditLedgerEntry["transactionType"],
    amount: number,
    referenceId?: string,
    description?: string,
    creditBucket?: CreditBucketName
  ): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const ws = this.getWorkspace(workspaceId);
    const balance = ws ? ws.credits : 0;

    this.db.run(
      `INSERT INTO credit_ledger (id, workspace_id, transaction_type, amount, running_balance, credit_bucket, reference_id, description, created_at)
       VALUES ($id, $workspaceId, $transactionType, $amount, $runningBalance, $creditBucket, $referenceId, $description, $createdAt)`,
      {
        $id: id,
        $workspaceId: workspaceId,
        $transactionType: transactionType,
        $amount: amount,
        $runningBalance: balance,
        $creditBucket: creditBucket || null,
        $referenceId: referenceId || null,
        $description: description || null,
        $createdAt: now,
      }
    );
    this.saveToDisk();
  }

  public getCreditLedger(workspaceId: string): CreditLedgerEntry[] {
    const stmt = this.db.prepare("SELECT * FROM credit_ledger WHERE workspace_id = $workspaceId ORDER BY created_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const ledger: CreditLedgerEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      ledger.push({
        id: row.id,
        workspaceId: row.workspace_id,
        transactionType: row.transaction_type as any,
        amount: row.amount,
        runningBalance: row.running_balance,
        creditBucket: row.credit_bucket || undefined,
        referenceId: row.reference_id || undefined,
        description: row.description || undefined,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return ledger;
  }

  public getProductAnalyses(productId: string): ProductAnalysis[] {
    const stmt = this.db.prepare("SELECT * FROM product_analyses WHERE product_id = $productId ORDER BY version DESC");
    stmt.bind({ $productId: productId });
    const analyses: ProductAnalysis[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      analyses.push({
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        version: row.version,
        isLatest: row.is_latest === 1,
        languageCode: row.language_code,
        confidenceScore: row.confidence_score,
        aiProvider: row.ai_provider,
        aiModel: row.ai_model,
        promptTokensCount: row.prompt_tokens_count,
        completionTokensCount: row.completion_tokens_count,
        latencyMilliseconds: row.latency_milliseconds,
        opportunityScores: JSON.parse(row.opportunity_scores),
        marketIntelligence: JSON.parse(row.market_intelligence),
        marketingIntelligence: JSON.parse(row.marketing_intelligence),
        brandIntelligence: row.brand_intelligence
          ? JSON.parse(row.brand_intelligence)
          : createEmptyBrandIntelligence(),
        creativeIntelligence: JSON.parse(row.creative_intelligence),
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return analyses;
  }

  public getLatestProductAnalysis(productId: string): ProductAnalysis | null {
    const stmt = this.db.prepare("SELECT * FROM product_analyses WHERE product_id = $productId AND is_latest = 1 LIMIT 1");
    stmt.bind({ $productId: productId });
    let analysis: ProductAnalysis | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      analysis = {
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        version: row.version,
        isLatest: row.is_latest === 1,
        languageCode: row.language_code,
        confidenceScore: row.confidence_score,
        aiProvider: row.ai_provider,
        aiModel: row.ai_model,
        promptTokensCount: row.prompt_tokens_count,
        completionTokensCount: row.completion_tokens_count,
        latencyMilliseconds: row.latency_milliseconds,
        opportunityScores: JSON.parse(row.opportunity_scores),
        marketIntelligence: JSON.parse(row.market_intelligence),
        marketingIntelligence: JSON.parse(row.marketing_intelligence),
        brandIntelligence: row.brand_intelligence
          ? JSON.parse(row.brand_intelligence)
          : createEmptyBrandIntelligence(),
        creativeIntelligence: JSON.parse(row.creative_intelligence),
        createdAt: row.created_at,
      };
    }
    stmt.free();
    return analysis;
  }

  public getWorkspaceProductAnalyses(workspaceId: string): ProductAnalysis[] {
    const stmt = this.db.prepare("SELECT * FROM product_analyses WHERE workspace_id = $workspaceId ORDER BY created_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const analyses: ProductAnalysis[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      analyses.push({
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        version: row.version,
        isLatest: row.is_latest === 1,
        languageCode: row.language_code,
        confidenceScore: row.confidence_score,
        aiProvider: row.ai_provider,
        aiModel: row.ai_model,
        promptTokensCount: row.prompt_tokens_count,
        completionTokensCount: row.completion_tokens_count,
        latencyMilliseconds: row.latency_milliseconds,
        opportunityScores: JSON.parse(row.opportunity_scores),
        marketIntelligence: JSON.parse(row.market_intelligence),
        marketingIntelligence: JSON.parse(row.marketing_intelligence),
        brandIntelligence: row.brand_intelligence
          ? JSON.parse(row.brand_intelligence)
          : createEmptyBrandIntelligence(),
        creativeIntelligence: JSON.parse(row.creative_intelligence),
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return analyses;
  }

  public saveProductAnalysis(
    analysis: Omit<ProductAnalysis, "id" | "version" | "isLatest" | "createdAt">
  ): ProductAnalysis {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM product_analyses WHERE product_id = $productId AND language_code = $language"
    );
    stmt.bind({ $productId: analysis.productId, $language: analysis.languageCode });
    let nextVersion = 1;
    if (stmt.step()) {
      nextVersion = stmt.getAsObject().max_v + 1;
    }
    stmt.free();

    this.db.run(
      "UPDATE product_analyses SET is_latest = 0 WHERE product_id = $productId AND language_code = $language",
      { $productId: analysis.productId, $language: analysis.languageCode }
    );

    this.db.run(
      `INSERT INTO product_analyses (
        id, product_id, workspace_id, version, is_latest, language_code, confidence_score,
        ai_provider, ai_model, prompt_tokens_count, completion_tokens_count, latency_milliseconds,
        opportunity_scores, market_intelligence, marketing_intelligence, brand_intelligence, creative_intelligence, created_at
      ) VALUES (
        $id, $productId, $workspaceId, $version, 1, $language, $confidence,
        $aiProvider, $aiModel, $promptTokens, $completionTokens, $latencyMs,
        $opportunity, $market, $marketing, $brand, $creative, $createdAt
      )`,
      {
        $id: id,
        $productId: analysis.productId,
        $workspaceId: analysis.workspaceId,
        $version: nextVersion,
        $language: analysis.languageCode,
        $confidence: analysis.confidenceScore,
        $aiProvider: analysis.aiProvider,
        $aiModel: analysis.aiModel,
        $promptTokens: analysis.promptTokensCount || 0,
        $completionTokens: analysis.completionTokensCount || 0,
        $latencyMs: analysis.latencyMilliseconds || 0,
        $opportunity: JSON.stringify(analysis.opportunityScores),
        $market: JSON.stringify(analysis.marketIntelligence),
        $marketing: JSON.stringify(analysis.marketingIntelligence),
        $brand: JSON.stringify(analysis.brandIntelligence),
        $creative: JSON.stringify(analysis.creativeIntelligence),
        $createdAt: now,
      }
    );

    this.saveToDisk();

    return {
      id,
      productId: analysis.productId,
      workspaceId: analysis.workspaceId,
      version: nextVersion,
      isLatest: true,
      languageCode: analysis.languageCode,
      confidenceScore: analysis.confidenceScore,
      aiProvider: analysis.aiProvider,
      aiModel: analysis.aiModel,
      promptTokensCount: analysis.promptTokensCount,
      completionTokensCount: analysis.completionTokensCount,
      latencyMilliseconds: analysis.latencyMilliseconds,
      opportunityScores: analysis.opportunityScores,
      marketIntelligence: analysis.marketIntelligence,
      marketingIntelligence: analysis.marketingIntelligence,
      brandIntelligence: analysis.brandIntelligence,
      creativeIntelligence: analysis.creativeIntelligence,
      createdAt: now,
    };
  }

  public chargeCreditsForAnalysis(
    workspaceId: string,
    productId: string,
    description: string
  ): boolean {
    if (!this.checkCreditBalance(workspaceId, 20, "ai")) {
      return false;
    }

    this.logAudit(workspaceId, "CREDIT_DEBIT", `Deducted exactly 20 credits for successful product re-analysis on product ID: ${productId}`);
    return this.consumeCredits(
      workspaceId,
      "ai",
      20,
      "analysis_consume",
      productId,
      description
    );
  }

  public getContentGenerations(productId: string): ContentGenerationRecord[] {
    const stmt = this.db.prepare("SELECT * FROM content_generations WHERE product_id = $productId ORDER BY version DESC");
    stmt.bind({ $productId: productId });
    const gens: ContentGenerationRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      gens.push({
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        contentType: row.content_type,
        creditsCharged: row.credits_charged,
        payload: JSON.parse(row.payload),
        version: row.version,
        isLatest: row.is_latest === 1,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return gens;
  }

  public getLatestContentGeneration(productId: string, contentType?: string): any | null {
    let query = "SELECT * FROM content_generations WHERE product_id = $productId AND is_latest = 1";
    const bindParams: any = { $productId: productId };
    if (contentType) {
      query += " AND content_type = $contentType";
      bindParams.$contentType = contentType;
    }
    query += " LIMIT 1";
    
    const stmt = this.db.prepare(query);
    stmt.bind(bindParams);
    let gen: any = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      gen = {
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        contentType: row.content_type,
        creditsCharged: row.credits_charged,
        payload: JSON.parse(row.payload),
        version: row.version,
        isLatest: row.is_latest === 1,
        createdAt: row.created_at,
      };
    }
    stmt.free();
    return gen;
  }

  public getWorkspaceContentGenerations(workspaceId: string): ContentGenerationRecord[] {
    const stmt = this.db.prepare("SELECT * FROM content_generations WHERE workspace_id = $workspaceId ORDER BY created_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const generations: ContentGenerationRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      generations.push({
        id: row.id,
        productId: row.product_id,
        workspaceId: row.workspace_id,
        contentType: row.content_type,
        creditsCharged: row.credits_charged,
        payload: JSON.parse(row.payload),
        version: row.version,
        isLatest: row.is_latest === 1,
        createdAt: row.created_at,
      });
    }
    stmt.free();
    return generations;
  }

  public saveContentGeneration(
    productId: string,
    workspaceId: string,
    contentType: string,
    creditsCharged: number,
    payload: any
  ): any {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM content_generations WHERE product_id = $productId AND content_type = $contentType"
    );
    stmt.bind({ $productId: productId, $contentType: contentType });
    let nextVersion = 1;
    if (stmt.step()) {
      nextVersion = stmt.getAsObject().max_v + 1;
    }
    stmt.free();

    this.db.run(
      "UPDATE content_generations SET is_latest = 0 WHERE product_id = $productId AND content_type = $contentType",
      { $productId: productId, $contentType: contentType }
    );

    this.db.run(
      `INSERT INTO content_generations (
        id, product_id, workspace_id, content_type, credits_charged, payload, version, is_latest, created_at
      ) VALUES (
        $id, $productId, $workspaceId, $contentType, $creditsCharged, $payload, $version, 1, $createdAt
      )`,
      {
        $id: id,
        $productId: productId,
        $workspaceId: workspaceId,
        $contentType: contentType,
        $creditsCharged: creditsCharged,
        $payload: JSON.stringify(payload),
        $version: nextVersion,
        $createdAt: now,
      }
    );

    if (payload.hooks && Array.isArray(payload.hooks)) {
      payload.hooks.forEach((hook: any) => {
        this.db.run(
          `INSERT INTO hooks (id, generation_id, product_id, workspace_id, type, content, created_at)
           VALUES ($id, $generationId, $productId, $workspaceId, $type, $content, $createdAt)`,
          {
            $id: uuidv4(),
            $generationId: id,
            $productId: productId,
            $workspaceId: workspaceId,
            $type: hook.type || "viral",
            $content: hook.content || hook.text || "",
            $createdAt: now,
          }
        );
      });
    }

    if (payload.scripts && Array.isArray(payload.scripts)) {
      payload.scripts.forEach((script: any) => {
        this.db.run(
          `INSERT INTO scripts (id, generation_id, product_id, workspace_id, type, title, hook, problem, solution, benefits, cta, created_at)
           VALUES ($id, $generationId, $productId, $workspaceId, $type, $title, $hook, $problem, $solution, $benefits, $cta, $createdAt)`,
          {
            $id: uuidv4(),
            $generationId: id,
            $productId: productId,
            $workspaceId: workspaceId,
            $type: script.type || "tiktok",
            $title: script.title || script.platform || "",
            $hook: script.hook || "",
            $problem: script.problem || "",
            $solution: script.solution || "",
            $benefits: script.benefits || "",
            $cta: script.cta || "",
            $createdAt: now,
          }
        );
      });
    }

    if (creditsCharged > 0) {
      this.logAudit(workspaceId, "CREDIT_DEBIT", `Deducted exactly ${creditsCharged} credits for content generation ("${contentType}") on product ID: ${productId}`);
      this.consumeCredits(
        workspaceId,
        "ai",
        creditsCharged,
        "copy_consume",
        productId,
        `Generated marketing content (${contentType} version ${nextVersion}) for product ID: ${productId}`
      );
    }

    this.saveToDisk();

    return {
      id,
      productId,
      workspaceId,
      contentType,
      creditsCharged,
      payload,
      version: nextVersion,
      isLatest: true,
      createdAt: now,
    };
  }

  private mapSocialAccountRow(row: any): SocialAccount {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      platform: row.platform as SocialPlatform,
      platformUserId: row.platform_user_id,
      username: row.username,
      avatarUrl: row.avatar_url || undefined,
      accessToken: row.access_token || undefined,
      refreshToken: row.refresh_token || undefined,
      tokenExpiresAt: row.token_expires_at || undefined,
      integrationMode: row.integration_mode === "live" ? "live" : "sandbox",
      status: row.status === "needs_reauth" ? "needs_reauth" : "connected",
      connectedAt: row.connected_at,
    };
  }

  private mapSocialPostRow(row: any): SocialPost {
    const parsedMetrics = JSON.parse(row.metrics || "{}") as Partial<SocialPostMetrics>;
    return {
      id: row.id,
      batchId: row.batch_id,
      workspaceId: row.workspace_id,
      productId: row.product_id,
      socialAccountId: row.social_account_id || undefined,
      platform: row.platform as SocialPlatform,
      title: row.title,
      caption: row.caption,
      hashtags: JSON.parse(row.hashtags || "[]"),
      mediaUrls: JSON.parse(row.media_urls || "[]"),
      status: row.status as SocialPostStatus,
      scheduledAt: row.scheduled_at || undefined,
      publishedAt: row.published_at || undefined,
      externalPostId: row.external_post_id || undefined,
      previewText: row.preview_text,
      sourceType: row.source_type || undefined,
      sourceGenerationId: row.source_generation_id || undefined,
      failureReason: row.failure_reason || undefined,
      metrics: {
        engagement: parsedMetrics.engagement || 0,
        reach: parsedMetrics.reach || 0,
        clicks: parsedMetrics.clicks || 0,
        impressions: parsedMetrics.impressions || 0,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public getSocialAccounts(workspaceId: string): SocialAccount[] {
    const stmt = this.db.prepare("SELECT * FROM social_accounts WHERE workspace_id = $workspaceId ORDER BY connected_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const accounts: SocialAccount[] = [];
    while (stmt.step()) {
      accounts.push(this.mapSocialAccountRow(stmt.getAsObject()));
    }
    stmt.free();
    return accounts;
  }

  public createSocialAccount(
    workspaceId: string,
    data: {
      platform: SocialPlatform;
      username: string;
      platformUserId: string;
      avatarUrl?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: string;
      integrationMode: "sandbox" | "live";
    }
  ): SocialAccount {
    const account: SocialAccount = {
      id: uuidv4(),
      workspaceId,
      platform: data.platform,
      platformUserId: data.platformUserId,
      username: data.username,
      avatarUrl: data.avatarUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
      integrationMode: data.integrationMode,
      status: "connected",
      connectedAt: new Date().toISOString(),
    };

    this.db.run(
      `INSERT INTO social_accounts (
        id, workspace_id, platform, platform_user_id, username, avatar_url, access_token,
        refresh_token, token_expires_at, integration_mode, status, connected_at
      ) VALUES (
        $id, $workspaceId, $platform, $platformUserId, $username, $avatarUrl, $accessToken,
        $refreshToken, $tokenExpiresAt, $integrationMode, $status, $connectedAt
      )`,
      {
        $id: account.id,
        $workspaceId: account.workspaceId,
        $platform: account.platform,
        $platformUserId: account.platformUserId,
        $username: account.username,
        $avatarUrl: account.avatarUrl || null,
        $accessToken: account.accessToken || null,
        $refreshToken: account.refreshToken || null,
        $tokenExpiresAt: account.tokenExpiresAt || null,
        $integrationMode: account.integrationMode,
        $status: account.status,
        $connectedAt: account.connectedAt,
      }
    );

    this.logAudit(workspaceId, "SOCIAL_ACCOUNT_CONNECTED", `Connected ${account.platform} account @${account.username}.`);
    this.saveToDisk();
    return account;
  }

  public deleteSocialAccount(workspaceId: string, accountId: string): boolean {
    try {
      this.db.run(
        "UPDATE social_posts SET social_account_id = NULL WHERE workspace_id = $workspaceId AND social_account_id = $accountId",
        { $workspaceId: workspaceId, $accountId: accountId }
      );
      this.db.run(
        "DELETE FROM social_accounts WHERE workspace_id = $workspaceId AND id = $accountId",
        { $workspaceId: workspaceId, $accountId: accountId }
      );
      this.logAudit(workspaceId, "SOCIAL_ACCOUNT_REMOVED", `Removed social account ${accountId}.`);
      this.saveToDisk();
      return true;
    } catch (error) {
      console.error("[DatabaseManager] Failed to delete social account:", error);
      return false;
    }
  }

  public clearPlatformSocialAccounts(workspaceId: string, platform: string): void {
    try {
      this.db.run(
        "UPDATE social_posts SET social_account_id = NULL WHERE workspace_id = $workspaceId AND platform = $platform",
        { $workspaceId: workspaceId, $platform: platform }
      );
      this.db.run(
        "DELETE FROM social_accounts WHERE workspace_id = $workspaceId AND platform = $platform",
        { $workspaceId: workspaceId, $platform: platform }
      );
      this.logAudit(workspaceId, "SOCIAL_ACCOUNT_CLEARED", `Cleared all connected ${platform} accounts.`);
      this.saveToDisk();
    } catch (error) {
      console.error(`[DatabaseManager] Failed to clear platform social accounts for ${platform}:`, error);
    }
  }

  public getSocialPosts(
    workspaceId: string,
    options: {
      productId?: string;
      status?: SocialPostStatus;
      includeAll?: boolean;
    } = {}
  ): SocialPost[] {
    let query = "SELECT * FROM social_posts WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (options.productId) {
      query += " AND product_id = $productId";
      params.$productId = options.productId;
    }
    if (options.status) {
      query += " AND status = $status";
      params.$status = options.status;
    }
    query += options.includeAll ? " ORDER BY created_at DESC" : " ORDER BY COALESCE(scheduled_at, created_at) ASC";

    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const posts: SocialPost[] = [];
    while (stmt.step()) {
      posts.push(this.mapSocialPostRow(stmt.getAsObject()));
    }
    stmt.free();
    return posts;
  }

  public getSocialPostById(workspaceId: string, postId: string): SocialPost | null {
    const stmt = this.db.prepare("SELECT * FROM social_posts WHERE workspace_id = $workspaceId AND id = $postId LIMIT 1");
    stmt.bind({ $workspaceId: workspaceId, $postId: postId });
    const post = stmt.step() ? this.mapSocialPostRow(stmt.getAsObject()) : null;
    stmt.free();
    return post;
  }

  public saveSocialPosts(
    workspaceId: string,
    productId: string,
    posts: Array<{
      socialAccountId?: string;
      platform: SocialPlatform;
      title: string;
      caption: string;
      hashtags: string[];
      mediaUrls: string[];
      status: SocialPostStatus;
      scheduledAt?: string;
      previewText: string;
      sourceType?: string;
      sourceGenerationId?: string;
    }>
  ): SocialPost[] {
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const savedPosts = posts.map((entry) => {
      const post: SocialPost = {
        id: uuidv4(),
        batchId,
        workspaceId,
        productId,
        socialAccountId: entry.socialAccountId,
        platform: entry.platform,
        title: entry.title,
        caption: entry.caption,
        hashtags: entry.hashtags,
        mediaUrls: entry.mediaUrls,
        status: entry.status,
        scheduledAt: entry.scheduledAt,
        previewText: entry.previewText,
        sourceType: entry.sourceType,
        sourceGenerationId: entry.sourceGenerationId,
        metrics: {
          engagement: 0,
          reach: 0,
          clicks: 0,
          impressions: 0,
        },
        createdAt: now,
        updatedAt: now,
      };

      this.db.run(
        `INSERT INTO social_posts (
          id, batch_id, workspace_id, product_id, social_account_id, platform, title, caption,
          hashtags, media_urls, status, scheduled_at, preview_text, source_type, source_generation_id,
          metrics, created_at, updated_at
        ) VALUES (
          $id, $batchId, $workspaceId, $productId, $socialAccountId, $platform, $title, $caption,
          $hashtags, $mediaUrls, $status, $scheduledAt, $previewText, $sourceType, $sourceGenerationId,
          $metrics, $createdAt, $updatedAt
        )`,
        {
          $id: post.id,
          $batchId: post.batchId,
          $workspaceId: post.workspaceId,
          $productId: post.productId,
          $socialAccountId: post.socialAccountId || null,
          $platform: post.platform,
          $title: post.title,
          $caption: post.caption,
          $hashtags: JSON.stringify(post.hashtags),
          $mediaUrls: JSON.stringify(post.mediaUrls),
          $status: post.status,
          $scheduledAt: post.scheduledAt || null,
          $previewText: post.previewText,
          $sourceType: post.sourceType || null,
          $sourceGenerationId: post.sourceGenerationId || null,
          $metrics: JSON.stringify(post.metrics),
          $createdAt: post.createdAt,
          $updatedAt: post.updatedAt,
        }
      );

      return post;
    });

    this.logAudit(workspaceId, "SOCIAL_POSTS_CREATED", `Created ${savedPosts.length} social post records for product ${productId}.`);
    this.saveToDisk();
    return savedPosts;
  }

  public updateSocialPostStatus(
    workspaceId: string,
    postId: string,
    patch: {
      status: SocialPostStatus;
      publishedAt?: string;
      externalPostId?: string;
      failureReason?: string;
      metrics?: SocialPostMetrics;
      socialAccountId?: string;
    }
  ): SocialPost | null {
    const existing = this.getSocialPostById(workspaceId, postId);
    if (!existing) {
      return null;
    }

    const updated: SocialPost = {
      ...existing,
      status: patch.status,
      publishedAt: patch.publishedAt ?? existing.publishedAt,
      externalPostId: patch.externalPostId ?? existing.externalPostId,
      failureReason: patch.failureReason,
      metrics: patch.metrics ?? existing.metrics,
      socialAccountId: patch.socialAccountId ?? existing.socialAccountId,
      updatedAt: new Date().toISOString(),
    };

    this.db.run(
      `UPDATE social_posts
       SET social_account_id = $socialAccountId,
           status = $status,
           published_at = $publishedAt,
           external_post_id = $externalPostId,
           failure_reason = $failureReason,
           metrics = $metrics,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId AND id = $postId`,
      {
        $socialAccountId: updated.socialAccountId || null,
        $status: updated.status,
        $publishedAt: updated.publishedAt || null,
        $externalPostId: updated.externalPostId || null,
        $failureReason: updated.failureReason || null,
        $metrics: JSON.stringify(updated.metrics),
        $updatedAt: updated.updatedAt,
        $workspaceId: workspaceId,
        $postId: postId,
      }
    );

    this.saveToDisk();
    return updated;
  }

  private mapVideoGenerationRow(row: any): VideoGenerationRecord {
    return {
      id: row.id,
      productId: row.product_id,
      workspaceId: row.workspace_id,
      version: row.version,
      isLatest: row.is_latest === 1,
      template: row.template as VideoTemplateName,
      outputType: row.output_type as VideoOutputType,
      inputMode: row.input_mode as VideoInputMode,
      prompt: row.prompt,
      provider: row.provider as VideoProviderName,
      providerFallbackChain: JSON.parse(row.provider_fallback_chain || "[]"),
      aspectRatio: row.aspect_ratio as VideoAspectRatio,
      durationSeconds: row.duration_seconds,
      status: row.status as VideoRenderStatus,
      progress: row.progress,
      creditsUsed: row.credits_used,
      estimatedRenderSeconds: row.estimated_render_seconds,
      sourceGenerationId: row.source_generation_id || undefined,
      sourceAnalysisId: row.source_analysis_id || undefined,
      sourceImageUrls: JSON.parse(row.source_image_urls || "[]"),
      title: row.title,
      videoUrl: row.video_url || undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      downloadUrl: row.download_url || undefined,
      errorMessage: row.error_message || undefined,
      scenes: JSON.parse(row.scenes || "[]"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
    };
  }

  public getVideoGenerations(productId: string): VideoGenerationRecord[] {
    const stmt = this.db.prepare("SELECT * FROM video_generations WHERE product_id = $productId ORDER BY version DESC");
    stmt.bind({ $productId: productId });
    const videos: VideoGenerationRecord[] = [];
    while (stmt.step()) {
      videos.push(this.mapVideoGenerationRow(stmt.getAsObject()));
    }
    stmt.free();
    return videos;
  }

  public getLatestVideoGeneration(productId: string): VideoGenerationRecord | null {
    const stmt = this.db.prepare("SELECT * FROM video_generations WHERE product_id = $productId AND is_latest = 1 LIMIT 1");
    stmt.bind({ $productId: productId });
    const video = stmt.step() ? this.mapVideoGenerationRow(stmt.getAsObject()) : null;
    stmt.free();
    return video;
  }

  public getVideoGenerationById(workspaceId: string, videoId: string): VideoGenerationRecord | null {
    const stmt = this.db.prepare("SELECT * FROM video_generations WHERE workspace_id = $workspaceId AND id = $videoId LIMIT 1");
    stmt.bind({ $workspaceId: workspaceId, $videoId: videoId });
    const video = stmt.step() ? this.mapVideoGenerationRow(stmt.getAsObject()) : null;
    stmt.free();
    return video;
  }

  public getWorkspaceVideoGenerations(workspaceId: string, productId?: string): VideoGenerationRecord[] {
    let query = "SELECT * FROM video_generations WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (productId) {
      query += " AND product_id = $productId";
      params.$productId = productId;
    }
    query += " ORDER BY created_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const videos: VideoGenerationRecord[] = [];
    while (stmt.step()) {
      videos.push(this.mapVideoGenerationRow(stmt.getAsObject()));
    }
    stmt.free();
    return videos;
  }

  public saveVideoGeneration(
    workspaceId: string,
    productId: string,
    record: Omit<VideoGenerationRecord, "version" | "isLatest" | "createdAt" | "updatedAt">
  ): VideoGenerationRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM video_generations WHERE product_id = $productId"
    );
    stmt.bind({ $productId: productId });
    let nextVersion = 1;
    if (stmt.step()) {
      nextVersion = stmt.getAsObject().max_v + 1;
    }
    stmt.free();

    this.db.run(
      "UPDATE video_generations SET is_latest = 0 WHERE product_id = $productId",
      { $productId: productId }
    );

    this.db.run(
      `INSERT INTO video_generations (
        id, product_id, workspace_id, version, is_latest, template, output_type, input_mode, prompt,
        provider, provider_fallback_chain, aspect_ratio, duration_seconds, status, progress, credits_used,
        estimated_render_seconds, source_generation_id, source_analysis_id, source_image_urls, title,
        video_url, thumbnail_url, download_url, error_message, scenes, completed_at, created_at, updated_at
      ) VALUES (
        $id, $productId, $workspaceId, $version, 1, $template, $outputType, $inputMode, $prompt,
        $provider, $providerFallbackChain, $aspectRatio, $durationSeconds, $status, $progress, $creditsUsed,
        $estimatedRenderSeconds, $sourceGenerationId, $sourceAnalysisId, $sourceImageUrls, $title,
        $videoUrl, $thumbnailUrl, $downloadUrl, $errorMessage, $scenes, $completedAt, $createdAt, $updatedAt
      )`,
      {
        $id: record.id,
        $productId: productId,
        $workspaceId: workspaceId,
        $version: nextVersion,
        $template: record.template,
        $outputType: record.outputType,
        $inputMode: record.inputMode,
        $prompt: record.prompt,
        $provider: record.provider,
        $providerFallbackChain: JSON.stringify(record.providerFallbackChain),
        $aspectRatio: record.aspectRatio,
        $durationSeconds: record.durationSeconds,
        $status: record.status,
        $progress: record.progress,
        $creditsUsed: record.creditsUsed,
        $estimatedRenderSeconds: record.estimatedRenderSeconds,
        $sourceGenerationId: record.sourceGenerationId || null,
        $sourceAnalysisId: record.sourceAnalysisId || null,
        $sourceImageUrls: JSON.stringify(record.sourceImageUrls),
        $title: record.title,
        $videoUrl: record.videoUrl || null,
        $thumbnailUrl: record.thumbnailUrl || null,
        $downloadUrl: record.downloadUrl || null,
        $errorMessage: record.errorMessage || null,
        $scenes: JSON.stringify(record.scenes),
        $completedAt: record.completedAt || null,
        $createdAt: now,
        $updatedAt: now,
      }
    );

    if (record.creditsUsed > 0) {
      this.logAudit(workspaceId, "VIDEO_CREDIT_DEBIT", `Deducted ${record.creditsUsed} credits for AI video generation on product ID: ${productId}`);
      this.consumeCredits(
        workspaceId,
        "video",
        record.creditsUsed,
        "video_consume",
        productId,
        `Generated AI video (${record.template} version ${nextVersion}) for product ID: ${productId}`
      );
    }

    this.saveToDisk();

    return {
      ...record,
      version: nextVersion,
      isLatest: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateVideoGeneration(
    workspaceId: string,
    videoId: string,
    patch: Partial<Pick<
      VideoGenerationRecord,
      "provider" | "status" | "progress" | "videoUrl" | "thumbnailUrl" | "downloadUrl" | "errorMessage" | "completedAt" | "scenes"
    >>
  ): VideoGenerationRecord | null {
    const existing = this.getVideoGenerationById(workspaceId, videoId);
    if (!existing) {
      return null;
    }

    const updated: VideoGenerationRecord = {
      ...existing,
      provider: patch.provider ?? existing.provider,
      status: patch.status ?? existing.status,
      progress: patch.progress ?? existing.progress,
      videoUrl: patch.videoUrl ?? existing.videoUrl,
      thumbnailUrl: patch.thumbnailUrl ?? existing.thumbnailUrl,
      downloadUrl: patch.downloadUrl ?? existing.downloadUrl,
      errorMessage: patch.errorMessage,
      completedAt: patch.completedAt ?? existing.completedAt,
      scenes: patch.scenes ?? existing.scenes,
      updatedAt: new Date().toISOString(),
    };

    this.db.run(
      `UPDATE video_generations
       SET provider = $provider,
           status = $status,
           progress = $progress,
           video_url = $videoUrl,
           thumbnail_url = $thumbnailUrl,
           download_url = $downloadUrl,
           error_message = $errorMessage,
           completed_at = $completedAt,
           scenes = $scenes,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId AND id = $videoId`,
      {
        $provider: updated.provider,
        $status: updated.status,
        $progress: updated.progress,
        $videoUrl: updated.videoUrl || null,
        $thumbnailUrl: updated.thumbnailUrl || null,
        $downloadUrl: updated.downloadUrl || null,
        $errorMessage: updated.errorMessage || null,
        $completedAt: updated.completedAt || null,
        $scenes: JSON.stringify(updated.scenes),
        $updatedAt: updated.updatedAt,
        $workspaceId: workspaceId,
        $videoId: videoId,
      }
    );

    this.saveToDisk();
    return updated;
  }

  public deleteVideoGeneration(workspaceId: string, videoId: string): boolean {
    try {
      const existing = this.getVideoGenerationById(workspaceId, videoId);
      this.db.run(
        "DELETE FROM video_generations WHERE workspace_id = $workspaceId AND id = $videoId",
        { $workspaceId: workspaceId, $videoId: videoId }
      );
      if (existing?.isLatest) {
        const fallback = this.getVideoGenerations(existing.productId)[0];
        if (fallback) {
          this.db.run(
            "UPDATE video_generations SET is_latest = 1 WHERE id = $id",
            { $id: fallback.id }
          );
        }
      }
      this.logAudit(workspaceId, "VIDEO_GENERATION_DELETED", `Deleted AI video generation ${videoId}.`);
      this.saveToDisk();
      return true;
    } catch (error) {
      console.error("[DatabaseManager] Failed to delete AI video generation:", error);
      return false;
    }
  }

  private mapShopifyStoreRow(row: any): ShopifyStoreConnection {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      shopDomain: row.shop_domain,
      shopName: row.shop_name,
      accessToken: row.access_token || undefined,
      refreshToken: row.refresh_token || undefined,
      tokenExpiresAt: row.token_expires_at || undefined,
      lastTokenRefreshAt: row.last_token_refresh_at || undefined,
      scopes: JSON.parse(row.scopes || "[]"),
      status: row.status,
      connectionMode: row.connection_mode === "live" ? "live" : "sandbox",
      isDefault: row.is_default === 1,
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
      lastSyncedAt: row.last_synced_at || undefined,
    };
  }

  private mapShopifySyncJobRow(row: any): ShopifySyncJob {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      storeId: row.store_id,
      scope: row.scope as ShopifySyncScope,
      status: row.status as ShopifySyncStatus,
      trigger: row.trigger_source as ShopifySyncTrigger,
      webhookTopic: row.webhook_topic || undefined,
      entityId: row.entity_id || undefined,
      summary: row.summary,
      syncedProducts: row.synced_products,
      syncedCollections: row.synced_collections,
      syncedInventory: row.synced_inventory,
      importedOrders: row.imported_orders,
      importedCustomers: row.imported_customers,
      revenueImported: row.revenue_imported,
      automationExecutions: row.automation_executions,
      errorMessage: row.error_message || undefined,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapShopifyWebhookEventRow(row: any): ShopifyWebhookEvent {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      storeId: row.store_id,
      topic: row.topic as ShopifyWebhookTopic,
      status: row.status as ShopifySyncStatus,
      payload: JSON.parse(row.payload || "{}"),
      syncJobId: row.sync_job_id || undefined,
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
    };
  }

  private mapShopifyAutomationSettingsRow(row: any): ShopifyAutomationSettings {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      storeId: row.store_id,
      autoSyncEveryHour: row.auto_sync_every_hour === 1,
      autoPublishGeneratedContent: row.auto_publish_generated_content === 1,
      autoCreateSocialPosts: row.auto_create_social_posts === 1,
      autoGenerateVideos: row.auto_generate_videos === 1,
      autoCompetitorMonitoring: row.auto_competitor_monitoring === 1,
      lastAutoSyncAt: row.last_auto_sync_at || undefined,
      lastAutomationRunAt: row.last_automation_run_at || undefined,
      updatedAt: row.updated_at,
    };
  }

  private mapShopifyAutomationRunRow(row: any): ShopifyAutomationRun {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      storeId: row.store_id,
      action: row.action,
      status: row.status,
      detail: row.detail,
      productId: row.product_id || undefined,
      createdAt: row.created_at,
    };
  }

  public getShopifyStores(workspaceId: string): ShopifyStoreConnection[] {
    const stmt = this.db.prepare("SELECT * FROM shopify_stores WHERE workspace_id = $workspaceId ORDER BY connected_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const stores: ShopifyStoreConnection[] = [];
    while (stmt.step()) {
      stores.push(this.mapShopifyStoreRow(stmt.getAsObject()));
    }
    stmt.free();
    return stores;
  }

  public getShopifyStoreById(workspaceId: string, storeId: string): ShopifyStoreConnection | null {
    const stmt = this.db.prepare("SELECT * FROM shopify_stores WHERE workspace_id = $workspaceId AND id = $storeId LIMIT 1");
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId });
    const store = stmt.step() ? this.mapShopifyStoreRow(stmt.getAsObject()) : null;
    stmt.free();
    return store;
  }

  public saveShopifyStore(
    workspaceId: string,
    input: Omit<ShopifyStoreConnection, "id" | "workspaceId" | "connectedAt" | "updatedAt" | "isDefault">
  ): ShopifyStoreConnection {
    const now = new Date().toISOString();
    const existing = this.getShopifyStores(workspaceId).find((item) => item.shopDomain === input.shopDomain);
    const isDefault = this.getShopifyStores(workspaceId).length === 0 || input.status === "connected";

    if (existing) {
      this.db.run(
        `UPDATE shopify_stores
         SET shop_name = $shopName,
             access_token = $accessToken,
             refresh_token = $refreshToken,
             token_expires_at = $tokenExpiresAt,
             last_token_refresh_at = $lastTokenRefreshAt,
             scopes = $scopes,
             status = $status,
             connection_mode = $connectionMode,
             updated_at = $updatedAt,
             last_synced_at = $lastSyncedAt
         WHERE workspace_id = $workspaceId AND id = $id`,
        {
          $workspaceId: workspaceId,
          $id: existing.id,
          $shopName: input.shopName,
          $accessToken: input.accessToken || null,
          $refreshToken: input.refreshToken || null,
          $tokenExpiresAt: input.tokenExpiresAt || null,
          $lastTokenRefreshAt: input.lastTokenRefreshAt || null,
          $scopes: JSON.stringify(input.scopes),
          $status: input.status,
          $connectionMode: input.connectionMode,
          $updatedAt: now,
          $lastSyncedAt: input.lastSyncedAt || null,
        }
      );
      const updated = this.getShopifyStoreById(workspaceId, existing.id);
      this.saveToDisk();
      return updated as ShopifyStoreConnection;
    }

    const store: ShopifyStoreConnection = {
      id: uuidv4(),
      workspaceId,
      connectedAt: now,
      updatedAt: now,
      isDefault,
      ...input,
    };

    if (isDefault) {
      this.db.run("UPDATE shopify_stores SET is_default = 0 WHERE workspace_id = $workspaceId", { $workspaceId: workspaceId });
    }

    this.db.run(
      `INSERT INTO shopify_stores (
        id, workspace_id, shop_domain, shop_name, access_token, refresh_token, token_expires_at,
        last_token_refresh_at, scopes, status, connection_mode, is_default, connected_at, updated_at, last_synced_at
      ) VALUES (
        $id, $workspaceId, $shopDomain, $shopName, $accessToken, $refreshToken, $tokenExpiresAt,
        $lastTokenRefreshAt, $scopes, $status, $connectionMode, $isDefault, $connectedAt, $updatedAt, $lastSyncedAt
      )`,
      {
        $id: store.id,
        $workspaceId: workspaceId,
        $shopDomain: store.shopDomain,
        $shopName: store.shopName,
        $accessToken: store.accessToken || null,
        $refreshToken: store.refreshToken || null,
        $tokenExpiresAt: store.tokenExpiresAt || null,
        $lastTokenRefreshAt: store.lastTokenRefreshAt || null,
        $scopes: JSON.stringify(store.scopes),
        $status: store.status,
        $connectionMode: store.connectionMode,
        $isDefault: store.isDefault ? 1 : 0,
        $connectedAt: store.connectedAt,
        $updatedAt: store.updatedAt,
        $lastSyncedAt: store.lastSyncedAt || null,
      }
    );

    this.saveShopifyAutomationSettings(workspaceId, store.id, {
      autoSyncEveryHour: true,
      autoPublishGeneratedContent: false,
      autoCreateSocialPosts: false,
      autoGenerateVideos: false,
      autoCompetitorMonitoring: false,
    });
    this.logAudit(workspaceId, "SHOPIFY_STORE_CONNECTED", `Connected Shopify store ${store.shopDomain}.`);
    this.saveToDisk();
    return store;
  }

  public updateShopifyStore(
    workspaceId: string,
    storeId: string,
    patch: Partial<Pick<
      ShopifyStoreConnection,
      | "shopName"
      | "accessToken"
      | "refreshToken"
      | "tokenExpiresAt"
      | "lastTokenRefreshAt"
      | "scopes"
      | "status"
      | "connectionMode"
      | "isDefault"
      | "lastSyncedAt"
    >>
  ): ShopifyStoreConnection | null {
    const existing = this.getShopifyStoreById(workspaceId, storeId);
    if (!existing) {
      return null;
    }
    if (patch.isDefault) {
      this.db.run("UPDATE shopify_stores SET is_default = 0 WHERE workspace_id = $workspaceId", { $workspaceId: workspaceId });
    }
    this.db.run(
      `UPDATE shopify_stores
       SET shop_name = $shopName,
           access_token = $accessToken,
           refresh_token = $refreshToken,
           token_expires_at = $tokenExpiresAt,
           last_token_refresh_at = $lastTokenRefreshAt,
           scopes = $scopes,
           status = $status,
           connection_mode = $connectionMode,
           is_default = $isDefault,
           updated_at = $updatedAt,
           last_synced_at = $lastSyncedAt
       WHERE workspace_id = $workspaceId AND id = $storeId`,
      {
        $workspaceId: workspaceId,
        $storeId: storeId,
        $shopName: patch.shopName ?? existing.shopName,
        $accessToken: patch.accessToken ?? existing.accessToken ?? null,
        $refreshToken: patch.refreshToken ?? existing.refreshToken ?? null,
        $tokenExpiresAt: patch.tokenExpiresAt ?? existing.tokenExpiresAt ?? null,
        $lastTokenRefreshAt: patch.lastTokenRefreshAt ?? existing.lastTokenRefreshAt ?? null,
        $scopes: JSON.stringify(patch.scopes ?? existing.scopes),
        $status: patch.status ?? existing.status,
        $connectionMode: patch.connectionMode ?? existing.connectionMode,
        $isDefault: (patch.isDefault ?? existing.isDefault) ? 1 : 0,
        $updatedAt: new Date().toISOString(),
        $lastSyncedAt: patch.lastSyncedAt ?? existing.lastSyncedAt ?? null,
      }
    );
    this.saveToDisk();
    return this.getShopifyStoreById(workspaceId, storeId);
  }

  public disconnectShopifyStore(workspaceId: string, storeId: string): ShopifyStoreConnection | null {
    this.logAudit(workspaceId, "SHOPIFY_STORE_DISCONNECTED", `Disconnected Shopify store ${storeId}.`);
    return this.updateShopifyStore(workspaceId, storeId, {
      status: "disconnected",
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
    });
  }

  public saveShopifyAutomationSettings(
    workspaceId: string,
    storeId: string,
    patch: Partial<Omit<ShopifyAutomationSettings, "id" | "workspaceId" | "storeId" | "updatedAt">>
  ): ShopifyAutomationSettings {
    const existing = this.getShopifyAutomationSettings(workspaceId, storeId);
    const now = new Date().toISOString();
    if (existing) {
      this.db.run(
        `UPDATE shopify_automation_settings
         SET auto_sync_every_hour = $autoSyncEveryHour,
             auto_publish_generated_content = $autoPublishGeneratedContent,
             auto_create_social_posts = $autoCreateSocialPosts,
             auto_generate_videos = $autoGenerateVideos,
             auto_competitor_monitoring = $autoCompetitorMonitoring,
             last_auto_sync_at = $lastAutoSyncAt,
             last_automation_run_at = $lastAutomationRunAt,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND store_id = $storeId`,
        {
          $workspaceId: workspaceId,
          $storeId: storeId,
          $autoSyncEveryHour: (patch.autoSyncEveryHour ?? existing.autoSyncEveryHour) ? 1 : 0,
          $autoPublishGeneratedContent: (patch.autoPublishGeneratedContent ?? existing.autoPublishGeneratedContent) ? 1 : 0,
          $autoCreateSocialPosts: (patch.autoCreateSocialPosts ?? existing.autoCreateSocialPosts) ? 1 : 0,
          $autoGenerateVideos: (patch.autoGenerateVideos ?? existing.autoGenerateVideos) ? 1 : 0,
          $autoCompetitorMonitoring: (patch.autoCompetitorMonitoring ?? existing.autoCompetitorMonitoring) ? 1 : 0,
          $lastAutoSyncAt: patch.lastAutoSyncAt ?? existing.lastAutoSyncAt ?? null,
          $lastAutomationRunAt: patch.lastAutomationRunAt ?? existing.lastAutomationRunAt ?? null,
          $updatedAt: now,
        }
      );
      this.saveToDisk();
      return this.getShopifyAutomationSettings(workspaceId, storeId) as ShopifyAutomationSettings;
    }

    const settings: ShopifyAutomationSettings = {
      id: uuidv4(),
      workspaceId,
      storeId,
      autoSyncEveryHour: patch.autoSyncEveryHour ?? true,
      autoPublishGeneratedContent: patch.autoPublishGeneratedContent ?? false,
      autoCreateSocialPosts: patch.autoCreateSocialPosts ?? false,
      autoGenerateVideos: patch.autoGenerateVideos ?? false,
      autoCompetitorMonitoring: patch.autoCompetitorMonitoring ?? false,
      lastAutoSyncAt: patch.lastAutoSyncAt,
      lastAutomationRunAt: patch.lastAutomationRunAt,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO shopify_automation_settings (
        id, workspace_id, store_id, auto_sync_every_hour, auto_publish_generated_content,
        auto_create_social_posts, auto_generate_videos, auto_competitor_monitoring,
        last_auto_sync_at, last_automation_run_at, updated_at
      ) VALUES (
        $id, $workspaceId, $storeId, $autoSyncEveryHour, $autoPublishGeneratedContent,
        $autoCreateSocialPosts, $autoGenerateVideos, $autoCompetitorMonitoring,
        $lastAutoSyncAt, $lastAutomationRunAt, $updatedAt
      )`,
      {
        $id: settings.id,
        $workspaceId: workspaceId,
        $storeId: storeId,
        $autoSyncEveryHour: settings.autoSyncEveryHour ? 1 : 0,
        $autoPublishGeneratedContent: settings.autoPublishGeneratedContent ? 1 : 0,
        $autoCreateSocialPosts: settings.autoCreateSocialPosts ? 1 : 0,
        $autoGenerateVideos: settings.autoGenerateVideos ? 1 : 0,
        $autoCompetitorMonitoring: settings.autoCompetitorMonitoring ? 1 : 0,
        $lastAutoSyncAt: settings.lastAutoSyncAt || null,
        $lastAutomationRunAt: settings.lastAutomationRunAt || null,
        $updatedAt: settings.updatedAt,
      }
    );
    this.saveToDisk();
    return settings;
  }

  public getShopifyAutomationSettings(workspaceId: string, storeId: string): ShopifyAutomationSettings | null {
    const stmt = this.db.prepare(
      "SELECT * FROM shopify_automation_settings WHERE workspace_id = $workspaceId AND store_id = $storeId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId });
    const settings = stmt.step() ? this.mapShopifyAutomationSettingsRow(stmt.getAsObject()) : null;
    stmt.free();
    return settings;
  }

  public getAllShopifyAutomationSettings(workspaceId: string): ShopifyAutomationSettings[] {
    const stmt = this.db.prepare("SELECT * FROM shopify_automation_settings WHERE workspace_id = $workspaceId ORDER BY updated_at DESC");
    stmt.bind({ $workspaceId: workspaceId });
    const settings: ShopifyAutomationSettings[] = [];
    while (stmt.step()) {
      settings.push(this.mapShopifyAutomationSettingsRow(stmt.getAsObject()));
    }
    stmt.free();
    return settings;
  }

  public enqueueShopifySyncJob(
    workspaceId: string,
    storeId: string,
    scope: ShopifySyncScope,
    trigger: ShopifySyncTrigger,
    summary: string,
    webhookTopic?: ShopifyWebhookTopic,
    entityId?: string
  ): ShopifySyncJob {
    const now = new Date().toISOString();
    const job: ShopifySyncJob = {
      id: uuidv4(),
      workspaceId,
      storeId,
      scope,
      status: "pending",
      trigger,
      webhookTopic,
      entityId,
      summary,
      syncedProducts: 0,
      syncedCollections: 0,
      syncedInventory: 0,
      importedOrders: 0,
      importedCustomers: 0,
      revenueImported: 0,
      automationExecutions: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO shopify_sync_jobs (
        id, workspace_id, store_id, scope, status, trigger_source, webhook_topic, entity_id,
        summary, synced_products, synced_collections, synced_inventory, imported_orders,
        imported_customers, revenue_imported, automation_executions, error_message,
        started_at, completed_at, created_at, updated_at
      ) VALUES (
        $id, $workspaceId, $storeId, $scope, $status, $triggerSource, $webhookTopic, $entityId,
        $summary, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, $createdAt, $updatedAt
      )`,
      {
        $id: job.id,
        $workspaceId: workspaceId,
        $storeId: storeId,
        $scope: scope,
        $status: job.status,
        $triggerSource: trigger,
        $webhookTopic: webhookTopic || null,
        $entityId: entityId || null,
        $summary: summary,
        $createdAt: job.createdAt,
        $updatedAt: job.updatedAt,
      }
    );
    this.saveToDisk();
    return job;
  }

  public updateShopifySyncJob(
    workspaceId: string,
    jobId: string,
    patch: Partial<Omit<ShopifySyncJob, "id" | "workspaceId" | "storeId" | "scope" | "trigger" | "createdAt">>
  ): ShopifySyncJob | null {
    const stmt = this.db.prepare("SELECT * FROM shopify_sync_jobs WHERE workspace_id = $workspaceId AND id = $jobId LIMIT 1");
    stmt.bind({ $workspaceId: workspaceId, $jobId: jobId });
    const existing = stmt.step() ? this.mapShopifySyncJobRow(stmt.getAsObject()) : null;
    stmt.free();
    if (!existing) {
      return null;
    }
    const next = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      `UPDATE shopify_sync_jobs
       SET status = $status,
           webhook_topic = $webhookTopic,
           entity_id = $entityId,
           summary = $summary,
           synced_products = $syncedProducts,
           synced_collections = $syncedCollections,
           synced_inventory = $syncedInventory,
           imported_orders = $importedOrders,
           imported_customers = $importedCustomers,
           revenue_imported = $revenueImported,
           automation_executions = $automationExecutions,
           error_message = $errorMessage,
           started_at = $startedAt,
           completed_at = $completedAt,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId AND id = $jobId`,
      {
        $workspaceId: workspaceId,
        $jobId: jobId,
        $status: next.status,
        $webhookTopic: next.webhookTopic || null,
        $entityId: next.entityId || null,
        $summary: next.summary,
        $syncedProducts: next.syncedProducts,
        $syncedCollections: next.syncedCollections,
        $syncedInventory: next.syncedInventory,
        $importedOrders: next.importedOrders,
        $importedCustomers: next.importedCustomers,
        $revenueImported: next.revenueImported,
        $automationExecutions: next.automationExecutions,
        $errorMessage: next.errorMessage || null,
        $startedAt: next.startedAt || null,
        $completedAt: next.completedAt || null,
        $updatedAt: next.updatedAt,
      }
    );
    this.saveToDisk();
    return this.getShopifySyncJobs(workspaceId).find((item) => item.id === jobId) || null;
  }

  public getShopifySyncJobs(
    workspaceId: string,
    options: { storeId?: string; status?: ShopifySyncStatus } = {}
  ): ShopifySyncJob[] {
    let query = "SELECT * FROM shopify_sync_jobs WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (options.storeId) {
      query += " AND store_id = $storeId";
      params.$storeId = options.storeId;
    }
    if (options.status) {
      query += " AND status = $status";
      params.$status = options.status;
    }
    query += " ORDER BY created_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const jobs: ShopifySyncJob[] = [];
    while (stmt.step()) {
      jobs.push(this.mapShopifySyncJobRow(stmt.getAsObject()));
    }
    stmt.free();
    return jobs;
  }

  public saveShopifyWebhookEvent(
    workspaceId: string,
    storeId: string,
    topic: ShopifyWebhookTopic,
    payload: Record<string, unknown>,
    syncJobId?: string,
    status: ShopifySyncStatus = "pending",
    errorMessage?: string
  ): ShopifyWebhookEvent {
    const event: ShopifyWebhookEvent = {
      id: uuidv4(),
      workspaceId,
      storeId,
      topic,
      status,
      payload,
      syncJobId,
      errorMessage,
      createdAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO shopify_webhook_events (
        id, workspace_id, store_id, topic, status, payload, sync_job_id, error_message, created_at
      ) VALUES (
        $id, $workspaceId, $storeId, $topic, $status, $payload, $syncJobId, $errorMessage, $createdAt
      )`,
      {
        $id: event.id,
        $workspaceId: workspaceId,
        $storeId: storeId,
        $topic: topic,
        $status: status,
        $payload: JSON.stringify(payload),
        $syncJobId: syncJobId || null,
        $errorMessage: errorMessage || null,
        $createdAt: event.createdAt,
      }
    );
    this.saveToDisk();
    return event;
  }

  public getShopifyWebhookEvents(workspaceId: string, storeId?: string): ShopifyWebhookEvent[] {
    let query = "SELECT * FROM shopify_webhook_events WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (storeId) {
      query += " AND store_id = $storeId";
      params.$storeId = storeId;
    }
    query += " ORDER BY created_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const events: ShopifyWebhookEvent[] = [];
    while (stmt.step()) {
      events.push(this.mapShopifyWebhookEventRow(stmt.getAsObject()));
    }
    stmt.free();
    return events;
  }

  public saveShopifyAutomationRun(
    workspaceId: string,
    storeId: string,
    action: ShopifyAutomationRun["action"],
    status: ShopifySyncStatus,
    detail: string,
    productId?: string
  ): ShopifyAutomationRun {
    const run: ShopifyAutomationRun = {
      id: uuidv4(),
      workspaceId,
      storeId,
      action,
      status,
      detail,
      productId,
      createdAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO shopify_automation_runs (id, workspace_id, store_id, action, status, detail, product_id, created_at)
       VALUES ($id, $workspaceId, $storeId, $action, $status, $detail, $productId, $createdAt)`,
      {
        $id: run.id,
        $workspaceId: workspaceId,
        $storeId: storeId,
        $action: action,
        $status: status,
        $detail: detail,
        $productId: productId || null,
        $createdAt: run.createdAt,
      }
    );
    this.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: run.createdAt,
    });
    this.saveToDisk();
    return run;
  }

  public getShopifyAutomationRuns(workspaceId: string, storeId?: string): ShopifyAutomationRun[] {
    let query = "SELECT * FROM shopify_automation_runs WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (storeId) {
      query += " AND store_id = $storeId";
      params.$storeId = storeId;
    }
    query += " ORDER BY created_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const runs: ShopifyAutomationRun[] = [];
    while (stmt.step()) {
      runs.push(this.mapShopifyAutomationRunRow(stmt.getAsObject()));
    }
    stmt.free();
    return runs;
  }

  public markShopifyStoreSynced(workspaceId: string, storeId: string): void {
    this.updateShopifyStore(workspaceId, storeId, {
      lastSyncedAt: new Date().toISOString(),
      status: "connected",
    });
  }

  public upsertShopifyProductRecord(
    workspaceId: string,
    storeId: string,
    shopifyProductId: string,
    handle: string | undefined,
    inventoryQuantity: number,
    product: NormalizedProduct
  ): NormalizedProduct {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "SELECT * FROM shopify_product_links WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_product_id = $shopifyProductId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId, $shopifyProductId: shopifyProductId });
    const hasLink = stmt.step();
    const row = hasLink ? stmt.getAsObject() : null;
    stmt.free();

    let productId = row?.product_id as string | undefined;
    if (!productId) {
      productId = uuidv4();
      this.db.run(
        `INSERT INTO products (
          id, workspace_id, title, description, images, gallery, variants, specifications, vendor,
          price, compare_at_price, currency, availability, created_at
        ) VALUES (
          $id, $workspaceId, $title, $description, $images, $gallery, $variants, $specifications, $vendor,
          $price, $compareAtPrice, $currency, $availability, $createdAt
        )`,
        {
          $id: productId,
          $workspaceId: workspaceId,
          $title: product.title,
          $description: product.description,
          $images: product.images,
          $gallery: JSON.stringify(product.gallery),
          $variants: JSON.stringify(product.variants),
          $specifications: JSON.stringify(product.specifications),
          $vendor: product.vendor,
          $price: product.price,
          $compareAtPrice: product.compare_at_price || null,
          $currency: product.currency,
          $availability: product.availability ? 1 : 0,
          $createdAt: now,
        }
      );
      this.db.run(
        `INSERT INTO shopify_product_links (
          id, workspace_id, store_id, product_id, shopify_product_id, handle, inventory_quantity, updated_at
        ) VALUES (
          $id, $workspaceId, $storeId, $productId, $shopifyProductId, $handle, $inventoryQuantity, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $storeId: storeId,
          $productId: productId,
          $shopifyProductId: shopifyProductId,
          $handle: handle || null,
          $inventoryQuantity: inventoryQuantity,
          $updatedAt: now,
        }
      );
    } else {
      this.db.run(
        `UPDATE products
         SET title = $title,
             description = $description,
             images = $images,
             gallery = $gallery,
             variants = $variants,
             specifications = $specifications,
             vendor = $vendor,
             price = $price,
             compare_at_price = $compareAtPrice,
             currency = $currency,
             availability = $availability
         WHERE workspace_id = $workspaceId AND id = $productId`,
        {
          $workspaceId: workspaceId,
          $productId: productId,
          $title: product.title,
          $description: product.description,
          $images: product.images,
          $gallery: JSON.stringify(product.gallery),
          $variants: JSON.stringify(product.variants),
          $specifications: JSON.stringify(product.specifications),
          $vendor: product.vendor,
          $price: product.price,
          $compareAtPrice: product.compare_at_price || null,
          $currency: product.currency,
          $availability: product.availability ? 1 : 0,
        }
      );
      this.db.run(
        `UPDATE shopify_product_links
         SET handle = $handle,
             inventory_quantity = $inventoryQuantity,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_product_id = $shopifyProductId`,
        {
          $workspaceId: workspaceId,
          $storeId: storeId,
          $shopifyProductId: shopifyProductId,
          $handle: handle || null,
          $inventoryQuantity: inventoryQuantity,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
    return { ...product, id: productId };
  }

  public upsertShopifyCollectionRecord(
    workspaceId: string,
    storeId: string,
    shopifyCollectionId: string,
    title: string,
    handle: string | undefined,
    productsCount: number
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "SELECT id FROM shopify_collections WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_collection_id = $shopifyCollectionId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId, $shopifyCollectionId: shopifyCollectionId });
    const exists = stmt.step();
    const row = exists ? stmt.getAsObject() : null;
    stmt.free();
    if (row?.id) {
      this.db.run(
        `UPDATE shopify_collections
         SET title = $title, handle = $handle, products_count = $productsCount, updated_at = $updatedAt
         WHERE id = $id`,
        { $id: row.id, $title: title, $handle: handle || null, $productsCount: productsCount, $updatedAt: now }
      );
    } else {
      this.db.run(
        `INSERT INTO shopify_collections (
          id, workspace_id, store_id, shopify_collection_id, title, handle, products_count, updated_at
        ) VALUES (
          $id, $workspaceId, $storeId, $shopifyCollectionId, $title, $handle, $productsCount, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $storeId: storeId,
          $shopifyCollectionId: shopifyCollectionId,
          $title: title,
          $handle: handle || null,
          $productsCount: productsCount,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
  }

  public upsertShopifyOrderRecord(
    workspaceId: string,
    storeId: string,
    shopifyOrderId: string,
    orderNumber: string,
    customerEmail: string | undefined,
    totalPrice: number,
    currency: string,
    status: string
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "SELECT id FROM shopify_orders WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_order_id = $shopifyOrderId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId, $shopifyOrderId: shopifyOrderId });
    const exists = stmt.step();
    const row = exists ? stmt.getAsObject() : null;
    stmt.free();
    if (row?.id) {
      this.db.run(
        `UPDATE shopify_orders
         SET order_number = $orderNumber, customer_email = $customerEmail, total_price = $totalPrice,
             currency = $currency, status = $status, updated_at = $updatedAt
         WHERE id = $id`,
        {
          $id: row.id,
          $orderNumber: orderNumber,
          $customerEmail: customerEmail || null,
          $totalPrice: totalPrice,
          $currency: currency,
          $status: status,
          $updatedAt: now,
        }
      );
    } else {
      this.db.run(
        `INSERT INTO shopify_orders (
          id, workspace_id, store_id, shopify_order_id, order_number, customer_email,
          total_price, currency, status, created_at, updated_at
        ) VALUES (
          $id, $workspaceId, $storeId, $shopifyOrderId, $orderNumber, $customerEmail,
          $totalPrice, $currency, $status, $createdAt, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $storeId: storeId,
          $shopifyOrderId: shopifyOrderId,
          $orderNumber: orderNumber,
          $customerEmail: customerEmail || null,
          $totalPrice: totalPrice,
          $currency: currency,
          $status: status,
          $createdAt: now,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
  }

  public upsertShopifyCustomerRecord(
    workspaceId: string,
    storeId: string,
    shopifyCustomerId: string,
    email: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
    ordersCount: number,
    totalSpent: number
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "SELECT id FROM shopify_customers WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_customer_id = $shopifyCustomerId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $storeId: storeId, $shopifyCustomerId: shopifyCustomerId });
    const exists = stmt.step();
    const row = exists ? stmt.getAsObject() : null;
    stmt.free();
    if (row?.id) {
      this.db.run(
        `UPDATE shopify_customers
         SET email = $email, first_name = $firstName, last_name = $lastName,
             orders_count = $ordersCount, total_spent = $totalSpent, updated_at = $updatedAt
         WHERE id = $id`,
        {
          $id: row.id,
          $email: email || null,
          $firstName: firstName || null,
          $lastName: lastName || null,
          $ordersCount: ordersCount,
          $totalSpent: totalSpent,
          $updatedAt: now,
        }
      );
    } else {
      this.db.run(
        `INSERT INTO shopify_customers (
          id, workspace_id, store_id, shopify_customer_id, email, first_name, last_name,
          orders_count, total_spent, updated_at
        ) VALUES (
          $id, $workspaceId, $storeId, $shopifyCustomerId, $email, $firstName, $lastName,
          $ordersCount, $totalSpent, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $storeId: storeId,
          $shopifyCustomerId: shopifyCustomerId,
          $email: email || null,
          $firstName: firstName || null,
          $lastName: lastName || null,
          $ordersCount: ordersCount,
          $totalSpent: totalSpent,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
  }

  public getShopifySyncAnalytics(workspaceId: string): ShopifySyncAnalytics {
    const stores = this.getShopifyStores(workspaceId).filter((store) => store.status !== "disconnected");
    const jobs = this.getShopifySyncJobs(workspaceId);
    const automationRuns = this.getShopifyAutomationRuns(workspaceId);
    const productCountResult = this.db.exec(`SELECT COUNT(*) AS c FROM shopify_product_links WHERE workspace_id = '${workspaceId}'`);
    const ordersResult = this.db.exec(`SELECT COUNT(*) AS c, COALESCE(SUM(total_price), 0) AS revenue FROM shopify_orders WHERE workspace_id = '${workspaceId}'`);
    const syncedProducts = productCountResult[0]?.values?.[0]?.[0] ?? 0;
    const ordersImported = ordersResult[0]?.values?.[0]?.[0] ?? 0;
    const revenueImported = ordersResult[0]?.values?.[0]?.[1] ?? 0;
    return {
      connectedStores: stores.length,
      syncedProducts: Number(syncedProducts),
      ordersImported: Number(ordersImported),
      revenueImported: Number(revenueImported),
      syncFailures: jobs.filter((job) => job.status === "failed").length,
      automationExecutions: automationRuns.length,
    };
  }

  public getShopifySyncOverview(workspaceId: string): ShopifySyncOverview {
    const jobs = this.getShopifySyncJobs(workspaceId);
    return {
      stores: this.getShopifyStores(workspaceId),
      jobs,
      queue: jobs.filter((job) => job.status === "pending" || job.status === "syncing"),
      webhooks: this.getShopifyWebhookEvents(workspaceId),
      automationSettings: this.getAllShopifyAutomationSettings(workspaceId),
      automationRuns: this.getShopifyAutomationRuns(workspaceId),
      analytics: this.getShopifySyncAnalytics(workspaceId),
    };
  }

  private mapQueueJobRow(row: any): QueueJobRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind as QueueJobKind,
      workerName: row.worker_name as QueueWorkerName,
      status: row.status as QueueJobStatus,
      referenceId: row.reference_id || undefined,
      payload: JSON.parse(row.payload || "{}"),
      priority: row.priority,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      backoffMs: row.backoff_ms,
      nextRunAt: row.next_run_at,
      lockedAt: row.locked_at || undefined,
      lastError: row.last_error || undefined,
      deadLetterReason: row.dead_letter_reason || undefined,
      processingTimeMs: row.processing_time_ms || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
    };
  }

  private mapQueueJobLogRow(row: any): QueueJobLog {
    return {
      id: row.id,
      jobId: row.job_id,
      workspaceId: row.workspace_id,
      status: row.status as QueueJobStatus,
      message: row.message,
      workerName: row.worker_name as QueueWorkerName,
      createdAt: row.created_at,
    };
  }

  private mapWorkerHealthRow(row: any): WorkerHealthSnapshot {
    return {
      workerName: row.worker_name as QueueWorkerName,
      status: row.status,
      activeJobId: row.active_job_id || undefined,
      memoryUsageMb: row.memory_usage_mb,
      queueLength: row.queue_length,
      failedJobs: row.failed_jobs,
      processedJobs: row.processed_jobs,
      averageProcessingTimeMs: row.average_processing_time_ms,
      lastHeartbeatAt: row.last_heartbeat_at,
    };
  }

  private mapDeadLetterRow(row: any): DeadLetterJob {
    return {
      id: row.id,
      sourceJobId: row.source_job_id,
      workspaceId: row.workspace_id,
      kind: row.kind as QueueJobKind,
      workerName: row.worker_name as QueueWorkerName,
      payload: JSON.parse(row.payload || "{}"),
      attempts: row.attempts,
      lastError: row.last_error,
      movedAt: row.moved_at,
    };
  }

  public enqueueQueueJob(
    workspaceId: string,
    input: {
      kind: QueueJobKind;
      workerName: QueueWorkerName;
      referenceId?: string;
      payload: Record<string, unknown>;
      priority?: number;
      maxAttempts?: number;
      backoffMs?: number;
      status?: Extract<QueueJobStatus, "pending" | "queued">;
    }
  ): QueueJobRecord {
    const now = new Date().toISOString();
    const job: QueueJobRecord = {
      id: uuidv4(),
      workspaceId,
      kind: input.kind,
      workerName: input.workerName,
      status: input.status || "queued",
      referenceId: input.referenceId,
      payload: input.payload,
      priority: input.priority ?? 5,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      backoffMs: input.backoffMs ?? 1000,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.db.run(
      `INSERT INTO queue_jobs (
        id, workspace_id, kind, worker_name, status, reference_id, payload, priority,
        attempt_count, max_attempts, backoff_ms, next_run_at, locked_at, last_error,
        dead_letter_reason, processing_time_ms, created_at, updated_at, completed_at
      ) VALUES (
        $id, $workspaceId, $kind, $workerName, $status, $referenceId, $payload, $priority,
        0, $maxAttempts, $backoffMs, $nextRunAt, NULL, NULL, NULL, NULL, $createdAt, $updatedAt, NULL
      )`,
      {
        $id: job.id,
        $workspaceId: workspaceId,
        $kind: job.kind,
        $workerName: job.workerName,
        $status: job.status,
        $referenceId: job.referenceId || null,
        $payload: JSON.stringify(job.payload),
        $priority: job.priority,
        $maxAttempts: job.maxAttempts,
        $backoffMs: job.backoffMs,
        $nextRunAt: job.nextRunAt,
        $createdAt: job.createdAt,
        $updatedAt: job.updatedAt,
      }
    );
    this.addQueueJobLog(workspaceId, job.id, job.workerName, job.status, `Queued ${job.kind} job.`);
    this.saveToDisk();
    return job;
  }

  public getQueueJobById(jobId: string): QueueJobRecord | null {
    const stmt = this.db.prepare("SELECT * FROM queue_jobs WHERE id = $jobId LIMIT 1");
    stmt.bind({ $jobId: jobId });
    const job = stmt.step() ? this.mapQueueJobRow(stmt.getAsObject()) : null;
    stmt.free();
    return job;
  }

  public getQueueJobs(
    workspaceId?: string,
    options: {
      statuses?: QueueJobStatus[];
      kinds?: QueueJobKind[];
      workerName?: QueueWorkerName;
      includeCompleted?: boolean;
      limit?: number;
    } = {}
  ): QueueJobRecord[] {
    let query = "SELECT * FROM queue_jobs WHERE 1=1";
    const params: Record<string, any> = {};
    if (workspaceId) {
      query += " AND workspace_id = $workspaceId";
      params.$workspaceId = workspaceId;
    }
    if (options.workerName) {
      query += " AND worker_name = $workerName";
      params.$workerName = options.workerName;
    }
    if (options.statuses && options.statuses.length > 0) {
      const placeholders = options.statuses.map((_, index) => `$status${index}`);
      query += ` AND status IN (${placeholders.join(", ")})`;
      options.statuses.forEach((status, index) => {
        params[`$status${index}`] = status;
      });
    } else if (!options.includeCompleted) {
      query += ` AND status != 'completed'`;
    }
    if (options.kinds && options.kinds.length > 0) {
      const placeholders = options.kinds.map((_, index) => `$kind${index}`);
      query += ` AND kind IN (${placeholders.join(", ")})`;
      options.kinds.forEach((kind, index) => {
        params[`$kind${index}`] = kind;
      });
    }
    query += " ORDER BY created_at DESC";
    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const jobs: QueueJobRecord[] = [];
    while (stmt.step()) {
      jobs.push(this.mapQueueJobRow(stmt.getAsObject()));
    }
    stmt.free();
    return jobs;
  }

  public claimNextQueueJob(workerName: QueueWorkerName, kinds: QueueJobKind[]): QueueJobRecord | null {
    const dueJobs = this.getQueueJobs(undefined, {
      statuses: ["pending", "queued", "retrying"],
      kinds,
      includeCompleted: true,
      limit: 200,
    }).filter((job) => new Date(job.nextRunAt).getTime() <= Date.now());

    const next = dueJobs
      .sort((a, b) => (b.priority - a.priority) || (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))[0];

    if (!next) {
      return null;
    }

    this.db.run(
      `UPDATE queue_jobs
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           locked_at = $lockedAt,
           updated_at = $updatedAt
       WHERE id = $jobId`,
      {
        $jobId: next.id,
        $lockedAt: new Date().toISOString(),
        $updatedAt: new Date().toISOString(),
      }
    );
    this.addQueueJobLog(next.workspaceId, next.id, workerName, "processing", `Worker ${workerName} claimed ${next.kind} job.`);
    this.saveToDisk();
    return this.getQueueJobById(next.id);
  }

  public updateQueueJob(
    jobId: string,
    patch: Partial<Pick<
      QueueJobRecord,
      | "status"
      | "payload"
      | "priority"
      | "attemptCount"
      | "maxAttempts"
      | "backoffMs"
      | "nextRunAt"
      | "lockedAt"
      | "lastError"
      | "deadLetterReason"
      | "processingTimeMs"
      | "completedAt"
    >>
  ): QueueJobRecord | null {
    const existing = this.getQueueJobById(jobId);
    if (!existing) {
      return null;
    }
    const next = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      `UPDATE queue_jobs
       SET status = $status,
           payload = $payload,
           priority = $priority,
           attempt_count = $attemptCount,
           max_attempts = $maxAttempts,
           backoff_ms = $backoffMs,
           next_run_at = $nextRunAt,
           locked_at = $lockedAt,
           last_error = $lastError,
           dead_letter_reason = $deadLetterReason,
           processing_time_ms = $processingTimeMs,
           updated_at = $updatedAt,
           completed_at = $completedAt
       WHERE id = $jobId`,
      {
        $jobId: jobId,
        $status: next.status,
        $payload: JSON.stringify(next.payload),
        $priority: next.priority,
        $attemptCount: next.attemptCount,
        $maxAttempts: next.maxAttempts,
        $backoffMs: next.backoffMs,
        $nextRunAt: next.nextRunAt,
        $lockedAt: next.lockedAt || null,
        $lastError: next.lastError || null,
        $deadLetterReason: next.deadLetterReason || null,
        $processingTimeMs: next.processingTimeMs || null,
        $updatedAt: next.updatedAt,
        $completedAt: next.completedAt || null,
      }
    );
    this.saveToDisk();
    return this.getQueueJobById(jobId);
  }

  public addQueueJobLog(
    workspaceId: string,
    jobId: string,
    workerName: QueueWorkerName,
    status: QueueJobStatus,
    message: string
  ): QueueJobLog {
    const log: QueueJobLog = {
      id: uuidv4(),
      jobId,
      workspaceId,
      status,
      message,
      workerName,
      createdAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO queue_job_logs (id, job_id, workspace_id, status, message, worker_name, created_at)
       VALUES ($id, $jobId, $workspaceId, $status, $message, $workerName, $createdAt)`,
      {
        $id: log.id,
        $jobId: log.jobId,
        $workspaceId: workspaceId,
        $status: status,
        $message: message,
        $workerName: workerName,
        $createdAt: log.createdAt,
      }
    );
    this.saveToDisk();
    return log;
  }

  public getQueueJobLogs(workspaceId?: string, jobId?: string): QueueJobLog[] {
    let query = "SELECT * FROM queue_job_logs WHERE 1=1";
    const params: Record<string, string> = {};
    if (workspaceId) {
      query += " AND workspace_id = $workspaceId";
      params.$workspaceId = workspaceId;
    }
    if (jobId) {
      query += " AND job_id = $jobId";
      params.$jobId = jobId;
    }
    query += " ORDER BY created_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const logs: QueueJobLog[] = [];
    while (stmt.step()) {
      logs.push(this.mapQueueJobLogRow(stmt.getAsObject()));
    }
    stmt.free();
    return logs;
  }

  public moveQueueJobToDeadLetter(jobId: string, reason: string): DeadLetterJob | null {
    const job = this.getQueueJobById(jobId);
    if (!job) {
      return null;
    }
    const dead: DeadLetterJob = {
      id: uuidv4(),
      sourceJobId: job.id,
      workspaceId: job.workspaceId,
      kind: job.kind,
      workerName: job.workerName,
      payload: job.payload,
      attempts: job.attemptCount,
      lastError: reason,
      movedAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO dead_letter_jobs (id, source_job_id, workspace_id, kind, worker_name, payload, attempts, last_error, moved_at)
       VALUES ($id, $sourceJobId, $workspaceId, $kind, $workerName, $payload, $attempts, $lastError, $movedAt)`,
      {
        $id: dead.id,
        $sourceJobId: dead.sourceJobId,
        $workspaceId: dead.workspaceId,
        $kind: dead.kind,
        $workerName: dead.workerName,
        $payload: JSON.stringify(dead.payload),
        $attempts: dead.attempts,
        $lastError: dead.lastError,
        $movedAt: dead.movedAt,
      }
    );
    this.updateQueueJob(jobId, {
      status: "failed",
      deadLetterReason: reason,
      completedAt: dead.movedAt,
    });
    this.addQueueJobLog(job.workspaceId, job.id, job.workerName, "failed", `Moved job to dead-letter queue: ${reason}`);
    this.saveToDisk();
    return dead;
  }

  public retryQueueJob(jobId: string): QueueJobRecord | null {
    const job = this.getQueueJobById(jobId);
    if (!job) {
      return null;
    }
    const retried = this.updateQueueJob(jobId, {
      status: "queued",
      nextRunAt: new Date().toISOString(),
      lockedAt: undefined,
      lastError: undefined,
      deadLetterReason: undefined,
      completedAt: undefined,
    });
    if (retried) {
      this.addQueueJobLog(retried.workspaceId, retried.id, retried.workerName, "queued", "Job manually retried.");
    }
    return retried;
  }

  public cancelQueueJob(jobId: string): QueueJobRecord | null {
    const job = this.updateQueueJob(jobId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    if (job) {
      this.addQueueJobLog(job.workspaceId, job.id, job.workerName, "cancelled", "Job cancelled.");
    }
    return job;
  }

  public getDeadLetterJobs(workspaceId?: string): DeadLetterJob[] {
    let query = "SELECT * FROM dead_letter_jobs";
    const params: Record<string, string> = {};
    if (workspaceId) {
      query += " WHERE workspace_id = $workspaceId";
      params.$workspaceId = workspaceId;
    }
    query += " ORDER BY moved_at DESC";
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const jobs: DeadLetterJob[] = [];
    while (stmt.step()) {
      jobs.push(this.mapDeadLetterRow(stmt.getAsObject()));
    }
    stmt.free();
    return jobs;
  }

  public heartbeatWorker(
    workerName: QueueWorkerName,
    patch: Omit<WorkerHealthSnapshot, "workerName">
  ): WorkerHealthSnapshot {
    const existing = this.getQueueWorkers().find((worker) => worker.workerName === workerName);
    const next: WorkerHealthSnapshot = {
      workerName,
      status: patch.status,
      activeJobId: patch.activeJobId,
      memoryUsageMb: patch.memoryUsageMb,
      queueLength: patch.queueLength,
      failedJobs: patch.failedJobs,
      processedJobs: patch.processedJobs,
      averageProcessingTimeMs: patch.averageProcessingTimeMs,
      lastHeartbeatAt: patch.lastHeartbeatAt,
    };
    if (existing) {
      this.db.run(
        `UPDATE queue_workers
         SET status = $status,
             active_job_id = $activeJobId,
             memory_usage_mb = $memoryUsageMb,
             queue_length = $queueLength,
             failed_jobs = $failedJobs,
             processed_jobs = $processedJobs,
             average_processing_time_ms = $averageProcessingTimeMs,
             last_heartbeat_at = $lastHeartbeatAt
         WHERE worker_name = $workerName`,
        {
          $workerName: workerName,
          $status: next.status,
          $activeJobId: next.activeJobId || null,
          $memoryUsageMb: next.memoryUsageMb,
          $queueLength: next.queueLength,
          $failedJobs: next.failedJobs,
          $processedJobs: next.processedJobs,
          $averageProcessingTimeMs: next.averageProcessingTimeMs,
          $lastHeartbeatAt: next.lastHeartbeatAt,
        }
      );
    } else {
      this.db.run(
        `INSERT INTO queue_workers (
          worker_name, status, active_job_id, memory_usage_mb, queue_length, failed_jobs,
          processed_jobs, average_processing_time_ms, last_heartbeat_at
        ) VALUES (
          $workerName, $status, $activeJobId, $memoryUsageMb, $queueLength, $failedJobs,
          $processedJobs, $averageProcessingTimeMs, $lastHeartbeatAt
        )`,
        {
          $workerName: workerName,
          $status: next.status,
          $activeJobId: next.activeJobId || null,
          $memoryUsageMb: next.memoryUsageMb,
          $queueLength: next.queueLength,
          $failedJobs: next.failedJobs,
          $processedJobs: next.processedJobs,
          $averageProcessingTimeMs: next.averageProcessingTimeMs,
          $lastHeartbeatAt: next.lastHeartbeatAt,
        }
      );
    }
    this.saveToDisk();
    return next;
  }

  public getQueueWorkers(): WorkerHealthSnapshot[] {
    const stmt = this.db.prepare("SELECT * FROM queue_workers ORDER BY worker_name ASC");
    const workers: WorkerHealthSnapshot[] = [];
    while (stmt.step()) {
      workers.push(this.mapWorkerHealthRow(stmt.getAsObject()));
    }
    stmt.free();
    return workers;
  }

  public getQueueAnalytics(workspaceId?: string): QueueAnalytics {
    const jobs = this.getQueueJobs(workspaceId, { includeCompleted: true });
    const activeJobs = jobs.filter((job) => job.status === "processing" || job.status === "queued" || job.status === "retrying" || job.status === "pending");
    const completedJobs = jobs.filter((job) => job.status === "completed");
    const failedJobs = jobs.filter((job) => job.status === "failed");
    const completedLastHour = completedJobs.filter((job) =>
      new Date(job.completedAt || job.updatedAt).getTime() >= Date.now() - 60 * 60 * 1000
    );
    const executionSamples = completedJobs
      .map((job) => job.processingTimeMs || 0)
      .filter((value) => value > 0);
    const kinds: QueueJobKind[] = [
      "product_import",
      "shopify_sync",
      "ai_content_generation",
      "ai_video_rendering",
      "social_publishing",
      "automation_execution",
      "competitor_monitoring",
    ];
    return {
      activeJobs: activeJobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      throughputPerHour: completedLastHour.length,
      averageExecutionTimeMs: executionSamples.length > 0
        ? Math.round(executionSamples.reduce((sum, value) => sum + value, 0) / executionSamples.length)
        : 0,
      queueLengthByKind: kinds.map((kind) => {
        const subset = jobs.filter((job) => job.kind === kind);
        return {
          kind,
          pending: subset.filter((job) => job.status === "pending" || job.status === "queued" || job.status === "retrying").length,
          processing: subset.filter((job) => job.status === "processing").length,
          completed: subset.filter((job) => job.status === "completed").length,
          failed: subset.filter((job) => job.status === "failed").length,
        };
      }),
    };
  }

  public getQueueOverview(workspaceId?: string): QueueOverview {
    const jobs = this.getQueueJobs(workspaceId, { includeCompleted: true });
    const workers = this.getQueueWorkers();
    return {
      jobs,
      activeJobs: jobs.filter((job) => job.status === "pending" || job.status === "queued" || job.status === "retrying" || job.status === "processing"),
      completedJobs: jobs.filter((job) => job.status === "completed"),
      failedJobs: jobs.filter((job) => job.status === "failed" || job.status === "cancelled"),
      workers,
      deadLetterJobs: this.getDeadLetterJobs(workspaceId),
      analytics: this.getQueueAnalytics(workspaceId),
    };
  }

  public cleanupQueueRecords(
    completedRetentionHours = 24,
    failedRetentionHours = 72,
    logRetentionHours = 72
  ): void {
    const completedCutoff = new Date(Date.now() - completedRetentionHours * 60 * 60 * 1000).toISOString();
    const failedCutoff = new Date(Date.now() - failedRetentionHours * 60 * 60 * 1000).toISOString();
    const logCutoff = new Date(Date.now() - logRetentionHours * 60 * 60 * 1000).toISOString();

    this.db.run(
      "DELETE FROM queue_jobs WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at < $completedCutoff",
      { $completedCutoff: completedCutoff }
    );
    this.db.run(
      "DELETE FROM queue_jobs WHERE (status = 'failed' OR status = 'cancelled') AND completed_at IS NOT NULL AND completed_at < $failedCutoff",
      { $failedCutoff: failedCutoff }
    );
    this.db.run(
      "DELETE FROM queue_job_logs WHERE created_at < $logCutoff",
      { $logCutoff: logCutoff }
    );
    this.saveToDisk();
  }

  // ─── NEW: Integration Methods ────────────────────────────────────────

  public getAIProviders(workspaceId: string): AIProviderConfig[] {
    const stmt = this.db.prepare(
      "SELECT provider, is_enabled, priority, default_model, monthly_usage, last_connection_date FROM workspace_ai_providers WHERE workspace_id = $workspaceId ORDER BY priority ASC"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const configs: AIProviderConfig[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      configs.push({
        provider: row.provider as AIProviderName,
        isEnabled: row.is_enabled === 1,
        priority: row.priority,
        hasApiKey: true,
        defaultModel: row.default_model || undefined,
        monthlyUsage: row.monthly_usage || 0,
        lastConnectionDate: row.last_connection_date || undefined,
      });
    }
    stmt.free();
    return configs;
  }

  public saveAIProvider(
    workspaceId: string,
    provider: AIProviderName,
    apiKey: string | null,
    isEnabled: boolean,
    priority: number = 0,
    defaultModel?: string,
    monthlyUsage?: number,
    lastConnectionDate?: string
  ): void {
    const now = new Date().toISOString();
    const hasKey = apiKey !== null && apiKey !== "";
    const { encrypted, iv } = hasKey ? encrypt(apiKey!) : { encrypted: "", iv: "" };
    
    const stmt = this.db.prepare(
      "SELECT id, api_key_encrypted, api_key_iv, monthly_usage FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId, $provider: provider });
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (row) {
      const keyEncrypted = hasKey ? encrypted : row.api_key_encrypted;
      const keyIv = hasKey ? iv : row.api_key_iv;
      
      this.db.run(
        `UPDATE workspace_ai_providers
         SET api_key_encrypted = $apiKeyEncrypted,
             api_key_iv = $apiKeyIv,
             is_enabled = $isEnabled,
             priority = $priority,
             default_model = $defaultModel,
             monthly_usage = $monthlyUsage,
             last_connection_date = $lastConnectionDate,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId AND provider = $provider`,
        {
          $workspaceId: workspaceId,
          $provider: provider,
          $apiKeyEncrypted: keyEncrypted,
          $apiKeyIv: keyIv,
          $isEnabled: isEnabled ? 1 : 0,
          $priority: priority,
          $defaultModel: defaultModel || null,
          $monthlyUsage: monthlyUsage !== undefined ? monthlyUsage : (row.monthly_usage || 0),
          $lastConnectionDate: lastConnectionDate || null,
          $updatedAt: now,
        }
      );
    } else {
      this.db.run(
        `INSERT INTO workspace_ai_providers (
          id, workspace_id, provider, api_key_encrypted, api_key_iv, is_enabled, priority, default_model, monthly_usage, last_connection_date, created_at, updated_at
        ) VALUES (
          $id, $workspaceId, $provider, $apiKeyEncrypted, $apiKeyIv, $isEnabled, $priority, $defaultModel, $monthlyUsage, $lastConnectionDate, $createdAt, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $provider: provider,
          $apiKeyEncrypted: encrypted,
          $apiKeyIv: iv,
          $isEnabled: isEnabled ? 1 : 0,
          $priority: priority,
          $defaultModel: defaultModel || null,
          $monthlyUsage: monthlyUsage || 0,
          $lastConnectionDate: lastConnectionDate || null,
          $createdAt: now,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
  }

  public getAIRouting(workspaceId: string): Record<string, string> {
    const stmt = this.db.prepare(
      "SELECT ai_routing FROM workspaces WHERE id = $workspaceId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    let routingStr: string | null = null;
    if (stmt.step()) {
      routingStr = stmt.getAsObject().ai_routing;
    }
    stmt.free();

    const defaultRouting: Record<string, string> = {
      product_analysis: "deepseek",
      product_research: "deepseek",
      market_intelligence: "deepseek",
      competitor_analysis: "deepseek",
      customer_avatar: "deepseek",
      seo_optimization: "deepseek",
      hashtag_generation: "deepseek",
      content_generation: "deepseek",
      product_description: "deepseek",
      facebook_content: "deepseek",
      instagram_content: "deepseek",
      tiktok_content: "deepseek",
      email_marketing: "deepseek",
      image_prompt_generation: "deepseek",
      image_analysis: "gemini",
      product_image_analysis: "gemini",
      ocr_visual_understanding: "gemini",
      image_generation: "flux",
      video_script_generation: "deepseek",
      video_prompt_generation: "deepseek",
      video_generation: "kling",
    };

    if (!routingStr) {
      return defaultRouting;
    }
    try {
      const parsed = JSON.parse(routingStr);
      return { ...defaultRouting, ...parsed };
    } catch {
      return defaultRouting;
    }
  }

  public saveAIRouting(workspaceId: string, routing: Record<string, string>): void {
    this.db.run(
      "UPDATE workspaces SET ai_routing = $aiRouting WHERE id = $workspaceId",
      {
        $aiRouting: JSON.stringify(routing),
        $workspaceId: workspaceId,
      }
    );
    this.saveToDisk();
  }

  public getAIUsageStats(workspaceId: string): any {
    const stmt = this.db.prepare(
      "SELECT ai_usage_stats FROM workspaces WHERE id = $workspaceId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    let statsStr: string | null = null;
    if (stmt.step()) {
      statsStr = stmt.getAsObject().ai_usage_stats;
    }
    stmt.free();

    const defaultStats = {
      tokens: { prompt: 154200, completion: 89450 },
      requests: 48,
      imagesGenerated: 12,
      videosGenerated: 4,
      estimatedCost: 12.85,
      monthlyCost: 24.50,
      creditsConsumed: 450,
    };

    if (!statsStr) {
      return defaultStats;
    }
    try {
      const parsed = JSON.parse(statsStr);
      return { ...defaultStats, ...parsed };
    } catch {
      return defaultStats;
    }
  }

  public saveAIUsageStats(workspaceId: string, stats: any): void {
    this.db.run(
      "UPDATE workspaces SET ai_usage_stats = $aiUsageStats WHERE id = $workspaceId",
      {
        $aiUsageStats: JSON.stringify(stats),
        $workspaceId: workspaceId,
      }
    );
    this.saveToDisk();
  }

  public deleteAIProvider(workspaceId: string, provider: AIProviderName): void {
    this.db.run(
      "DELETE FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider",
      { $workspaceId: workspaceId, $provider: provider }
    );
    this.saveToDisk();
  }

  public getAIProviderApiKey(workspaceId: string, provider: AIProviderName, mustBeEnabled: boolean = true): string | null {
    const query = mustBeEnabled
      ? "SELECT api_key_encrypted, api_key_iv FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider AND is_enabled = 1 LIMIT 1"
      : "SELECT api_key_encrypted, api_key_iv FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider LIMIT 1";
    const stmt = this.db.prepare(query);
    stmt.bind({ $workspaceId: workspaceId, $provider: provider });
    let key: string | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      key = decrypt(row.api_key_encrypted, row.api_key_iv);
    }
    stmt.free();
    return key;
  }

  public getWooCommerceConnection(workspaceId: string): WooCommerceConnection | null {
    const stmt = this.db.prepare(
      "SELECT store_url, is_active, last_sync_at FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    let connection: WooCommerceConnection | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      connection = {
        storeUrl: row.store_url,
        isActive: row.is_active === 1,
        lastSyncAt: row.last_sync_at || undefined,
      };
    }
    stmt.free();
    return connection;
  }

  public saveWooCommerceConnection(
    workspaceId: string,
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
    isActive: boolean
  ): void {
    const now = new Date().toISOString();
    const { encrypted: keyEnc, iv: keyIv } = encrypt(consumerKey);
    const { encrypted: secretEnc, iv: secretIv } = encrypt(consumerSecret);
    const stmt = this.db.prepare(
      "SELECT id FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    const exists = stmt.step();
    stmt.free();
    if (exists) {
      this.db.run(
        `UPDATE workspace_woocommerce_connections
         SET store_url = $storeUrl,
             consumer_key_encrypted = $consumerKeyEncrypted,
             consumer_key_iv = $consumerKeyIv,
             consumer_secret_encrypted = $consumerSecretEncrypted,
             consumer_secret_iv = $consumerSecretIv,
             is_active = $isActive,
             updated_at = $updatedAt
         WHERE workspace_id = $workspaceId`,
        {
          $workspaceId: workspaceId,
          $storeUrl: storeUrl,
          $consumerKeyEncrypted: keyEnc,
          $consumerKeyIv: keyIv,
          $consumerSecretEncrypted: secretEnc,
          $consumerSecretIv: secretIv,
          $isActive: isActive ? 1 : 0,
          $updatedAt: now,
        }
      );
    } else {
      this.db.run(
        `INSERT INTO workspace_woocommerce_connections (
          id, workspace_id, store_url, consumer_key_encrypted, consumer_key_iv,
          consumer_secret_encrypted, consumer_secret_iv, is_active, created_at, updated_at
        ) VALUES (
          $id, $workspaceId, $storeUrl, $consumerKeyEncrypted, $consumerKeyIv,
          $consumerSecretEncrypted, $consumerSecretIv, $isActive, $createdAt, $updatedAt
        )`,
        {
          $id: uuidv4(),
          $workspaceId: workspaceId,
          $storeUrl: storeUrl,
          $consumerKeyEncrypted: keyEnc,
          $consumerKeyIv: keyIv,
          $consumerSecretEncrypted: secretEnc,
          $consumerSecretIv: secretIv,
          $isActive: isActive ? 1 : 0,
          $createdAt: now,
          $updatedAt: now,
        }
      );
    }
    this.saveToDisk();
  }

  public deleteWooCommerceConnection(workspaceId: string): void {
    this.db.run(
      "DELETE FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId",
      { $workspaceId: workspaceId }
    );
    this.saveToDisk();
  }

  public getWooCommerceCredentials(workspaceId: string): { storeUrl: string; consumerKey: string; consumerSecret: string } | null {
    const stmt = this.db.prepare(
      "SELECT store_url, consumer_key_encrypted, consumer_key_iv, consumer_secret_encrypted, consumer_secret_iv FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId AND is_active = 1 LIMIT 1"
    );
    stmt.bind({ $workspaceId: workspaceId });
    let creds: any = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      creds = {
        storeUrl: row.store_url,
        consumerKey: decrypt(row.consumer_key_encrypted, row.consumer_key_iv),
        consumerSecret: decrypt(row.consumer_secret_encrypted, row.consumer_secret_iv),
      };
    }
    stmt.free();
    return creds;
  }

  public saveOAuthState(
    workspaceId: string,
    platform: string,
    state: string,
    redirectUri: string,
    expiresAt: string
  ): void {
    this.db.run(
      `INSERT INTO oauth_states (id, workspace_id, platform, state, redirect_uri, created_at, expires_at)
       VALUES ($id, $workspaceId, $platform, $state, $redirectUri, $createdAt, $expiresAt)`,
      {
        $id: uuidv4(),
        $workspaceId: workspaceId,
        $platform: platform,
        $state: state,
        $redirectUri: redirectUri,
        $createdAt: new Date().toISOString(),
        $expiresAt: expiresAt,
      }
    );
    this.saveToDisk();
  }

  public getOAuthState(state: string): { workspaceId: string; platform: string; redirectUri: string } | null {
    const stmt = this.db.prepare(
      "SELECT workspace_id, platform, redirect_uri FROM oauth_states WHERE state = $state AND expires_at > $now LIMIT 1"
    );
    stmt.bind({ $state: state, $now: new Date().toISOString() });
    let result: any = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      result = {
        workspaceId: row.workspace_id,
        platform: row.platform,
        redirectUri: row.redirect_uri,
      };
    }
    stmt.free();
    return result;
  }

  public deleteOAuthState(state: string): void {
    this.db.run("DELETE FROM oauth_states WHERE state = $state", { $state: state });
    this.saveToDisk();
  }
  public getDatabase() {
  return this.db;
}
}
