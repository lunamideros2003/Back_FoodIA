import { createApp } from "./app.ts";
import { env, isProduction } from "./config/env.ts";
import { closeDb, databaseLabel } from "./db/connection.ts";
import { modelStore } from "./services/modelStore.ts";
import { WARNINGS } from "./deployChecks.ts";
import { startGrpcServer, stopGrpcServer } from "./grpc/server.ts";

const app = createApp();

/**
 * The first boot against an empty Supabase has to create the schema and insert
 * the 40 dishes. That is hundreds of round trips, so it happens BEFORE the
 * port opens: Render waits for the port and never sends a health check in the
 * middle of the seeding. Later boots only run a single COUNT.
 */
try {
  modelStore.ensureReady();
} catch (error) {
  console.error(
    "[db] No se pudo preparar la base de datos:",
    (error as Error).message,
  );
  process.exit(1);
}

const server = app.listen(env.port, () => {
  const stats = modelStore.stats();
  console.log("");
  console.log("  FoodMood IA · API de recomendaciones");
  console.log(`  → http://localhost:${env.port}/api/health`);
  console.log(`  → grpc://localhost:${env.grpcPort} (FoodMoodStatus)`);
  console.log(`  → Base de datos: ${databaseLabel()}`);
  console.log(
    `  → Modelo ${stats.version} | ${stats.dishes} platos | ${stats.observations} observaciones | ${stats.trainingMs} ms`,
  );
  console.log(
    `  → Capa de IA: ${
      env.ai.provider === "local"
        ? "modelo local (offline)"
        : `LLM (${env.ai.provider} · ${env.ai.model})`
    }`,
  );

  // On a hosted platform the silent killers are a missing CORS entry and a
  // database path on an ephemeral filesystem. Both are cheap to notice here
  // and impossible to notice later from the browser.
  const productionWarnings = WARNINGS({
    isProduction,
    corsOrigins: env.corsOrigins,
    hasDatabaseUrl: Boolean(env.databaseUrl),
  });
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
    console.error("[server] Failed to start:", error.message);
    process.exit(1);
  }

  console.log("");
  console.log("  The port is already in use. It is almost always another FoodMood");
  console.log("  process running in a different terminal.");
  console.log("");
  console.log("  Option 1 · close the other terminal");
  console.log("    Press Ctrl+C there and you are done.");
  console.log("");
  console.log("  Option 2 · close it from this terminal");
  console.log(`    Stop-Process -Id (Get-NetTCPConnection -LocalPort ${env.port} -State Listen).OwningProcess -Force`);
  console.log("");
  console.log("  Option 3 · use another port");
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
  if (port > 0) console.log(`  → gRPC layer active on ${port}`);
}).catch((error: Error) => {
  console.warn(`  ! gRPC failed to start: ${error.message}`);
});

function shutdown(signal: string): void {
  console.log(`\n[server] ${signal} received, shutting down...`);
  server.close(() => {
    void stopGrpcServer();
    closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
