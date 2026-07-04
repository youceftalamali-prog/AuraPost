import type { User } from "../models/User";

export interface UserRepository {
  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  create(user: User): Promise<User>;

  update(id: string, data: Partial<User>): Promise<User>;

  delete(id: string): Promise<void>;

  exists(email: string): Promise<boolean>;

  list(): Promise<User[]>;
}
