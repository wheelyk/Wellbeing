import "dotenv/config";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — also used as the refresh cookie's maxAge

function requireSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireSecret("JWT_ACCESS_SECRET"), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireSecret("JWT_REFRESH_SECRET"), {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

// Pinning `algorithms: ["HS256"]` explicitly (matching what sign() above always uses) rather
// than relying on jsonwebtoken's own default behavior - defense in depth against algorithm
// confusion, so a verify call can never be tricked into accepting a token signed a different
// way than this app itself ever signs one, regardless of what a future library version's
// default turns out to be.
const VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: ["HS256"] };

export function verifyRefreshToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, requireSecret("JWT_REFRESH_SECRET"), VERIFY_OPTIONS) as jwt.JwtPayload;
}

export function verifyAccessToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, requireSecret("JWT_ACCESS_SECRET"), VERIFY_OPTIONS) as jwt.JwtPayload;
}
