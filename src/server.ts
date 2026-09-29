import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { closeDb } from "./db/connection.ts";
import { modelStore } from "./services/modelStore.ts";

const app = createApp();

const server = app.listen(env.port, () => {
  const stats = modelStore.stats();
  console.log("");
  console.log("  FoodMood IA · API de recomendaciones");
  console.log(`  → http://localhost:${env.port}/api/health`);
  console.log(`  → Base de datos: ${env.databaseFile}`);
  console.log(
    `  → Modelo ${stats.version} | ${stats.dishes} platos | ${stats.observations} observaciones | ${stats.trainingMs} ms`,
  );
  console.log(
    `  → Capa de IA: ${env.ai.provider === "openai" ? `LLM (${env.ai.model})` : "modelo local (offline)"}`,
  );
  console.log("");
});

function shutdown(signal: string): void {
  console.log(`\n[server] ${signal} recibido, cerrando...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
