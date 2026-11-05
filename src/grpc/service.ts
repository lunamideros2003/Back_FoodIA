import { process } from "node:process";
import type { Server as GrpcServer, ServiceDefinition } from "@grpc/grpc-js";
import { listDishes, listMoods } from "../services/repositories.ts";
import { env } from "../config/env.ts";
import { modelStore } from "../services/modelStore.ts";

/**
 * Snapshot of the running backend, in protobuf numbers and strings only.
 * Kept out of the user data: this service is public by design (the REST
 * equivalent is GET /api/health) and must never leak recipe internals.
 */
export function statusReply(): {
  service: string;
  version: string;
  ai_provider: string;
  uptime_seconds: number;
  dishes: number;
  moods: number;
} {
  return {
    service: "foodmood-ia-backend",
    version: modelStore.version,
    ai_provider: env.ai.provider,
    uptime_seconds: Math.max(0, Math.floor(process.uptime())),
    dishes: listDishes().length,
    moods: listMoods().length,
  };
}

export function dishReply(id: number): {
  id: number;
  slug: string;
  name_es: string;
  category: string;
  prep_minutes: number;
  calories: number;
  difficulty: string;
} | null {
  const dish = listDishes().find((candidate) => candidate.id === id);
  if (!dish) return null;
  return {
    id: dish.id,
    slug: dish.slug,
    name_es: dish.nameEs,
    category: dish.category,
    prep_minutes: dish.prepMinutes,
    calories: dish.calories,
    difficulty: dish.difficulty,
  };
}

/**
 * The service definition shared by the gRPC server and the gRPC-Web bridge:
 * one source of behaviour so the two transports can never drift apart.
 */
export function foodMoodDefinition(): ServiceDefinition {
  return {
    GetStatus: (_call: unknown, callback: (error: null, response: unknown) => void) => {
      callback(null, statusReply());
    },
    GetDish: (
      call: { request: { id?: number } },
      callback: (error: { code: number; details: string } | null, response?: unknown) => void,
    ) => {
      const id = Number(call.request?.id);
      const dish = Number.isInteger(id) ? dishReply(id) : null;
      if (!dish) {
        callback({ code: 5 /* NOT_FOUND */, details: "El plato no existe." });
        return;
      }
      callback(null, dish);
    },
  };
}

export const GRPC_SERVICE_PATH = "/foodmood.v1.FoodMoodStatus/";

/** Unused today but part of the public contract the server stops cleanly. */
export type FoodMoodGrpcServer = GrpcServer;
