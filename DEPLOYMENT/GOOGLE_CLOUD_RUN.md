# Deploying to Google Cloud Run

## 1. Add a Dockerfile (none exists in this repo yet)

Cloud Run requires a container image. Create `Dockerfile` at the project root:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

## 2. Build and push the image

```bash
gcloud auth login
gcloud config set project <your-project-id>

gcloud builds submit --tag gcr.io/<your-project-id>/aurapost-ai
```

## 3. Handle the fixed port (3000)

The app listens on a hardcoded port 3000 (`const PORT = 3000;` in `server.ts`; see `DEPLOYMENT_GUIDE.md` "Known Deployment Gaps"). Cloud Run lets you specify which container port to route traffic to, so no code change is required — just tell Cloud Run to target port 3000 explicitly:

```bash
gcloud run deploy aurapost-ai \
  --image gcr.io/<your-project-id>/aurapost-ai \
  --platform managed \
  --region us-central1 \
  --port 3000 \
  --allow-unauthenticated
```

## 4. Set required environment variables

```bash
gcloud run services update aurapost-ai \
  --region us-central1 \
  --set-env-vars \
JWT_SECRET="<generated>",\
JWT_REFRESH_SECRET="<generated>",\
ENCRYPTION_MASTER_KEY="<generated>",\
NODE_ENV=production,\
GEMINI_API_KEY="<your-key>",\
OPENAI_API_KEY="<your-key>",\
STRIPE_SECRET_KEY="<your-key>",\
STRIPE_WEBHOOK_SECRET="<your-key>"
```

Add any additional provider keys from `REQUIRED_ENV_VARIABLES.md` the same way. For secrets, prefer **Secret Manager** over plain env vars:

```bash
gcloud secrets create jwt-secret --data-file=- <<< "<generated-value>"
gcloud run services update aurapost-ai \
  --region us-central1 \
  --update-secrets=JWT_SECRET=jwt-secret:latest
```

Repeat for `JWT_REFRESH_SECRET` and `ENCRYPTION_MASTER_KEY` at minimum.

## 5. Persistent storage warning (important)

Cloud Run containers are **stateless and ephemeral** — the local filesystem (including `/tmp`, where this app's SQLite database lives in production) does **not** persist across revisions, restarts, or scale-to-zero events. Deploying this app to Cloud Run as-is means **your data will be lost** whenever Cloud Run recycles the instance.

Before using Cloud Run for anything beyond a demo:
- Mount a **Filestore** instance via Cloud Run's NFS volume mount support (adds cost/latency, and SQLite over NFS is not officially supported/recommended), or
- Migrate the database layer to **Cloud SQL for PostgreSQL** or **Supabase** (recommended long-term; this was flagged in the original audit as a needed architectural change, and is not something a deployment guide alone can fix).

Cloud Run is a fine choice for the stateless frontend/API layer; it is the wrong target for this app's current SQLite-on-disk storage model without one of the above changes.

## 6. Verify

```bash
SERVICE_URL=$(gcloud run services describe aurapost-ai --region us-central1 --format='value(status.url)')
curl $SERVICE_URL/api/health
curl -i $SERVICE_URL/api/workspace   # expect 401
```
