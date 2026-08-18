import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LIMIT = 10;

// Vitest sets NODE_ENV to "test" automatically for every test run in this project (confirmed
// directly, not assumed). Skipping the limiter entirely in that environment is what keeps the
// rest of this project's test suite - which makes many rapid, legitimate requests against these
// same routes across dozens of test files - from getting spuriously blocked by a limit that only
// makes sense against real, spaced-out traffic.
function skipInTests(): boolean {
  return process.env.NODE_ENV === "test";
}

// A factory, not a single hard-coded instance, so a test can build a second, independent limiter
// with this exact real configuration but without the test-environment skip - proving the actual
// blocking behavior works, without ever touching the real app's own limiter instance (each
// express-rate-limit instance keeps its own separate in-memory hit-count store, so two instances
// never interfere with each other).
export function createAuthRateLimiter(overrides: { skip?: boolean } = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    skip: overrides.skip === undefined ? skipInTests : () => overrides.skip as boolean,
    message: {
      error: { message: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
    },
  });
}

// Applied only to register, login, and change-password (see auth.ts) - the routes where an
// attacker could meaningfully brute-force a genuinely guessable secret (a password). Deliberately
// NOT applied to /refresh or /logout: a refresh token is a long, unguessable signed JWT sitting
// in an httpOnly cookie, not something an attacker can brute-force the way a password can be
// guessed - and, since this project added silent session rehydration, /refresh is now called
// automatically on every page load as well as roughly every 15 minutes during ordinary use.
// Rate-limiting it as tightly as login would risk locking a real, legitimate user out of their
// own normal usage, not just blocking an attacker.
export const authRateLimiter = createAuthRateLimiter();
