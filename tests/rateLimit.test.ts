import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "../src/middleware/rateLimit.ts";

function makeRequest(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function makeResponse() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    setHeader(name: string, value: string) {
      response.headers[name] = value;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };
  return response as typeof response & Response;
}

function hit(limiter: ReturnType<typeof rateLimit>, ip: string) {
  const response = makeResponse();
  let passed = false;
  const next: NextFunction = () => {
    passed = true;
  };
  limiter(makeRequest(ip), response, next);
  return { passed, response };
}

describe("rate limiter", () => {
  it("lets the requests through until the limit", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 });

    for (let i = 0; i < 3; i += 1) {
      const result = hit(limiter, "1.1.1.1");
      assert.equal(result.passed, true);
      assert.equal(result.response.statusCode, 200);
    }
  });

  it("blocks the request over the limit with a 429 and a retry hint", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });

    hit(limiter, "1.1.1.1");
    hit(limiter, "1.1.1.1");
    const blocked = hit(limiter, "1.1.1.1");

    assert.equal(blocked.passed, false);
    assert.equal(blocked.response.statusCode, 429);
    assert.ok(Number(blocked.response.headers["Retry-After"]) >= 1);
    assert.match((blocked.response.body as { error: string }).error, /Demasiadas/);
  });

  it("keeps the clients apart", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });

    assert.equal(hit(limiter, "1.1.1.1").passed, true);
    assert.equal(hit(limiter, "1.1.1.1").passed, false);
    assert.equal(hit(limiter, "2.2.2.2").passed, true);
  });

  it("allows the client again once the window has passed", async () => {
    const limiter = rateLimit({ windowMs: 40, max: 1 });

    assert.equal(hit(limiter, "1.1.1.1").passed, true);
    assert.equal(hit(limiter, "1.1.1.1").passed, false);

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(hit(limiter, "1.1.1.1").passed, true);
  });
});
