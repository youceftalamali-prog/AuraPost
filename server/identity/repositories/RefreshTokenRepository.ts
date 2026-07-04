import type { RefreshToken } from "../models/RefreshToken";

export interface RefreshTokenRepository {
  findById(id: string): Promise<RefreshToken | null>;

  findByToken(token: string): Promise<RefreshToken | null>;

  create(token: RefreshToken): Promise<RefreshToken>;

  revoke(id: string): Promise<void>;

  revokeAll(userId: string): Promise<void>;

  delete(id: string): Promise<void>;
}