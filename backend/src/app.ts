import express, { Express } from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  return app;
}
