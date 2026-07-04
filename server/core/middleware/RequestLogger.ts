import { Request, Response, NextFunction } from "express";
import { Logger } from "../logger/Logger";

export function RequestLogger(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  Logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  next();
}