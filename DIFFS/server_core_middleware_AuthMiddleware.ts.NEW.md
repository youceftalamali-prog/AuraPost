# New File: server/core/middleware/AuthMiddleware.ts

This file did not exist in the original upload. Full contents:

```ts
import { Request, Response, NextFunction } from "express";
import { JwtService, TokenPayload } from "../../identity/services/JwtService";
import { DatabaseManager } from "../../db";

/**
 * SECURITY FIX (Phase 1 — Critical Issue #1: Broken Access Control)
 *
 * Previously, every business API route (workspace, billing, shopify, products,
 * intelligence, content, publishing, etc.) trusted a client-supplied
 * `workspaceId` query/body parameter with no verification that the caller was
 * even logged in, let alone that they owned that workspace. This allowed any
 * unauthenticated request to read/write any workspace's data (IDOR).
 *
 * This middleware:
 *   1. requireAuth      - rejects any request without a valid, unexpired JWT.
 *   2. requireWorkspaceAccess - resolves the effective workspaceId from the
 *      authenticated user's own memberships, and rejects (403) any attempt to
 *      access a workspaceId the user is not a member of. If no workspaceId is
 *      supplied, the user's own workspace is used automatically - the
 *      "default-workspace" fallback string literal is no longer accepted
 *      blindly from client input.
 */

const jwtService = new JwtService();

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header. Expected 'Bearer <token>'." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Missing access token." });
  }

  try {
    const payload = jwtService.verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
}

/**
 * Must run after requireAuth. Reads workspaceId from query, body, or params
 * (in that order). If none is supplied, resolves the caller's own workspace.
 * If one IS supplied, verifies membership before allowing the request through.
 * The resolved & verified workspaceId is attached to req as `req.workspaceId`.
 */
export async function requireWorkspaceAccess(req: AuthenticatedRequest & { workspaceId?: string }, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required before workspace access can be authorized." });
  }

  const requestedWorkspaceId =
    (req.query.workspaceId as string) ||
    (req.body && (req.body as any).workspaceId) ||
    (req.params && (req.params as any).workspaceId) ||
    undefined;

  try {
    const db = await DatabaseManager.getInstance();

    if (!requestedWorkspaceId) {
      // No workspace explicitly requested: resolve (or provision) the caller's own workspace.
      req.workspaceId = await db.ensureUserHasWorkspace(req.user.userId);
      return next();
    }

    const isMember = await db.isWorkspaceMember(req.user.userId, requestedWorkspaceId);
    if (!isMember) {
      return res.status(403).json({ error: "You do not have access to this workspace." });
    }

    req.workspaceId = requestedWorkspaceId;
    return next();
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to authorize workspace access." });
  }
}

/**
 * Convenience wrapper combining requireAuth + requireWorkspaceAccess, and — critically —
 * overwriting req.query.workspaceId / req.body.workspaceId with the verified value so that
 * every pre-existing route handler (which reads `req.query.workspaceId || "default-workspace"`)
 * automatically operates on the authorized workspace instead of raw, unverified client input.
 * This closes the IDOR hole without requiring every route handler to be rewritten individually.
 */
export function requireAuthAndWorkspace() {
  return [
    requireAuth,
    async (req: AuthenticatedRequest & { workspaceId?: string }, res: Response, next: NextFunction) => {
      await requireWorkspaceAccessInternal(req, res, next);
    },
  ];
}

async function requireWorkspaceAccessInternal(
  req: AuthenticatedRequest & { workspaceId?: string },
  res: Response,
  next: NextFunction
) {
  await requireWorkspaceAccess(req, res, () => {
    if (req.workspaceId) {
      if (req.query) (req.query as any).workspaceId = req.workspaceId;
      if (req.body && typeof req.body === "object") (req.body as any).workspaceId = req.workspaceId;
    }
    next();
  });
}
```
