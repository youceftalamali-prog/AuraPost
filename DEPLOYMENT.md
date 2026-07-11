# DEPLOYMENT.md

Quick-start deployment guide for AuraPost AI. For platform-specific instructions (Google Cloud Run, Railway) and the PostgreSQL migration path from a legacy SQLite installation, see the `DEPLOYMENT/` folder.

## 1. Prerequisites

- Node.js 20+ (built/tested against Node 22)
- A PostgreSQL 14+ database (PostgreSQL is the only supported backend — see `POSTGRESQL_CUTOVER_REPORT.md`)
- npm

## 2. Required Configuration

Copy `.env.example` to `.env` and fill in at minimum:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32)
```

**The server refuses to start without these three secrets and a valid `DATABASE_URL`.** This is intentional (see `SECURITY_AUDIT.md` §2) — it fails loudly rather than silently running with an insecure default.

Add provider credentials incrementally as you enable each feature — see `DEPLOYMENT/REQUIRED_ENV_VARIABLES.md` for the complete list (PayPal, Stripe, Shopify, Meta, AI providers, video providers). Every feature whose credentials are left unset fails with a clear, honest error rather than a fabricated result — this is a deliberate design property of this codebase (see `PRODUCTION_READINESS_FINAL_REPORT.md`), not a bug.

## 3. Install & Build

```bash
npm install
npm run build
```

This runs `vite build` (frontend → `dist/`) and bundles the Express backend via `esbuild` into `dist/server.cjs`. Both steps must complete with zero errors.

## 4. Database Bootstrap

The schema (37+ tables, including workspace membership, billing/PayPal, credit ledgers, and encrypted-token columns) is applied automatically on first boot — no manual migration step is required for a fresh database. The full schema is also available standalone at `server/db/postgres/schema.sql` if you want to review or apply it manually (`psql "$DATABASE_URL" -f server/db/postgres/schema.sql`) before first boot.

If you are migrating from a legacy pre-PostgreSQL-cutover installation that still has a SQLite `.db` file with real data, see `DEPLOYMENT/POSTGRES_MIGRATION_GUIDE.md` and `scripts/migrate-sqlite-to-postgres.ts`.

## 5. Run

```bash
node dist/server.cjs
```

Listens on port **3000** (currently hardcoded — see `KNOWN_LIMITATIONS.md` if your platform requires binding to a `PORT` env var instead).

## 6. Smoke Test

```bash
curl https://<your-domain>/api/health
# → {"status":"ok","testMode":false}

curl https://<your-domain>/api/workspace
# → 401 Unauthorized  (proves the authentication/authorization fix is live)
```

If `/api/workspace` returns anything other than a `401` without a valid Bearer token, you are not running the hardened build — stop and investigate before proceeding.

## 7. PayPal Setup (primary payment processor)

1. Create an app in the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from that app.
3. Register a webhook endpoint at `https://<your-domain>/api/billing/paypal/webhook` subscribed to at minimum: `PAYMENT.SALE.COMPLETED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`.
4. Copy the resulting Webhook ID into `PAYPAL_WEBHOOK_ID`.
5. **Before accepting real payments**, manually verify at least one full order/subscription flow against PayPal's real sandbox — this has not been possible in the environment this project was built in (no outbound network access to PayPal's servers), so it has never been observed succeeding end-to-end. See `KNOWN_LIMITATIONS.md`.

## 8. Platform-Specific Guides

- `DEPLOYMENT/GOOGLE_CLOUD_RUN.md`
- `DEPLOYMENT/RAILWAY_DEPLOYMENT.md`
- `DEPLOYMENT/POSTGRES_MIGRATION_GUIDE.md` (only needed if migrating from a legacy SQLite installation)
- `DEPLOYMENT/REQUIRED_ENV_VARIABLES.md` (the complete environment variable reference)

## 9. Before Going Live — Read This

`PRODUCTION_READINESS_FINAL_REPORT.md` §10 gives an explicit Go/No-Go recommendation: the core platform (auth, billing math, data integrity, encryption) is verified and solid, but **no external integration (PayPal, Shopify, Meta, any AI provider, any video provider) has ever completed a real, successful round-trip against its actual third-party service** in the environment this was built in, due to a lack of network access there. `KNOWN_LIMITATIONS.md` lists exactly what still needs manual verification against real credentials before full launch.
