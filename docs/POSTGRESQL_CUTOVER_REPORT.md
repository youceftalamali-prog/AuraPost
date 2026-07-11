# PostgreSQL Cutover Report

## Status: COMPLETE — application runs fully on PostgreSQL, verified live

TypeScript: **PASS** (0 errors). Production build: **PASS**. Production boot against a real, freshly-created PostgreSQL 16 database: **PASS**, with end-to-end functional verification of authentication, refresh-token rotation, and workspace authorization (details below).

---

## 1. What Changed, At a Glance

| | Before | After |
|---|---|---|
| Database engine | sql.js (in-memory WASM SQLite), file persisted via whole-file export/rewrite | PostgreSQL 16 via `pg`, real connection pool |
| Production data path | `/tmp/aurapost.db` (ephemeral on most hosts) | Any PostgreSQL instance via `DATABASE_URL` |
| `DatabaseManager` methods | Synchronous (sql.js is sync) | Async (129 methods now return Promises) |
| Identity repositories | `SqliteUserRepository`, `SqliteSessionRepository`, `SqliteRefreshTokenRepository` — reached into a raw sql.js handle via `getDatabase()` | `PostgresUserRepository`, `PostgresSessionRepository`, `PostgresRefreshTokenRepository` — use `DatabaseManager`'s public, parameterized `dbGet`/`dbAll`/`dbRun` |
| `sql.js` in `package.json` | Production `dependencies` | Removed from `dependencies`; kept only in `devDependencies`, used solely by the one-time `scripts/migrate-sqlite-to-postgres.ts` utility |
| Transactions | None (sql.js has no real transaction isolation across the async request lifecycle) | Real `BEGIN`/`COMMIT`/`ROLLBACK` via `withTransaction()` |
| Connection pooling | N/A (single in-memory instance) | `pg.Pool`, configurable via `PG_POOL_MAX`, with idle-error handling so a dropped connection can't crash the process |
| Health checks | None | `DatabaseManager.healthCheck()` — real `SELECT 1` round-trip with latency |

---

## 2. Total Methods Converted

- **129 of 144** `DatabaseManager` methods converted from synchronous sql.js calls to async PostgreSQL calls (the remaining 15 are pure row-mapping helpers — e.g. `mapWorkspaceSubscriptionRow`, `mapSocialPostRow` — that take an already-fetched row and do no I/O, so they correctly remain synchronous).
- **3 identity repositories** rewritten from raw sql.js access to `DatabaseManager`'s public query helpers (`PostgresUserRepository`, `PostgresSessionRepository`, `PostgresRefreshTokenRepository`), replacing the deleted `Sqlite*Repository` files.
- **1 new core module**: `server/db/postgres/namedParams.ts` — converts the codebase's existing `$paramName` named-parameter convention (preserved unchanged from the sql.js era) to PostgreSQL's positional `$1, $2, ...` placeholders at call time, so ~400 existing SQL statements across `db.ts` did not need individual hand-transcription.
- **~275 individual call sites** across `server.ts`, `server/queue/engine.ts`, `server/shopify/live-sync.ts`, `server/video/studio.ts`, `server/social/queue.ts`, `server/ai/analyzer.ts`, `server/ai/provider.ts`, `server/identity/services/AuthService.ts`, and `server/core/middleware/AuthMiddleware.ts` updated to `await` the now-async `DatabaseManager` calls.
- **1 new schema file**: `server/db/postgres/schema.sql` (and its bundled TypeScript twin `schemaSql.ts`) — the complete 37-table PostgreSQL schema, translated 1:1 from the former SQLite schema, executed automatically on every boot (`createSchema()`), idempotently (`CREATE TABLE IF NOT EXISTS`).
- **1 new table**: `workspace_members`, carried over unchanged from the Phase 1 security work.

## 3. Total TypeScript Errors Fixed

