import type { Permission } from "../models/Permission";

export interface PermissionRepository {
  findById(id: string): Promise<Permission | null>;

  findByName(name: string): Promise<Permission | null>;

  create(permission: Permission): Promise<Permission>;

  update(id: string, data: Partial<Permission>): Promise<Permission>;

  delete(id: string): Promise<void>;

  list(): Promise<Permission[]>;
}