import { Worker } from "node:worker_threads";
import { toPostgresSql } from "./postgresSql.ts";

export interface PostgresOptions {
  /** `postgresql://…` for Supabase or `pglite://memory` for local tests. */
  url: string;
  ssl?: boolean;
  /** How long a single statement may take before the process gives up. */
  timeoutMs?: number;
  /** Room for the JSON answer. The catalogue query is the biggest one. */
  bufferBytes?: number;
}

interface QueryResult {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
}

interface WorkerReply {
  ready?: boolean;
  driver?: "postgres" | "pglite";
  result?: QueryResult;
  error?: { message: string; code?: string; detail?: string };
}

class PostgresStatement {
  private db: PostgresDatabase;
  private sql: string;

  constructor(db: PostgresDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
    return this.db.runStatement(this.sql, params);
  }

  get(...params: unknown[]): unknown {
    return this.db.getStatement(this.sql, params);
  }

  all(...params: unknown[]): unknown[] {
    return this.db.allStatement(this.sql, params);
  }
}

/**
 * A `node:sqlite`-shaped facade over Postgres. `prepare().run/get/all` and
 * `exec()` behave exactly like the synchronous SQLite API the rest of the
 * backend already uses, so services and tests do not need to change.
 */
export class PostgresDatabase {
  readonly driver: "postgres" | "pglite";

  #worker: Worker;
  #flag: Int32Array;
  #buffer: Uint8Array;
  #decoder = new TextDecoder();
  #seq = 0;
  #timeoutMs: number;
  #closed = false;
  #workerError: Error | null = null;

  constructor(options: PostgresOptions) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const bufferBytes = options.bufferBytes ?? 32 * 1024 * 1024;

    const control = new SharedArrayBuffer(16);
    const data = new SharedArrayBuffer(bufferBytes);
    this.#flag = new Int32Array(control);
    this.#buffer = new Uint8Array(data);
    this.#timeoutMs = timeoutMs;

    this.#worker = new Worker(new URL("./postgresWorker.mjs", import.meta.url), {
      workerData: {
        control,
        data,
        config: { url: options.url, ssl: options.ssl },
      },
    });
    this.#worker.on("error", (error: Error) => {
      this.#workerError = error;
    });

    const ready = Atomics.wait(this.#flag, 0, 0, timeoutMs);
    if (ready === "timed-out") {
      void this.#worker.terminate();
      const detail = this.#workerError ? `: ${this.#workerError.message}` : "";
      throw new Error(
        `La conexión a Postgres no respondió en ${timeoutMs} ms${detail}. Revisa DATABASE_URL.`,
      );
    }

    const payload = this.#read() as WorkerReply;
    if (payload.error) {
      void this.#worker.terminate();
      throw new Error(`No se pudo conectar a Postgres: ${payload.error.message}`);
    }

    this.driver = payload.driver ?? "postgres";
  }

  exec(sql: string): void {
    const translated = toPostgresSql(sql);
    if (!translated.trim()) return;
    this.#call("exec", translated, []);
  }

  prepare(sql: string): PostgresStatement {
    return new PostgresStatement(this, sql);
  }

  runStatement(sql: string, params: unknown[]): { changes: number; lastInsertRowid: number } {
    const translated = toPostgresSql(sql);
    if (!translated.trim()) return { changes: 0, lastInsertRowid: 0 };

    const result = this.#call("run", translated, params);
    const rows = result.rows ?? [];
    const inserted = /\bRETURNING\b/i.test(translated) ? rows[0]?.id : undefined;

    return {
      changes: Number(result.rowCount ?? 0),
      lastInsertRowid: Number(inserted ?? 0),
    };
  }

  getStatement(sql: string, params: unknown[]): unknown {
    const translated = toPostgresSql(sql);
    if (!translated.trim()) return undefined;
    return this.#call("get", translated, params).rows?.[0];
  }

  allStatement(sql: string, params: unknown[]): unknown[] {
    const translated = toPostgresSql(sql);
    if (!translated.trim()) return [];
    return this.#call("all", translated, params).rows ?? [];
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    void this.#worker.terminate();
  }

  #read(): WorkerReply {
    const length = Atomics.load(this.#flag, 1);
    const text = this.#decoder.decode(this.#buffer.subarray(0, length));
    return JSON.parse(text) as WorkerReply;
  }

  #call(
    op: "exec" | "run" | "get" | "all",
    sql: string,
    params: unknown[],
  ): QueryResult {
    if (this.#closed) throw new Error("La conexión a Postgres ya está cerrada.");

    this.#seq += 1;
    Atomics.store(this.#flag, 0, 0);
    this.#worker.postMessage({ id: this.#seq, op, sql, params });

    const status = Atomics.wait(this.#flag, 0, 0, this.#timeoutMs);
    if (status === "timed-out") {
      this.#closed = true;
      void this.#worker.terminate();
      throw new Error(`Postgres no respondió en ${this.#timeoutMs} ms.`);
    }

    const payload = this.#read();
    if (payload.error) {
      const error = new Error(payload.error.message) as Error & { code?: string };
      error.code = payload.error.code;
      throw error;
    }

    return payload.result ?? {};
  }
}

export function createPostgresDatabase(options: PostgresOptions): PostgresDatabase {
  return new PostgresDatabase(options);
}
