import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startGrpcServer, stopGrpcServer, createStatusClient } from "../src/grpc/server.ts";
import type { DishReply, StatusReply } from "../src/grpc/service.ts";
import { listDishes } from "../src/services/repositories.ts";
import { env } from "../src/config/env.ts";

let port: number;
let client: ReturnType<typeof createStatusClient>;

before(async () => {
  port = await startGrpcServer(40091);
  client = createStatusClient(port);
});

after(async () => {
  client.close();
  await stopGrpcServer();
});

function getStatus(): Promise<StatusReply> {
  return new Promise((resolve, reject) => {
    client.getStatus({}, (error, response) => {
      if (error || !response) reject(error ?? new Error("empty reply"));
      else resolve(response);
    });
  });
}

function getDish(id: number): Promise<DishReply> {
  return new Promise((resolve, reject) => {
    client.getDish({ id }, (error, response) => {
      if (error || !response) reject(error ?? new Error("empty reply"));
      else resolve(response);
    });
  });
}

describe("native gRPC server", () => {
  it("answers GetStatus with the model and catalogue size", async () => {
    const reply = await getStatus();

    assert.equal(reply.service, "foodmood-ia-backend");
    assert.equal(reply.version, "foodmood-1.4.0");
    assert.equal(reply.dishes, listDishes().length);
    assert.equal(reply.moods, 6);
    assert.equal(typeof reply.uptimeSeconds, "number");
    assert.equal(reply.aiProvider, env.ai.provider);
  });

  it("answers GetDish for a known catalogue id", async () => {
    const first = listDishes()[0];
    const reply = await getDish(first.id);

    assert.equal(reply.id, first.id);
    assert.equal(reply.nameEs, first.nameEs);
    assert.equal(reply.slug, first.slug);
    assert.equal(reply.category, first.category);
    assert.equal(reply.prepMinutes, first.prepMinutes);
    assert.equal(reply.calories, first.calories);
    assert.equal(reply.difficulty, first.difficulty);
  });

  it("turns an unknown dish into a NOT_FOUND status", async () => {
    const error = await new Promise<{ code?: number; details?: string } | null>((resolve) => {
      client.getDish({ id: 999999 }, (caught) => resolve(caught));
    });

    assert.equal(error?.code, 5);
    assert.equal(error?.details, "El plato no existe.");
  });
});
