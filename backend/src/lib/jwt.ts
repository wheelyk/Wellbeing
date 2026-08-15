import "dotenv/config";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

function requireSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireSecret("JWT_ACCESS_SECRET"), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireSecret("JWT_REFRESH_SECRET"), {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}
