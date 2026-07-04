import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class JwtService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry: any;
  private readonly refreshTokenExpiry: any;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "aurapost-access-secret-key-change-me-in-prod";
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "aurapost-refresh-secret-key-change-me-in-prod";
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || "15m"; // 15 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || "7d"; // 7 days
  }

  public generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
    });
  }

  public generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry,
    });
  }

  public verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload;
    } catch (error) {
      throw new Error("Invalid or expired access token");
    }
  }

  public verifyRefreshToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.jwtRefreshSecret) as TokenPayload;
    } catch (error) {
      throw new Error("Invalid or expired refresh token");
    }
  }
}
