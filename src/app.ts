import express, { type Express } from "express";
import cors from "cors";
import { env } from "./config/env.ts";
import { router } from "./routes/api.routes.ts";
import { favoritesRouter } from "./routes/favorites.routes.ts";
import { historyRouter } from "./routes/history.routes.ts";
import { preferencesRouter } from "./routes/preferences.routes.ts";
import { assistantRouter } from "./routes/assistant.routes.ts";
import { questionnaireRouter } from "./routes/questionnaire.routes.ts";
import { discoveryRouter } from "./routes/discovery.routes.ts";
import { overviewRouter } from "./routes/overview.routes.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.ts";
import { modelStore } from "./services/modelStore.ts";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header means a tool, curl or a health check: always fine.
        if (!origin) {
          callback(null, true);
          return;
        }
        if (env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // A rejected origin is the single most common "it works on my machine"
        // problem once the frontend is deployed, so name the fix in the log.
        console.warn(
          `[cors] Bloqueado: ${origin}\n` +
            `        Agrega esa URL a CORS_ORIGIN en las variables de entorno del servidor.\n` +
            `        Orígenes permitidos ahora: ${env.corsOrigins.join(", ") || "(ninguno)"}`,
        );
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
        "GET  /api/catalog/facets",
        "GET  /api/users",
        "POST /api/users",
        "GET  /api/users/:id",
        "PATCH /api/users/:id/preferences",
        "GET  /api/users/:id/interactions",
        "GET  /api/users/:id/taste",
        "GET  /api/users/:id/sessions",
        "GET  /api/users/:id/favorites",
        "POST /api/users/:id/favorites",
        "POST /api/users/:id/favorites/toggle",
        "DELETE /api/users/:id/favorites/:dishId",
        "GET  /api/users/:id/history",
        "POST /api/users/:id/history",
        "PATCH /api/users/:id/history/:dishId",
        "DELETE /api/users/:id/history/:dishId",
        "GET  /api/users/:id/saved-preferences",
        "PUT  /api/users/:id/saved-preferences",
        "DELETE /api/users/:id/saved-preferences/:key",
        "GET  /api/users/:id/overview",
        "GET  /api/recipes/:slug/allergens",
        "POST /api/recipes/:slug/assistant",
        "POST /api/recipes/:slug/substitute",
        "POST /api/recipes/:slug/adapt",
        "GET  /api/questionnaire",
        "POST /api/questionnaire/recommend",
        "POST /api/discover/by-ingredients",
        "POST /api/planning/meals",
        "POST /api/recommendations",
        "GET  /api/interactions",
        "POST /api/interactions",
      ],
    });
  });

  app.use("/api", router);
  app.use("/api", favoritesRouter);
  app.use("/api", historyRouter);
  app.use("/api", preferencesRouter);
  app.use("/api", assistantRouter);
  app.use("/api", questionnaireRouter);
  app.use("/api", discoveryRouter);
  app.use("/api", overviewRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Train on boot so the first request is already warm.
  modelStore.ensureReady();

  return app;
}
