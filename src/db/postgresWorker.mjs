/**
 * Owns the real database connection and answers the main thread synchronously.
 *
 * The application was built around `node:sqlite`, whose whole API is blocking.
 * Refactoring every route, service and test to `async` would have touched the
 * entire backend for no gain. Instead this worker keeps a normal asynchronous
 * Postgres client and the main thread parks on `Atomics.wait` until the answer
 * is ready. It is not a hot path (tens of queries per request at most) and it
 * lets the whole app move to Supabase without changing a single call site.
 */
import { parentPort, workerData } from "node:worker_threads";

const flag = new Int32Array(workerData.control);
const buffer = new Uint8Array(workerData.data);
const encoder = new TextEncoder();

const config = workerData.config ?? {};
const url = String(config.url ?? "");

/** Lines like `-3 hours` and timestamps are the only types that differ. */
function serialize(payload) {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
}

function send(payload) {
  const text = serialize(payload);
  const bytes = encoder.encode(text);
  if (bytes.length > buffer.length) {
    const fallback = encoder.encode(
      JSON.stringify({
        error: { message: `Respuesta demasiado grande (${bytes.length} bytes).` },
      }),
    );
    buffer.set(fallback, 0);
    Atomics.store(flag, 1, fallback.length);
  } else {
    buffer.set(bytes, 0);
    Atomics.store(flag, 1, bytes.length);
  }
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
}

/* ------------------------------------------------------------------ *
 * PGlite: Postgres compiled to WebAssembly, used for local tests only.
 * ------------------------------------------------------------------ */

async function openPglite(target) {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = target === "pglite://memory" || target === "pglite:" ? undefined : target.slice("pglite:".length);
  const db = new PGlite(dataDir);
  await db.waitReady;

  return {
    async exec(sql) {
      await db.exec(sql);
      return { rows: [], rowCount: 0 };
    },
    async query(sql, params) {
      const result = await db.query(sql, params);
      return {
        rows: result.rows ?? [],
        rowCount: result.affectedRows ?? result.rowCount ?? 0,
      };
    },
    async close() {
      await db.close();
    },
  };
}

/* ------------------------------------------------------------------ *
 * node-postgres: the production driver.
 * ------------------------------------------------------------------ */

function connectionString(raw) {
  try {
    const parsed = new URL(raw);
    // `pg` understands sslmode, but mixing it with an explicit ssl option is
    // the classic source of "self signed certificate" surprises. Supabase
    // always needs TLS, so the URL keeps only the real connection data.
    for (const key of ["sslmode", "pgbouncer", "supa"]) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return raw;
  }
}

const CONNECTION_ERRORS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "08000",
  "08003",
  "08006",
  "08001",
  "57P01",
]);

function isConnectionError(error) {
  return (
    CONNECTION_ERRORS.has(error?.code) ||
    /connection terminated|connection closed|server closed the connection/i.test(
      String(error?.message ?? ""),
    )
  );
}

async function openPostgres() {
  const pg = await import("pg");
  const { Client, types } = pg.default ?? pg;

  // `COUNT(*)` comes back as a string by default (int8). The rest of the code
  // treats totals as numbers, exactly like SQLite did.
  types.setTypeParser(20, (value) => Number(value));

  const useSsl =
    config.ssl !== false && !/localhost|127\.0\.0\.1/.test(config.url);
  const options = {
    connectionString: connectionString(config.url),
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  let client = new Client(options);
  let inTransaction = false;

  async function connect() {
    client = new Client(options);
    await client.connect();
  }

  await connect();

  function noteTransaction(sql) {
    const head = sql.trim().slice(0, 16).toUpperCase();
    if (head.startsWith("BEGIN")) inTransaction = true;
    if (head.startsWith("COMMIT") || head.startsWith("ROLLBACK")) inTransaction = false;
  }

  async function run(sql, params) {
    try {
      return await client.query(sql, params);
    } catch (error) {
      if (inTransaction || !isConnectionError(error)) throw error;
      await client.end().catch(() => {});
      await connect();
      return client.query(sql, params);
    }
  }

  return {
    async exec(sql) {
      noteTransaction(sql);
      await run(sql, undefined);
      return { rows: [], rowCount: 0 };
    },
    async query(sql, params) {
      noteTransaction(sql);
      const result = await run(sql, params);
      return {
        rows: result?.rows ?? [],
        rowCount: result?.rowCount ?? 0,
      };
    },
    async close() {
      await client.end().catch(() => {});
    },
  };
}

/* ------------------------------------------------------------------ *
 * Main loop
 * ------------------------------------------------------------------ */

const connection = url.startsWith("pglite:")
  ? await openPglite(url)
  : await openPostgres();

parentPort.on("message", async (message) => {
  const { id, op, sql, params } = message;
  try {
    if (op === "exec") {
      const result = await connection.exec(sql);
      send({ id, result });
      return;
    }
    const result = await connection.query(sql, params ?? []);
    send({ id, result });
  } catch (error) {
    send({
      id,
      error: {
        message: error?.message ?? String(error),
        code: error?.code,
        detail: error?.detail,
      },
    });
  }
});

send({ ready: true, driver: url.startsWith("pglite:") ? "pglite" : "postgres" });

process.on("exit", () => {
  void connection.close();
});
