# Required Environment Variables

## Mandatory — the app will not start without these

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Added after this document was first written, during the PostgreSQL cutover.** PostgreSQL is now the only supported database backend — sql.js/SQLite has been removed from the production path entirely. App throws at startup if unset. Format: `postgresql://user:password@host:5432/dbname`. |
| `JWT_SECRET` | Signs access tokens | Must be a strong random value (e.g. `openssl rand -base64 48`). App throws at startup if missing. |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | Must be different from `JWT_SECRET`. App throws at startup if missing or identical to `JWT_SECRET`. |
| `ENCRYPTION_MASTER_KEY` | Encrypts stored third-party API keys and OAuth tokens (AES-256-GCM) | Must be at least 16 characters, ideally 32+ random bytes (`openssl rand -base64 32`). App throws at startup if missing or too short. Protects AI provider keys, Shopify tokens, and social-platform tokens. |

## PayPal (primary payment processor)

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID` | PayPal REST API client ID (from the PayPal Developer Dashboard) |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API client secret |
| `PAYPAL_WEBHOOK_ID` | The webhook ID assigned when registering your webhook endpoint in the PayPal dashboard — required for webhook signature verification |
| `PAYPAL_ENV` | `sandbox` (default) or `live` |
| `PAYPAL_{PLAN}_{INTERVAL}_PLAN_ID` (optional, e.g. `PAYPAL_PRO_MONTHLY_PLAN_ID`) | Pre-created PayPal Billing Plan ID for a given plan/interval combination. If not set, a new Product + Plan is created dynamically on first subscription checkout for that combination — functional, but will accumulate duplicate Plans in the PayPal dashboard over time if never configured. |

Without `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`, all PayPal endpoints run in a transparent sandbox mode (clearly labeled `mode: "sandbox"` in every response) rather than failing — matching the same pattern already used for Stripe.

## Mandatory for specific features (app boots without them, but the feature fails honestly with a clear error instead of a fake result)

| Variable | Feature |
|---|---|
| `OPENAI_API_KEY` | OpenAI text generation / analysis |
| `OPENAI_IMAGES_API_KEY` | OpenAI DALL·E 3 image generation (falls back to `OPENAI_API_KEY` if unset) |
| `GEMINI_API_KEY` | Gemini text generation, product analysis, image-quality analysis |
| `GEMINI_IMAGES_API_KEY` | Gemini/Imagen image generation (falls back to `GEMINI_API_KEY` if unset) |
| `DEEPSEEK_API_KEY` | DeepSeek text generation (primary provider in the AI routing chain) |
| `STABILITY_API_KEY` | Stability AI image generation |
| `FLUX_API_KEY` | Black Forest Labs (Flux) image generation |
| `VEO_API_KEY` | Google Veo video generation (falls back to `GEMINI_API_KEY` if unset) |
| `RUNWAY_API_KEY` | RunwayML video generation |
| `KLING_API_KEY` / `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | Kling AI video generation (access/secret key pair used to sign a JWT) |
| `PIKA_API_KEY` | Reserved; Pika Labs video generation is not implemented — this key is currently unused |
| `STRIPE_SECRET_KEY` | Stripe billing (checkout, portal). Without it, billing runs in transparent sandbox mode. |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhook signatures |
| `STRIPE_STARTER_MONTHLY_PRICE_ID`, `STRIPE_STARTER_YEARLY_PRICE_ID` | Stripe Price IDs for the Starter plan |
| `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID` | Stripe Price IDs for the Pro plan |
| `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID`, `STRIPE_ENTERPRISE_YEARLY_PRICE_ID` | Stripe Price IDs for the Enterprise plan |
| `SHOPIFY_API_KEY` | Shopify app OAuth client ID |
| `SHOPIFY_API_SECRET` | Shopify app OAuth client secret |
| `META_APP_ID` | Meta (Facebook/Instagram) app ID for OAuth |
| `META_APP_SECRET` | Meta app secret for OAuth |
| `CLAUDE_API_KEY` | Anthropic Claude, if used as an additional text-generation provider |

## Optional / behavior-tuning variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | (unset) | `production` switches the SQLite file path to `/tmp/aurapost.db` (see DEPLOYMENT_GUIDE.md for why this matters) and affects other environment-sensitive behavior. |
| `TEST_MODE` | `false` | Cosmetic flag surfaced by `/api/health`; does not disable any security checks. |
| `SOCIAL_PUBLISH_LIVE` | `false` | Must be `true` for real posts to be published to Meta; otherwise publishing calls are rejected/no-op. |
| `VIDEO_PROVIDER_LIVE` | `false` | Must be `true` to use real video provider API calls; the sandbox/test path is otherwise used. |
| `SHOPIFY_SYNC_TEST_MODE` | `false` | Explicitly gates the synthetic Shopify sync fallback used only for local development/testing. |
| `AURAPOST_ENABLE_TEST_DATASET` | `false` | Enables a seeded/synthetic product dataset for local development only. |
| `DEEPSEEK_MODEL` | provider default | Overrides the DeepSeek model name |
| `GEMINI_MODEL` | provider default | Overrides the Gemini model name |
| `OPENAI_MODEL` | provider default | Overrides the OpenAI model name |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `APP_URL` / `APP_BASE_URL` | (unset) | Base URL used to build OAuth redirect URIs (Meta, Shopify) — **must** be set to your real public HTTPS URL in any deployed environment. |

## Optional / PostgreSQL connection tuning

| Variable | Default | Purpose |
|---|---|---|
| `PG_POOL_MAX` | 10 | Maximum connections in the PostgreSQL pool |
| `PG_POOL_IDLE_TIMEOUT_MS` | 30000 | How long an idle pooled connection is kept before being closed |
| `PG_POOL_CONN_TIMEOUT_MS` | 5000 | How long to wait for a new connection before timing out |
| `PG_SSL` | (SSL enabled) | Set to `false` to disable SSL for the PostgreSQL connection (e.g. for a local/Docker-network Postgres with no TLS) |

## Known Gaps (disclosed, not fixed in this pass)

- The HTTP port is currently **hardcoded to `3000`** in `server.ts` (`const PORT = 3000;`) rather than read from a `PORT` environment variable. Most PaaS providers (Railway, Cloud Run, Render, etc.) inject a `PORT` variable and expect the app to bind to it. See `DEPLOYMENT_GUIDE.md` for the one-line workaround required at deploy time if your platform does not let you fix the listening port to `3000` directly.
- ~~There is no `.env` variable to change the SQLite database file location...~~ **RESOLVED by the PostgreSQL cutover** (see `POSTGRESQL_CUTOVER_REPORT.md`). The application no longer uses SQLite/sql.js in its production path at all; all data lives in PostgreSQL via `DATABASE_URL`, which is a real, durable, connection-pooled database regardless of the underlying host's filesystem persistence guarantees.
