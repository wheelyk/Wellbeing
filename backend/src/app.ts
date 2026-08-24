import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { authRouter } from "./routes/auth";
import { moodLogsRouter } from "./routes/moodLogs";
import { habitsRouter } from "./routes/habits";
import { habitLogsRouter } from "./routes/habitLogs";
import { medicationsRouter } from "./routes/medications";
import { medicationLogsRouter } from "./routes/medicationLogs";
import { symptomsRouter } from "./routes/symptoms";
import { symptomLogsRouter } from "./routes/symptomLogs";
import { usersRouter } from "./routes/users";
import { dashboardRouter } from "./routes/dashboard";
import { historyRouter } from "./routes/history";
import { trendsRouter } from "./routes/trends";
import { exportRouter } from "./routes/export";
import { pushRouter } from "./routes/push";
import { categoriesRouter } from "./routes/categories";
import { categoryLogsRouter } from "./routes/categoryLogs";
import { adminCategoriesRouter } from "./routes/adminCategories";
import { remindersRouter } from "./routes/reminders";
import { requireAuth } from "./middleware/requireAuth";
import { requireAdmin } from "./middleware/requireAdmin";
import { errorHandler } from "./middleware/errorHandler";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export function createApp(): Express {
  const app = express();

  // Railway (this app's production host, see docs/log/07-deployment.md) sits in front of this
  // process as a reverse proxy - every real request arrives from Railway's own edge, not the
  // actual client, with the real client IP carried in `X-Forwarded-For` instead. Without this
  // setting, Express ignores that header entirely and `req.ip` resolves to the same constant
  // value (Railway's own internal connecting address) for every single request regardless of
  // who's actually making it - confirmed directly: two requests with different
  // `X-Forwarded-For` values produced an *identical* `req.ip` before this fix. Since
  // `authRateLimiter` (rateLimiter.ts) keys its per-IP bucket off `req.ip`, this collapsed every
  // real user's register/login/change-password attempts into one shared 10-per-15-minutes
  // bucket for the entire production userbase combined - a handful of requests from anyone
  // (or nobody malicious at all, just ordinary concurrent traffic) could lock every user out of
  // authenticating for 15 minutes, and the limiter never actually isolated a specific
  // bad actor's own attempts from everyone else's either. `1` matches Railway's documented
  // single-hop edge topology (trusting exactly one layer of `X-Forwarded-For`, not an
  // unbounded/self-reported chain) - reachable safely because Railway's own edge sanitizes and
  // sets this header itself, a client cannot inject an arbitrary value into it.
  app.set("trust proxy", 1);

  // Sets a standard, safe baseline of security response headers (nosniff, no clickjacking-via-
  // framing, no `X-Powered-By: Express` fingerprint, HSTS, etc.) - defaults only, no per-header
  // tuning, since this is a pure JSON API with no HTML of its own to scope a CSP around.
  app.use(helmet());
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/mood-logs", requireAuth, moodLogsRouter);
  app.use("/api/habits", requireAuth, habitsRouter);
  app.use("/api/habit-logs", requireAuth, habitLogsRouter);
  app.use("/api/medications", requireAuth, medicationsRouter);
  app.use("/api/medication-logs", requireAuth, medicationLogsRouter);
  app.use("/api/symptoms", requireAuth, symptomsRouter);
  app.use("/api/symptom-logs", requireAuth, symptomLogsRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);
  app.use("/api/history", requireAuth, historyRouter);
  app.use("/api/trends", requireAuth, trendsRouter);
  app.use("/api/export", requireAuth, exportRouter);
  app.use("/api/push", requireAuth, pushRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/category-logs", requireAuth, categoryLogsRouter);
  app.use("/api/admin/categories", requireAuth, requireAdmin, adminCategoriesRouter);
  app.use("/api/reminders", requireAuth, remindersRouter);

  // Must be registered last - Express only routes a request to error-handling middleware
  // (recognized by its four-parameter signature) once every earlier layer has either handled
  // the request or passed an error along; anything registered after this would never run for
  // a request that already errored out.
  app.use(errorHandler);

  return app;
}
