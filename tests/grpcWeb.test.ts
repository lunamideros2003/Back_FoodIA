import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import type { Express } from "express";
import { loadPackageDefinition, type ServiceDefinition } from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { env } from "../src/config/env.ts";
import { listDishes } from "../src/services/repositories.ts";

// The bridge routes through the app (and therefore through the database), so
// this suite uses its own throwaway file exactly like the auth suite does.
const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "foodmood-grpc-web-"));
process.env.DATABASE_FILE = path.join(databaseDir, "grpc-web.test.sqlite");

const PROTO_FILE = fileURLToPath(new URL("../grpc/foodmood.proto", import.meta.url));

interface Method {
  requestSerialize: (value: Record<string, unknown>) => Buffer;
  responseDeserialize: (bytes: Buffer) => Record<string, unknown>;
}

let server: Server;
let base: string;
let methods: Record<string, Method>;

before(async () => {
  const { createApp } = (await import("../src/app.ts")) as { createApp: () => Express };
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}/api/grpc/foodmood.v1.FoodMoodStatus`;

  // The contract from the .proto is the independent decoder: if the hand-rolled
  // encoder drifts by one field number, these tests fail.
  const definition = protoLoader.loadSync(PROTO_FILE, {
    keepCase: false,
    defaults: true,
    oneofs: true,
    longs: Number,
  });
  const pkg = loadPackageDefinition(definition) as unknown as {
    foodmood: { v1: { FoodMoodStatus: { service: ServiceDefinition & Record<string, Method> } } };
  };
  methods = pkg.foodmood.v1.FoodMoodStatus.service;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { closeDb } = (await import("../src/db/connection.ts")) as { closeDb: () => void };
  closeDb();
  fs.rmSync(databaseDir, { recursive: true, force: true });
});

interface Frame {
  flag: number;
  payload: Uint8Array;
}

function parseFrames(body: Uint8Array): Frame[] {
  const frames: Frame[] = [];
  let offset = 0;
  while (offset + 5 <= body.length) {
    const flag = body[offset];
    const view = new DataView(body.buffer, body.byteOffset + offset + 1, 4);
    const length = view.getUint32(0, false);
    frames.push({ flag, payload: body.subarray(offset + 5, offset + 5 + length) });
    offset += 5 + length;
  }
  return frames;
}

function grpcBody(serialize: (value: Record<string, unknown>) => Buffer, message: Record<string, unknown>): Uint8Array {
  const payload = new Uint8Array(serialize(message));
  const framed = new Uint8Array(5 + payload.length);
  framed[0] = 0;
  new DataView(framed.buffer).setUint32(1, payload.length, false);
  framed.set(payload, 5);
  return framed;
}

async function call(method: string, payload: Uint8Array, options: { text?: boolean } = {}) {
  const contentType = options.text
    ? "application/grpc-web-text+proto"
    : "application/grpc-web+proto";
  const response = await fetch(`${base}/${method}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: options.text ? Buffer.from(payload).toString("base64") : payload,
  });
  const raw = Buffer.from(await response.arrayBuffer());
  const bytes = options.text ? new Uint8Array(Buffer.from(raw.toString("utf8"), "base64")) : raw;
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    frames: parseFrames(bytes),
  };
}

describe("gRPC-Web bridge", () => {
  it("answers GetStatus over plain HTTP/1.1", async () => {
    const answer = await call("GetStatus", grpcBody(methods.GetStatus.requestSerialize, {}));

    assert.equal(answer.status, 200);
    assert.equal(answer.contentType, "application/grpc-web+proto");
    assert.equal(answer.frames.length, 2);
    assert.equal(answer.frames[0].flag, 0);
    assert.equal(answer.frames[1].flag, 0x80);

    const message = methods.GetStatus.responseDeserialize(Buffer.from(answer.frames[0].payload));
    assert.equal(message.service, "foodmood-ia-backend");
    assert.equal(message.version, "foodmood-1.4.0");
    assert.equal(message.aiProvider, env.ai.provider);
    assert.equal(typeof message.uptimeSeconds, "number");
    assert.ok(Number(message.dishes) > 0);
    assert.equal(message.moods, 6);

    assert.equal(Buffer.from(answer.frames[1].payload).toString("utf8"), "grpc-status: 0\r\n");
  });

  it("answers GetDish for a known id and keeps accents intact", async () => {
    const first = listDishes()[0];
    const answer = await call("GetDish", grpcBody(methods.GetDish.requestSerialize, { id: first.id }));
    const message = methods.GetDish.responseDeserialize(Buffer.from(answer.frames[0].payload));

    assert.equal(message.id, first.id);
    assert.equal(message.nameEs, first.nameEs);
    assert.equal(message.slug, first.slug);
    assert.equal(message.category, first.category);
    assert.equal(message.prepMinutes, first.prepMinutes);
    assert.equal(message.calories, first.calories);
    assert.equal(message.difficulty, first.difficulty);
  });

  it("reports NOT_FOUND as a trailer-only response", async () => {
    const answer = await call("GetDish", grpcBody(methods.GetDish.requestSerialize, { id: 999999 }));

    assert.equal(answer.frames.length, 1);
    assert.equal(answer.frames[0].flag, 0x80);
    const trailers = Buffer.from(answer.frames[0].payload).toString("utf8");
    assert.match(trailers, /grpc-status: 5/);
    assert.match(trailers, /grpc-message: El%20plato%20no%20existe/);
  });

  it("accepts the base64 text flavour used by grpc-web clients", async () => {
    const answer = await call("GetStatus", grpcBody(methods.GetStatus.requestSerialize, {}), {
      text: true,
    });

    assert.equal(answer.contentType, "application/grpc-web-text+proto");
    assert.equal(answer.frames.length, 2);
    const message = methods.GetStatus.responseDeserialize(Buffer.from(answer.frames[0].payload));
    assert.equal(message.service, "foodmood-ia-backend");
  });

  it("answers UNIMPLEMENTED for an unknown method", async () => {
    const answer = await call("Nope", new Uint8Array());

    assert.equal(answer.frames.length, 1);
    assert.match(Buffer.from(answer.frames[0].payload).toString("utf8"), /grpc-status: 12/);
  });

  it("reports INVALID_ARGUMENT for a truncated protobuf body", async () => {
    const answer = await call("GetDish", new Uint8Array([0x08, 0x80]));

    assert.equal(answer.frames.length, 1);
    const trailers = Buffer.from(answer.frames[0].payload).toString("utf8");
    assert.match(trailers, /grpc-status: 3/);
    assert.match(trailers, /Petici%C3%B3n%20inv%C3%A1lida/);
  });
});
