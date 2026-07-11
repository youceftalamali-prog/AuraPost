# Diff: server/identity/services/JwtService.ts

```diff
--- original_reference/server/identity/services/JwtService.ts	2026-07-06 18:23:36.000000000 +0000
+++ audit/server/identity/services/JwtService.ts	2026-07-10 07:23:00.335237884 +0000
@@ -1,4 +1,5 @@
 import jwt from "jsonwebtoken";
+import { v4 as uuidv4 } from "uuid";
 
 export interface TokenPayload {
   userId: string;
@@ -13,8 +14,21 @@
   private readonly refreshTokenExpiry: any;
 
   constructor() {
-    this.jwtSecret = process.env.JWT_SECRET || "aurapost-access-secret-key-change-me-in-prod";
-    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "aurapost-refresh-secret-key-change-me-in-prod";
+    // SECURITY FIX (Phase 1 — Critical Issue #6): hardcoded default secrets removed.
+    // Booting with a publicly-known secret allows anyone to forge valid access/refresh
+    // tokens. We now fail fast instead of silently running insecurely.
+    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
+      throw new Error(
+        "FATAL: JWT_SECRET and JWT_REFRESH_SECRET environment variables must be set. " +
+        "Refusing to start with an insecure default secret. Generate strong random values " +
+        "(e.g. `openssl rand -base64 48`) and set them before starting the server."
+      );
+    }
+    if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
+      throw new Error("FATAL: JWT_SECRET and JWT_REFRESH_SECRET must not be identical.");
+    }
+    this.jwtSecret = process.env.JWT_SECRET;
+    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
     this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || "15m"; // 15 minutes
     this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || "7d"; // 7 days
   }
@@ -22,12 +36,24 @@
   public generateAccessToken(payload: TokenPayload): string {
     return jwt.sign(payload, this.jwtSecret, {
       expiresIn: this.accessTokenExpiry,
+      jwtid: uuidv4(),
     });
   }
 
+  /**
+   * BUG FIX (found via live PostgreSQL boot testing, POSTGRESQL_CUTOVER_REPORT.md):
+   * jwt.sign() is deterministic for an identical payload + identical secret +
+   * identical `iat`/`exp` (both derived from the current second). Two calls to
+   * generateRefreshToken() with the same {userId, email, role} within the same
+   * wall-clock second (e.g. login immediately followed by /api/auth/refresh)
+   * previously produced a byte-for-byte identical token string, which then
+   * violated refresh_tokens.token's UNIQUE constraint on insert. A random jti
+   * (JWT ID) claim guarantees uniqueness regardless of timing.
+   */
   public generateRefreshToken(payload: TokenPayload): string {
     return jwt.sign(payload, this.jwtRefreshSecret, {
       expiresIn: this.refreshTokenExpiry,
+      jwtid: uuidv4(),
     });
   }
 
```
