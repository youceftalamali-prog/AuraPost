export interface Permission {
  id: string;

  name: string;

  description: string;

  resource: string;

  action: string;

  createdAt: Date;

  updatedAt: Date;
}