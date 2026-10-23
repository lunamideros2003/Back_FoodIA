import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, transaction } from "../db/connection.ts";
import { findUserById } from "./repositories.ts";
import { HttpError } from "../middleware/error.ts";
import type { User } from "../domain/types.ts";

const SESSION_DAYS = 30;

interface SessionRow {
  token_hash: string;
  user_id: number;
  expires_at: string;
}

export interface Session {
  user: User;
  token: string;
  expiresAt: string;
}

function toIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, "hex");
  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
}

export function createSession(userId: number): Session {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = toIso(SESSION_DAYS);

  getDb()
    .prepare(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`,
    )
    .run(hashToken(token), userId, expiresAt);

  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");
  return { user, token, expiresAt };
}

export function resolveSession(token: string | undefined | null): User | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT token_hash, user_id, expires_at
       FROM auth_sessions
       WHERE token_hash = ?`,
    )
    .get(hashToken(token)) as SessionRow | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    transaction((db) => db.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).run(row.token_hash));
    return null;
  }

  return findUserById(row.user_id);
}

export function destroySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const result = getDb()
    .prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
    .run(hashToken(token));
  return result.changes > 0;
}

function cleanupExpired(): void {
  transaction((db) =>
    db.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`).run(new Date().toISOString()),
  );
}

export function purgeExpiredSessions(): number {
  const before = getDb().prepare(`SELECT COUNT(*) AS total FROM auth_sessions`).get() as { total: number };
  cleanupExpired();
  const after = getDb().prepare(`SELECT COUNT(*) AS total FROM auth_sessions`).get() as { total: number };
  return before.total - after.total;
}
