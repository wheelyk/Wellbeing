import type { CookieOptions, Response } from "express";
import { REFRESH_TOKEN_TTL_SECONDS } from "./jwt";

export const REFRESH_TOKEN_COOKIE = "refreshToken";

// Scoped to /api/auth so the browser only attaches it to auth requests, not every request to
// the API.
//
// sameSite: "none", not "lax" - the frontend (Vercel) and this API (Railway) are genuinely
// different sites, not just different origins on the same domain, so every request between them
// is cross-site. A Lax cookie is only sent on cross-site *top-level navigations* (e.g. following
// a link) - never on a cross-site fetch()/XHR, which is exactly what every apiFetch call and the
// startup rehydrateSession() call are. Confirmed directly (not just reasoned about): with
// sameSite: "lax", a real browser given this app's actual cross-site topology never even stored
// the cookie after login at all (`await page.context().cookies()` came back empty), and a full
// page reload afterward - losing the in-memory access token the same way a real page
// refresh does - landed back on /login every time. That's the bug this fixes: any full reload
// (mobile browsers reclaim backgrounded tabs and reload them far more eagerly than desktop ones
// tend to, which is why this was most visible there, but the underlying cause isn't mobile- or
// Android-specific - it reproduces identically on desktop Chromium given the same cross-site
// setup).
//
// sameSite: "none" requires secure: true unconditionally, even outside production - the two
// attributes aren't independent, a browser rejects a None cookie outright if it isn't also
// Secure. Local dev still works despite running over plain http: Chrome (and Chromium, which is
// what local testing here actually used) treats `localhost` and `127.0.0.1` as secure contexts
// regardless of scheme, specifically so this kind of cookie-security requirement doesn't get in
// the way of local development.
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
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
