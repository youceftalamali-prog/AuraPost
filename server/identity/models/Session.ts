export interface Session {
  id: string;

  userId: string;

  refreshTokenId: string;

  ipAddress: string;

  userAgent: string;

  device?: string;

  platform?: string;

  browser?: string;

  isActive: boolean;

  lastActivityAt: Date;

  createdAt: Date;

  updatedAt: Date;
}