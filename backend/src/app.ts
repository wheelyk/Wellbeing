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
import { historyRouter } from "./routes/history";
import { requireAuth } from "./middleware/requireAuth";

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
  app.use("/api/history", requireAuth, historyRouter);

  return app;
}
