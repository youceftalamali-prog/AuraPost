export enum AuthProvider {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  FACEBOOK = "facebook",
}

export enum UserStatus {
  ACTIVE = "active",
  PENDING = "pending",
  SUSPENDED = "suspended",
  DELETED = "deleted",
}

export interface User {
  id: string;

  firstName: string;
  lastName: string;

  email: string;
  passwordHash: string;

  avatar?: string;

  authProvider: AuthProvider;
  providerId?: string;

  emailVerified: boolean;

  role: string;
  status: UserStatus;

  createdAt: Date;
  updatedAt: Date;

  lastLoginAt?: Date;
}