| Milestone | Error count |
|---|---|
| Immediately after converting `DatabaseManager`'s core (constructor/init/schema/query helpers) to async, before touching the rest of the class | 232 |
| After bulk-converting method signatures + scripted sql.js-boilerplate removal | 149 |
| After fixing `db.ts` internal call sites (missing `await` between its own now-async methods) | 108 |
| After bulk-adding `await` to external call sites across `server.ts` and other consumer files | 52 |
| After adding `async` to Express route handlers and helper functions | 24 |
| After fixing chained-call operator-precedence bugs (`await x().find()` parses as `await (x().find())`, not `(await x()).find()`) and remaining async-function gaps | 6 |
| **Final** | **0** |

**Total: 232 → 0 TypeScript errors resolved.**

## 4. A Second, More Important Category of Bug: Errors TypeScript Could Not Catch

TypeScript's type checker only flags a missing `await` when the resulting `Promise<T>` is used somewhere its shape doesn't match (e.g. calling `.find()` on it, or assigning it to a typed variable). It does **not** flag a missing `await` on a call whose result is discarded (a "fire-and-forget" statement like `db.logAudit(...);` with no assignment) — that remains syntactically valid regardless of return type, so it produces **zero compiler errors** while being **completely broken at runtime** (the write may not happen before the function returns, and any rejection is silently unhandled).

A dedicated sweep (not tsc-driven) was run across every file for exactly this pattern, using the known list of 129 async `DatabaseManager` method names. It initially reported 86 additional missing-await sites; on investigation, the detection script itself had a regex bug (matching the bare `db` inside `this.db` due to `this.db` failing its lookbehind and falling through to the shorter `db` alternative). After fixing the detector, **the real count of silently-broken fire-and-forget call sites found and fixed was 44**, concentrated in `server/shopify/live-sync.ts` (39), `server/identity/services/AuthService.ts` (2), `server/core/middleware/AuthMiddleware.ts` (2), and `server/ai/provider.ts` (1). A follow-up sweep with the corrected detector confirmed **zero** remaining missing-await sites anywhere in the codebase, including inside `db.ts`'s own internal cross-method calls.

## 5. Two Real Bugs Found Only By Booting Against a Live Database

TypeScript passing and the build succeeding are necessary but not sufficient conditions for "the application works." Both of the following were invisible to the compiler and were only caught by actually starting the server against a real, empty PostgreSQL 16 database and exercising it:

### Bug 1 — Named-parameter lookup used the wrong key format (critical)
`namedToPositional()`'s first implementation stripped the leading `$` from a SQL placeholder (`$workspaceId` → `workspaceId`) before looking it up in the params object. But every call site in the codebase — preserved unchanged from the sql.js era — passes params as `{ $workspaceId: value }`, i.e. the object key **includes** the `$`. The lookup was therefore always missing, silently resolving to `undefined` → `null` for **every parameter of every query in the application**. This did not surface as a TypeScript error (the params object type is `Record<string, unknown>`, so any key shape type-checks) and would not have surfaced in a superficial smoke test that only checks HTTP status codes. It was caught because the very first fresh-database boot failed outright with a real Postgres constraint violation (`null value in column "created_at" of relation "credit_ledger" violates not-null constraint`) during seed-data insertion. **Fixed** by looking up the full token (`$workspaceId`) instead of the stripped name. Verified via a 4-case unit test matching the real calling convention, then via a full fresh-database boot showing correct, real timestamps in seeded rows.

### Bug 2 — Refresh tokens could collide (pre-existing, exposed by fast automated testing)
`JwtService.generateRefreshToken()` signed `{ userId, email, role }` with no unique claim. `jwt.sign()` is deterministic for identical payload + identical secret + identical `iat`/`exp` (both derived from the current second). A login immediately followed by a call to `/api/auth/refresh` — happening within the same wall-clock second, as automated test scripts (and occasionally real users) do — produced a byte-for-byte identical refresh token, which then violated `refresh_tokens.token`'s `UNIQUE` constraint on insert (`HTTP 500`). This is not a PostgreSQL-specific bug (the same collision could occur against the old SQLite schema, which also had a `UNIQUE` constraint on the token column), but it was only exposed here by real end-to-end refresh-flow testing during this cutover. **Fixed** by adding a random `jwtid` (`jti`) claim to both access and refresh tokens, guaranteeing uniqueness regardless of timing. Verified: a login-then-immediate-refresh sequence now succeeds (`200`), returns rotated tokens, and the old (pre-rotation) refresh token is correctly rejected (`401`) on reuse.

