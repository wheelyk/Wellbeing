import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";

// Declaration merging: extends Express's own Request type so every route handler downstream
// of this middleware sees `req.userId` as a known, typed property — not an `any` grab-bag.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({
      error: { message: "Missing access token", code: "MISSING_ACCESS_TOKEN" },
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub as string;
    next();
  } catch {
    res.status(401).json({
      error: { message: "Invalid or expired access token", code: "INVALID_ACCESS_TOKEN" },
    });
  }
}
