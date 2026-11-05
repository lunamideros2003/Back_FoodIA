import type { DishReply, StatusReply } from "./service.ts";

/**
 * The gRPC-Web wire format, in about a hundred lines of honest code.
 *
 * A gRPC-Web response body is a sequence of length-prefixed frames:
 *
 *   0x00 | uint32 length | protobuf message   (a data frame)
 *   0x80 | uint32 length | "key: value\r\n..." (the trailers, always last)
 *
 * The browser cannot speak HTTP/2 trailers, so the bridge turns `grpc-status`
 * and `grpc-message` into that second frame. Everything here is written by
 * hand on purpose: the .proto file is the contract and the field numbers
 * below must match it one to one.
 */

export const GRPC_WEB_CONTENT_TYPE = "application/grpc-web+proto";
export const GRPC_WEB_TEXT_CONTENT_TYPE = "application/grpc-web-text+proto";

/** Field numbers straight from grpc/foodmood.proto. */
const STATUS = { service: 1, version: 2, aiProvider: 3, uptimeSeconds: 4, dishes: 5, moods: 6 } as const;
const DISH = { id: 1, slug: 2, nameEs: 3, category: 4, prepMinutes: 5, calories: 6, difficulty: 7 } as const;

const DATA_FRAME = 0x00;
const TRAILER_FRAME = 0x80;
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

export function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let rest = Math.max(0, Math.floor(value));
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

function varintField(field: number, value: number): number[] {
  return [...encodeVarint((field << 3) | WIRE_VARINT), ...encodeVarint(value)];
}

function stringField(field: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [
    ...encodeVarint((field << 3) | WIRE_LENGTH_DELIMITED),
    ...encodeVarint(bytes.length),
    ...bytes,
  ];
}

export function encodeStatusReply(reply: StatusReply): Uint8Array {
  return new Uint8Array([
    ...stringField(STATUS.service, reply.service),
    ...stringField(STATUS.version, reply.version),
    ...stringField(STATUS.aiProvider, reply.aiProvider),
    ...varintField(STATUS.uptimeSeconds, reply.uptimeSeconds),
    ...varintField(STATUS.dishes, reply.dishes),
    ...varintField(STATUS.moods, reply.moods),
  ]);
}

export function encodeDishReply(reply: DishReply): Uint8Array {
  return new Uint8Array([
    ...varintField(DISH.id, reply.id),
    ...stringField(DISH.slug, reply.slug),
    ...stringField(DISH.nameEs, reply.nameEs),
    ...stringField(DISH.category, reply.category),
    ...varintField(DISH.prepMinutes, reply.prepMinutes),
    ...varintField(DISH.calories, reply.calories),
    ...stringField(DISH.difficulty, reply.difficulty),
  ]);
}

/** Reads a varint starting at `offset`; returns the value and the next byte. */
export function readVarint(bytes: Uint8Array, offset: number): { value: number; offset: number } {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset: cursor };
    shift += 7;
    if (shift > 49) throw new Error("varint demasiado largo");
  }
  throw new Error("varint incompleto");
}

/** `DishRequest { int32 id = 1 }`: the only request body the bridge accepts. */
export function decodeIdRequest(bytes: Uint8Array): number {
  let cursor = 0;
  while (cursor < bytes.length) {
    const header = readVarint(bytes, cursor);
    const field = header.value >>> 3;
    const wire = header.value & 0x7;
    cursor = header.offset;

    if (wire === WIRE_VARINT) {
      const read = readVarint(bytes, cursor);
      cursor = read.offset;
      if (field === 1) return read.value | 0;
    } else if (wire === WIRE_LENGTH_DELIMITED) {
      const length = readVarint(bytes, cursor);
      cursor = length.offset + length.value;
    } else if (wire === 5) {
      cursor += 4;
    } else if (wire === 1) {
      cursor += 8;
    } else {
      throw new Error(`wire type desconocido: ${wire}`);
    }
  }
  return 0;
}

/** 5-byte prefix: frame flag plus the big-endian length of the payload. */
export function frame(flag: number, payload: Uint8Array): Uint8Array {
  const framed = new Uint8Array(5 + payload.length);
  framed[0] = flag;
  new DataView(framed.buffer).setUint32(1, payload.length, false);
  framed.set(payload, 5);
  return framed;
}

export function messageFrame(payload: Uint8Array): Uint8Array {
  return frame(DATA_FRAME, payload);
}

/** Trailers as a normal gRPC-Web trailer frame; `status !== 0` is an error. */
export function trailerFrame(status: number, message = ""): Uint8Array {
  const lines = [`grpc-status: ${status}\r\n`];
  if (message) lines.push(`grpc-message: ${encodeURIComponent(message)}\r\n`);
  return frame(TRAILER_FRAME, new TextEncoder().encode(lines.join("")));
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
