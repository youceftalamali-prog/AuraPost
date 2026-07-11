# Deleted File: server/identity/repositories/SqliteSessionRepository.ts

This file existed in the original upload and was removed. Original content preserved for the audit trail:

```
import type { Session } from "../models/Session";
import { SessionRepository } from "./SessionRepository";
import { DatabaseManager } from "../../db";

export class SqliteSessionRepository implements SessionRepository {
  private async getDb() {
    const manager = await DatabaseManager.getInstance();
    return manager.getDatabase();
  }

  private async save() {
    const manager = await DatabaseManager.getInstance();
    manager.saveToDisk();
  }

  private mapRowToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      refreshTokenId: row.refresh_token_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      device: row.device || undefined,
      platform: row.platform || undefined,
      browser: row.browser || undefined,
      isActive: row.is_active === 1,
      lastActivityAt: new Date(row.last_activity_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async findById(id: string): Promise<Session | null> {
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM sessions WHERE id = $id LIMIT 1");
    stmt.bind({ $id: id });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapRowToSession(row);
  }

  async findByUser(userId: string): Promise<Session[]> {
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM sessions WHERE user_id = $user_id ORDER BY created_at DESC");
    stmt.bind({ $user_id: userId });
    const sessions: Session[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      sessions.push(this.mapRowToSession(row));
    }
    stmt.free();
    return sessions;
  }

  async create(session: Session): Promise<Session> {
    const db = await this.getDb();
    db.run(
      `INSERT INTO sessions (
        id, user_id, refresh_token_id, ip_address, user_agent,
        device, platform, browser, is_active, last_activity_at,
        created_at, updated_at
      ) VALUES (
        $id, $user_id, $refresh_token_id, $ip_address, $user_agent,
        $device, $platform, $browser, $is_active, $last_activity_at,
        $created_at, $updated_at
      )`,
      {
        $id: session.id,
        $user_id: session.userId,
        $refresh_token_id: session.refreshTokenId,
        $ip_address: session.ipAddress,
        $user_agent: session.userAgent,
        $device: session.device || null,
        $platform: session.platform || null,
        $browser: session.browser || null,
        $is_active: session.isActive ? 1 : 0,
        $last_activity_at: session.lastActivityAt.toISOString(),
        $created_at: session.createdAt.toISOString(),
        $updated_at: session.updatedAt.toISOString(),
      }
    );
    await this.save();
    return session;
  }

  async update(id: string, data: Partial<Session>): Promise<Session> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Session with id ${id} not found`);
    }

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };

    const db = await this.getDb();
    db.run(
      `UPDATE sessions SET
        user_id = $user_id,
        refresh_token_id = $refresh_token_id,
        ip_address = $ip_address,
        user_agent = $user_agent,
        device = $device,
        platform = $platform,
        browser = $browser,
        is_active = $is_active,
        last_activity_at = $last_activity_at,
        updated_at = $updated_at
      WHERE id = $id`,
      {
        $id: id,
        $user_id: updated.userId,
        $refresh_token_id: updated.refreshTokenId,
        $ip_address: updated.ipAddress,
        $user_agent: updated.userAgent,
        $device: updated.device || null,
        $platform: updated.platform || null,
        $browser: updated.browser || null,
        $is_active: updated.isActive ? 1 : 0,
        $last_activity_at: updated.lastActivityAt.toISOString(),
        $updated_at: updated.updatedAt.toISOString(),
      }
    );
    await this.save();
    return updated;
  }

  async deactivate(id: string): Promise<void> {
    const db = await this.getDb();
    db.run("UPDATE sessions SET is_active = 0, updated_at = $updated_at WHERE id = $id", {
      $id: id,
      $updated_at: new Date().toISOString()
    });
    await this.save();
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    db.run("DELETE FROM sessions WHERE id = $id", { $id: id });
    await this.save();
  }
}
```
