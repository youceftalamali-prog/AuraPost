# Deploying to Railway

## 1. Create the project

```bash
npm install -g @railway/cli
railway login
railway init
```

Or use the Railway dashboard: **New Project → Deploy from GitHub repo**, pointing at this codebase.

## 2. Configure the build

Railway auto-detects Node.js projects. Confirm/set these in the Railway dashboard under **Settings → Build**:

- **Build command:** `npm install && npm run build`
- **Start command:** `node dist/server.cjs`

## 3. Handle the fixed port (3000)

The app listens on a hardcoded port 3000 rather than `process.env.PORT` (see `DEPLOYMENT_GUIDE.md` → "Known Deployment Gaps"). Railway's proxy auto-detects the port your app is actually listening on in most cases, but if Railway's health check fails to detect it automatically, explicitly set the service's target port to `3000` under **Settings → Networking → Public Networking → Port**.

If Railway's environment strictly enforces binding to its injected `$PORT` value, you will need the one-line change described in `DEPLOYMENT_GUIDE.md` (`const PORT = process.env.PORT || 3000;`) before deploying — this was intentionally left unmodified in this packaging pass per the "no code changes" instruction.

## 4. Set environment variables

In the Railway dashboard, go to your service → **Variables**, and add (minimum to boot):

```
NODE_ENV=production
JWT_SECRET=<generated with: openssl rand -base64 48>
JWT_REFRESH_SECRET=<generated with: openssl rand -base64 48>
ENCRYPTION_MASTER_KEY=<generated with: openssl rand -base64 32>
```

Then add whichever provider keys you need from `REQUIRED_ENV_VARIABLES.md` (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `SHOPIFY_API_KEY`, `META_APP_ID`, etc.). Railway Variables are encrypted at rest, so this is an acceptable place to store them directly (no separate secrets manager required for a project this size).

You can also do this via CLI:

```bash
railway variables set JWT_SECRET="<generated>"
railway variables set JWT_REFRESH_SECRET="<generated>"
railway variables set ENCRYPTION_MASTER_KEY="<generated>"
railway variables set NODE_ENV=production
```

## 5. Persistent storage (important)

Railway's default filesystem is **ephemeral** on redeploys unless you attach a **Volume**. Since this app's production database path is `/tmp/aurapost.db`, you must either:

- **Attach a Railway Volume** mounted at a persistent path, and change the database path away from `/tmp` to that mount point (this requires a source change beyond this packaging pass's scope — flagged here for your team), or
- Treat the current setup as **demo/staging only** and plan a migration to a managed Postgres/Supabase database (Railway offers a one-click Postgres plugin) before onboarding real users.

Railway does offer a built-in **PostgreSQL plugin** (`railway add` → PostgreSQL) if/when you're ready to make that migration — it is not wired into this codebase today (confirmed: no `pg` or Postgres client dependency exists in `package.json`).

## 6. Deploy

```bash
railway up
```

Or push to the connected GitHub branch if using Railway's GitHub integration.

## 7. Verify

```bash
railway domain   # get your public URL
curl https://<your-railway-domain>/api/health
curl -i https://<your-railway-domain>/api/workspace   # expect 401
```
