import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { Express } from "express";
import { recipeFixture } from "./recipeFixture.ts";

// The route needs a configured provider to reach the generation branch. The
// provider call is mocked below, so no network or real key is used.
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodmood-generate-"));
process.env.DATABASE_FILE = path.join(databaseDir, "generate.test.sqlite");
process.env.AI_PROVIDER = "groq";
process.env.AI_API_KEY = "test-key";

let server: Server;
let base: string;
let closeDb: () => void;
const originalFetch = globalThis.fetch;

function providerReply(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Mocks only the model call; the requests to the test server stay real. */
function mockProvider(content: string): void {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/chat/completions")) return providerReply(content);
    return originalFetch(input, init);
  };
}

before(async () => {
  mockProvider(JSON.stringify(recipeFixture()));

  const { createApp } = (await import("../src/app.ts")) as { createApp: () => Express };
  const connection = await import("../src/db/connection.ts");
  closeDb = connection.closeDb;

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(databaseDir, { recursive: true, force: true });
});

interface GeneratePayload {
  dish?: { slug?: string; steps?: string[]; nameEs?: string };
  generated?: boolean;
  total?: number;
  error?: string;
}

async function generate(body: Record<string, unknown>) {
  return fetch(`${base}/recipes/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("recipe generation route", () => {
  it("creates a new recipe and returns it", async () => {
    const response = await generate({ idea: "algo con calabaza", servings: 2 });
    assert.equal(response.status, 201);

    const body = (await response.json()) as GeneratePayload;
    assert.equal(body.generated, true);
    assert.equal(body.dish?.nameEs, "Tarta tibia de calabaza");
    assert.equal(body.dish?.slug, "tarta-tibia-de-calabaza");
    assert.equal(body.dish?.steps?.length, 3);
    assert.equal(body.total, 41);
  });

  it("serves the generated recipe from the normal catalogue route", async () => {
    const response = await fetch(`${base}/dishes/tarta-tibia-de-calabaza`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { dish?: { nameEs?: string } };
    assert.equal(body.dish?.nameEs, "Tarta tibia de calabaza");
  });

  it("rejects an idea that is too long", async () => {
    const response = await generate({ idea: "a".repeat(241) });
    assert.equal(response.status, 400);
  });

  it("returns a clear error when the model sends something incomplete", async () => {
    mockProvider(JSON.stringify({ nameEs: "Incompleta" }));

    const response = await generate({ idea: "otra receta" });
    assert.equal(response.status, 502);

    const body = (await response.json()) as GeneratePayload;
    assert.match(body.error ?? "", /receta incompleta/i);
  });
});
