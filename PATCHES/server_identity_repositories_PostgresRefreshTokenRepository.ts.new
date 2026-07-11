import type { RefreshToken } from "../models/RefreshToken";
import { RefreshTokenRepository } from "./RefreshTokenRepository";
import { DatabaseManager } from "../../db";

/**
 * PHASE 2 — POSTGRESQL CUTOVER
 * Replaces the former SqliteRefreshTokenRepository (see
 * PostgresUserRepository.ts for the full rationale — identical pattern
 * applied here).
 */
export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  private async db() {
    return DatabaseManager.getInstance();
  }

  private mapRowToRefreshToken(row: any): RefreshToken {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      revoked: row.revoked === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async findById(id: string): Promise<RefreshToken | null> {
    const db = await this.db();
    const row = await db.dbGet("SELECT * FROM refresh_tokens WHERE id = $id LIMIT 1", { $id: id });
    return row ? this.mapRowToRefreshToken(row) : null;
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const db = await this.db();
    const row = await db.dbGet("SELECT * FROM refresh_tokens WHERE token = $token LIMIT 1", { $token: token });
    return row ? this.mapRowToRefreshToken(row) : null;
  }

  async create(token: RefreshToken): Promise<RefreshToken> {
    const db = await this.db();
    await db.dbRun(
      `INSERT INTO refresh_tokens (
        id, user_id, token, expires_at, revoked, created_at, updated_at
      ) VALUES (
        $id, $user_id, $token, $expires_at, $revoked, $created_at, $updated_at
      )`,
      {
        $id: token.id,
        $user_id: token.userId,
        $token: token.token,
        $expires_at: token.expiresAt.toISOString(),
        $revoked: token.revoked ? 1 : 0,
        $created_at: token.createdAt.toISOString(),
        $updated_at: token.updatedAt.toISOString(),
      }
    );
    return token;
  }

  async revoke(id: string): Promise<void> {
    const db = await this.db();
    await db.dbRun(
      "UPDATE refresh_tokens SET revoked = 1, updated_at = $updated_at WHERE id = $id",
      { $id: id, $updated_at: new Date().toISOString() }
    );
  }

  async revokeAll(userId: string): Promise<void> {
    const db = await this.db();
    await db.dbRun(
      "UPDATE refresh_tokens SET revoked = 1, updated_at = $updated_at WHERE user_id = $user_id",
      { $user_id: userId, $updated_at: new Date().toISOString() }
    );
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    await db.dbRun("DELETE FROM refresh_tokens WHERE id = $id", { $id: id });
  }
}
