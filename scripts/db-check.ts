/**
 * Prueba la cadena de conexión antes de tocar Render.
 *
 *   $env:DATABASE_URL="postgresql://postgres.PROYECTO:PASSWORD@...pooler.supabase.com:5432/postgres"
 *   npm run db:check
 *
 * Solo lee: no crea ni borra nada. Para crear las tablas y sembrar los platos,
 * después de que esto funcione, ejecuta `npm run seed`.
 */
import { createPostgresDatabase } from "../src/db/postgres.ts";

const url = (process.env.DATABASE_URL ?? "").trim();

if (!url) {
  console.error("Falta DATABASE_URL. Ejemplo:");
  console.error(
    '  $env:DATABASE_URL="postgresql://postgres.PROYECTO:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"',
  );
  process.exit(1);
}

const started = Date.now();

try {
  const db = createPostgresDatabase({
    url,
    ssl: process.env.DATABASE_SSL !== "false",
    timeoutMs: 20_000,
  });

  const row = db.prepare("SELECT current_database() AS name, version() AS version").get() as {
    name: string;
    version: string;
  };

  console.log("Conexión OK en", Date.now() - started, "ms");
  console.log("  Base de datos:", row.name);
  console.log("  Servidor:", row.version.split(",")[0]);

  const tables = db
    .prepare(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = 'public'",
    )
    .get() as { total: number };
  console.log("  Tablas en public:", tables.total);
  if (tables.total === 0) {
    console.log("  (vacía: el backend las crea y siembra al arrancar)");
  }

  db.close();
} catch (error) {
  console.error("No se pudo conectar:", (error as Error).message);
  process.exit(1);
}
