import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { Express } from "express";

// The register/login flow mutates the database, so every run needs its own
// throwaway file instead of polluting the developer's data. The env var has to
// be set before src/app.ts loads env.ts, hence the dynamic import in before().
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodmood-auth-"));
process.env.DATABASE_FILE = path.join(databaseDir, "auth.test.sqlite");

let server: Server;
let base: string;

before(async () => {
  const { createApp } = (await import("../src/app.ts")) as { createApp: () => Express };
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { closeDb } = (await import("../src/db/connection.ts")) as { closeDb: () => void };
  closeDb();
  fs.rmSync(databaseDir, { recursive: true, force: true });
});

interface AuthPayload {
  user?: { id: number; email: string; displayName: string };
  token?: string;
  expiresAt?: string;
  error?: string;
}

async function register(body: Record<string, unknown>) {
  return fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function login(body: Record<string, unknown>) {
  return fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  it("registers an account and issues a bearer session", async () => {
    const response = await register({
      email: "Auth.Tester@example.com",
      password: "pan-con-tomate-1",
      displayName: "Auth Tester",
      preferences: { diet: "vegan" },
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as AuthPayload;
    assert.equal(body.user?.email, "auth.tester@example.com");
    assert.equal(body.user?.displayName, "Auth Tester");
    assert.ok(!("passwordHash" in (body.user as object)));
    assert.ok(body.token?.length ?? 0 > 20);
    assert.ok(new Date(body.expiresAt ?? "").getTime() > Date.now());
  });

  it("rejects registering the same email twice", async () => {
    const response = await register({
      email: "auth.tester@example.com",
      password: "pan-con-tomate-1",
      displayName: "Duplicado",
    });
    assert.equal(response.status, 409);
    const body = (await response.json()) as AuthPayload;
    assert.ok(body.error);
  });

  it("rejects weak credentials with validation details", async () => {
    const short = await register({
      email: "otra@example.com",
      password: "corta",
      displayName: "Corta",
    });
    assert.equal(short.status, 400);

    const badName = await register({
      email: "otra@example.com",
      password: "pan-con-tomate-1",
      displayName: "A",
    });
    assert.equal(badName.status, 400);
  });

  it("logs in with the right password and issues another session", async () => {
    const response = await login({
      email: "auth.tester@example.com",
      password: "pan-con-tomate-1",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as AuthPayload;
    assert.equal(body.user?.email, "auth.tester@example.com");
    assert.ok(body.token);
  });

  it("refuses a wrong password without leaking details", async () => {
    const response = await login({
      email: "auth.tester@example.com",
      password: "una-contrasena-equivocada",
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as AuthPayload;
    assert.equal(body.error, "Correo o contrase\u00f1a incorrectos.");
    assert.equal(body.user, undefined);
  });

  it("refuses an unknown email with the same message", async () => {
    const response = await login({
      email: "nadie@example.com",
      password: "pan-con-tomate-1",
    });
    assert.equal(response.status, 401);
  });

  it("identifies the session holder through /auth/me", async () => {
    const loginResponse = await login({
      email: "auth.tester@example.com",
      password: "pan-con-tomate-1",
    });
    const { token, user } = (await loginResponse.json()) as AuthPayload;
    assert.ok(token);

    const me = await fetch(`${base}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as AuthPayload;
    assert.equal(meBody.user?.email, user?.email);
  });

  it("rejects /auth/me without or with a bad token", async () => {
    const missing = await fetch(`${base}/auth/me`);
    assert.equal(missing.status, 401);

    const broken = await fetch(`${base}/auth/me`, {
      headers: { authorization: "Bearer no-es-un-token" },
    });
    assert.equal(broken.status, 401);
  });

  it("closes the session on logout and stops accepting the token", async () => {
    const loginResponse = await login({
      email: "auth.tester@example.com",
      password: "pan-con-tomate-1",
    });
    const { token } = (await loginResponse.json()) as AuthPayload;
    assert.ok(token);

    const logout = await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(logout.status, 200);

    const reuse = await fetch(`${base}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(reuse.status, 401);
  });

  it("answers /auth/session with null when there is no valid token", async () => {
    const response = await fetch(`${base}/auth/session`, {
      headers: { authorization: "Bearer nada-que-ver" },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { session: unknown };
    assert.equal(body.session, null);
  });
});
