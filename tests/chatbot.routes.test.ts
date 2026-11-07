import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { Express } from "express";

// The app seeds a real database on boot, so this suite gets its own throwaway
// file. The env var must exist before src/app.ts loads env.ts.
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodmood-chat-"));
process.env.DATABASE_FILE = path.join(databaseDir, "chat.test.sqlite");

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

interface ChatPayload {
  answer?: string;
  source?: string;
  topic?: string;
  inScope?: boolean;
  suggestions?: string[];
  error?: string;
}

async function chat(body: Record<string, unknown>) {
  return fetch(`${base}/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("chatbot route", () => {
  it("refuses a sum with a clear message", async () => {
    const response = await chat({ message: "ayúdame con una suma: 2+2" });
    assert.equal(response.status, 200);

    const body = (await response.json()) as ChatPayload;
    assert.equal(body.topic, "off-topic");
    assert.equal(body.inScope, false);
    assert.match(body.answer ?? "", /No resuelvo sumas/);
  });

  it("answers a food question with a usable reply", async () => {
    const response = await chat({ message: "¿Qué puedo cocinar con arroz?" });
    assert.equal(response.status, 200);

    const body = (await response.json()) as ChatPayload;
    assert.equal(body.inScope, true);
    assert.ok((body.answer ?? "").length > 20);
    assert.ok((body.suggestions ?? []).length >= 3);
  });

  it("rejects an empty message", async () => {
    const response = await chat({ message: "   " });
    assert.equal(response.status, 400);
  });

  it("rejects a message that is too long", async () => {
    const response = await chat({ message: "a".repeat(601) });
    assert.equal(response.status, 400);
  });
});
