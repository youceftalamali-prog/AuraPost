# New File: server/db/postgres/pool.ts

This file did not exist in the original upload. Full contents:

```ts
import { Pool, PoolConfig } from "pg";
import { logger } from "../../core/observability/logger";

/**
 * PHASE 2 — DATABASE HARDENING
 *
 * Real connection-pooled Postgres client, ready for the app to use once the
 * DatabaseManager query methods are ported (see server/db/postgres/README.md
 * for exactly what is and is not done in this pass).
 *
 * Not wired into DatabaseManager yet: server/db.ts (the sql.js-backed manager)
 * remains the active data layer today. This module, the schema, and the
 * migration script are the infrastructure for that cutover, not the cutover
 * itself — see MIGRATION_GUIDE.md for the honest scope statement.
 */

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Postgres pool cannot be created. " +
      "See DEPLOYMENT/REQUIRED_ENV_VARIABLES.md."
    );
  }

  const config: PoolConfig = {
    connectionString,
    // Reasonable defaults for a small/medium SaaS workload; tune via env vars
    // once real production traffic patterns are known.
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_TIMEOUT_MS || 5000),
    ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: false },
  };

  pool = new Pool(config);

  pool.on("error", (err) => {
    // Idle client errors (e.g. a dropped connection) must not crash the process.
    logger.error({ err }, "Unexpected error on idle Postgres client");
  });

  return pool;
}

/** Runs `fn` inside a single transaction (BEGIN/COMMIT/ROLLBACK), releasing the client afterward. */
export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
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

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```
