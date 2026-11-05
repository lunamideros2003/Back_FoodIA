import { createApp } from "./app.ts";
import { env, isProduction } from "./config/env.ts";
import { closeDb } from "./db/connection.ts";
import { modelStore } from "./services/modelStore.ts";
import { WARNINGS } from "./deployChecks.ts";
import { startGrpcServer, stopGrpcServer } from "./grpc/server.ts";

const app = createApp();

const server = app.listen(env.port, () => {
  const stats = modelStore.stats();
  console.log("");
  console.log("  FoodMood IA · API de recomendaciones");
  console.log(`  → http://localhost:${env.port}/api/health`);
  console.log(`  → grpc://localhost:${env.grpcPort} (FoodMoodStatus)`);
  console.log(`  → Base de datos: ${env.databaseFile}`);
  console.log(
    `  → Modelo ${stats.version} | ${stats.dishes} platos | ${stats.observations} observaciones | ${stats.trainingMs} ms`,
  );
  console.log(
    `  → Capa de IA: ${env.ai.provider === "openai" ? `LLM (${env.ai.model})` : "modelo local (offline)"}`,
  );

  // On a hosted platform the silent killers are a missing CORS entry and a
  // database path on an ephemeral filesystem. Both are cheap to notice here
  // and impossible to notice later from the browser.
  const productionWarnings = WARNINGS({ isProduction, corsOrigins: env.corsOrigins });
  if (productionWarnings.length > 0) {
    console.log("");
    for (const warning of productionWarnings) {
      console.log(`  ! ${warning}`);
    }
  }

  console.log("");
});

/**
 * A raw EADDRINUSE stack trace is the most common way to get stuck on day one,
 * so it gets a plain explanation with the command that fixes it.
 */
function handleListenError(error: NodeJS.ErrnoException): void {
  if (error.code !== "EADDRINUSE") {
    console.error("[server] No se pudo iniciar:", error.message);
    process.exit(1);
  }

  console.log("");
  console.log("  El puerto ya está ocupado. Casi siempre es otro FoodMood");
  console.log("  corriendo en otra terminal.");
  console.log("");
  console.log("  Opción 1 · cerrar la otra terminal");
  console.log("    Presiona Ctrl+C ahí y ya está.");
  console.log("");
  console.log("  Opción 2 · cerrarlo desde esta terminal");
  console.log(`    Stop-Process -Id (Get-NetTCPConnection -LocalPort ${env.port} -State Listen).OwningProcess -Force`);
  console.log("");
  console.log("  Opción 3 · usar otro puerto");
  console.log(`    $env:PORT=4100 ; npm run dev`);
  console.log("");
  process.exit(1);
}

server.on("error", handleListenError);

// gRPC lives on its own port and never blocks the REST API: if the port is
// taken the HTTP server keeps serving and only the gRPC line goes silent.
void (env.grpcPort === 0
  ? Promise.resolve(0)
  : startGrpcServer(env.grpcPort)
).then((port) => {
  if (port > 0) console.log(`  → Capa gRPC activa en ${port}`);
}).catch((error: Error) => {
  console.warn(`  ! gRPC no pudo arrancar: ${error.message}`);
});

function shutdown(signal: string): void {
  console.log(`\n[server] ${signal} recibido, cerrando...`);
  server.close(() => {
    void stopGrpcServer();
    closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
