import { v4 as uuidv4 } from "uuid";
import type { User } from "../models/User";
import { AuthProvider, UserStatus } from "../models/User";
import type { Session } from "../models/Session";
import type { RefreshToken } from "../models/RefreshToken";
import { PostgresUserRepository } from "../repositories/PostgresUserRepository";
import { PostgresSessionRepository } from "../repositories/PostgresSessionRepository";
import { PostgresRefreshTokenRepository } from "../repositories/PostgresRefreshTokenRepository";
import { PasswordService } from "./PasswordService";
import { JwtService } from "./JwtService";
import { AppError } from "../../core/errors/AppError";
import type { RegisterDto } from "../dto/Register.dto";
import type { LoginDto } from "../dto/Login.dto";
import { DatabaseManager } from "../../db";

export class AuthService {
  private userRepository: PostgresUserRepository;
  private sessionRepository: PostgresSessionRepository;
  private refreshTokenRepository: PostgresRefreshTokenRepository;
  private passwordService: PasswordService;
  private jwtService: JwtService;

  constructor() {
    this.userRepository = new PostgresUserRepository();
    this.sessionRepository = new PostgresSessionRepository();
    this.refreshTokenRepository = new PostgresRefreshTokenRepository();
    this.passwordService = new PasswordService();
    this.jwtService = new JwtService();
  }

  public async register(dto: RegisterDto): Promise<{ user: User }> {
    if (dto.password !== dto.confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }

    const emailLower = dto.email.toLowerCase().trim();
    const existingUser = await this.userRepository.findByEmail(emailLower);
    if (existingUser) {
      throw new AppError("A user with this email address already exists", 409);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const newUser: User = {
      id: uuidv4(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: emailLower,
      passwordHash: passwordHash,
      authProvider: AuthProvider.EMAIL,
      emailVerified: false,
      role: "user",
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const createdUser = await this.userRepository.create(newUser);

    // SECURITY FIX (Phase 1): every user must have an explicit, auditable workspace
    // membership row. Without this, workspace-level authorization cannot be enforced.
    const db = await DatabaseManager.getInstance();
    await db.ensureUserHasWorkspace(createdUser.id);

    return { user: createdUser };
  }

  public async login(
    dto: LoginDto,
    context: { ipAddress: string; userAgent: string; device?: string; platform?: string; browser?: string }
  ): Promise<{ user: User; accessToken: string; refreshToken: string; session: Session }> {
    const emailLower = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(emailLower);
    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(`Your account is currently ${user.status}`, 403);
    }

    const isPasswordValid = await this.passwordService.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError("Invalid email or password", 401);
    }

    // Update user's last login
    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    // SECURITY FIX (Phase 1): migrate pre-existing users (created before this fix)
    // to have an explicit workspace membership row.
    const db = await DatabaseManager.getInstance();
    await db.ensureUserHasWorkspace(user.id);

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshTokenString = this.jwtService.generateRefreshToken(payload);

    // Save refresh token to db
    const refreshTokenId = uuidv4();
    const expiryDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
    const newRefreshToken: RefreshToken = {
      id: refreshTokenId,
      userId: user.id,
      token: refreshTokenString,
      expiresAt: new Date(Date.now() + expiryDuration),
      revoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.refreshTokenRepository.create(newRefreshToken);

    // Save session to db
    const newSession: Session = {
      id: uuidv4(),
      userId: user.id,
      refreshTokenId: refreshTokenId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      device: context.device,
      platform: context.platform,
      browser: context.browser,
      isActive: true,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const createdSession = await this.sessionRepository.create(newSession);

    return {
      user,
      accessToken,
      refreshToken: refreshTokenString,
      session: createdSession,
    };
  }

  public async refresh(
    refreshTokenString: string,
    context: { ipAddress: string; userAgent: string; device?: string; platform?: string; browser?: string }
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Verify token using jwt
    const payload = this.jwtService.verifyRefreshToken(refreshTokenString);

    // 2. Look up refresh token in db
    const storedToken = await this.refreshTokenRepository.findByToken(refreshTokenString);
    if (!storedToken || storedToken.revoked || new Date() > storedToken.expiresAt) {
      throw new AppError("Invalid, expired or revoked refresh token", 401);
    }

    // 3. Find User
    const user = await this.userRepository.findById(payload.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError("User is inactive or no longer exists", 401);
    }

    // 4. Update the stored token / session activities if needed, or rotate tokens
    // Let's generate a new access token
    const newPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const newAccessToken = this.jwtService.generateAccessToken(newPayload);

    // If we want token rotation, we can generate a new refresh token and revoke the old one:
    const newRefreshTokenString = this.jwtService.generateRefreshToken(newPayload);

    // Revoke old refresh token
    await this.refreshTokenRepository.revoke(storedToken.id);

    // Create a new refresh token
    const newRefreshTokenId = uuidv4();
    const expiryDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
    const newRefreshToken: RefreshToken = {
      id: newRefreshTokenId,
      userId: user.id,
      token: newRefreshTokenString,
      expiresAt: new Date(Date.now() + expiryDuration),
      revoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.refreshTokenRepository.create(newRefreshToken);

    // Create a new session or update existing session linked to the old token
    // We can just log a new session
    const newSession: Session = {
      id: uuidv4(),
      userId: user.id,
      refreshTokenId: newRefreshTokenId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      device: context.device,
      platform: context.platform,
      browser: context.browser,
      isActive: true,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.sessionRepository.create(newSession);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenString,
    };
  }

  public async logout(refreshTokenString: string): Promise<void> {
    const storedToken = await this.refreshTokenRepository.findByToken(refreshTokenString);
    if (!storedToken) {
      throw new AppError("Refresh token not found", 404);
    }

    // Revoke refresh token
    await this.refreshTokenRepository.revoke(storedToken.id);

    // Deactivate associated sessions if possible
    // We can search for sessions with storedToken.id and deactivate them
    const userSessions = await this.sessionRepository.findByUser(storedToken.userId);
    const sessionToDeactivate = userSessions.find(s => s.refreshTokenId === storedToken.id);
    if (sessionToDeactivate) {
      await this.sessionRepository.deactivate(sessionToDeactivate.id);
    }
  }
}
