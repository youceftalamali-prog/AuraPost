# New File: server/core/middleware/SecurityMiddleware.ts

This file did not exist in the original upload. Full contents:

```ts
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * PHASE 1 SECURITY HARDENING
 *
 * This app is a pure Bearer-token JSON API (no cookie-based sessions were found
 * anywhere in the codebase), so CSRF in the classic sense does not apply here -
 * browsers do not automatically attach `Authorization` headers cross-site the
 * way they do cookies. The relevant browser-facing risks are XSS (mitigated via
 * CSP/secure headers below) and origin restriction (mitigated via CORS below).
 */

export function buildHelmetMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Vite/React build output is same-origin; no inline eval is required at runtime.
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"], // Tailwind/utility classes rely on inline style attrs in places
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // would break third-party (Shopify/Stripe/Meta) asset loading
  });
}

export function buildCorsMiddleware(): RequestHandler {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header, e.g. server-to-server, curl).
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) {
        // No allowlist configured: default to same-origin-only behavior by rejecting
        // cross-origin browser requests rather than silently allowing "*".
        return callback(new Error("CORS: ALLOWED_ORIGINS is not configured; cross-origin requests are rejected by default."));
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin '${origin}' is not in the ALLOWED_ORIGINS allowlist.`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}

/** Strict limiter for authentication endpoints (brute-force / credential-stuffing protection). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again in 15 minutes." },
});

/** General API limiter, generous enough for normal SaaS usage patterns. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

/** Tighter limiter for expensive AI-generation endpoints, to bound cost exposure per caller. */
export const aiGenerationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many generation requests. Please slow down." },
  keyGenerator: (req: any) => req.user?.userId || ipKeyGenerator(req.ip),
});

/** Webhook-specific limiter (Shopify/Stripe can legitimately burst, so this is generous). */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
```
