import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
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
import { requireAuth } from "./middleware/requireAuth";
import { errorHandler } from "./middleware/errorHandler";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export function createApp(): Express {
  const app = express();

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

  // Must be registered last - Express only routes a request to error-handling middleware
  // (recognized by its four-parameter signature) once every earlier layer has either handled
  // the request or passed an error along; anything registered after this would never run for
  // a request that already errored out.
  app.use(errorHandler);

  return app;
}
