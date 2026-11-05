import type { ServerUnaryCall, sendUnaryData, ServiceDefinition } from "@grpc/grpc-js";
import { listDishes, listMoods } from "../services/repositories.ts";
import { env } from "../config/env.ts";
import { modelStore } from "../services/modelStore.ts";

/**
 * Snapshot of the running backend, in protobuf numbers and strings only.
 * Kept out of the user data: this service is public by design (the REST
 * equivalent is GET /api/health) and must never leak recipe internals.
 */
export interface StatusReply {
  service: string;
  version: string;
  aiProvider: string;
  uptimeSeconds: number;
  dishes: number;
  moods: number;
}

export function statusReply(): StatusReply {
  return {
    service: "foodmood-ia-backend",
    version: modelStore.version,
    aiProvider: env.ai.provider,
    uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
    dishes: listDishes().length,
    moods: listMoods().length,
  };
}

export interface DishReply {
  id: number;
  slug: string;
  nameEs: string;
  category: string;
  prepMinutes: number;
  calories: number;
  difficulty: string;
}

export function dishReply(id: number): DishReply | null {
  const dish = listDishes().find((candidate) => candidate.id === id);
  if (!dish) return null;
  return {
    id: dish.id,
    slug: dish.slug,
    nameEs: dish.nameEs,
    category: dish.category,
    prepMinutes: dish.prepMinutes,
    calories: dish.calories,
    difficulty: dish.difficulty,
  };
}

/**
 * The service definition shared by the gRPC server and the gRPC-Web bridge:
 * one source of behaviour so the two transports can never drift apart.
 * Typed loosely because there is no generated code; proto-loader keeps the
 * runtime shape and the .proto stays the single contract.
 */
export function foodMoodDefinition(): Record<string, unknown> {
  return {
    GetStatus: (
      _call: ServerUnaryCall<Record<string, never>, unknown>,
      callback: sendUnaryData<unknown>,
    ) => {
      callback(null, statusReply());
    },
    GetDish: (
      call: ServerUnaryCall<{ id?: number }, unknown>,
      callback: sendUnaryData<unknown>,
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

/** The concrete ServiceDefinition demanded by grpc-js at addService time. */
export const asGrpcServiceDefinition = (handlers: unknown) =>
  handlers as ServiceDefinition;

