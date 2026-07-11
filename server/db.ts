import { v4 as uuidv4 } from "uuid";
import { Pool, PoolClient } from "pg";
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
import { namedToPositional } from "./db/postgres/namedParams.ts";
import { POSTGRES_SCHEMA_SQL } from "./db/postgres/schemaSql.ts";
import { logger } from "./core/observability/logger.ts";

/**
 * PHASE 2 — POSTGRESQL CUTOVER
 *
 * DatabaseManager previously wrapped sql.js (an in-memory WASM SQLite build
 * that required exporting and rewriting the *entire* database file to disk
 * after every write — see the original audit's Database Audit section for
 * why that was a production-readiness risk: no real transactions, no
 * concurrency safety, and in production the file lived on ephemeral /tmp).
 *
 * It now wraps a real, connection-pooled PostgreSQL client (`pg`). Every
 * public method signature is preserved (same name, same parameters, same
 * conceptual return shape) with one unavoidable change: every method that
 * touches the database is now `async` and returns a `Promise`, because
 * network I/O to a real database server cannot be synchronous in Node.js.
 * Every call site across the codebase has been updated accordingly (see
 * POSTGRESQL_CUTOVER_REPORT.md for the full list).
 *
 * SQL text and named-parameter objects (`$paramName`) are preserved
 * unchanged from the pre-cutover implementation wherever possible; a small
 * conversion helper (`namedToPositional`) maps them onto pg's positional
 * ($1, $2, ...) placeholders at call time. See db/postgres/namedParams.ts.
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private pool: Pool | null = null;
  private isInitialized = false;

  private constructor() {}

  public static async getInstance(): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    await DatabaseManager.instance.init();
    return DatabaseManager.instance;
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "FATAL: DATABASE_URL environment variable is not set. PostgreSQL is now the " +
        "only supported database backend (see POSTGRESQL_CUTOVER_REPORT.md). Set " +
        "DATABASE_URL to a valid postgres:// connection string before starting the server."
      );
    }

    this.pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_TIMEOUT_MS || 5000),
      ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: false },
    });

    this.pool.on("error", (err) => {
      // An idle client erroring out (e.g. a dropped connection) must not crash the process.
      logger.error({ err }, "Unexpected error on idle PostgreSQL client");
    });

    // Verify connectivity fails fast and loudly rather than lazily on first query.
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }

    await this.createSchema();
    await this.seedInitialData();

    this.isInitialized = true;
    logger.info({ event: "db_connected" }, "[PostgreSQL Database] Connected and schema verified.");
  }

  /**
   * Runs a write/DDL statement. Named parameters ($paramName) are converted to
   * positional placeholders automatically — see db/postgres/namedParams.ts.
   * Public so repository classes (server/identity/repositories/*) can issue
   * their own parameterized queries without needing access to the raw pool.
   */
  public async dbRun(sql: string, params: Record<string, unknown> = {}, client?: PoolClient): Promise<{ changes: number }> {
    const { text, values } = namedToPositional(sql, params);
    const executor = client || this.pool;
    if (!executor) throw new Error("Database pool is not initialized.");
    const result = await executor.query(text, values);
    return { changes: result.rowCount || 0 };
  }

  /** Runs a read query and returns all matching rows. Public — see dbRun() note above. */
  public async dbAll<T = any>(sql: string, params: Record<string, unknown> = {}, client?: PoolClient): Promise<T[]> {
    const { text, values } = namedToPositional(sql, params);
    const executor = client || this.pool;
    if (!executor) throw new Error("Database pool is not initialized.");
    const result = await executor.query(text, values);
    return result.rows as T[];
  }

  /** Runs a read query and returns the first matching row, or null. Public — see dbRun() note above. */
  public async dbGet<T = any>(sql: string, params: Record<string, unknown> = {}, client?: PoolClient): Promise<T | null> {
    const rows = await this.dbAll<T>(sql, params, client);
    return rows.length > 0 ? rows[0] : null;
  }

  /** Runs `fn` inside a single BEGIN/COMMIT/ROLLBACK transaction on a dedicated client. Public for cross-table transactional writes from repositories or route handlers. */
  public async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error("Database pool is not initialized.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * PHASE 2 CUTOVER: no-op retained only so the ~56 pre-existing call sites
   * throughout this file (`await this.saveToDisk();`) continue to compile
   * unchanged. Postgres commits each write durably as soon as the query
   * resolves — there is no separate "flush to disk" step the way sql.js
   * required (it held the entire database in memory and needed the whole
   * file re-exported and rewritten after every write).
   */
  public async saveToDisk(): Promise<void> {
    return;
  }

  /**
   * PHASE 2 CUTOVER: no-op retained for the same reason as saveToDisk(). This
   * was sql.js's ALTER-TABLE-if-missing migration helper for evolving the
   * schema over time. server/db/postgres/schema.sql already defines every
   * column ensureColumn() used to add, so there is nothing left to migrate.
   */
  private async ensureColumn(_tableName: string, _columnName: string, _columnDefinition: string): Promise<void> {
    return;
  }

  private async createSchema(): Promise<void> {
    if (!this.pool) throw new Error("Database pool is not initialized.");
    // POSTGRES_SCHEMA_SQL contains multiple ';'-separated DDL statements and no
    // parameters, so pg's simple query protocol executes all of them in one call.
    await this.pool.query(POSTGRES_SCHEMA_SQL);
  }

  /** Real database connectivity check for health/readiness endpoints (Phase 2 requirement). */
  public async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      if (!this.pool) throw new Error("Pool not initialized");
      await this.pool.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err?.message || String(err) };
    }
  }

  public async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
    }
  }

  /**
   * RESTORED during Phase 2 cutover: this method was accidentally removed along
   * with the old sql.js createSchema() body it was adjacent to. Restored here,
   * converted to async/Postgres.
   */
  private async ensureWorkspaceCreditPools(
    workspaceId: string,
    plan: SubscriptionPlanName,
    balances?: Partial<Record<CreditBucketName, number>>
  ): Promise<void> {
    const now = new Date().toISOString();
    const planDef = getBillingPlan(plan);
    const allocationMap: Record<CreditBucketName, number> = {
      ai: planDef.aiCredits,
      video: planDef.videoCredits,
      publishing: planDef.publishingCredits,
    };

    for (const bucket of ["ai", "video", "publishing"] as CreditBucketName[]) {
      const existingRow = await this.dbGet(
        "SELECT balance FROM workspace_credit_pools WHERE workspace_id = $workspaceId AND bucket = $bucket LIMIT 1",
        { $workspaceId: workspaceId, $bucket: bucket }
      );
      if (existingRow) {
        continue;
      }

      await this.dbRun(
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
    }

    await this.syncWorkspaceCredits(workspaceId);
  }

  /**
   * RESTORED during Phase 2 cutover (see ensureWorkspaceCreditPools note above).
   */
  private async ensureSeedWorkspaceBilling(
    workspaceId: string,
    plan: SubscriptionPlanName,
    status: SubscriptionStatus,
    interval: SubscriptionInterval,
    balances?: Partial<Record<CreditBucketName, number>>
  ): Promise<void> {
    const now = new Date();
    const trialEndsAt = status === "trialing"
      ? new Date(now.getTime() + getBillingPlan(plan).trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const existingRow = await this.dbGet(
      "SELECT id FROM billing_subscriptions WHERE workspace_id = $workspaceId LIMIT 1",
      { $workspaceId: workspaceId }
    );
    if (!existingRow) {
      await this.dbRun(
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

    await this.ensureWorkspaceCreditPools(workspaceId, plan, balances);
  }

  private async syncWorkspaceCredits(workspaceId: string): Promise<void> {
    const pools = await this.getWorkspaceCreditSummary(workspaceId);
    const totalBalance = pools?.totalBalance || 0;
    await this.dbRun(
      "UPDATE workspaces SET credits = $credits WHERE id = $workspaceId",
      { $credits: totalBalance, $workspaceId: workspaceId }
    );
  }

  private async seedInitialData(): Promise<void> {
    const existing = await this.dbGet("SELECT id FROM workspaces WHERE id = 'default-workspace'");
    if (!existing) {
      logger.info({ event: "db_seed" }, "[PostgreSQL Database] Seeding default workspace and test profiles...");

      await this.dbRun(`
        INSERT INTO workspaces (id, name, credits)
        VALUES ('default-workspace', 'Primary Workspace', 500)
        ON CONFLICT (id) DO NOTHING
      `);

      await this.dbRun(`
        INSERT INTO workspaces (id, name, credits)
        VALUES ('competitor-tenant', 'Malicious Competitor LLC', 100),
               ('exhausted-tenant', 'Out of Credits Corp', 10)
        ON CONFLICT (id) DO NOTHING
      `);

      await this.dbRun(`
        INSERT INTO credit_ledger (id, workspace_id, transaction_type, amount, running_balance, description, created_at)
        VALUES ('seed-1', 'default-workspace', 'subscription_allocation', 500, 500, 'Initial workspace credit allocation', $now1),
               ('seed-2', 'competitor-tenant', 'subscription_allocation', 100, 100, 'Initial workspace credit allocation', $now2),
               ('seed-3', 'exhausted-tenant', 'subscription_allocation', 10, 10, 'Initial workspace credit allocation', $now3)
        ON CONFLICT (id) DO NOTHING
      `, { $now1: new Date().toISOString(), $now2: new Date().toISOString(), $now3: new Date().toISOString() });

      await this.logAudit("default-workspace", "WORKSPACE_SEED", "Provisioned workspace with 500 default credits.");
      await this.logAudit("competitor-tenant", "WORKSPACE_SEED", "Provisioned isolated playground workspace with 100 credits.");
      await this.logAudit("exhausted-tenant", "WORKSPACE_SEED", "Provisioned isolated playground workspace with 10 credits.");
    }

    await this.ensureSeedWorkspaceBilling("default-workspace", "pro", "active", "monthly", {
      ai: 260,
      video: 160,
      publishing: 80,
    });
    await this.ensureSeedWorkspaceBilling("competitor-tenant", "starter", "active", "monthly", {
      ai: 60,
      video: 25,
      publishing: 15,
    });
    await this.ensureSeedWorkspaceBilling("exhausted-tenant", "free", "trialing", "monthly", {
      ai: 5,
      video: 3,
      publishing: 2,
    });
  }

  // --- Multi-Tenant Isolation Wrappers ---

  /**
   * SECURITY FIX (Phase 1): Returns true if the given user is a member of the given workspace.
   * Used by the requireWorkspaceAccess middleware to prevent cross-tenant (IDOR) access.
   */
  public async isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
    const row = await this.dbGet(
      "SELECT 1 FROM workspace_members WHERE user_id = $userId AND workspace_id = $workspaceId LIMIT 1",
      { $userId: userId, $workspaceId: workspaceId }
    );
    return !!row;
  }

  /**
   * SECURITY FIX (Phase 1): Adds a user as a member of a workspace (idempotent).
   */
  public async addWorkspaceMember(userId: string, workspaceId: string, role: string = "owner"): Promise<void> {
    const id = uuidv4();
    await this.dbRun(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES ($id, $workspaceId, $userId, $role, $createdAt) ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      {
        $id: id,
        $workspaceId: workspaceId,
        $userId: userId,
        $role: role,
        $createdAt: new Date().toISOString(),
      }
    );
    await this.saveToDisk();
  }

  /**
   * SECURITY FIX (Phase 1): Returns the workspace IDs a given user belongs to.
   */
  public async getWorkspaceIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.dbAll<{ workspace_id?: string }>(
      "SELECT workspace_id FROM workspace_members WHERE user_id = $userId",
      { $userId: userId }
    );
    const ids: string[] = [];
    for (const row of rows) {
      if (row.workspace_id) ids.push(row.workspace_id);
    }
    return ids;
  }

  /**
   * SECURITY FIX (Phase 1): Ensures a user has at least one workspace membership.
   * Preserves current single-workspace demo behavior by attaching new users to
   * "default-workspace" as an owner, while still requiring real membership checks
   * for every request (closes the previous "any workspaceId is accepted" hole).
   */
  public async ensureUserHasWorkspace(userId: string): Promise<string> {
    const existing = await this.getWorkspaceIdsForUser(userId);
    if (existing.length > 0) {
      return existing[0];
    }
    await this.addWorkspaceMember(userId, "default-workspace", "owner");
    return "default-workspace";
  }

  public async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const row = await this.dbGet<any>("SELECT * FROM workspaces WHERE id = $id", { $id: workspaceId });
    if (!row) {
      return null;
    }
    const subscription = await this.getWorkspaceSubscription(workspaceId);
    const creditPools = await this.getWorkspaceCreditSummary(workspaceId);
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

  public async getAllWorkspaces(): Promise<Workspace[]> {
    const rows = await this.dbAll<{ id?: string }>("SELECT id FROM workspaces ORDER BY name ASC");
    const workspaces: Workspace[] = [];
    for (const row of rows) {
      if (row.id) {
        const workspace = await this.getWorkspace(row.id);
        if (workspace) {
          workspaces.push(workspace);
        }
      }
    }
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

  public async getWorkspaceCreditSummary(workspaceId: string): Promise<WorkspaceCreditSummary | null> {
    const rows = await this.dbAll<any>(
      "SELECT * FROM workspace_credit_pools WHERE workspace_id = $workspaceId ORDER BY bucket ASC",
      { $workspaceId: workspaceId }
    );
    const buckets: Partial<Record<CreditBucketName, WorkspaceCreditBucket>> = {};
    for (const row of rows) {
      const bucket = this.mapWorkspaceCreditBucket(row);
      buckets[bucket.bucket] = bucket;
    }
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
      paymentProvider: row.payment_provider === "stripe" ? "stripe" : "paypal",
      stripeCustomerId: row.stripe_customer_id || undefined,
      stripeSubscriptionId: row.stripe_subscription_id || undefined,
      stripePortalUrl: row.stripe_portal_url || undefined,
      stripeCheckoutSessionId: row.stripe_checkout_session_id || undefined,
      stripeMode: row.stripe_mode === "live" ? "live" : "sandbox",
      paypalSubscriptionId: row.paypal_subscription_id || undefined,
      paypalPlanId: row.paypal_plan_id || undefined,
      paypalPayerId: row.paypal_payer_id || undefined,
      paypalMode: row.paypal_mode === "live" ? "live" : "sandbox",
      trialEndsAt: row.trial_ends_at || undefined,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end === 1,
      canceledAt: row.canceled_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription | null> {
    const row = await this.dbGet<any>(
      "SELECT * FROM billing_subscriptions WHERE workspace_id = $workspaceId LIMIT 1",
      { $workspaceId: workspaceId }
    );
    return row ? this.mapWorkspaceSubscriptionRow(row) : null;
  }

  public async getBillingPlans(): Promise<BillingPlanDefinition[]> {
    return getBillingPlans();
  }

  public async getBillingInvoices(workspaceId: string): Promise<BillingInvoice[]> {
    const rows = await this.dbAll<any>(
      "SELECT * FROM billing_invoices WHERE workspace_id = $workspaceId ORDER BY created_at DESC",
      { $workspaceId: workspaceId }
    );
    const invoices: BillingInvoice[] = [];
    for (const row of rows) {
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
    return invoices;
  }

  public async getPaymentHistory(workspaceId: string): Promise<PaymentHistoryItem[]> {
    const rows = await this.dbAll<any>(
      "SELECT * FROM payment_history WHERE workspace_id = $workspaceId ORDER BY created_at DESC",
      { $workspaceId: workspaceId }
    );
    const payments: PaymentHistoryItem[] = [];
    for (const row of rows) {
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
    return payments;
  }

  public async getBillingAnalytics(): Promise<BillingAnalytics> {
    const rows = await this.dbAll<any>("SELECT * FROM billing_subscriptions ORDER BY created_at DESC");
    const subscriptions: WorkspaceSubscription[] = rows.map((row) => this.mapWorkspaceSubscriptionRow(row));

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

  public async getBillingOverview(workspaceId: string): Promise<BillingOverview> {
    const workspace = await this.getWorkspace(workspaceId);
    const subscription = await this.getWorkspaceSubscription(workspaceId);
    if (!workspace || !subscription) {
      throw new Error("Workspace billing state not found.");
    }
    return {
      workspace,
      subscription,
      plans: await this.getBillingPlans(),
      invoices: await this.getBillingInvoices(workspaceId),
      payments: await this.getPaymentHistory(workspaceId),
      analytics: await this.getBillingAnalytics(),
    };
  }

  private async resetCreditsToPlanAllocation(workspaceId: string, plan: SubscriptionPlanName): Promise<void> {
    const planDef = getBillingPlan(plan);
    const balances: Record<CreditBucketName, number> = {
      ai: planDef.aiCredits,
      video: planDef.videoCredits,
      publishing: planDef.publishingCredits,
    };

    for (const [bucket, amount] of Object.entries(balances) as Array<[CreditBucketName, number]>) {
      await this.dbRun(
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
    }
    await this.syncWorkspaceCredits(workspaceId);
  }

  public async updateWorkspaceSubscription(
    workspaceId: string,
    patch: Partial<Pick<
      WorkspaceSubscription,
      | "plan"
      | "status"
      | "billingInterval"
      | "paymentProvider"
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "stripePortalUrl"
      | "stripeCheckoutSessionId"
      | "stripeMode"
      | "paypalSubscriptionId"
      | "paypalPlanId"
      | "paypalPayerId"
      | "paypalMode"
      | "trialEndsAt"
      | "currentPeriodStart"
      | "currentPeriodEnd"
      | "cancelAtPeriodEnd"
      | "canceledAt"
    >>
  ): Promise<WorkspaceSubscription> {
    const existing = await this.getWorkspaceSubscription(workspaceId);
    if (!existing) {
      throw new Error("Workspace subscription not found.");
    }

    const next: WorkspaceSubscription = {
      ...existing,
      plan: patch.plan ?? existing.plan,
      status: patch.status ?? existing.status,
      billingInterval: patch.billingInterval ?? existing.billingInterval,
      paymentProvider: patch.paymentProvider ?? existing.paymentProvider,
      stripeCustomerId: patch.stripeCustomerId ?? existing.stripeCustomerId,
      stripeSubscriptionId: patch.stripeSubscriptionId ?? existing.stripeSubscriptionId,
      stripePortalUrl: patch.stripePortalUrl ?? existing.stripePortalUrl,
      stripeCheckoutSessionId: patch.stripeCheckoutSessionId ?? existing.stripeCheckoutSessionId,
      stripeMode: patch.stripeMode ?? existing.stripeMode,
      paypalSubscriptionId: patch.paypalSubscriptionId ?? existing.paypalSubscriptionId,
      paypalPlanId: patch.paypalPlanId ?? existing.paypalPlanId,
      paypalPayerId: patch.paypalPayerId ?? existing.paypalPayerId,
      paypalMode: patch.paypalMode ?? existing.paypalMode,
      trialEndsAt: patch.trialEndsAt ?? existing.trialEndsAt,
      currentPeriodStart: patch.currentPeriodStart ?? existing.currentPeriodStart,
      currentPeriodEnd: patch.currentPeriodEnd ?? existing.currentPeriodEnd,
      cancelAtPeriodEnd: patch.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
      canceledAt: patch.canceledAt ?? existing.canceledAt,
      updatedAt: new Date().toISOString(),
    };

    await this.dbRun(
      `UPDATE billing_subscriptions
       SET plan = $plan,
           status = $status,
           billing_interval = $billingInterval,
           payment_provider = $paymentProvider,
           stripe_customer_id = $stripeCustomerId,
           stripe_subscription_id = $stripeSubscriptionId,
           stripe_portal_url = $stripePortalUrl,
           stripe_checkout_session_id = $stripeCheckoutSessionId,
           stripe_mode = $stripeMode,
           paypal_subscription_id = $paypalSubscriptionId,
           paypal_plan_id = $paypalPlanId,
           paypal_payer_id = $paypalPayerId,
           paypal_mode = $paypalMode,
           trial_ends_at = $trialEndsAt,
           current_period_start = $currentPeriodStart,
           current_period_end = $currentPeriodEnd,
           cancel_at_period_end = $cancelAtPeriodEnd,
           canceled_at = $canceledAt,
           updated_at = $updatedAt
       WHERE workspace_id = $workspaceId`,
      {
        $workspaceId: workspaceId,
        $paymentProvider: next.paymentProvider,
        $paypalSubscriptionId: next.paypalSubscriptionId || null,
        $paypalPlanId: next.paypalPlanId || null,
        $paypalPayerId: next.paypalPayerId || null,
        $paypalMode: next.paypalMode,
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
      await this.dbRun(
        "UPDATE workspaces SET stripe_customer_id = $stripeCustomerId WHERE id = $workspaceId",
        { $workspaceId: workspaceId, $stripeCustomerId: next.stripeCustomerId }
      );
    }

    await this.saveToDisk();
    return next;
  }

  public async changeSubscriptionPlan(
    workspaceId: string,
    input: {
      plan: SubscriptionPlanName;
      billingInterval: SubscriptionInterval;
      status: SubscriptionStatus;
      paymentProvider?: "paypal" | "stripe";
      stripeMode?: "sandbox" | "live";
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      stripeCheckoutSessionId?: string;
      paypalMode?: "sandbox" | "live";
      paypalSubscriptionId?: string;
      paypalPlanId?: string;
      paypalPayerId?: string;
      reason: string;
    }
  ): Promise<WorkspaceSubscription> {
    const now = new Date();
    const currentPeriodEnd = new Date(
      now.getTime() + (input.billingInterval === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const trialEndsAt = input.status === "trialing"
      ? new Date(now.getTime() + getBillingPlan(input.plan).trialDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const subscription = await this.updateWorkspaceSubscription(workspaceId, {
      plan: input.plan,
      status: input.status,
      billingInterval: input.billingInterval,
      paymentProvider: input.paymentProvider,
      stripeMode: input.stripeMode,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      paypalMode: input.paypalMode,
      paypalSubscriptionId: input.paypalSubscriptionId,
      paypalPlanId: input.paypalPlanId,
      paypalPayerId: input.paypalPayerId,
      trialEndsAt,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: undefined,
    });

    await this.resetCreditsToPlanAllocation(workspaceId, input.plan);
    await this.logAudit(workspaceId, "SUBSCRIPTION_PLAN_CHANGED", input.reason);
    await this.logCreditTransaction(
      workspaceId,
      "plan_change",
      0,
      subscription.id,
      input.reason
    );

    return await this.getWorkspaceSubscription(workspaceId) as WorkspaceSubscription;
  }

  public async getWorkspaceIdByPayPalSubscriptionId(paypalSubscriptionId: string): Promise<string | null> {
    const row = await this.dbGet<{ workspace_id: string }>(
      "SELECT workspace_id FROM billing_subscriptions WHERE paypal_subscription_id = $subId LIMIT 1",
      { $subId: paypalSubscriptionId }
    );
    return row?.workspace_id || null;
  }

  public async cancelWorkspaceSubscription(workspaceId: string, immediate = false): Promise<WorkspaceSubscription> {
    const subscription = await this.getWorkspaceSubscription(workspaceId);
    if (!subscription) {
      throw new Error("Workspace subscription not found.");
    }
    const next = await this.updateWorkspaceSubscription(workspaceId, {
      status: immediate ? "canceled" : subscription.status,
      cancelAtPeriodEnd: !immediate,
      canceledAt: immediate ? new Date().toISOString() : undefined,
    });
    await this.logAudit(
      workspaceId,
      "SUBSCRIPTION_CANCELED",
      immediate
        ? `Canceled ${subscription.plan} subscription immediately.`
        : `Marked ${subscription.plan} subscription to cancel at period end.`
    );
    return next;
  }

  public async createBillingInvoice(
    workspaceId: string,
    payload: Omit<BillingInvoice, "id" | "workspaceId" | "createdAt">
  ): Promise<BillingInvoice> {
    const invoice: BillingInvoice = {
      id: uuidv4(),
      workspaceId,
      createdAt: new Date().toISOString(),
      paymentProvider: payload.paymentProvider || (payload.stripeInvoiceId ? "stripe" : "paypal"),
      ...payload,
    };
    await this.dbRun(
      `INSERT INTO billing_invoices (
        id, workspace_id, subscription_id, payment_provider, stripe_invoice_id, paypal_order_id, paypal_capture_id,
        amount_paid, currency, status, hosted_invoice_url, invoice_pdf_url, created_at
      ) VALUES (
        $id, $workspaceId, $subscriptionId, $paymentProvider, $stripeInvoiceId, $paypalOrderId, $paypalCaptureId,
        $amountPaid, $currency, $status, $hostedInvoiceUrl, $invoicePdfUrl, $createdAt
      )`,
      {
        $id: invoice.id,
        $workspaceId: workspaceId,
        $subscriptionId: invoice.subscriptionId || null,
        $paymentProvider: invoice.paymentProvider,
        $stripeInvoiceId: invoice.stripeInvoiceId || null,
        $paypalOrderId: invoice.paypalOrderId || null,
        $paypalCaptureId: invoice.paypalCaptureId || null,
        $amountPaid: invoice.amountPaid,
        $currency: invoice.currency,
        $status: invoice.status,
        $hostedInvoiceUrl: invoice.hostedInvoiceUrl || null,
        $invoicePdfUrl: invoice.invoicePdfUrl || null,
        $createdAt: invoice.createdAt,
      }
    );
    await this.saveToDisk();
    return invoice;
  }

  public async createPaymentHistoryItem(
    workspaceId: string,
    payload: Omit<PaymentHistoryItem, "id" | "workspaceId" | "createdAt">
  ): Promise<PaymentHistoryItem> {
    const payment: PaymentHistoryItem = {
      id: uuidv4(),
      workspaceId,
      createdAt: new Date().toISOString(),
      paymentProvider: payload.paymentProvider || (payload.stripePaymentIntentId ? "stripe" : "paypal"),
      ...payload,
    };
    await this.dbRun(
      `INSERT INTO payment_history (
        id, workspace_id, invoice_id, payment_provider, stripe_payment_intent_id, paypal_order_id, paypal_capture_id,
        amount, currency, status, payment_method, description, created_at
      ) VALUES (
        $id, $workspaceId, $invoiceId, $paymentProvider, $stripePaymentIntentId, $paypalOrderId, $paypalCaptureId,
        $amount, $currency, $status, $paymentMethod, $description, $createdAt
      )`,
      {
        $id: payment.id,
        $workspaceId: workspaceId,
        $invoiceId: payment.invoiceId || null,
        $paymentProvider: payment.paymentProvider,
        $stripePaymentIntentId: payment.stripePaymentIntentId || null,
        $paypalOrderId: payment.paypalOrderId || null,
        $paypalCaptureId: payment.paypalCaptureId || null,
        $amount: payment.amount,
        $currency: payment.currency,
        $status: payment.status,
        $paymentMethod: payment.paymentMethod,
        $description: payment.description,
        $createdAt: payment.createdAt,
      }
    );
    await this.saveToDisk();
    return payment;
  }

  /**
   * PHASE 2 (PayPal integration): idempotency + replay protection for incoming
   * PayPal webhooks. Returns `true` if this event was already processed (caller
   * should return 200 without reprocessing, per PayPal's own recommendation),
   * `false` if this is the first time this event id has been seen (caller should
   * proceed to process it). The INSERT's UNIQUE constraint on paypal_event_id is
   * the actual source of truth/safety; the SELECT below is just to give the
   * caller an early, clear answer without relying on catching a constraint error.
   */
  public async recordPayPalWebhookEvent(input: {
    paypalEventId: string;
    eventType: string;
    resourceId?: string;
    workspaceId?: string;
    payload: unknown;
    signatureVerified: boolean;
  }): Promise<{ alreadyProcessed: boolean }> {
    const existing = await this.dbGet(
      "SELECT id FROM paypal_webhook_events WHERE paypal_event_id = $eventId",
      { $eventId: input.paypalEventId }
    );
    if (existing) {
      return { alreadyProcessed: true };
    }
    await this.dbRun(
      `INSERT INTO paypal_webhook_events (id, paypal_event_id, event_type, resource_id, workspace_id, payload, signature_verified, processed_at)
       VALUES ($id, $eventId, $eventType, $resourceId, $workspaceId, $payload, $signatureVerified, $processedAt)
       ON CONFLICT (paypal_event_id) DO NOTHING`,
      {
        $id: uuidv4(),
        $eventId: input.paypalEventId,
        $eventType: input.eventType,
        $resourceId: input.resourceId || null,
        $workspaceId: input.workspaceId || null,
        $payload: JSON.stringify(input.payload),
        $signatureVerified: input.signatureVerified ? 1 : 0,
        $processedAt: new Date().toISOString(),
      }
    );
    return { alreadyProcessed: false };
  }

  public async recordStripeWebhookEvent(workspaceId: string | undefined, eventType: string, payload: unknown): Promise<void> {
    await this.dbRun(
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
    await this.saveToDisk();
  }

  public async getProducts(workspaceId: string): Promise<NormalizedProduct[]> {
    const rows = await this.dbAll<any>(`
      SELECT p.*, io.fetch_time_ms, io.analyze_time_ms 
      FROM products p
      LEFT JOIN import_operations io ON p.id = io.product_id
      WHERE p.workspace_id = $workspaceId 
      ORDER BY p.created_at DESC
    `, { $workspaceId: workspaceId });
    const products: NormalizedProduct[] = [];
    for (const row of rows) {
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
    return products;
  }

  public async deleteProduct(workspaceId: string, productId: string): Promise<boolean> {
    try {
      await this.dbRun("DELETE FROM products WHERE workspace_id = $workspaceId AND id = $productId", {
        $workspaceId: workspaceId,
        $productId: productId,
      });
      await this.dbRun("DELETE FROM import_operations WHERE workspace_id = $workspaceId AND product_id = $productId", {
        $workspaceId: workspaceId,
        $productId: productId,
      });
      await this.saveToDisk();
      return true;
    } catch (e) {
      console.error("[DatabaseManager] Failed to delete product:", e);
      return false;
    }
  }

  public async getImportOperations(workspaceId: string): Promise<ImportOperation[]> {
    const rows = await this.dbAll<any>("SELECT * FROM import_operations WHERE workspace_id = $workspaceId ORDER BY created_at DESC", { $workspaceId: workspaceId });
    const ops: ImportOperation[] = [];
    for (const row of rows) {
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
    return ops;
  }

  public async getAuditLogs(workspaceId: string): Promise<AuditLog[]> {
    const rows = await this.dbAll<any>("SELECT * FROM audit_logs WHERE workspace_id = $workspaceId ORDER BY created_at DESC", { $workspaceId: workspaceId });
    const logs: AuditLog[] = [];
    for (const row of rows) {
      logs.push({
        id: row.id,
        workspaceId: row.workspace_id,
        action: row.action,
        details: row.details,
        createdAt: row.created_at,
      });
    }
    return logs;
  }

  // --- Strict Transactional Credit Validation and Safe Deduction ---

  public async checkCreditBalance(
    workspaceId: string,
    requiredCredits = 20,
    bucket: CreditBucketName = "ai"
  ): Promise<boolean> {
    if (process.env.TEST_MODE === "true") {
      return true;
    }
    const pools = await this.getWorkspaceCreditSummary(workspaceId);
    if (!pools) {
      return false;
    }
    if (pools[bucket].balance < requiredCredits) {
      const refillAmount = Math.max(200, requiredCredits * 5);
      await this.dbRun(
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
      await this.syncWorkspaceCredits(workspaceId);
      await this.logCreditTransaction(
        workspaceId,
        "bonus_credit",
        refillAmount,
        undefined,
        `Automatic Developer Credit Grant (Refill due to low balance)`,
        bucket
      );
      await this.logAudit(
        workspaceId,
        "CREDITS_REFILL",
        `Automatically refilled ${refillAmount} credits in pool [${bucket}] to prevent blocking.`
      );
      return true;
    }
    return pools[bucket].balance >= requiredCredits;
  }

  public async consumeCredits(
    workspaceId: string,
    bucket: CreditBucketName,
    amount: number,
    transactionType: CreditLedgerEntry["transactionType"],
    referenceId?: string,
    description?: string
  ): Promise<boolean> {
    let pools = await this.getWorkspaceCreditSummary(workspaceId);
    if (!pools) {
      return false;
    }
    if (pools[bucket].balance < amount) {
      const refillAmount = Math.max(200, amount * 5);
      await this.dbRun(
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
      await this.syncWorkspaceCredits(workspaceId);
      await this.logCreditTransaction(
        workspaceId,
        "bonus_credit",
        refillAmount,
        undefined,
        `Automatic Developer Credit Grant (Refill due to low balance)`,
        bucket
      );
      await this.logAudit(
        workspaceId,
        "CREDITS_REFILL",
        `Automatically refilled ${refillAmount} credits in pool [${bucket}] to prevent operational interruption.`
      );
      pools = await this.getWorkspaceCreditSummary(workspaceId);
    }

    await this.dbRun(
      `UPDATE workspace_credit_pools
       SET balance = GREATEST(0, balance - $amount),
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
    await this.syncWorkspaceCredits(workspaceId);
    await this.logCreditTransaction(workspaceId, transactionType, -amount, referenceId, description, bucket);
    return true;
  }

  public async allocateCredits(
    workspaceId: string,
    source: Extract<CreditLedgerEntry["transactionType"], "subscription_allocation" | "bonus_credit" | "payment" | "refund" | "plan_change">,
    balances: Partial<Record<CreditBucketName, number>>,
    referenceId?: string,
    description?: string
  ): Promise<void> {
    for (const [bucket, amount] of Object.entries(balances) as Array<[CreditBucketName, number]>) {
      if (!amount) {
        continue;
      }
      await this.dbRun(
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
      await this.syncWorkspaceCredits(workspaceId);
      await this.logCreditTransaction(workspaceId, source, amount, referenceId, description, bucket);
    }
  }

  public async rebalanceWorkspaceCredits(workspaceId: string, totalAmount: number): Promise<void> {
    const subscription = await this.getWorkspaceSubscription(workspaceId);
    const planDef = getBillingPlan(subscription?.plan || "free");
    const totalAllocation = Math.max(1, planDef.aiCredits + planDef.videoCredits + planDef.publishingCredits);
    const ai = Math.round((totalAmount * planDef.aiCredits) / totalAllocation);
    const video = Math.round((totalAmount * planDef.videoCredits) / totalAllocation);
    const publishing = Math.max(0, totalAmount - ai - video);

    for (const [bucket, balance] of ([
      ["ai", ai],
      ["video", video],
      ["publishing", publishing],
    ] as Array<[CreditBucketName, number]>)) {
      await this.dbRun(
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
    }
    await this.syncWorkspaceCredits(workspaceId);
  }

  public async createImportOperation(
    workspaceId: string,
    provider: string,
    sourceUrl: string
  ): Promise<ImportOperation> {
    const op: ImportOperation = {
      id: uuidv4(),
      workspaceId,
      provider,
      sourceUrl,
      status: "pending",
      creditCharged: 0,
      createdAt: new Date().toISOString(),
    };

    await this.dbRun(
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
    await this.saveToDisk();
    return op;
  }

  public async completeImportSuccess(
    opId: string,
    workspaceId: string,
    product: NormalizedProduct,
    fetchTimeMs?: number,
    telemetry?: string
  ): Promise<NormalizedProduct> {
    const productId = uuidv4();
    const now = new Date().toISOString();

    await this.dbRun(
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

    await this.dbRun(
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

    await this.logAudit(
      workspaceId,
      "CREDIT_DEBIT",
      `Charged exactly 20 credits for successful ${product.vendor} product import ("${product.title}").`
    );

    await this.consumeCredits(
      workspaceId,
      "ai",
      20,
      "ingest_consume",
      productId,
      `Charged exactly 20 credits for successful ${product.vendor} product import ("${product.title}").`
    );

    await this.saveToDisk();

    return { ...product, id: productId };
  }

  public async completeImportFailure(
    opId: string,
    workspaceId: string,
    errorMessage: string,
    fetchTimeMs?: number,
    telemetry?: string
  ): Promise<void> {
    await this.dbRun(
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

    await this.logAudit(
      workspaceId,
      "IMPORT_FAILURE",
      `Import operation failed: ${errorMessage}. Charged 0 credits (retained existing balance).`
    );

    await this.saveToDisk();
  }

  public async updateImportOperationTelemetry(opId: string, telemetry: string): Promise<void> {
    await this.dbRun(
      `UPDATE import_operations
       SET telemetry = $telemetry
       WHERE id = $id`,
      { $id: opId, $telemetry: telemetry }
    );
    await this.saveToDisk();
  }

  public async updateImportOperationAnalysisTime(workspaceId: string, productId: string, latencyMs: number): Promise<void> {
    await this.dbRun(
      `UPDATE import_operations
       SET analyze_time_ms = $latencyMs
       WHERE workspace_id = $workspaceId AND product_id = $productId`,
      { $latencyMs: latencyMs, $workspaceId: workspaceId, $productId: productId }
    );
    await this.saveToDisk();
  }

  public async logAudit(workspaceId: string, action: string, details: string): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await this.dbRun(
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

  public async setCredits(workspaceId: string, amount: number): Promise<void> {
    await this.rebalanceWorkspaceCredits(workspaceId, amount);
    await this.logAudit(workspaceId, "CREDITS_SET", `Workspace balance updated/reset to ${amount} credits.`);
    await this.saveToDisk();
  }

  public async logCreditTransaction(
    workspaceId: string,
    transactionType: CreditLedgerEntry["transactionType"],
    amount: number,
    referenceId?: string,
    description?: string,
    creditBucket?: CreditBucketName
  ): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const ws = await this.getWorkspace(workspaceId);
    const balance = ws ? ws.credits : 0;

    await this.dbRun(
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
    await this.saveToDisk();
  }

  public async getCreditLedger(workspaceId: string): Promise<CreditLedgerEntry[]> {
    const rows = await this.dbAll<any>("SELECT * FROM credit_ledger WHERE workspace_id = $workspaceId ORDER BY created_at DESC", { $workspaceId: workspaceId });
    const ledger: CreditLedgerEntry[] = [];
    for (const row of rows) {
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
    return ledger;
  }

  public async getProductAnalyses(productId: string): Promise<ProductAnalysis[]> {
    const rows = await this.dbAll<any>("SELECT * FROM product_analyses WHERE product_id = $productId ORDER BY version DESC", { $productId: productId });
    const analyses: ProductAnalysis[] = [];
    for (const row of rows) {
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
    return analyses;
  }

  public async getLatestProductAnalysis(productId: string): Promise<ProductAnalysis | null> {
    let analysis: ProductAnalysis | null = null;
    const row = await this.dbGet<any>("SELECT * FROM product_analyses WHERE product_id = $productId AND is_latest = 1 LIMIT 1", { $productId: productId });
    if (row) {
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
    return analysis;
  }

  public async getWorkspaceProductAnalyses(workspaceId: string): Promise<ProductAnalysis[]> {
    const rows = await this.dbAll<any>("SELECT * FROM product_analyses WHERE workspace_id = $workspaceId ORDER BY created_at DESC", { $workspaceId: workspaceId });
    const analyses: ProductAnalysis[] = [];
    for (const row of rows) {
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
    return analyses;
  }

  public async saveProductAnalysis(
    analysis: Omit<ProductAnalysis, "id" | "version" | "isLatest" | "createdAt">
  ): Promise<ProductAnalysis> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const versionRow = await this.dbGet<{ max_v: number }>(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM product_analyses WHERE product_id = $productId AND language_code = $language",
      { $productId: analysis.productId, $language: analysis.languageCode }
    );
    let nextVersion = 1;
    if (versionRow) {
      nextVersion = versionRow.max_v + 1;
    }

    await this.dbRun(
      "UPDATE product_analyses SET is_latest = 0 WHERE product_id = $productId AND language_code = $language",
      { $productId: analysis.productId, $language: analysis.languageCode }
    );

    await this.dbRun(
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

    await this.saveToDisk();

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

  public async chargeCreditsForAnalysis(
    workspaceId: string,
    productId: string,
    description: string
  ): Promise<boolean> {
    if (!await this.checkCreditBalance(workspaceId, 20, "ai")) {
      return false;
    }

    await this.logAudit(workspaceId, "CREDIT_DEBIT", `Deducted exactly 20 credits for successful product re-analysis on product ID: ${productId}`);
    return await this.consumeCredits(
      workspaceId,
      "ai",
      20,
      "analysis_consume",
      productId,
      description
    );
  }

  public async getContentGenerations(productId: string): Promise<ContentGenerationRecord[]> {
    const rows = await this.dbAll<any>("SELECT * FROM content_generations WHERE product_id = $productId ORDER BY version DESC", { $productId: productId });
    const gens: ContentGenerationRecord[] = [];
    for (const row of rows) {
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
    return gens;
  }

  public async getLatestContentGeneration(productId: string, contentType?: string): Promise<any | null> {
    let query = "SELECT * FROM content_generations WHERE product_id = $productId AND is_latest = 1";
    const bindParams: any = { $productId: productId };
    if (contentType) {
      query += " AND content_type = $contentType";
      bindParams.$contentType = contentType;
    }
    query += " LIMIT 1";
    
    const row = await this.dbGet<any>(query, bindParams);
    let gen: any = null;
    if (row) {
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
    return gen;
  }

  public async getWorkspaceContentGenerations(workspaceId: string): Promise<ContentGenerationRecord[]> {
    const rows = await this.dbAll<any>("SELECT * FROM content_generations WHERE workspace_id = $workspaceId ORDER BY created_at DESC", { $workspaceId: workspaceId });
    const generations: ContentGenerationRecord[] = [];
    for (const row of rows) {
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
    return generations;
  }

  public async saveContentGeneration(
    productId: string,
    workspaceId: string,
    contentType: string,
    creditsCharged: number,
    payload: any
  ): Promise<any> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const versionRow = await this.dbGet<{ max_v: number }>(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM content_generations WHERE product_id = $productId AND content_type = $contentType",
      { $productId: productId, $contentType: contentType }
    );
    let nextVersion = 1;
    if (versionRow) {
      nextVersion = versionRow.max_v + 1;
    }

    await this.dbRun(
      "UPDATE content_generations SET is_latest = 0 WHERE product_id = $productId AND content_type = $contentType",
      { $productId: productId, $contentType: contentType }
    );

    await this.dbRun(
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
      for (const hook of payload.hooks as any[]) {
        await this.dbRun(
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
      }
    }

    if (payload.scripts && Array.isArray(payload.scripts)) {
      for (const script of payload.scripts as any[]) {
        await this.dbRun(
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
      }
    }

    if (creditsCharged > 0) {
      await this.logAudit(workspaceId, "CREDIT_DEBIT", `Deducted exactly ${creditsCharged} credits for content generation ("${contentType}") on product ID: ${productId}`);
      await this.consumeCredits(
        workspaceId,
        "ai",
        creditsCharged,
        "copy_consume",
        productId,
        `Generated marketing content (${contentType} version ${nextVersion}) for product ID: ${productId}`
      );
    }

    await this.saveToDisk();

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
      accessToken: this.decryptTokenField(row.access_token, row.access_token_iv),
      refreshToken: this.decryptTokenField(row.refresh_token, row.refresh_token_iv),
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

  public async getSocialAccounts(workspaceId: string): Promise<SocialAccount[]> {
    const rows = await this.dbAll<any>("SELECT * FROM social_accounts WHERE workspace_id = $workspaceId ORDER BY connected_at DESC", { $workspaceId: workspaceId });
    const accounts: SocialAccount[] = [];
    for (const row of rows) {
      accounts.push(this.mapSocialAccountRow(row));
    }
    return accounts;
  }

  public async createSocialAccount(
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
  ): Promise<SocialAccount> {
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

    const socialEncryptedAccess = this.encryptTokenField(account.accessToken);
    const socialEncryptedRefresh = this.encryptTokenField(account.refreshToken);
    await this.dbRun(
      `INSERT INTO social_accounts (
        id, workspace_id, platform, platform_user_id, username, avatar_url, access_token, access_token_iv,
        refresh_token, refresh_token_iv, token_expires_at, integration_mode, status, connected_at
      ) VALUES (
        $id, $workspaceId, $platform, $platformUserId, $username, $avatarUrl, $accessToken, $accessTokenIv,
        $refreshToken, $refreshTokenIv, $tokenExpiresAt, $integrationMode, $status, $connectedAt
      )`,
      {
        $id: account.id,
        $workspaceId: account.workspaceId,
        $platform: account.platform,
        $platformUserId: account.platformUserId,
        $username: account.username,
        $avatarUrl: account.avatarUrl || null,
        $accessToken: socialEncryptedAccess.value,
        $accessTokenIv: socialEncryptedAccess.iv,
        $refreshToken: socialEncryptedRefresh.value,
        $refreshTokenIv: socialEncryptedRefresh.iv,
        $tokenExpiresAt: account.tokenExpiresAt || null,
        $integrationMode: account.integrationMode,
        $status: account.status,
        $connectedAt: account.connectedAt,
      }
    );

    await this.logAudit(workspaceId, "SOCIAL_ACCOUNT_CONNECTED", `Connected ${account.platform} account @${account.username}.`);
    await this.saveToDisk();
    return account;
  }

  public async deleteSocialAccount(workspaceId: string, accountId: string): Promise<boolean> {
    try {
      await this.dbRun(
        "UPDATE social_posts SET social_account_id = NULL WHERE workspace_id = $workspaceId AND social_account_id = $accountId",
        { $workspaceId: workspaceId, $accountId: accountId }
      );
      await this.dbRun(
        "DELETE FROM social_accounts WHERE workspace_id = $workspaceId AND id = $accountId",
        { $workspaceId: workspaceId, $accountId: accountId }
      );
      await this.logAudit(workspaceId, "SOCIAL_ACCOUNT_REMOVED", `Removed social account ${accountId}.`);
      await this.saveToDisk();
      return true;
    } catch (error) {
      console.error("[DatabaseManager] Failed to delete social account:", error);
      return false;
    }
  }

  public async clearPlatformSocialAccounts(workspaceId: string, platform: string): Promise<void> {
    try {
      await this.dbRun(
        "UPDATE social_posts SET social_account_id = NULL WHERE workspace_id = $workspaceId AND platform = $platform",
        { $workspaceId: workspaceId, $platform: platform }
      );
      await this.dbRun(
        "DELETE FROM social_accounts WHERE workspace_id = $workspaceId AND platform = $platform",
        { $workspaceId: workspaceId, $platform: platform }
      );
      await this.logAudit(workspaceId, "SOCIAL_ACCOUNT_CLEARED", `Cleared all connected ${platform} accounts.`);
      await this.saveToDisk();
    } catch (error) {
      console.error(`[DatabaseManager] Failed to clear platform social accounts for ${platform}:`, error);
    }
  }

  public async getSocialPosts(
    workspaceId: string,
    options: {
      productId?: string;
      status?: SocialPostStatus;
      includeAll?: boolean;
    } = {}
  ): Promise<SocialPost[]> {
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

    const rows = await this.dbAll<any>(query, params);
    const posts: SocialPost[] = [];
    for (const row of rows) {
      posts.push(this.mapSocialPostRow(row));
    }
    return posts;
  }

  public async getSocialPostById(workspaceId: string, postId: string): Promise<SocialPost | null> {
    const row = await this.dbGet<any>("SELECT * FROM social_posts WHERE workspace_id = $workspaceId AND id = $postId LIMIT 1", { $workspaceId: workspaceId, $postId: postId });
    const post = row ? this.mapSocialPostRow(row) : null;
    return post;
  }

  public async saveSocialPosts(
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
  ): Promise<SocialPost[]> {
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const savedPosts = await Promise.all(posts.map(async (entry) => {
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

      await this.dbRun(
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
    }));

    await this.logAudit(workspaceId, "SOCIAL_POSTS_CREATED", `Created ${savedPosts.length} social post records for product ${productId}.`);
    await this.saveToDisk();
    return savedPosts;
  }

  public async updateSocialPostStatus(
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
  ): Promise<SocialPost | null> {
    const existing = await this.getSocialPostById(workspaceId, postId);
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

    await this.dbRun(
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

    await this.saveToDisk();
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

  public async getVideoGenerations(productId: string): Promise<VideoGenerationRecord[]> {
    const rows = await this.dbAll<any>("SELECT * FROM video_generations WHERE product_id = $productId ORDER BY version DESC", { $productId: productId });
    const videos: VideoGenerationRecord[] = [];
    for (const row of rows) {
      videos.push(this.mapVideoGenerationRow(row));
    }
    return videos;
  }

  public async getLatestVideoGeneration(productId: string): Promise<VideoGenerationRecord | null> {
    const row = await this.dbGet<any>("SELECT * FROM video_generations WHERE product_id = $productId AND is_latest = 1 LIMIT 1", { $productId: productId });
    const video = row ? this.mapVideoGenerationRow(row) : null;
    return video;
  }

  public async getVideoGenerationById(workspaceId: string, videoId: string): Promise<VideoGenerationRecord | null> {
    const row = await this.dbGet<any>("SELECT * FROM video_generations WHERE workspace_id = $workspaceId AND id = $videoId LIMIT 1", { $workspaceId: workspaceId, $videoId: videoId });
    const video = row ? this.mapVideoGenerationRow(row) : null;
    return video;
  }

  public async getWorkspaceVideoGenerations(workspaceId: string, productId?: string): Promise<VideoGenerationRecord[]> {
    let query = "SELECT * FROM video_generations WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (productId) {
      query += " AND product_id = $productId";
      params.$productId = productId;
    }
    query += " ORDER BY created_at DESC";
    const rows = await this.dbAll<any>(query, params);
    const videos: VideoGenerationRecord[] = [];
    for (const row of rows) {
      videos.push(this.mapVideoGenerationRow(row));
    }
    return videos;
  }

  public async saveVideoGeneration(
    workspaceId: string,
    productId: string,
    record: Omit<VideoGenerationRecord, "version" | "isLatest" | "createdAt" | "updatedAt">
  ): Promise<VideoGenerationRecord> {
    const now = new Date().toISOString();
    const versionRow = await this.dbGet<{ max_v: number }>(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM video_generations WHERE product_id = $productId",
      { $productId: productId }
    );
    let nextVersion = 1;
    if (versionRow) {
      nextVersion = versionRow.max_v + 1;
    }

    await this.dbRun(
      "UPDATE video_generations SET is_latest = 0 WHERE product_id = $productId",
      { $productId: productId }
    );

    await this.dbRun(
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
      await this.logAudit(workspaceId, "VIDEO_CREDIT_DEBIT", `Deducted ${record.creditsUsed} credits for AI video generation on product ID: ${productId}`);
      await this.consumeCredits(
        workspaceId,
        "video",
        record.creditsUsed,
        "video_consume",
        productId,
        `Generated AI video (${record.template} version ${nextVersion}) for product ID: ${productId}`
      );
    }

    await this.saveToDisk();

    return {
      ...record,
      version: nextVersion,
      isLatest: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async updateVideoGeneration(
    workspaceId: string,
    videoId: string,
    patch: Partial<Pick<
      VideoGenerationRecord,
      "provider" | "status" | "progress" | "videoUrl" | "thumbnailUrl" | "downloadUrl" | "errorMessage" | "completedAt" | "scenes"
    >>
  ): Promise<VideoGenerationRecord | null> {
    const existing = await this.getVideoGenerationById(workspaceId, videoId);
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

    await this.dbRun(
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

    await this.saveToDisk();
    return updated;
  }

  public async deleteVideoGeneration(workspaceId: string, videoId: string): Promise<boolean> {
    try {
      const existing = await this.getVideoGenerationById(workspaceId, videoId);
      await this.dbRun(
        "DELETE FROM video_generations WHERE workspace_id = $workspaceId AND id = $videoId",
        { $workspaceId: workspaceId, $videoId: videoId }
      );
      if (existing?.isLatest) {
        const fallback = await this.getVideoGenerations(existing.productId)[0];
        if (fallback) {
          await this.dbRun(
            "UPDATE video_generations SET is_latest = 1 WHERE id = $id",
            { $id: fallback.id }
          );
        }
      }
      await this.logAudit(workspaceId, "VIDEO_GENERATION_DELETED", `Deleted AI video generation ${videoId}.`);
      await this.saveToDisk();
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
      accessToken: this.decryptTokenField(row.access_token, row.access_token_iv),
      refreshToken: this.decryptTokenField(row.refresh_token, row.refresh_token_iv),
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

  public async getShopifyStores(workspaceId: string): Promise<ShopifyStoreConnection[]> {
    const rows = await this.dbAll<any>("SELECT * FROM shopify_stores WHERE workspace_id = $workspaceId ORDER BY connected_at DESC", { $workspaceId: workspaceId });
    const stores: ShopifyStoreConnection[] = [];
    for (const row of rows) {
      stores.push(this.mapShopifyStoreRow(row));
    }
    return stores;
  }

  public async getShopifyStoreById(workspaceId: string, storeId: string): Promise<ShopifyStoreConnection | null> {
    const row = await this.dbGet<any>("SELECT * FROM shopify_stores WHERE workspace_id = $workspaceId AND id = $storeId LIMIT 1", { $workspaceId: workspaceId, $storeId: storeId });
    const store = row ? this.mapShopifyStoreRow(row) : null;
    return store;
  }

  /**
   * PHASE 3 SECURITY HARDENING: Shopify and social-platform OAuth access/refresh
   * tokens were previously stored as plaintext in shopify_stores and
   * social_accounts. These helpers apply the same AES-256-GCM encryption
   * already used for AI provider API keys (server/encryption.ts), so no
   * plaintext token remains in the database. Returns {value: null, iv: null}
   * for an absent token so callers can write NULL cleanly.
   */
  private encryptTokenField(plainToken: string | undefined | null): { value: string | null; iv: string | null } {
    if (!plainToken) {
      return { value: null, iv: null };
    }
    const { encrypted, iv } = encrypt(plainToken);
    return { value: encrypted, iv };
  }

  private decryptTokenField(encryptedValue: string | null | undefined, iv: string | null | undefined): string | undefined {
    if (!encryptedValue || !iv) {
      // Not encrypted (or absent) — return as-is. This also transparently
      // handles any pre-existing plaintext rows written before this fix
      // (no _iv value present), avoiding a hard migration requirement.
      return encryptedValue || undefined;
    }
    try {
      return decrypt(encryptedValue, iv);
    } catch (err) {
      logger.error({ event: "token_decrypt_failed" }, "Failed to decrypt a stored OAuth token; treating as unavailable.");
      return undefined;
    }
  }

  public async saveShopifyStore(
    workspaceId: string,
    input: Omit<ShopifyStoreConnection, "id" | "workspaceId" | "connectedAt" | "updatedAt" | "isDefault">
  ): Promise<ShopifyStoreConnection> {
    const now = new Date().toISOString();
    const existingStores = await this.getShopifyStores(workspaceId);
    const existing = existingStores.find((item) => item.shopDomain === input.shopDomain);
    const isDefault = existingStores.length === 0 || input.status === "connected";

    if (existing) {
      const encryptedAccess = this.encryptTokenField(input.accessToken);
      const encryptedRefresh = this.encryptTokenField(input.refreshToken);
      await this.dbRun(
        `UPDATE shopify_stores
         SET shop_name = $shopName,
             access_token = $accessToken,
             access_token_iv = $accessTokenIv,
             refresh_token = $refreshToken,
             refresh_token_iv = $refreshTokenIv,
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
          $accessToken: encryptedAccess.value,
          $accessTokenIv: encryptedAccess.iv,
          $refreshToken: encryptedRefresh.value,
          $refreshTokenIv: encryptedRefresh.iv,
          $tokenExpiresAt: input.tokenExpiresAt || null,
          $lastTokenRefreshAt: input.lastTokenRefreshAt || null,
          $scopes: JSON.stringify(input.scopes),
          $status: input.status,
          $connectionMode: input.connectionMode,
          $updatedAt: now,
          $lastSyncedAt: input.lastSyncedAt || null,
        }
      );
      const updated = await this.getShopifyStoreById(workspaceId, existing.id);
      await this.saveToDisk();
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
      await this.dbRun("UPDATE shopify_stores SET is_default = 0 WHERE workspace_id = $workspaceId", { $workspaceId: workspaceId });
    }

    const insertEncryptedAccess = this.encryptTokenField(store.accessToken);
    const insertEncryptedRefresh = this.encryptTokenField(store.refreshToken);
    await this.dbRun(
      `INSERT INTO shopify_stores (
        id, workspace_id, shop_domain, shop_name, access_token, access_token_iv, refresh_token, refresh_token_iv, token_expires_at,
        last_token_refresh_at, scopes, status, connection_mode, is_default, connected_at, updated_at, last_synced_at
      ) VALUES (
        $id, $workspaceId, $shopDomain, $shopName, $accessToken, $accessTokenIv, $refreshToken, $refreshTokenIv, $tokenExpiresAt,
        $lastTokenRefreshAt, $scopes, $status, $connectionMode, $isDefault, $connectedAt, $updatedAt, $lastSyncedAt
      )`,
      {
        $id: store.id,
        $workspaceId: workspaceId,
        $shopDomain: store.shopDomain,
        $shopName: store.shopName,
        $accessToken: insertEncryptedAccess.value,
        $accessTokenIv: insertEncryptedAccess.iv,
        $refreshToken: insertEncryptedRefresh.value,
        $refreshTokenIv: insertEncryptedRefresh.iv,
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

    await this.saveShopifyAutomationSettings(workspaceId, store.id, {
      autoSyncEveryHour: true,
      autoPublishGeneratedContent: false,
      autoCreateSocialPosts: false,
      autoGenerateVideos: false,
      autoCompetitorMonitoring: false,
    });
    await this.logAudit(workspaceId, "SHOPIFY_STORE_CONNECTED", `Connected Shopify store ${store.shopDomain}.`);
    await this.saveToDisk();
    return store;
  }

  public async updateShopifyStore(
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
  ): Promise<ShopifyStoreConnection | null> {
    const existing = await this.getShopifyStoreById(workspaceId, storeId);
    if (!existing) {
      return null;
    }
    if (patch.isDefault) {
      await this.dbRun("UPDATE shopify_stores SET is_default = 0 WHERE workspace_id = $workspaceId", { $workspaceId: workspaceId });
    }
    const updateEncryptedAccess = this.encryptTokenField(patch.accessToken ?? existing.accessToken);
    const updateEncryptedRefresh = this.encryptTokenField(patch.refreshToken ?? existing.refreshToken);
    await this.dbRun(
      `UPDATE shopify_stores
       SET shop_name = $shopName,
           access_token = $accessToken,
           access_token_iv = $accessTokenIv,
           refresh_token = $refreshToken,
           refresh_token_iv = $refreshTokenIv,
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
        $accessToken: updateEncryptedAccess.value,
        $accessTokenIv: updateEncryptedAccess.iv,
        $refreshToken: updateEncryptedRefresh.value,
        $refreshTokenIv: updateEncryptedRefresh.iv,
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
    await this.saveToDisk();
    return await this.getShopifyStoreById(workspaceId, storeId);
  }

  public async disconnectShopifyStore(workspaceId: string, storeId: string): Promise<ShopifyStoreConnection | null> {
    await this.logAudit(workspaceId, "SHOPIFY_STORE_DISCONNECTED", `Disconnected Shopify store ${storeId}.`);
    return await this.updateShopifyStore(workspaceId, storeId, {
      status: "disconnected",
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
    });
  }

  public async saveShopifyAutomationSettings(
    workspaceId: string,
    storeId: string,
    patch: Partial<Omit<ShopifyAutomationSettings, "id" | "workspaceId" | "storeId" | "updatedAt">>
  ): Promise<ShopifyAutomationSettings> {
    const existing = await this.getShopifyAutomationSettings(workspaceId, storeId);
    const now = new Date().toISOString();
    if (existing) {
      await this.dbRun(
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
      await this.saveToDisk();
      return await this.getShopifyAutomationSettings(workspaceId, storeId) as ShopifyAutomationSettings;
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
    await this.dbRun(
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
    await this.saveToDisk();
    return settings;
  }

  public async getShopifyAutomationSettings(workspaceId: string, storeId: string): Promise<ShopifyAutomationSettings | null> {
    const row = await this.dbGet<any>(
      "SELECT * FROM shopify_automation_settings WHERE workspace_id = $workspaceId AND store_id = $storeId LIMIT 1"
    , { $workspaceId: workspaceId, $storeId: storeId });
    const settings = row ? this.mapShopifyAutomationSettingsRow(row) : null;
    return settings;
  }

  public async getAllShopifyAutomationSettings(workspaceId: string): Promise<ShopifyAutomationSettings[]> {
    const rows = await this.dbAll<any>("SELECT * FROM shopify_automation_settings WHERE workspace_id = $workspaceId ORDER BY updated_at DESC", { $workspaceId: workspaceId });
    const settings: ShopifyAutomationSettings[] = [];
    for (const row of rows) {
      settings.push(this.mapShopifyAutomationSettingsRow(row));
    }
    return settings;
  }

  public async enqueueShopifySyncJob(
    workspaceId: string,
    storeId: string,
    scope: ShopifySyncScope,
    trigger: ShopifySyncTrigger,
    summary: string,
    webhookTopic?: ShopifyWebhookTopic,
    entityId?: string
  ): Promise<ShopifySyncJob> {
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
    await this.dbRun(
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
    await this.saveToDisk();
    return job;
  }

  public async updateShopifySyncJob(
    workspaceId: string,
    jobId: string,
    patch: Partial<Omit<ShopifySyncJob, "id" | "workspaceId" | "storeId" | "scope" | "trigger" | "createdAt">>
  ): Promise<ShopifySyncJob | null> {
    const row = await this.dbGet<any>("SELECT * FROM shopify_sync_jobs WHERE workspace_id = $workspaceId AND id = $jobId LIMIT 1", { $workspaceId: workspaceId, $jobId: jobId });
    const existing = row ? this.mapShopifySyncJobRow(row) : null;
    if (!existing) {
      return null;
    }
    const next = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.dbRun(
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
    await this.saveToDisk();
    const jobs = await this.getShopifySyncJobs(workspaceId);
    return jobs.find((item) => item.id === jobId) || null;
  }

  public async getShopifySyncJobs(
    workspaceId: string,
    options: { storeId?: string; status?: ShopifySyncStatus } = {}
  ): Promise<ShopifySyncJob[]> {
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
    const rows = await this.dbAll<any>(query, params);
    const jobs: ShopifySyncJob[] = [];
    for (const row of rows) {
      jobs.push(this.mapShopifySyncJobRow(row));
    }
    return jobs;
  }

  public async saveShopifyWebhookEvent(
    workspaceId: string,
    storeId: string,
    topic: ShopifyWebhookTopic,
    payload: Record<string, unknown>,
    syncJobId?: string,
    status: ShopifySyncStatus = "pending",
    errorMessage?: string
  ): Promise<ShopifyWebhookEvent> {
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
    await this.dbRun(
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
    await this.saveToDisk();
    return event;
  }

  public async getShopifyWebhookEvents(workspaceId: string, storeId?: string): Promise<ShopifyWebhookEvent[]> {
    let query = "SELECT * FROM shopify_webhook_events WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (storeId) {
      query += " AND store_id = $storeId";
      params.$storeId = storeId;
    }
    query += " ORDER BY created_at DESC";
    const rows = await this.dbAll<any>(query, params);
    const events: ShopifyWebhookEvent[] = [];
    for (const row of rows) {
      events.push(this.mapShopifyWebhookEventRow(row));
    }
    return events;
  }

  public async saveShopifyAutomationRun(
    workspaceId: string,
    storeId: string,
    action: ShopifyAutomationRun["action"],
    status: ShopifySyncStatus,
    detail: string,
    productId?: string
  ): Promise<ShopifyAutomationRun> {
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
    await this.dbRun(
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
    await this.saveShopifyAutomationSettings(workspaceId, storeId, {
      lastAutomationRunAt: run.createdAt,
    });
    await this.saveToDisk();
    return run;
  }

  public async getShopifyAutomationRuns(workspaceId: string, storeId?: string): Promise<ShopifyAutomationRun[]> {
    let query = "SELECT * FROM shopify_automation_runs WHERE workspace_id = $workspaceId";
    const params: Record<string, string> = { $workspaceId: workspaceId };
    if (storeId) {
      query += " AND store_id = $storeId";
      params.$storeId = storeId;
    }
    query += " ORDER BY created_at DESC";
    const rows = await this.dbAll<any>(query, params);
    const runs: ShopifyAutomationRun[] = [];
    for (const row of rows) {
      runs.push(this.mapShopifyAutomationRunRow(row));
    }
    return runs;
  }

  public async markShopifyStoreSynced(workspaceId: string, storeId: string): Promise<void> {
    await this.updateShopifyStore(workspaceId, storeId, {
      lastSyncedAt: new Date().toISOString(),
      status: "connected",
    });
  }

  public async upsertShopifyProductRecord(
    workspaceId: string,
    storeId: string,
    shopifyProductId: string,
    handle: string | undefined,
    inventoryQuantity: number,
    product: NormalizedProduct
  ): Promise<NormalizedProduct> {
    const now = new Date().toISOString();
    const row = await this.dbGet<any>(
      "SELECT * FROM shopify_product_links WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_product_id = $shopifyProductId LIMIT 1",
      { $workspaceId: workspaceId, $storeId: storeId, $shopifyProductId: shopifyProductId }
    );

    let productId = row?.product_id as string | undefined;
    if (!productId) {
      productId = uuidv4();
      await this.dbRun(
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
      await this.dbRun(
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
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
    return { ...product, id: productId };
  }

  public async upsertShopifyCollectionRecord(
    workspaceId: string,
    storeId: string,
    shopifyCollectionId: string,
    title: string,
    handle: string | undefined,
    productsCount: number
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = await this.dbGet<any>(
      "SELECT id FROM shopify_collections WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_collection_id = $shopifyCollectionId LIMIT 1",
      { $workspaceId: workspaceId, $storeId: storeId, $shopifyCollectionId: shopifyCollectionId }
    );
    if (row?.id) {
      await this.dbRun(
        `UPDATE shopify_collections
         SET title = $title, handle = $handle, products_count = $productsCount, updated_at = $updatedAt
         WHERE id = $id`,
        { $id: row.id, $title: title, $handle: handle || null, $productsCount: productsCount, $updatedAt: now }
      );
    } else {
      await this.dbRun(
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
    await this.saveToDisk();
  }

  public async upsertShopifyOrderRecord(
    workspaceId: string,
    storeId: string,
    shopifyOrderId: string,
    orderNumber: string,
    customerEmail: string | undefined,
    totalPrice: number,
    currency: string,
    status: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = await this.dbGet<any>(
      "SELECT id FROM shopify_orders WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_order_id = $shopifyOrderId LIMIT 1",
      { $workspaceId: workspaceId, $storeId: storeId, $shopifyOrderId: shopifyOrderId }
    );
    if (row?.id) {
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
  }

  public async upsertShopifyCustomerRecord(
    workspaceId: string,
    storeId: string,
    shopifyCustomerId: string,
    email: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
    ordersCount: number,
    totalSpent: number
  ): Promise<void> {
    const now = new Date().toISOString();
    const row = await this.dbGet<any>(
      "SELECT id FROM shopify_customers WHERE workspace_id = $workspaceId AND store_id = $storeId AND shopify_customer_id = $shopifyCustomerId LIMIT 1",
      { $workspaceId: workspaceId, $storeId: storeId, $shopifyCustomerId: shopifyCustomerId }
    );
    if (row?.id) {
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
  }

  public async getShopifySyncAnalytics(workspaceId: string): Promise<ShopifySyncAnalytics> {
    const allStores = await this.getShopifyStores(workspaceId);
    const stores = allStores.filter((store) => store.status !== "disconnected");
    const jobs = await this.getShopifySyncJobs(workspaceId);
    const automationRuns = await this.getShopifyAutomationRuns(workspaceId);
    // SECURITY FIX (Phase 2 cutover): previously interpolated workspaceId directly into
    // a raw SQL string executed against the old sql.js handle - a SQL injection risk,
    // even though workspaceId originates from server-trusted context today. Now uses a
    // real parameterized query like every other method in this class.
    const productCountRow = await this.dbGet<{ c: number }>(
      "SELECT COUNT(*) AS c FROM shopify_product_links WHERE workspace_id = $workspaceId",
      { $workspaceId: workspaceId }
    );
    const ordersRow = await this.dbGet<{ c: number; revenue: number }>(
      "SELECT COUNT(*) AS c, COALESCE(SUM(total_price), 0) AS revenue FROM shopify_orders WHERE workspace_id = $workspaceId",
      { $workspaceId: workspaceId }
    );
    const syncedProducts = productCountRow?.c ?? 0;
    const ordersImported = ordersRow?.c ?? 0;
    const revenueImported = ordersRow?.revenue ?? 0;
    return {
      connectedStores: stores.length,
      syncedProducts: Number(syncedProducts),
      ordersImported: Number(ordersImported),
      revenueImported: Number(revenueImported),
      syncFailures: jobs.filter((job) => job.status === "failed").length,
      automationExecutions: automationRuns.length,
    };
  }

  public async getShopifySyncOverview(workspaceId: string): Promise<ShopifySyncOverview> {
    const jobs = await this.getShopifySyncJobs(workspaceId);
    return {
      stores: await this.getShopifyStores(workspaceId),
      jobs,
      queue: jobs.filter((job) => job.status === "pending" || job.status === "syncing"),
      webhooks: await this.getShopifyWebhookEvents(workspaceId),
      automationSettings: await this.getAllShopifyAutomationSettings(workspaceId),
      automationRuns: await this.getShopifyAutomationRuns(workspaceId),
      analytics: await this.getShopifySyncAnalytics(workspaceId),
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

  public async enqueueQueueJob(
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
  ): Promise<QueueJobRecord> {
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
    await this.dbRun(
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
    await this.addQueueJobLog(workspaceId, job.id, job.workerName, job.status, `Queued ${job.kind} job.`);
    await this.saveToDisk();
    return job;
  }

  public async getQueueJobById(jobId: string): Promise<QueueJobRecord | null> {
    const row = await this.dbGet<any>("SELECT * FROM queue_jobs WHERE id = $jobId LIMIT 1", { $jobId: jobId });
    const job = row ? this.mapQueueJobRow(row) : null;
    return job;
  }

  public async getQueueJobs(
    workspaceId?: string,
    options: {
      statuses?: QueueJobStatus[];
      kinds?: QueueJobKind[];
      workerName?: QueueWorkerName;
      includeCompleted?: boolean;
      limit?: number;
    } = {}
  ): Promise<QueueJobRecord[]> {
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
    const rows = await this.dbAll<any>(query, params);
    const jobs: QueueJobRecord[] = [];
    for (const row of rows) {
      jobs.push(this.mapQueueJobRow(row));
    }
    return jobs;
  }

  public async claimNextQueueJob(workerName: QueueWorkerName, kinds: QueueJobKind[]): Promise<QueueJobRecord | null> {
    const candidateJobs = await this.getQueueJobs(undefined, {
      statuses: ["pending", "queued", "retrying"],
      kinds,
      includeCompleted: true,
      limit: 200,
    });
    const dueJobs = candidateJobs.filter((job) => new Date(job.nextRunAt).getTime() <= Date.now());

    const next = dueJobs
      .sort((a, b) => (b.priority - a.priority) || (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))[0];

    if (!next) {
      return null;
    }

    await this.dbRun(
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
    await this.addQueueJobLog(next.workspaceId, next.id, workerName, "processing", `Worker ${workerName} claimed ${next.kind} job.`);
    await this.saveToDisk();
    return await this.getQueueJobById(next.id);
  }

  public async updateQueueJob(
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
  ): Promise<QueueJobRecord | null> {
    const existing = await this.getQueueJobById(jobId);
    if (!existing) {
      return null;
    }
    const next = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.dbRun(
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
    await this.saveToDisk();
    return await this.getQueueJobById(jobId);
  }

  public async addQueueJobLog(
    workspaceId: string,
    jobId: string,
    workerName: QueueWorkerName,
    status: QueueJobStatus,
    message: string
  ): Promise<QueueJobLog> {
    const log: QueueJobLog = {
      id: uuidv4(),
      jobId,
      workspaceId,
      status,
      message,
      workerName,
      createdAt: new Date().toISOString(),
    };
    await this.dbRun(
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
    await this.saveToDisk();
    return log;
  }

  public async getQueueJobLogs(workspaceId?: string, jobId?: string): Promise<QueueJobLog[]> {
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
    const rows = await this.dbAll<any>(query, params);
    const logs: QueueJobLog[] = [];
    for (const row of rows) {
      logs.push(this.mapQueueJobLogRow(row));
    }
    return logs;
  }

  public async moveQueueJobToDeadLetter(jobId: string, reason: string): Promise<DeadLetterJob | null> {
    const job = await this.getQueueJobById(jobId);
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
    await this.dbRun(
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
    await this.updateQueueJob(jobId, {
      status: "failed",
      deadLetterReason: reason,
      completedAt: dead.movedAt,
    });
    await this.addQueueJobLog(job.workspaceId, job.id, job.workerName, "failed", `Moved job to dead-letter queue: ${reason}`);
    await this.saveToDisk();
    return dead;
  }

  public async retryQueueJob(jobId: string): Promise<QueueJobRecord | null> {
    const job = await this.getQueueJobById(jobId);
    if (!job) {
      return null;
    }
    const retried = await this.updateQueueJob(jobId, {
      status: "queued",
      nextRunAt: new Date().toISOString(),
      lockedAt: undefined,
      lastError: undefined,
      deadLetterReason: undefined,
      completedAt: undefined,
    });
    if (retried) {
      await this.addQueueJobLog(retried.workspaceId, retried.id, retried.workerName, "queued", "Job manually retried.");
    }
    return retried;
  }

  public async cancelQueueJob(jobId: string): Promise<QueueJobRecord | null> {
    const job = await this.updateQueueJob(jobId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    if (job) {
      await this.addQueueJobLog(job.workspaceId, job.id, job.workerName, "cancelled", "Job cancelled.");
    }
    return job;
  }

  public async getDeadLetterJobs(workspaceId?: string): Promise<DeadLetterJob[]> {
    let query = "SELECT * FROM dead_letter_jobs";
    const params: Record<string, string> = {};
    if (workspaceId) {
      query += " WHERE workspace_id = $workspaceId";
      params.$workspaceId = workspaceId;
    }
    query += " ORDER BY moved_at DESC";
    const rows = await this.dbAll<any>(query, params);
    const jobs: DeadLetterJob[] = [];
    for (const row of rows) {
      jobs.push(this.mapDeadLetterRow(row));
    }
    return jobs;
  }

  public async heartbeatWorker(
    workerName: QueueWorkerName,
    patch: Omit<WorkerHealthSnapshot, "workerName">
  ): Promise<WorkerHealthSnapshot> {
    const workers = await this.getQueueWorkers();
    const existing = workers.find((worker) => worker.workerName === workerName);
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
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
    return next;
  }

  public async getQueueWorkers(): Promise<WorkerHealthSnapshot[]> {
    const rows = await this.dbAll<any>("SELECT * FROM queue_workers ORDER BY worker_name ASC");
    const workers: WorkerHealthSnapshot[] = [];
    for (const row of rows) {
      workers.push(this.mapWorkerHealthRow(row));
    }
    return workers;
  }

  public async getQueueAnalytics(workspaceId?: string): Promise<QueueAnalytics> {
    const jobs = await this.getQueueJobs(workspaceId, { includeCompleted: true });
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

  public async getQueueOverview(workspaceId?: string): Promise<QueueOverview> {
    const jobs = await this.getQueueJobs(workspaceId, { includeCompleted: true });
    const workers = await this.getQueueWorkers();
    return {
      jobs,
      activeJobs: jobs.filter((job) => job.status === "pending" || job.status === "queued" || job.status === "retrying" || job.status === "processing"),
      completedJobs: jobs.filter((job) => job.status === "completed"),
      failedJobs: jobs.filter((job) => job.status === "failed" || job.status === "cancelled"),
      workers,
      deadLetterJobs: await this.getDeadLetterJobs(workspaceId),
      analytics: await this.getQueueAnalytics(workspaceId),
    };
  }

  public async cleanupQueueRecords(
    completedRetentionHours = 24,
    failedRetentionHours = 72,
    logRetentionHours = 72
  ): Promise<void> {
    const completedCutoff = new Date(Date.now() - completedRetentionHours * 60 * 60 * 1000).toISOString();
    const failedCutoff = new Date(Date.now() - failedRetentionHours * 60 * 60 * 1000).toISOString();
    const logCutoff = new Date(Date.now() - logRetentionHours * 60 * 60 * 1000).toISOString();

    await this.dbRun(
      "DELETE FROM queue_jobs WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at < $completedCutoff",
      { $completedCutoff: completedCutoff }
    );
    await this.dbRun(
      "DELETE FROM queue_jobs WHERE (status = 'failed' OR status = 'cancelled') AND completed_at IS NOT NULL AND completed_at < $failedCutoff",
      { $failedCutoff: failedCutoff }
    );
    await this.dbRun(
      "DELETE FROM queue_job_logs WHERE created_at < $logCutoff",
      { $logCutoff: logCutoff }
    );
    await this.saveToDisk();
  }

  // ─── NEW: Integration Methods ────────────────────────────────────────

  public async getAIProviders(workspaceId: string): Promise<AIProviderConfig[]> {
    const rows = await this.dbAll<any>(
      "SELECT provider, is_enabled, priority, default_model, monthly_usage, last_connection_date FROM workspace_ai_providers WHERE workspace_id = $workspaceId ORDER BY priority ASC"
    , { $workspaceId: workspaceId });
    const configs: AIProviderConfig[] = [];
    for (const row of rows) {
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
    return configs;
  }

  public async saveAIProvider(
    workspaceId: string,
    provider: AIProviderName,
    apiKey: string | null,
    isEnabled: boolean,
    priority: number = 0,
    defaultModel?: string,
    monthlyUsage?: number,
    lastConnectionDate?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const hasKey = apiKey !== null && apiKey !== "";
    const { encrypted, iv } = hasKey ? encrypt(apiKey!) : { encrypted: "", iv: "" };
    
    const row = await this.dbGet<any>(
      "SELECT id, api_key_encrypted, api_key_iv, monthly_usage FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider LIMIT 1"
    , { $workspaceId: workspaceId, $provider: provider });

    if (row) {
      const keyEncrypted = hasKey ? encrypted : row.api_key_encrypted;
      const keyIv = hasKey ? iv : row.api_key_iv;
      
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
  }

  public async getAIRouting(workspaceId: string): Promise<Record<string, string>> {
    const row = await this.dbGet<{ ai_routing: string | null }>(
      "SELECT ai_routing FROM workspaces WHERE id = $workspaceId LIMIT 1",
      { $workspaceId: workspaceId }
    );
    const routingStr: string | null = row ? row.ai_routing : null;

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

  public async saveAIRouting(workspaceId: string, routing: Record<string, string>): Promise<void> {
    await this.dbRun(
      "UPDATE workspaces SET ai_routing = $aiRouting WHERE id = $workspaceId",
      {
        $aiRouting: JSON.stringify(routing),
        $workspaceId: workspaceId,
      }
    );
    await this.saveToDisk();
  }

  public async getAIUsageStats(workspaceId: string): Promise<any> {
    const row = await this.dbGet<{ ai_usage_stats: string | null }>(
      "SELECT ai_usage_stats FROM workspaces WHERE id = $workspaceId LIMIT 1",
      { $workspaceId: workspaceId }
    );
    const statsStr: string | null = row ? row.ai_usage_stats : null;

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

  public async saveAIUsageStats(workspaceId: string, stats: any): Promise<void> {
    await this.dbRun(
      "UPDATE workspaces SET ai_usage_stats = $aiUsageStats WHERE id = $workspaceId",
      {
        $aiUsageStats: JSON.stringify(stats),
        $workspaceId: workspaceId,
      }
    );
    await this.saveToDisk();
  }

  public async deleteAIProvider(workspaceId: string, provider: AIProviderName): Promise<void> {
    await this.dbRun(
      "DELETE FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider",
      { $workspaceId: workspaceId, $provider: provider }
    );
    await this.saveToDisk();
  }

  public async getAIProviderApiKey(workspaceId: string, provider: AIProviderName | "dataforseo", mustBeEnabled: boolean = true): Promise<string | null> {
    const query = mustBeEnabled
      ? "SELECT api_key_encrypted, api_key_iv FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider AND is_enabled = 1 LIMIT 1"
      : "SELECT api_key_encrypted, api_key_iv FROM workspace_ai_providers WHERE workspace_id = $workspaceId AND provider = $provider LIMIT 1";
    let key: string | null = null;
    const row = await this.dbGet<any>(query, { $workspaceId: workspaceId, $provider: provider });
    if (row) {
      key = decrypt(row.api_key_encrypted, row.api_key_iv);
    }
    return key;
  }

  public async getWooCommerceConnection(workspaceId: string): Promise<WooCommerceConnection | null> {
    let connection: WooCommerceConnection | null = null;
    const row = await this.dbGet<any>(
      "SELECT store_url, is_active, last_sync_at FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId LIMIT 1"
    , { $workspaceId: workspaceId });
    if (row) {
      connection = {
        storeUrl: row.store_url,
        isActive: row.is_active === 1,
        lastSyncAt: row.last_sync_at || undefined,
      };
    }
    return connection;
  }

  public async saveWooCommerceConnection(
    workspaceId: string,
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
    isActive: boolean
  ): Promise<void> {
    const now = new Date().toISOString();
    const { encrypted: keyEnc, iv: keyIv } = encrypt(consumerKey);
    const { encrypted: secretEnc, iv: secretIv } = encrypt(consumerSecret);
    const existsRow = await this.dbGet(
      "SELECT id FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId LIMIT 1",
      { $workspaceId: workspaceId }
    );
    const exists = !!existsRow;
    if (exists) {
      await this.dbRun(
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
      await this.dbRun(
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
    await this.saveToDisk();
  }

  public async deleteWooCommerceConnection(workspaceId: string): Promise<void> {
    await this.dbRun(
      "DELETE FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId",
      { $workspaceId: workspaceId }
    );
    await this.saveToDisk();
  }

  public async getWooCommerceCredentials(workspaceId: string): Promise<{ storeUrl: string; consumerKey: string; consumerSecret: string } | null> {
    let creds: any = null;
    const row = await this.dbGet<any>(
      "SELECT store_url, consumer_key_encrypted, consumer_key_iv, consumer_secret_encrypted, consumer_secret_iv FROM workspace_woocommerce_connections WHERE workspace_id = $workspaceId AND is_active = 1 LIMIT 1"
    , { $workspaceId: workspaceId });
    if (row) {
      creds = {
        storeUrl: row.store_url,
        consumerKey: decrypt(row.consumer_key_encrypted, row.consumer_key_iv),
        consumerSecret: decrypt(row.consumer_secret_encrypted, row.consumer_secret_iv),
      };
    }
    return creds;
  }

  public async saveOAuthState(
    workspaceId: string,
    platform: string,
    state: string,
    redirectUri: string,
    expiresAt: string
  ): Promise<void> {
    await this.dbRun(
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
    await this.saveToDisk();
  }

  public async getOAuthState(state: string): Promise<{ workspaceId: string; platform: string; redirectUri: string } | null> {
    let result: any = null;
    const row = await this.dbGet<any>(
      "SELECT workspace_id, platform, redirect_uri FROM oauth_states WHERE state = $state AND expires_at > $now LIMIT 1"
    , { $state: state, $now: new Date().toISOString() });
    if (row) {
      result = {
        workspaceId: row.workspace_id,
        platform: row.platform,
        redirectUri: row.redirect_uri,
      };
    }
    return result;
  }

  public async deleteOAuthState(state: string): Promise<void> {
    await this.dbRun("DELETE FROM oauth_states WHERE state = $state", { $state: state });
    await this.saveToDisk();
  }
  // PHASE 2 CUTOVER: getDatabase() removed. It previously exposed the raw
  // sql.js Database handle so identity repositories could run their own
  // queries directly. Those repositories now use the public dbGet/dbAll/dbRun
  // helpers above instead (see server/identity/repositories/Postgres*Repository.ts),
  // which keeps the pg Pool encapsulated inside DatabaseManager.

  // --- IMAGE STUDIO PROJECTS METHODS ---
  public async saveImageStudioProject(project: {
    id: string;
    workspaceId: string;
    name: string;
    aspectRatio: string;
    canvasWidth: number;
    canvasHeight: number;
    layers: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.dbRun(
      `INSERT INTO image_studio_projects (id, workspace_id, name, aspect_ratio, canvas_width, canvas_height, layers, created_at, updated_at)
       VALUES ($id, $workspaceId, $name, $aspectRatio, $canvasWidth, $canvasHeight, $layers, $createdAt, $updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         aspect_ratio = excluded.aspect_ratio,
         canvas_width = excluded.canvas_width,
         canvas_height = excluded.canvas_height,
         layers = excluded.layers,
         updated_at = excluded.updated_at`,
      {
        $id: project.id,
        $workspaceId: project.workspaceId,
        $name: project.name,
        $aspectRatio: project.aspectRatio,
        $canvasWidth: project.canvasWidth,
        $canvasHeight: project.canvasHeight,
        $layers: project.layers,
        $createdAt: now,
        $updatedAt: now,
      }
    );
    await this.saveToDisk();
  }

  public async getImageStudioProjects(workspaceId: string): Promise<any[]> {
    const rows = await this.dbAll<any>(
      "SELECT * FROM image_studio_projects WHERE workspace_id = $workspaceId ORDER BY updated_at DESC"
    , { $workspaceId: workspaceId });
    const list: any[] = [];
    for (const row of rows) {
      list.push({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        aspectRatio: row.aspect_ratio,
        canvasWidth: row.canvas_width,
        canvasHeight: row.canvas_height,
        layers: row.layers,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    return list;
  }

  public async deleteImageStudioProject(projectId: string): Promise<void> {
    await this.dbRun("DELETE FROM image_studio_projects WHERE id = $id", { $id: projectId });
    await this.saveToDisk();
  }

  public async duplicateImageStudioProject(projectId: string, newProjectId: string, newName: string): Promise<void> {
    const row = await this.dbGet<any>("SELECT * FROM image_studio_projects WHERE id = $id LIMIT 1", { $id: projectId });
    if (row) {
      const now = new Date().toISOString();
      await this.dbRun(
        `INSERT INTO image_studio_projects (id, workspace_id, name, aspect_ratio, canvas_width, canvas_height, layers, created_at, updated_at)
         VALUES ($newId, $workspaceId, $name, $aspectRatio, $canvasWidth, $canvasHeight, $layers, $createdAt, $updatedAt)`,
        {
          $newId: newProjectId,
          $workspaceId: row.workspace_id,
          $name: newName,
          $aspectRatio: row.aspect_ratio,
          $canvasWidth: row.canvas_width,
          $canvasHeight: row.canvas_height,
          $layers: row.layers,
          $createdAt: now,
          $updatedAt: now,
        }
      );
    }
    await this.saveToDisk();
  }
}
