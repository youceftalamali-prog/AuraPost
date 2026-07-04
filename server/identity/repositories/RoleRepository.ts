import type { Role } from "../models/Role";

export interface RoleRepository {
  findById(id: string): Promise<Role | null>;

  findByName(name: string): Promise<Role | null>;

  create(role: Role): Promise<Role>;

  update(id: string, data: Partial<Role>): Promise<Role>;

  delete(id: string): Promise<void>;

  list(): Promise<Role[]>;
}