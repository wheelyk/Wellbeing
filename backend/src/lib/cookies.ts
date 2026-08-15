import type { CookieOptions, Response } from "express";
import { REFRESH_TOKEN_TTL_SECONDS } from "./jwt";

export const REFRESH_TOKEN_COOKIE = "refreshToken";

// Scoped to /api/auth so the browser only attaches it to auth requests, not every request
// to the API. secure is skipped outside production because local dev runs over plain http,
// where a Secure cookie would silently never be sent.
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/auth",
};

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE_OPTIONS);
}
