import type { User } from "../models/User";
import { AuthProvider, UserStatus } from "../models/User";
import { UserRepository } from "./UserRepository";
import { DatabaseManager } from "../../db";

/**
 * PHASE 2 — POSTGRESQL CUTOVER
 * Replaces the former SqliteUserRepository, which reached into
 * DatabaseManager's raw sql.js handle via getDatabase() and ran its own
 * prepare/bind/step/free calls directly. That escape hatch is gone — this
 * repository now goes through DatabaseManager's public dbGet/dbAll/dbRun
 * helpers, which are backed by a real, pooled PostgreSQL connection.
 * The UserRepository interface (findById/findByEmail/create/update/delete/
 * exists/list) is unchanged, so AuthService and everything else that depends
 * on it needed no changes.
 */
export class PostgresUserRepository implements UserRepository {
  private async db() {
    return DatabaseManager.getInstance();
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      passwordHash: row.password_hash,
      avatar: row.avatar || undefined,
      authProvider: row.auth_provider as AuthProvider,
      providerId: row.provider_id || undefined,
      emailVerified: row.email_verified === 1,
      role: row.role,
      status: row.status as UserStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
    };
  }

  async findById(id: string): Promise<User | null> {
    const db = await this.db();
    const row = await db.dbGet("SELECT * FROM users WHERE id = $id LIMIT 1", { $id: id });
    return row ? this.mapRowToUser(row) : null;
  }

  /**
   * PHASE 2 NOTE: case-insensitive email matching (previously SQLite's
   * COLLATE NOCASE on the column) is done here with LOWER() on both sides,
   * matching the functional unique index defined in schema.sql
   * (idx_users_email_lower). See POSTGRESQL_CUTOVER_REPORT.md.
   */
  async findByEmail(email: string): Promise<User | null> {
    const db = await this.db();
    const row = await db.dbGet("SELECT * FROM users WHERE LOWER(email) = LOWER($email) LIMIT 1", { $email: email });
    return row ? this.mapRowToUser(row) : null;
  }

  async create(user: User): Promise<User> {
    const db = await this.db();
    await db.dbRun(
      `INSERT INTO users (
        id, email, password_hash, first_name, last_name, avatar,
        auth_provider, provider_id, role, status, email_verified,
        last_login_at, created_at, updated_at
      ) VALUES (
        $id, $email, $password_hash, $first_name, $last_name, $avatar,
        $auth_provider, $provider_id, $role, $status, $email_verified,
        $last_login_at, $created_at, $updated_at
      )`,
      {
        $id: user.id,
        $email: user.email,
        $password_hash: user.passwordHash,
        $first_name: user.firstName,
        $last_name: user.lastName,
        $avatar: user.avatar || null,
        $auth_provider: user.authProvider,
        $provider_id: user.providerId || null,
        $role: user.role,
        $status: user.status,
        $email_verified: user.emailVerified ? 1 : 0,
        $last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        $created_at: user.createdAt.toISOString(),
        $updated_at: user.updatedAt.toISOString(),
      }
    );
    return user;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };

    const db = await this.db();
    await db.dbRun(
      `UPDATE users SET
        email = $email,
        password_hash = $password_hash,
        first_name = $first_name,
        last_name = $last_name,
        avatar = $avatar,
        auth_provider = $auth_provider,
        provider_id = $provider_id,
        role = $role,
        status = $status,
        email_verified = $email_verified,
        last_login_at = $last_login_at,
        updated_at = $updated_at
      WHERE id = $id`,
      {
        $id: id,
        $email: updated.email,
        $password_hash: updated.passwordHash,
        $first_name: updated.firstName,
        $last_name: updated.lastName,
        $avatar: updated.avatar || null,
        $auth_provider: updated.authProvider,
        $provider_id: updated.providerId || null,
        $role: updated.role,
        $status: updated.status,
        $email_verified: updated.emailVerified ? 1 : 0,
        $last_login_at: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
        $updated_at: updated.updatedAt.toISOString(),
      }
    );
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    await db.dbRun("DELETE FROM users WHERE id = $id", { $id: id });
  }

  async exists(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return user !== null;
  }

  async list(): Promise<User[]> {
    const db = await this.db();
    const rows = await db.dbAll("SELECT * FROM users ORDER BY created_at DESC");
    return rows.map((row) => this.mapRowToUser(row));
  }
}
