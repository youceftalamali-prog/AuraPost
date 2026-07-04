import { Router } from "express";
import { AuthService } from "../services/AuthService";
import { RegisterSchema } from "../validators/Register.validator";
import { LoginSchema } from "../validators/Login.validator";
import { RefreshTokenSchema } from "../validators/RefreshToken.validator";
import { AppError } from "../../core/errors/AppError";

const router = Router();
const authService = new AuthService();

// Helper to parse client IP and user agent info
const getClientContext = (req: any) => {
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
  const userAgent = req.headers["user-agent"] || "Unknown";
  
  // Basic platform parsing or use values passed from client or headers
  const platform = req.headers["sec-ch-ua-platform"] || undefined;
  
  return {
    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : String(ipAddress),
    userAgent,
    platform: platform ? String(platform).replace(/"/g, "") : undefined,
  };
};

// 1. POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const validated = RegisterSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validated.error.flatten().fieldErrors,
      });
    }

    const result = await authService.register(validated.data);
    return res.status(201).json({
      message: "Registration successful",
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
        createdAt: result.user.createdAt,
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Internal server error",
    });
  }
});

// 2. POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const validated = LoginSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validated.error.flatten().fieldErrors,
      });
    }

    const context = getClientContext(req);
    const result = await authService.login(validated.data, context);

    return res.status(200).json({
      message: "Login successful",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
        createdAt: result.user.createdAt,
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Internal server error",
    });
  }
});

// 3. POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    const validated = RefreshTokenSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validated.error.flatten().fieldErrors,
      });
    }

    const context = getClientContext(req);
    const result = await authService.refresh(validated.data.refreshToken, context);

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error: any) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Internal server error",
    });
  }
});

// 4. POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const validated = RefreshTokenSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validated.error.flatten().fieldErrors,
      });
    }

    await authService.logout(validated.data.refreshToken);

    return res.status(200).json({
      message: "Logout successful",
    });
  } catch (error: any) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Internal server error",
    });
  }
});

export default router;
