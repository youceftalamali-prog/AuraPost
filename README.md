# AuraPost AI

An AI-powered e-commerce marketing SaaS: product import (Shopify), AI-driven product analysis and content generation (OpenAI/Gemini/DeepSeek), AI image and video generation, social publishing (Meta/Facebook/Instagram), and subscription billing (PayPal, with Stripe also supported).

## Documentation

This project has been through a full production-hardening engagement. Start here depending on what you need:

| Document | Purpose |
|---|---|
| `DEPLOYMENT.md` | How to configure and run this in production |
| `DEPLOYMENT/REQUIRED_ENV_VARIABLES.md` | Every environment variable, what it does, what happens if it's unset |
| `KNOWN_LIMITATIONS.md` | **Read this before launch.** What has and hasn't been verified against real third-party services |
| `PRODUCTION_READINESS_FINAL_REPORT.md` | Current scores, Go/No-Go recommendation, evidence |
| `SECURITY_AUDIT.md` | Consolidated security findings and fixes |
| `POSTGRESQL_CUTOVER_REPORT.md` | The database migration from SQLite to PostgreSQL |
| `TOKEN_ENCRYPTION_AUDIT.md` | How OAuth tokens are encrypted at rest |
| `TEST_RESULTS.md` | Live end-to-end test evidence, workflow by workflow |
| `CHANGED_FILES.md` | Every file added/modified/removed across this engagement, with patches in `PATCHES/` and readable diffs in `DIFFS/` |

## Run Locally

**Prerequisites:** Node.js 20+, a PostgreSQL 14+ database.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in at minimum `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_MASTER_KEY` (the server will not start without these — see `DEPLOYMENT.md`)
3. Run the app in development: `npm run dev`

Or for a production build:

```bash
npm run build
node dist/server.cjs
```

See `DEPLOYMENT.md` for the full guide, including PayPal webhook setup and platform-specific instructions (Google Cloud Run, Railway).

## Architecture

- **Backend:** Express + TypeScript, PostgreSQL (via `pg`), JWT authentication with workspace-level authorization
- **Frontend:** React + Vite + Tailwind
- **AI:** OpenAI, Gemini, DeepSeek (text/analysis); OpenAI DALL·E, Gemini/Imagen, Stability AI, Flux (images); Google Veo, RunwayML, Kling AI (video)
- **Commerce:** Shopify Admin API integration
- **Social:** Meta Graph API (Facebook Pages + Instagram Business)
- **Billing:** PayPal (primary), Stripe (also supported)

Every integration above fails with a clear, honest error when its credentials are not configured — none of them fabricate a fake success response. See `KNOWN_LIMITATIONS.md` for exactly which integrations have been verified against real third-party services versus verified only at the "fails honestly when disconnected" level.
