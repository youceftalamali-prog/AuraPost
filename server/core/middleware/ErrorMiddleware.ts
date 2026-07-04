import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

export function ErrorMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: error.details,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
}