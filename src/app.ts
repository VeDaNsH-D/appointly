import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/error-handler";
import { NotFoundError } from "./errors/app-error";

export function createApp(): Express {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // API router mounted under /api/v1 and alias /api
  app.use("/api/v1", apiRouter);
  app.use("/api", apiRouter);

  // Catch-all 404 handler for undefined routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Endpoint ${req.method} ${req.originalUrl} not found`));
  });

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}
