# Deployment Guide

This guide covers deploying the hardened AuraPost AI codebase to a real environment. It assumes you have already reviewed `REQUIRED_ENV_VARIABLES.md`.

## 1. Prerequisites

- Node.js 20+ (project was built/tested against Node 22)
- npm
- A `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_MASTER_KEY` generated with `openssl rand -base64 48` / `openssl rand -base64 32` respectively — **the app will not boot without these**
- API keys for whichever AI/commerce/social providers you intend to use (see `REQUIRED_ENV_VARIABLES.md`); the app boots and runs without them, but each corresponding feature will fail with a clear, honest error until configured

## 2. Install & Build

```bash
npm install
npm run build
```

`npm run build` runs:
1. `vite build` — compiles the React frontend into `dist/`
2. `esbuild server.ts --bundle --platform=node --format=cjs ... --outfile=dist/server.cjs` — bundles the Express backend into a single CommonJS file

Both steps must complete with no errors before deploying. This was verified in the hardening pass (see `TEST_RESULTS.md` in the reports package).

## 3. Run

```bash
NODE_ENV=production \
JWT_SECRET="<your-generated-secret>" \
JWT_REFRESH_SECRET="<your-generated-secret>" \
ENCRYPTION_MASTER_KEY="<your-generated-key>" \
node dist/server.cjs
```

The server listens on **port 3000** (hardcoded in `server.ts` — see "Known Gaps" below). It serves the built frontend as static files and the API under `/api/*`.

## 4. Known Deployment Gaps to Plan Around

These are disclosed, not hidden — plan your deployment around them rather than assuming they're handled:

### a) Hardcoded port 3000
`server.ts` contains `const PORT = 3000;` rather than reading `process.env.PORT`. Most PaaS platforms (Railway, Cloud Run, Render, Heroku) inject a `PORT` variable and route traffic to whatever port your app actually listens on — check your platform's specific requirement:
- **If your platform lets you configure the exposed/target port explicitly** (e.g. Cloud Run's `--port` flag, or a Railway "port" setting), set it to `3000` and you need no code change.
- **If your platform strictly requires reading `process.env.PORT`**, you will need a one-line change to `server.ts` (`const PORT = process.env.PORT || 3000;`) before deploying there. This was flagged but intentionally left unmodified per the "no code changes" scope of this packaging pass.

### b) Ephemeral database storage in production
In production (`NODE_ENV=production`), the SQLite database file lives at `/tmp/aurapost.db`. On most containerized/serverless platforms, `/tmp` (or the entire container filesystem) is wiped on every restart, redeploy, or scale-out event — **meaning all application data can be lost**. Before going live with real users:
- Mount a persistent volume at that path (supported on Railway via Volumes; on Cloud Run only with Cloud Run + a mounted GCS FUSE volume or Filestore, which adds latency and complexity), **or**
- Migrate the data layer to a managed database (Postgres/Supabase) — this was flagged in the original audit as a larger architectural change outside the scope of this hardening pass.

If you cannot address this before launch, at minimum schedule frequent backups of the SQLite file and communicate the data-durability risk to stakeholders.

### c) Single shared workspace model
The authorization fix (Phase 1) makes workspace access verifiable and safe, but the app currently only ever creates one workspace (`default-workspace`) that new users are auto-attached to as members. This preserves today's single-tenant demo behavior safely — it does not yet provide per-customer data isolation. If you plan to onboard multiple distinct businesses, you will need to build real per-customer workspace creation on top of the now-safe `workspace_members` foundation.

### d) No CORS / rate limiting / security headers
`server.ts` does not configure CORS, `helmet`, or rate limiting. If deploying behind a reverse proxy or CDN, configure these at that layer (e.g. Cloudflare, or your PaaS's built-in options) until they're added in code.

## 5. Environment Variable Checklist Before Going Live

Run through `REQUIRED_ENV_VARIABLES.md` top to bottom. At minimum you need the three mandatory secrets to boot; add provider keys incrementally as you enable each feature (AI providers, Stripe, Shopify, Meta, video providers).

## 6. Smoke Test After Deploying

```bash
curl https://<your-domain>/api/health
# Expect: {"status":"ok","testMode":false}

curl https://<your-domain>/api/workspace
# Expect: 401 Unauthorized (proves the auth fix is live)
```

If `/api/workspace` returns anything other than a 401 without a valid Bearer token, do not consider the deployment secure — recheck that you deployed the hardened `server.ts` / `AuthMiddleware.ts`, not a pre-hardening build.

## 7. Platform-Specific Guides

See `GOOGLE_CLOUD_RUN.md` and `RAILWAY_DEPLOYMENT.md` in this same folder for step-by-step instructions on those two platforms.
