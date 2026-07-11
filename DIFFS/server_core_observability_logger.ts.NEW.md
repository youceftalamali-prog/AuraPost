# New File: server/core/observability/logger.ts

This file did not exist in the original upload. Full contents:

```ts
import pino from "pino";

/**
 * PHASE 5 — OBSERVABILITY
 *
 * Structured JSON logger. Replaces ad-hoc console.log calls at the
 * infrastructure level (request logging, startup, shutdown, error tracking)
 * with structured, machine-parseable output suitable for log aggregation
 * (Cloud Logging, Datadog, ELK, etc.).
 *
 * SECURITY: redact() strips common sensitive field names so API keys, tokens,
 * and passwords never make it into logs even if accidentally included in a
 * logged object.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.accessToken",
      "*.refreshToken",
      "*.apiKey",
      "*.api_key",
      "*.secret",
      "*.token",
      "*.stripeSecretKey",
      "*.encryptionMasterKey",
    ],
    censor: "[REDACTED]",
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Optional Sentry error tracking. Only initializes if SENTRY_DSN is set;
 * otherwise this is a no-op so the app runs identically without it configured.
 */
let sentryInitialized = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("Sentry DSN not configured; error tracking via Sentry is disabled.");
    return;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      beforeSend(event) {
        // Defense-in-depth: strip Authorization headers from any captured request context.
        if (event.request?.headers) {
          delete (event.request.headers as any).authorization;
          delete (event.request.headers as any).Authorization;
        }
        return event;
      },
    });
    sentryInitialized = true;
    logger.info("Sentry error tracking initialized.");
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Sentry (package not available or misconfigured); continuing without it.");
  }
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  logger.error({ err: error, ...context }, "Unhandled error captured");
  if (sentryInitialized) {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.captureException(error, { extra: context });
    } catch {
      // Sentry unavailable; already logged above via pino.
    }
  }
}
```