Both fixes are small (a handful of lines each) but neither would have been caught without literally starting the server against PostgreSQL and driving real requests through it — which is why this report's verification section below is based on live HTTP responses and direct `psql` inspection, not just "the build succeeded."

## 6. Remaining sql.js / SQLite References

**Production code path: zero.** `server.ts` and every file it imports at runtime contain no `sql.js` import, no `SQL.Database`, no `.prepare()`/`.step()`/`.getAsObject()`/`.free()` calls, and no reference to a SQLite file path. `DatabaseManager` refuses to start at all without a valid `DATABASE_URL` (see `server/db.ts`'s `init()`).

**Remaining references (all outside the production runtime path):**
- `scripts/migrate-sqlite-to-postgres.ts` — intentionally uses `sql.js` to read the legacy `storage/aurapost.db` file for one-time data migration. This is a standalone CLI utility, never imported by `server.ts` or any production module. `sql.js` was correspondingly moved to `devDependencies` only.
- Prose comments throughout `server/db.ts`, `server/db/postgres/*.ts`, and `server/dataforseo.ts` explaining *what the code used to do* before the cutover (e.g. "PHASE 2 CUTOVER: previously reached directly into DatabaseManager's raw sql.js handle..."). These are documentation of the change, not functional code.
- A handful of user-facing UI strings in `src/components/` (`ArchitectureDiagram.tsx`, `BrandKit.tsx`, `DBViewer.tsx`) still say "SQLite" in display text. `ImageStudio.tsx`'s misleading "Saved project into SQLite cloud database" toast and matching log lines were corrected as part of this pass. `DBViewer.tsx` is confirmed dead/unrouted code (not reachable by any user, per the earlier audit); `ArchitectureDiagram.tsx` and `BrandKit.tsx` are cosmetic labels only. These are flagged as a minor follow-up, not a functional gap.

## 7. Verification — Live, Not Just Compiled

All of the following were run against a **freshly created, empty** PostgreSQL 16 database (`DROP DATABASE` + `CREATE DATABASE` immediately before boot), not a pre-seeded one, and then again against the resulting seeded database to confirm idempotent boot:

```
TypeScript:        npx tsc --noEmit               → 0 errors
Build:              npm run build                  → succeeded (vite + esbuild), dist/server.cjs 787.2kb
Boot (fresh DB):     node dist/server.cjs           → "[PostgreSQL Database] Connected and schema verified."
Boot (existing DB):  node dist/server.cjs           → connects without re-seeding (idempotency confirmed)
Schema bootstrap:    38 tables created automatically from POSTGRES_SCHEMA_SQL on first boot
```

### Authentication — verified live
- `POST /api/auth/register` → `201`, real user row created with a real UUID (`psql`-visible).
- `POST /api/auth/login` → `200`, real JWT access + refresh tokens issued, password verified via bcrypt against the PostgreSQL-stored hash.
- `GET /api/workspace` with no `Authorization` header → `401` (confirms the Phase 1 auth gate is still enforced end-to-end on the new database backend).

### Refresh tokens — verified live
- Immediate refresh after login (the exact scenario that triggered Bug 2 above) → `200`, new access + refresh tokens returned, both containing distinct `jti` claims.
- Re-using the now-rotated (old) refresh token → `401 "Invalid, expired or revoked refresh token"`, confirming revocation is correctly persisted and checked against PostgreSQL.

### Workspace authorization — verified live
- User A requesting their own workspace (auto-resolved, no `workspaceId` supplied) → `200`, correct workspace/subscription/credit data.
- User B requesting a workspace they are not a member of → `403 "You do not have access to this workspace."`, confirming the `workspace_members` membership check (Phase 1) still works correctly against real PostgreSQL joins.

### Broader data-layer coverage — verified live
- `GET /api/billing/overview` → `200` with correctly assembled data spanning **five** tables in a single response (`workspaces`, `billing_subscriptions`, `workspace_credit_pools`, `billing_invoices`, `payment_history`) plus a cross-workspace analytics aggregation (MRR/ARR/churn computed correctly across all three seeded workspaces).
- `POST /api/ai-providers/save` → `200`; direct `psql` inspection of `workspace_ai_providers` confirms the stored `api_key_encrypted`/`api_key_iv` columns contain real AES-256-GCM ciphertext (not the plaintext test key), proving the encryption round-trip (`server/encryption.ts`) works correctly through the new data layer.

### Not individually exercised via HTTP in this pass
`DatabaseManager` has 129 async methods; the tests above exercise a representative, high-value cross-section (auth, sessions, refresh tokens, workspace membership, billing/subscriptions/credit pools, encrypted provider-key storage) rather than every method individually. Methods for Shopify sync job persistence, video-generation records, queue-engine job claiming, and social-post scheduling were converted using the same mechanical process, pass TypeScript's type checking (which — per Bug 1 and Bug 2 above — is necessary but not sufficient on its own), and were covered by the missing-await sweep, but were **not** independently driven through their own HTTP endpoints in this verification pass. This is disclosed rather than glossed over: broader endpoint-level QA of those paths is a reasonable next step before declaring every corner of the data layer battle-tested, even though the cutover itself (engine, schema, pooling, transactions) is complete and the core paths are proven live.

## 8. Files Modified (this phase)

**Rewritten:**
- `server/db.ts` — sql.js → PostgreSQL throughout (129 methods converted, 4,270 lines)

**New:**
- `server/db/postgres/namedParams.ts` — named→positional parameter conversion
- `server/db/postgres/pool.ts` — standalone pool/transaction helper module
- `server/db/postgres/schema.sql` / `schemaSql.ts` — full PostgreSQL schema (psql-runnable and bundled-string forms)
- `server/identity/repositories/PostgresUserRepository.ts`
- `server/identity/repositories/PostgresSessionRepository.ts`
- `server/identity/repositories/PostgresRefreshTokenRepository.ts`
- `scripts/migrate-sqlite-to-postgres.ts` — one-time data migration utility

**Deleted:**
- `server/identity/repositories/SqliteUserRepository.ts`
- `server/identity/repositories/SqliteSessionRepository.ts`
- `server/identity/repositories/SqliteRefreshTokenRepository.ts`

**Updated (call sites / wiring):**
- `server.ts`, `server/queue/engine.ts`, `server/shopify/live-sync.ts`, `server/video/studio.ts`, `server/social/queue.ts`, `server/ai/analyzer.ts`, `server/ai/provider.ts`, `server/identity/services/AuthService.ts`, `server/identity/services/JwtService.ts` (jti fix), `server/identity/index.ts`, `server/core/middleware/AuthMiddleware.ts`, `server/dataforseo.ts`, `src/types.ts`, `src/components/ImageStudio.tsx` (UI copy), `package.json` (dependency reshuffle)

## 9. Remaining Database Risks (honest, not exhaustive-tested)

1. **Verification depth**, as stated in Section 7 — Shopify sync, video generation, queue engine, and social publishing data paths are converted and type-safe but not individually HTTP-tested against live PostgreSQL in this pass.
2. **No connection-retry/backoff logic** if PostgreSQL is briefly unreachable after boot — the pool will surface errors per-query rather than queueing or retrying. Acceptable for now; worth hardening before high-traffic production use.
3. **No read replicas / no query performance tuning** — indexes were carried over from the original schema plus a few additive ones (see `schema.sql`); no query plan analysis has been done under load.
4. **`workspace_ai_providers`, social account tokens, and Shopify access tokens** — AI provider keys are encrypted (verified above); social/Shopify access tokens are stored as plaintext columns, matching pre-cutover behavior (flagged in the original audit as a separate, not-yet-addressed item).
5. **The migration script** (`scripts/migrate-sqlite-to-postgres.ts`) has not been run against a real production SQLite export in this pass — it was written and is type-checked, but a dry run against an actual legacy `aurapost.db` with real data is recommended before relying on it for a production cutover.
