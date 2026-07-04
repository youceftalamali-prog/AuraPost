import type { RefreshToken } from "../models/RefreshToken";
import { RefreshTokenRepository } from "./RefreshTokenRepository";
import { DatabaseManager } from "../../db";

export class SqliteRefreshTokenRepository implements RefreshTokenRepository {
  private async getDb() {
    const manager = await DatabaseManager.getInstance();
    return manager.getDatabase();
  }

  private async save() {
    const manager = await DatabaseManager.getInstance();
    manager.saveToDisk();
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
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM refresh_tokens WHERE id = $id LIMIT 1");
    stmt.bind({ $id: id });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapRowToRefreshToken(row);
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM refresh_tokens WHERE token = $token LIMIT 1");
    stmt.bind({ $token: token });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapRowToRefreshToken(row);
  }

  async create(token: RefreshToken): Promise<RefreshToken> {
    const db = await this.getDb();
    db.run(
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
    await this.save();
    return token;
  }

  async revoke(id: string): Promise<void> {
    const db = await this.getDb();
    db.run(
      "UPDATE refresh_tokens SET revoked = 1, updated_at = $updated_at WHERE id = $id",
      {
        $id: id,
        $updated_at: new Date().toISOString(),
      }
    );
    await this.save();
  }

  async revokeAll(userId: string): Promise<void> {
    const db = await this.getDb();
    db.run(
      "UPDATE refresh_tokens SET revoked = 1, updated_at = $updated_at WHERE user_id = $user_id",
      {
        $user_id: userId,
        $updated_at: new Date().toISOString(),
      }
    );
    await this.save();
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    db.run("DELETE FROM refresh_tokens WHERE id = $id", { $id: id });
    await this.save();
  }
}
