# KNOWN_LIMITATIONS.md

This document states plainly what has and has not been verified, and what is architecturally incomplete, so nothing here is discovered by surprise after deployment.

## 1. Environment Constraint That Shapes Everything Below

The environment this project was built and tested in has **no outbound network access** to Shopify, Meta/Facebook, OpenAI, Gemini, any video-generation provider (Google Veo, RunwayML, Kling AI), or PayPal. This was confirmed directly (each returns an egress-proxy `403`, not a response from the real service). Every limitation below that says "never observed succeeding against the real service" traces back to this one constraint, not to unfinished code.

## 2. Never Observed Succeeding Against a Real Third Party (in any phase of this engagement)

| Integration | What IS proven | What is NOT proven |
|---|---|---|
| **PayPal** | Real REST API v2 client code; sandbox-mode order/subscription creation and capture verified end-to-end against live PostgreSQL; webhook signature verification, replay protection, and idempotency all live-tested for their rejection paths | A real order or subscription has never been created against PayPal's actual sandbox servers; a real, PayPal-signed webhook has never been accepted (only rejected-path scenarios were testable) |
| **Shopify** | Real OAuth token-exchange code; real Admin REST API sync code; webhook HMAC verification fully live-tested (valid/invalid/missing); sandbox-mode connection verified end-to-end with token encryption confirmed | A real product/order/customer sync against an actual Shopify store has never completed; only the honest-failure path (network unreachable → job failed, store flagged `needs_reauth`) has been observed |
| **Meta / Facebook / Instagram** | Real Graph API publishing code (confirmed to attempt an actual HTTPS call to `graph.facebook.com`, not a mock); real OAuth callback code; social-account token encryption verified via direct invocation | OAuth flow, Page discovery, Instagram Business discovery, token refresh, and a *successful* publish have never been observed — only the failure-handling path for a publish attempt has been |
| **AI (OpenAI, Gemini, DeepSeek)** | Honest-failure behavior verified repeatedly (a clear, real error when no provider is configured — no fabricated analysis, no fake content) | A real, successful AI-generated analysis or piece of content has never been produced in this engagement, because no real API key was ever available in a network-connected environment |
| **Video generation (Veo, RunwayML, Kling)** | Real API-calling code (no stock-footage fallback exists — confirmed via repository-wide search); credit deduction and job-queuing verified live | A real generated video has never been produced |

**The practical implication:** before this system serves a single real paying customer, someone with genuine network access and real credentials needs to manually run each of the five integrations above at least once against the real service. The code is written to make that "just work" once pointed at real credentials, but "written to work" and "observed working" are different claims, and this document does not conflate them.

## 3. Architectural Limitations (Not Bugs, But Worth Planning Around)

1. **Single shared workspace model.** Real workspace-level authorization exists and is enforced (see `PRODUCTION_READINESS_FINAL_REPORT.md`), but the application only ever provisions one workspace (`default-workspace`) that all registered users are attached to. Multi-tenant data *isolation* is real; multi-tenant *onboarding* (each customer getting their own workspace) is not yet built.
2. **PayPal Plan creation.** Subscription Plan IDs are created dynamically on first use unless a `PAYPAL_{PLAN}_{INTERVAL}_PLAN_ID` env var is pre-set, which will accumulate duplicate Products/Plans in the PayPal dashboard over repeated cold-starts if never configured.
3. **No connection retry/backoff** if PostgreSQL becomes briefly unreachable after boot — errors surface per-query.
4. **No automated encryption backfill** for a hypothetical existing production database with plaintext Shopify/social tokens from before this fix — none exists to migrate against currently, so none was built.
5. **No secret-rotation tooling** for `JWT_SECRET`/`JWT_REFRESH_SECRET`/`ENCRYPTION_MASTER_KEY`.
6. Session and refresh tokens are stored in cleartext in PostgreSQL — this is standard, expected practice for a self-issued, revocable, short-lived JWT (not a third-party credential), not an oversight, but is noted here explicitly so it isn't mistaken for one.

## 4. Testing Depth Gaps (Disclosed Rather Than Hidden)

- AI Caption Generator was not independently driven through its own HTTP endpoint (it shares the exact same provider-chain code as the Product Analyzer, which *was* tested).
- Queue retry-to-dead-letter exhaustion was proven for Shopify sync jobs but not separately re-run to completion for a social-publishing job (same underlying engine code).
- Video-render worker failure-to-completion was not independently re-run to observe the final `failed` status transition (the identical try/catch/record-failure pattern was directly observed working for both Shopify sync and social publishing).
- No load/performance testing has been done at any point in this engagement.
- No penetration testing or third-party security review has been performed; this is an internal engineering audit only.

## 5. What "Production Ready" Means Here, Precisely

The **platform** — authentication, authorization, workspace isolation, database integrity, encryption, billing state machines, webhook security mechanics, and honest failure handling under real error conditions — has been proven repeatedly against a real, live PostgreSQL database across multiple independent testing passes, and several real bugs were found and fixed specifically because real infrastructure was used instead of relying on code review alone.

The **five external integrations** (PayPal, Shopify, Meta, AI providers, video providers) are code-complete, type-safe, and demonstrably fail honestly rather than fabricating success — a real and meaningful improvement over the state this project started in — but none has ever completed a real, successful round-trip against its actual third-party service in any phase of this engagement.

See `PRODUCTION_READINESS_FINAL_REPORT.md` §10 for the resulting Go/No-Go recommendation.
