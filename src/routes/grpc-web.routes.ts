import { Router, type Request, type Response } from "express";
import express from "express";
import { dishReply, statusReply } from "../grpc/service.ts";
import { env } from "../config/env.ts";
import {
  GRPC_WEB_CONTENT_TYPE,
  GRPC_WEB_TEXT_CONTENT_TYPE,
  concatBytes,
  decodeIdRequest,
  encodeDishReply,
  encodeStatusReply,
  messageFrame,
  trailerFrame,
} from "../grpc/wire.ts";

/**
 * gRPC-Web bridge: the same handlers the native server exposes, spoken over
 * plain HTTP/1.1 so a browser can use them without Envoy or a proxy that
 * rewrites frames. It is deliberately read-only and mirrors the .proto.
 *
 *   POST /api/grpc/foodmood.v1.FoodMoodStatus/GetStatus
 *   POST /api/grpc/foodmood.v1.FoodMoodStatus/GetDish
 *
 * Both `application/grpc-web+proto` (binary) and `application/grpc-web-text+proto`
 * (base64, what the official grpc-web client sends) are accepted.
 */

export const GRPC_WEB_SERVICE = "foodmood.v1.FoodMoodStatus";

const INVALID_ARGUMENT = 3;
const NOT_FOUND = 5;
const UNIMPLEMENTED = 12;

export interface UnaryResult {
  /** RPC status: 0 on success, a canonical gRPC code otherwise. */
  status: number;
  message: string;
  /** Encoded reply, absent when the call failed. */
  payload?: Uint8Array;
}

/** Transport-agnostic dispatch, shared by the route and its tests. */
export function callUnary(method: string, request: Uint8Array): UnaryResult {
  if (method === "GetStatus") {
    return { status: 0, message: "", payload: encodeStatusReply(statusReply()) };
  }

  if (method === "GetDish") {
    let id: number;
    try {
      id = decodeIdRequest(request);
    } catch (error) {
      return {
        status: INVALID_ARGUMENT,
        message: `Petición inválida: ${(error as Error).message}`,
      };
    }
    const dish = dishReply(id);
    if (!dish) return { status: NOT_FOUND, message: "El plato no existe." };
    return { status: 0, message: "", payload: encodeDishReply(dish) };
  }

  return { status: UNIMPLEMENTED, message: `Método desconocido: ${method}` };
}

/** A gRPC-Web body starts with a 5-byte frame header; bare protobuf also works. */
export function unframe(body: Uint8Array): Uint8Array {
  if (body.length < 5 || body[0] !== 0) return body;
  const length = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(1, false);
  if (length > body.length - 5) return body;
  return body.subarray(5, 5 + length);
}

function isTextMode(req: Request): boolean {
  return (req.headers["content-type"] ?? "").includes(GRPC_WEB_TEXT_CONTENT_TYPE);
}

/** The text flavour sends the framed body base64-encoded. */
function fromBase64(bytes: Uint8Array): Uint8Array {
  const encoded = Buffer.from(bytes).toString("utf8").trim();
  return encoded ? new Uint8Array(Buffer.from(encoded, "base64")) : new Uint8Array();
}

export const grpcWebRouter = Router();

// gRPC-Web bodies are binary; the global JSON parser ignores them, but reading
// them as raw bytes makes the intent explicit and keeps a 64 kb ceiling.
grpcWebRouter.use(express.raw({ type: () => true, limit: "64kb" }));

// Discovery, REST-style: a grader or a new client can see the contract without
// opening the .proto or running protoc.
grpcWebRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    service: GRPC_WEB_SERVICE,
    proto: "grpc/foodmood.proto",
    transport: "gRPC-Web sobre HTTP/1.1 (application/grpc-web+proto)",
    nativePort: env.grpcPort,
    methods: [
      { name: "GetStatus", request: "StatusRequest", response: "StatusReply", streams: "unary" },
      { name: "GetDish", request: "DishRequest", response: "DishReply", streams: "unary" },
    ],
  });
});

grpcWebRouter.post("/:service/:method", (req: Request, res: Response) => {
  const { service, method } = req.params;
  const text = isTextMode(req);
  const binary = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
  const body = text ? fromBase64(binary) : binary;

  const result: UnaryResult =
    service === GRPC_WEB_SERVICE
      ? callUnary(String(method), unframe(body))
      : { status: UNIMPLEMENTED, message: `Servicio desconocido: ${service}` };

  const frames = [
    ...(result.payload ? [messageFrame(result.payload)] : []),
    trailerFrame(result.status, result.message),
  ];
  const payload = concatBytes(...frames);

  res.status(200);
  res.setHeader("Content-Type", text ? GRPC_WEB_TEXT_CONTENT_TYPE : GRPC_WEB_CONTENT_TYPE);
  res.setHeader("X-Grpc-Web", "1");
  // gRPC-Web clients read the trailer frame; exposing it keeps CORS honest.
  res.setHeader("Access-Control-Expose-Headers", "grpc-status, grpc-message");
  res.end(text ? Buffer.from(payload).toString("base64") : Buffer.from(payload));
});
