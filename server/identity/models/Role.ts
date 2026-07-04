export interface Role {
  id: string;

  name: string;

  description: string;

  permissions: string[];

  isSystem: boolean;

  createdAt: Date;

  updatedAt: Date;
}