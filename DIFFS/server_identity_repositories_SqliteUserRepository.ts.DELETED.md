# Deleted File: server/identity/repositories/SqliteUserRepository.ts

This file existed in the original upload and was removed. Original content preserved for the audit trail:

```
import type { User } from "../models/User";
import { AuthProvider, UserStatus } from "../models/User";
import { UserRepository } from "./UserRepository";
import { DatabaseManager } from "../../db";

export class SqliteUserRepository implements UserRepository {
  private async getDb() {
    const manager = await DatabaseManager.getInstance();
    return manager.getDatabase();
  }

  private async save() {
    const manager = await DatabaseManager.getInstance();
    manager.saveToDisk();
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
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM users WHERE id = $id LIMIT 1");
    stmt.bind({ $id: id });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapRowToUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM users WHERE email = $email LIMIT 1");
    stmt.bind({ $email: email });
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.mapRowToUser(row);
  }

  async create(user: User): Promise<User> {
    const db = await this.getDb();
    db.run(
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
    await this.save();
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

    const db = await this.getDb();
    db.run(
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
    await this.save();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    db.run("DELETE FROM users WHERE id = $id", { $id: id });
    await this.save();
  }

  async exists(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return user !== null;
  }

  async list(): Promise<User[]> {
    const db = await this.getDb();
    const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
    const users: User[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      users.push(this.mapRowToUser(row));
    }
    stmt.free();
    return users;
  }
}
```
