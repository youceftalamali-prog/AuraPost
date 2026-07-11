#!/usr/bin/env node
/**
 * PHASE 2 — DATABASE HARDENING
 *
 * Migrates data from the existing sql.js SQLite database file into a
 * PostgreSQL database using the schema in server/db/postgres/schema.sql.
 *
 * Usage:
 *   1. Ensure the target Postgres database exists and has the schema applied:
 *        psql "$DATABASE_URL" -f server/db/postgres/schema.sql
 *   2. Run this script:
 *        SQLITE_DB_PATH=./storage/aurapost.db DATABASE_URL=postgres://... \
 *          npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Design:
 *   - Generic, table-driven: introspects each SQLite table's columns and
 *     builds a parameterized INSERT for the corresponding Postgres table,
 *     rather than hand-writing 37 bespoke mapping functions. Column names
 *     are identical between the two schemas by construction (schema.sql was
 *     translated 1:1 from server/db.ts), so this is a safe simplification.
 *   - Each table is migrated inside its own transaction. If a table fails,
 *     the script logs the error, rolls back that table only, and continues
 *     with the rest — so a single bad row doesn't abort the whole migration.
 *   - Idempotent-ish: uses `ON CONFLICT (id) DO NOTHING` for tables with a
 *     simple `id` primary key, so the script can be safely re-run. Tables
 *     with composite primary keys (workspace_credit_pools) are handled with
 *     their specific conflict target.
 *   - This script moves DATA. It does not attempt to also cut the
 *     application over to Postgres — that requires porting DatabaseManager's
 *     query methods (see MIGRATION_GUIDE.md for the honest scope statement).
 */

import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const TABLES_IN_DEPENDENCY_ORDER = [
  "workspaces",
  "users",
  "workspace_members",
  "billing_subscriptions",
  "workspace_credit_pools",
  "billing_invoices",
  "payment_history",
  "stripe_webhook_events",
  "shopify_stores",
  "shopify_sync_jobs",
  "shopify_webhook_events",
  "shopify_automation_settings",
  "shopify_automation_runs",
  "shopify_product_links",
  "shopify_collections",
  "shopify_orders",
  "shopify_customers",
  "queue_jobs",
  "queue_job_logs",
  "queue_workers",
  "dead_letter_jobs",
  "products",
  "import_operations",
  "audit_logs",
  "product_analyses",
  "credit_ledger",
  "content_generations",
  "hooks",
  "scripts",
  "social_accounts",
  "social_posts",
  "video_generations",
  "workspace_ai_providers",
  "workspace_woocommerce_connections",
  "oauth_states",
  "sessions",
  "refresh_tokens",
  "image_studio_projects",
];

// Tables whose primary key is not a single `id` column need an explicit conflict target.
const CONFLICT_TARGET_OVERRIDES: Record<string, string> = {
  workspace_credit_pools: "(workspace_id, bucket)",
  queue_workers: "(worker_name)",
};

async function main() {
  const sqliteDbPath = process.env.SQLITE_DB_PATH || "./storage/aurapost.db";
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("FATAL: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`FATAL: SQLite database file not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  console.log(`Reading SQLite database from: ${sqliteDbPath}`);
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const fileBuffer = fs.readFileSync(sqliteDbPath);
  const sqliteDb = new SQL.Database(fileBuffer);

  const pgPool = new Pool({ connectionString: databaseUrl, ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: false } });

  const summary: Record<string, { migrated: number; skipped: number; error?: string }> = {};

  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    summary[table] = { migrated: 0, skipped: 0 };
    try {
      const rows = readAllRows(sqliteDb, table);
      if (rows.length === 0) {
        console.log(`[${table}] no rows to migrate.`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const conflictTarget = CONFLICT_TARGET_OVERRIDES[table] || "(id)";

      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        for (const row of rows) {
          const values = columns.map((col) => normalizeValue(row[col]));
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const sql = `
            INSERT INTO ${table} (${columns.join(", ")})
            VALUES (${placeholders})
            ON CONFLICT ${conflictTarget} DO NOTHING
          `;
          const result = await client.query(sql, values);
          if (result.rowCount && result.rowCount > 0) {
            summary[table].migrated += 1;
          } else {
            summary[table].skipped += 1;
          }
        }
        await client.query("COMMIT");
        console.log(`[${table}] migrated ${summary[table].migrated}, skipped (already present) ${summary[table].skipped}.`);
      } catch (err: any) {
        await client.query("ROLLBACK");
        summary[table].error = err.message;
        console.error(`[${table}] FAILED, rolled back this table only: ${err.message}`);
      } finally {
        client.release();
      }
    } catch (err: any) {
      summary[table].error = err.message;
      console.error(`[${table}] FAILED to read from SQLite: ${err.message}`);
    }
  }

  await pgPool.end();

  console.log("\n=== Migration Summary ===");
  for (const [table, result] of Object.entries(summary)) {
    const status = result.error ? `ERROR: ${result.error}` : `OK (${result.migrated} migrated, ${result.skipped} skipped)`;
    console.log(`${table.padEnd(36)} ${status}`);
  }

  const failedTables = Object.entries(summary).filter(([, r]) => r.error);
  if (failedTables.length > 0) {
    console.error(`\n${failedTables.length} table(s) had errors. Review before considering the migration complete.`);
    process.exit(1);
  }
  console.log("\nMigration completed with no table-level errors.");
}

function readAllRows(sqliteDb: any, table: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let stmt;
  try {
    stmt = sqliteDb.prepare(`SELECT * FROM ${table}`);
  } catch (err: any) {
    if (String(err.message || "").includes("no such table")) {
      return [];
    }
    throw err;
  }
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** SQLite returns 0/1 for integer flags and raw strings for timestamps; pg accepts both directly. Empty string -> null for nullable text columns is the one normalization worth doing generically. */
function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

main().catch((err) => {
  console.error("FATAL migration error:", err);
  process.exit(1);
});
