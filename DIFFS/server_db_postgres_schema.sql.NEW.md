# New File: server/db/postgres/schema.sql

This file did not exist in the original upload. Full contents:

```sql
-- ============================================================================
-- AuraPost AI — PostgreSQL Schema (Phase 2: Database Hardening)
-- ============================================================================
-- Translated 1:1 from the existing SQLite (sql.js) schema in server/db.ts.
-- Design decisions, made deliberately to minimize migration risk:
--
--   1. Primary keys remain TEXT (existing app code generates UUIDv4 strings
--      via uuid.v4() and treats IDs as opaque strings everywhere). Switching
--      to native Postgres UUID type would require touching every call site
--      that builds/compares IDs — out of scope for this pass.
--   2. Boolean-style flags (0/1 in SQLite) remain INTEGER, not BOOLEAN, so
--      that the existing application code (which reads/writes 0/1 literals
--      throughout db.ts) continues to work unmodified against either backend
--      during the transition period. Converting to native BOOLEAN is a good
--      follow-up once all query methods have been ported (see MIGRATION_GUIDE.md).
--   3. Money/amount columns remain DOUBLE PRECISION (mirroring SQLite's REAL)
--      rather than NUMERIC, again to avoid changing arithmetic/rounding
--      behavior the app currently depends on. Recommended follow-up: migrate
--      to NUMERIC(12,2) for exact monetary precision once ported.
--   4. Timestamp columns use TIMESTAMPTZ (Postgres will happily accept the
--      ISO-8601 strings the app already writes via `new Date().toISOString()`).
--   5. SQLite's `COLLATE NOCASE` on users.email has no direct Postgres
--      equivalent without the citext extension (an extra dependency this
--      pass avoids). Case-insensitive uniqueness is instead enforced via a
--      functional unique index on LOWER(email); application query code must
--      be updated to filter with `WHERE LOWER(email) = LOWER($1)` when ported
--      (tracked as a required follow-up in MIGRATION_GUIDE.md — NOT done in
--      this pass, since it requires touching UserRepository query methods).
--
-- This file is idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS) and can be run repeatedly against a fresh or partially-provisioned
-- database.
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER DEFAULT 1000,
  stripe_customer_id TEXT,
  ai_routing TEXT,
  ai_usage_stats TEXT
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  provider_id TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  email_verified INTEGER NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
-- Case-insensitive uniqueness (replaces SQLite's COLLATE NOCASE — see header note).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider_provider_id ON users(auth_provider, provider_id);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  payment_provider TEXT NOT NULL DEFAULT 'paypal',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_portal_url TEXT,
  stripe_checkout_session_id TEXT,
  stripe_mode TEXT NOT NULL DEFAULT 'sandbox',
  paypal_subscription_id TEXT,
  paypal_plan_id TEXT,
  paypal_payer_id TEXT,
  paypal_mode TEXT NOT NULL DEFAULT 'sandbox',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end INTEGER DEFAULT 0 NOT NULL,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paypal';
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS paypal_plan_id TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS paypal_payer_id TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS paypal_mode TEXT NOT NULL DEFAULT 'sandbox';
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_workspace ON billing_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_paypal_sub ON billing_subscriptions(paypal_subscription_id);

CREATE TABLE IF NOT EXISTS workspace_credit_pools (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  monthly_allocation INTEGER NOT NULL DEFAULT 0,
  used_this_period INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, bucket)
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id TEXT,
  payment_provider TEXT NOT NULL DEFAULT 'paypal',
  stripe_invoice_id TEXT,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paypal';
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_workspace ON billing_invoices(workspace_id);

CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoice_id TEXT,
  payment_provider TEXT NOT NULL DEFAULT 'paypal',
  stripe_payment_intent_id TEXT,
  paypal_order_id TEXT,
  paypal_capture_id TEXT,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paypal';
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_history_workspace ON payment_history(workspace_id);

-- PHASE 2 (PayPal integration): idempotency + replay-attack protection for incoming
-- PayPal webhooks. PayPal's webhook event `id` is globally unique per event; a UNIQUE
-- constraint here means a duplicate delivery (PayPal retries on anything but a 2xx)
-- or a maliciously replayed payload can never be processed twice.
CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  id TEXT PRIMARY KEY,
  paypal_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  workspace_id TEXT,
  payload TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_event_id ON paypal_webhook_events(paypal_event_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS shopify_stores (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  access_token TEXT,
  access_token_iv TEXT,
  refresh_token TEXT,
  refresh_token_iv TEXT,
  token_expires_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,
  scopes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  connection_mode TEXT NOT NULL DEFAULT 'sandbox',
  is_default INTEGER NOT NULL DEFAULT 0,
  connected_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ
);
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS access_token_iv TEXT;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS refresh_token_iv TEXT;
CREATE INDEX IF NOT EXISTS idx_shopify_stores_workspace ON shopify_stores(workspace_id);

CREATE TABLE IF NOT EXISTS shopify_sync_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  revenue_imported DOUBLE PRECISION NOT NULL DEFAULT 0,
  automation_executions INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_jobs_store ON shopify_sync_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_jobs_workspace ON shopify_sync_jobs(workspace_id);

CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  sync_job_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_store ON shopify_webhook_events(store_id);

CREATE TABLE IF NOT EXISTS shopify_automation_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL UNIQUE,
  auto_sync_every_hour INTEGER NOT NULL DEFAULT 1,
  auto_publish_generated_content INTEGER NOT NULL DEFAULT 0,
  auto_create_social_posts INTEGER NOT NULL DEFAULT 0,
  auto_generate_videos INTEGER NOT NULL DEFAULT 0,
  auto_competitor_monitoring INTEGER NOT NULL DEFAULT 0,
  last_auto_sync_at TIMESTAMPTZ,
  last_automation_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS shopify_automation_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_automation_runs_store ON shopify_automation_runs(store_id);

CREATE TABLE IF NOT EXISTS shopify_product_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  shopify_product_id TEXT NOT NULL,
  handle TEXT,
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_product_links_store ON shopify_product_links(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_product_links_product ON shopify_product_links(product_id);

CREATE TABLE IF NOT EXISTS shopify_collections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  shopify_collection_id TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT,
  products_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_collections_store ON shopify_collections(store_id);

CREATE TABLE IF NOT EXISTS shopify_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  shopify_order_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  customer_email TEXT,
  total_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_store ON shopify_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_workspace ON shopify_orders(workspace_id);

CREATE TABLE IF NOT EXISTS shopify_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  shopify_customer_id TEXT NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  orders_count INTEGER NOT NULL DEFAULT 0,
  total_spent DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_store ON shopify_customers(store_id);

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
  next_run_at TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  dead_letter_reason TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status_next_run ON queue_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_workspace ON queue_jobs(workspace_id);

CREATE TABLE IF NOT EXISTS queue_job_logs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_job_logs_job ON queue_job_logs(job_id);

CREATE TABLE IF NOT EXISTS queue_workers (
  worker_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  active_job_id TEXT,
  memory_usage_mb DOUBLE PRECISION NOT NULL DEFAULT 0,
  queue_length INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  processed_jobs INTEGER NOT NULL DEFAULT 0,
  average_processing_time_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id TEXT PRIMARY KEY,
  source_job_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  last_error TEXT NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL
);

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
  price DOUBLE PRECISION,
  compare_at_price DOUBLE PRECISION,
  currency TEXT,
  availability INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);

CREATE TABLE IF NOT EXISTS import_operations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  credit_charged INTEGER NOT NULL,
  error_message TEXT,
  product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  fetch_time_ms INTEGER,
  analyze_time_ms INTEGER,
  telemetry TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_operations_workspace ON import_operations(workspace_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);

CREATE TABLE IF NOT EXISTS product_analyses (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  is_latest INTEGER DEFAULT 1 NOT NULL,
  language_code TEXT DEFAULT 'en' NOT NULL,
  confidence_score DOUBLE PRECISION DEFAULT 1.000 NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_analyses_product ON product_analyses(product_id);
CREATE INDEX IF NOT EXISTS idx_product_analyses_workspace ON product_analyses(workspace_id);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  running_balance INTEGER NOT NULL,
  credit_bucket TEXT,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace ON credit_ledger(workspace_id);

CREATE TABLE IF NOT EXISTS content_generations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  credits_charged INTEGER NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_latest INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_generations_product ON content_generations(product_id);

CREATE TABLE IF NOT EXISTS hooks (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hooks_generation ON hooks(generation_id);

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
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scripts_generation ON scripts(generation_id);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT,
  access_token_iv TEXT,
  refresh_token TEXT,
  refresh_token_iv TEXT,
  token_expires_at TIMESTAMPTZ,
  integration_mode TEXT NOT NULL DEFAULT 'sandbox',
  status TEXT NOT NULL DEFAULT 'connected',
  connected_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS access_token_iv TEXT;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS refresh_token_iv TEXT;
CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace ON social_accounts(workspace_id);

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
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  preview_text TEXT NOT NULL,
  source_type TEXT,
  source_generation_id TEXT,
  failure_reason TEXT,
  metrics TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_posts_workspace ON social_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_batch ON social_posts(batch_id);

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
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_generations_product ON video_generations(product_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_workspace ON video_generations(workspace_id);

-- ─── Integration Tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_ai_providers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  default_model TEXT,
  monthly_usage INTEGER DEFAULT 0,
  last_connection_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS workspace_woocommerce_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_url TEXT NOT NULL,
  consumer_key_encrypted TEXT NOT NULL,
  consumer_key_iv TEXT NOT NULL,
  consumer_secret_encrypted TEXT NOT NULL,
  consumer_secret_iv TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(workspace_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  redirect_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_id TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  device TEXT,
  platform TEXT,
  browser TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_activity_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_id ON sessions(refresh_token_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS image_studio_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  canvas_width INTEGER NOT NULL,
  canvas_height INTEGER NOT NULL,
  layers TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_studio_projects_workspace_id ON image_studio_projects(workspace_id);

-- ============================================================================
-- Additional indexes not present in the original SQLite schema, added here
-- because they support query patterns already used by db.ts (e.g. filtering
-- shopify_orders/customers by workspace_id + store_id together) and are cheap
-- to add now while defining the schema fresh.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_shopify_orders_store_workspace ON shopify_orders(store_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_store_workspace ON shopify_customers(store_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_generations_workspace ON content_generations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_ai_providers_workspace ON workspace_ai_providers(workspace_id);
```
