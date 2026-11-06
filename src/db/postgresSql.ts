/**
 * The whole data layer was written for SQLite with its own dialect quirks:
 * `?` placeholders, `INSERT OR IGNORE`, `datetime('now')`. Rewriting every
 * query by hand would be noisy and easy to get wrong, so the Postgres adapter
 * translates each statement just before sending it.
 *
 * The SQLite path never goes through this file: local development and the test
 * suite keep running the exact same SQL they always did.
 */

/** Tables whose primary key is an auto-incrementing `id` in Postgres. */
const ID_TABLES = new Set([
  "users",
  "moods",
  "ingredients",
  "dishes",
  "interactions",
  "recommendation_sessions",
  "recipe_entries",
]);

/** Statements that only make sense in SQLite and are silently skipped. */
const SQLITE_ONLY = /^\s*(PRAGMA\b|DELETE\s+FROM\s+sqlite_sequence\b)/i;

export function isSqliteOnlyStatement(sql: string): boolean {
  return SQLITE_ONLY.test(sql);
}

/**
 * Replaces every `?` that is not inside a string literal, a quoted identifier
 * or a comment with a numbered Postgres placeholder `$1`, `$2`…
 */
function numberPlaceholders(sql: string): string {
  let out = "";
  let index = 0;
  let quote: "'" | '"' | "`" | null = null;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      out += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (quote) {
      out += char;
      if (char === quote) {
        // A doubled quote (`''`) is an escaped quote, not the end of the text.
        if (next === quote) {
          out += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      out += char;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += char;
      continue;
    }

    if (char === "?") {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += char;
  }

  return out;
}

function rewriteInsertOrIgnore(sql: string): string {
  const match = /^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i.exec(sql);
  if (!match) return sql;

  const rest = sql.slice(match[0].length);
  const rewritten = `${match[1]}INSERT INTO${rest}`;
  return /\bON\s+CONFLICT\b/i.test(rewritten)
    ? rewritten
    : `${rewritten.trimEnd()} ON CONFLICT DO NOTHING`;
}

function rewriteInsertOrReplace(sql: string): string {
  const match =
    /^(\s*)INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z_][\w.]*)\s*\(([\s\S]*?)\)\s*VALUES/i.exec(
      sql,
    );
  if (!match) return rewriteInsertOrIgnore(sql);

  const [, indent, table, columns] = match;
  const names = columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  const [target, ...updates] = names;

  const tail = sql.slice(match[0].length);
  const set = updates
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  const conflict = target
    ? ` ON CONFLICT (${target}) ${set ? `DO UPDATE SET ${set}` : "DO NOTHING"}`
    : " ON CONFLICT DO NOTHING";

  return `${indent}INSERT INTO ${table} (${columns}) VALUES${tail}${conflict}`;
}

function addReturningId(sql: string): string {
  const insert = /^\s*INSERT\s+INTO\s+("?)([A-Za-z_][\w.]*)\1/i.exec(sql);
  if (!insert) return sql;
  if (!ID_TABLES.has(insert[2].toLowerCase())) return sql;
  if (/\bRETURNING\b/i.test(sql)) return sql;

  return `${sql.trimEnd()} RETURNING id`;
}

/**
 * Turns a SQLite statement into the closest Postgres equivalent.
 * Returns an empty string for statements that have no meaning in Postgres.
 */
export function toPostgresSql(sql: string): string {
  if (isSqliteOnlyStatement(sql)) return "";

  let out = sql
    .replace(/datetime\s*\(\s*'now'\s*,\s*\?\s*\)/gi, "(now() + ?::interval)")
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, "now()");

  out = rewriteInsertOrReplace(out);
  out = rewriteInsertOrIgnore(out);
  out = numberPlaceholders(out);
  out = addReturningId(out);

  return out;
}
