import express, { type Express } from "express";
import cors from "cors";
import { env } from "./config/env.ts";
import { router } from "./routes/api.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.ts";
import { modelStore } from "./services/modelStore.ts";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/tooling requests (no Origin header) and configured frontends.
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origen bloqueado por CORS: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "256kb" }));

  app.get("/", (_req, res) => {
    res.json({
      name: "FoodMood IA API",
      docs: "/api/health",
      endpoints: [
        "GET  /api/health",
        "GET  /api/ai/stats",
        "POST /api/ai/retrain",
        "GET  /api/moods",
        "GET  /api/moods/:key/summary",
        "GET  /api/categories",
        "GET  /api/dishes",
        "GET  /api/dishes/:slug",
        "GET  /api/dishes/:id/similar",
        "GET  /api/users",
        "POST /api/users",
        "GET  /api/users/:id",
        "PATCH /api/users/:id/preferences",
        "GET  /api/users/:id/interactions",
        "GET  /api/users/:id/taste",
        "GET  /api/users/:id/sessions",
        "POST /api/recommendations",
        "GET  /api/interactions",
        "POST /api/interactions",
      ],
    });
  });

  app.use("/api", router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Train on boot so the first request is already warm.
  modelStore.ensureReady();

  return app;
}
