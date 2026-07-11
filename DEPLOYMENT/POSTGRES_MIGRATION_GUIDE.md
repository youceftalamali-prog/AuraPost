# PostgreSQL Migration Guide (Phase 2 — Database Hardening)

## Honest Scope Statement

This delivers the **infrastructure and a tested path** to move off SQLite/sql.js:
- `server/db/postgres/schema.sql` — full schema, translated 1:1 from `server/db.ts`'s `createSchema()`, with indexes, foreign keys, and a documented case-insensitive email uniqueness strategy.
- `server/db/postgres/pool.ts` — a real, pooled `pg.Pool` client with transaction helper (`withTransaction`), sane defaults, and idle-error handling so a dropped connection can't crash the process.
- `scripts/migrate-sqlite-to-postgres.ts` — a generic, table-driven data migration script that copies every row from the existing SQLite file into Postgres, table-by-table, each in its own transaction, safely re-runnable (`ON CONFLICT DO NOTHING`).

**What this does NOT do:** `server/db.ts` (the `DatabaseManager` class used by every route handler — roughly 150 public methods across ~5,000 lines) still talks to sql.js, not Postgres. Porting every one of those methods to run against `pg` instead of `sql.js` is a large, mechanical-but-risky undertaking that was not completed in this pass — doing it carelessly under time pressure would risk introducing exactly the kind of silent data-correctness bugs this whole engagement has been about removing. Claiming otherwise would repeat the same mistake as the fabricated systems already removed from this codebase.

**What you get today:** a database-agnostic, ready-to-run schema and a working, tested data-copy path. **What's left:** repointing `DatabaseManager` at Postgres (see "Recommended Cutover Approach" below).

## Why Move Off SQLite/sql.js At All

As documented in the original audit: in production, the SQLite file lives at `/tmp/aurapost.db`, which most containerized/serverless platforms treat as ephemeral — restarts, redeploys, and scale-out events can silently wipe all application data. sql.js is also an in-memory database that gets serialized and rewritten to disk as a whole file on every write (`saveToDisk()` in `db.ts`), which does not scale under concurrent writes and is not crash-safe mid-write.

## Step-by-Step Migration

### 1. Provision a Postgres database
Any managed Postgres works (Railway Postgres plugin, Supabase, Cloud SQL, RDS, Neon, etc.). Obtain a `DATABASE_URL` connection string.

### 2. Apply the schema
```bash
psql "$DATABASE_URL" -f server/db/postgres/schema.sql
```
This is idempotent — safe to re-run.

### 3. Copy existing data
```bash
export SQLITE_DB_PATH=./storage/aurapost.db
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
npx tsx scripts/migrate-sqlite-to-postgres.ts
```
The script prints a per-table summary (rows migrated vs. skipped vs. errored) and exits non-zero if any table had an error, so it's CI/script-safe.

### 4. Verify row counts match
```sql
-- Run against Postgres, compare against the equivalent SQLite counts
SELECT 'users', count(*) FROM users
UNION ALL SELECT 'workspaces', count(*) FROM workspaces
UNION ALL SELECT 'products', count(*) FROM products;
-- ...repeat for tables you care most about
```

### 5. Recommended Cutover Approach (not yet executed)

Because `DatabaseManager` is one large class with many methods, a big-bang rewrite is higher-risk than an incremental one. Recommended path for your team:

1. Introduce a thin `IDatabaseBackend` interface capturing the methods currently on `DatabaseManager`.
2. Keep the existing sql.js implementation as `SqliteDatabaseBackend` (already effectively `server/db.ts`).
3. Implement `PostgresDatabaseBackend` incrementally, table-group by table-group (start with `users`/`workspaces`/`workspace_members`/auth-related tables, since those are smallest and highest-value; then billing; then Shopify; then everything else), using `server/db/postgres/pool.ts`'s `withTransaction` for any multi-statement writes (e.g. `saveShopifyStore` + its audit log entry).
4. Select the active backend via a single environment variable (e.g. `DATABASE_URL` present → Postgres, absent → sql.js), so both can coexist during the transition and staging can validate Postgres before production cutover.
5. Run both backends in parallel against a staging copy of real traffic (shadow mode) before flipping production, if traffic volume justifies the effort.

### 6. Add Connection Pooling & Transaction Safety (delivered)

`server/db/postgres/pool.ts` provides:
- A shared `Pool` sized via `PG_POOL_MAX` (default 10), with idle/connection timeouts.
- `withTransaction(fn)` for wrapping any multi-step write in `BEGIN`/`COMMIT`/`ROLLBACK`.
- An `error` handler on the pool so a dropped idle connection logs via the structured logger instead of crashing the process (`server/core/observability/logger.ts`).

## Rollback Plan

Because the cutover described above is staged behind an environment variable and the legacy sql.js path is left completely untouched:

- **Before cutover:** no rollback needed — Postgres is additive infrastructure; the running app is unaffected until `DatabaseManager` is repointed.
- **During staged cutover (per table group):** if a `PostgresDatabaseBackend` table group misbehaves, revert that table group's code to call the sql.js implementation again and redeploy; because both backends can coexist behind the environment flag, this is a config/deploy-only rollback, not a data rollback.
- **After full cutover:** keep the SQLite file (`storage/aurapost.db`) as a cold backup for a defined retention window (e.g. 30 days) before deleting it. If a critical bug is found in the Postgres path post-cutover, you can temporarily unset `DATABASE_URL` to fall back to the (now stale, but intact) SQLite file while the Postgres issue is fixed, accepting the data-loss window between the last SQLite write and the cutover moment — communicate this tradeoff to stakeholders before relying on it as a rollback strategy for anything beyond a short emergency window.
- **Backups going forward (Postgres):** use your provider's automated backups (Railway/Supabase/RDS/Cloud SQL all offer point-in-time recovery) — this is a meaningfully stronger backup story than the current SQLite-file-on-ephemeral-disk situation and is itself a major reliability improvement independent of the full query-layer cutover.

## Indexes Added Beyond the Original Schema

`schema.sql` adds a few indexes not present in the SQLite schema, because they support query patterns already used in `db.ts` (composite lookups by `store_id` + `workspace_id`, and workspace-scoped lookups on `content_generations` / `workspace_ai_providers`). These are additive and safe — see the bottom of `schema.sql` for the exact list.
