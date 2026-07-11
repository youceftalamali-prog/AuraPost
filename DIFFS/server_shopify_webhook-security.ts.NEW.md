# New File: server/shopify/webhook-security.ts

This file did not exist in the original upload. Full contents:

```ts
import crypto from "crypto";
import type { Request } from "express";

/**
 * SECURITY FIX (Phase 1): the Shopify webhook receiver at
 * POST /api/shopify/webhooks/:storeId previously had NO signature verification
 * at all - any unauthenticated caller could POST an arbitrary payload and
 * trigger a real sync job. Shopify signs every webhook request with an
 * HMAC-SHA256 digest of the raw request body, using the app's client secret,
 * sent in the `X-Shopify-Hmac-Sha256` header. This verifies that signature.
 *
 * Reference: https://shopify.dev/docs/apps/build/webhooks/subscribe/verify-webhooks-with-http
 */
export function verifyShopifyWebhookHmac(req: Request & { rawBody?: Buffer }): { valid: boolean; reason?: string } {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return { valid: false, reason: "SHOPIFY_API_SECRET is not configured; cannot verify webhook signatures." };
  }

  const providedHmac = req.headers["x-shopify-hmac-sha256"];
  if (!providedHmac || typeof providedHmac !== "string") {
    return { valid: false, reason: "Missing X-Shopify-Hmac-Sha256 header." };
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return { valid: false, reason: "Raw request body was not captured; cannot verify signature." };
  }

  const computedHmac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");

  const providedBuf = Buffer.from(providedHmac, "base64");
  const computedBuf = Buffer.from(computedHmac, "base64");

  if (providedBuf.length !== computedBuf.length || !crypto.timingSafeEqual(providedBuf, computedBuf)) {
    return { valid: false, reason: "HMAC signature mismatch." };
  }

  return { valid: true };
}
```
