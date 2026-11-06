import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Server as GrpcServer,
  ServerCredentials,
  credentials,
  loadPackageDefinition,
  type Server,
} from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { asGrpcServiceDefinition, foodMoodDefinition, type DishReply, type StatusReply } from "./service.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROTO_FILE = path.resolve(here, "..", "..", "grpc", "foodmood.proto");

/**
 * Shared loader options. `longs: Number` keeps uint64 fields (like
 * uptime_seconds) as plain JavaScript numbers on both sides of the wire
 * instead of protobufjs Long objects.
 */
const LOADER_OPTIONS = {
  keepCase: false,
  defaults: true,
  oneofs: true,
  longs: Number,
} as const;

let grpcServer: Server | null = null;
let grpcPort = 0;

/**
 * Small, honest contract: load the .proto at boot (no generated code to
 * forget), bind the handlers from service.ts and expose HTTP/2 + protobuf on
 * its own port so the REST API is untouched.
 */
export async function startGrpcServer(port: number): Promise<number> {
  const packageDefinition = protoLoader.loadSync(PROTO_FILE, LOADER_OPTIONS);
  const pkg = loadPackageDefinition(packageDefinition) as unknown as {
    foodmood: { v1: { FoodMoodStatus: { service: unknown } } };
  };

  // proto-loader hands the service shape over untyped (no codegen), so the
  // two casts stay honest: the .proto file is the single real contract.
  const server = new GrpcServer();
  server.addService(
    asGrpcServiceDefinition(pkg.foodmood.v1.FoodMoodStatus.service) as never,
    foodMoodDefinition() as never,
  );

  const bound = await new Promise<number>((resolve, reject) => {
    server.bindAsync(`127.0.0.1:${port}`, ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });

  grpcServer = server;
  grpcPort = bound;
  return bound;
}

/** The port the native gRPC server is actually listening on, 0 if down. */
export function activeGrpcPort(): number {
  return grpcPort;
}

export async function stopGrpcServer(): Promise<void> {
  const server = grpcServer;
  if (!server) return;
  grpcServer = null;
  grpcPort = 0;
  // tryShutdown no siempre llama al callback; un temporizador de seguridad
  // evita que los tests o el apagado se cuelguen para siempre.
  await Promise.race([
    new Promise<void>((resolve) => server.tryShutdown(() => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);
}

/** A client pointing at the local insecure server; used by tests and scripts. */
export interface StatusClient {
  getStatus(request: Record<string, never>, callback: UnaryCallback<StatusReply>): void;
  getDish(request: { id: number }, callback: UnaryCallback<DishReply>): void;
  close(): void;
}

export type UnaryCallback<TReply> = (
  error: { code?: number; details?: string } | null,
  response?: TReply,
) => void;

export function createStatusClient(port: number): StatusClient {
  const packageDefinition = protoLoader.loadSync(PROTO_FILE, LOADER_OPTIONS);
  const pkg = loadPackageDefinition(packageDefinition) as unknown as {
    foodmood: {
      v1: {
        FoodMoodStatus: new (
          address: string,
          creds: { insecure: () => never },
        ) => StatusClient;
      };
    };
  };

  return new pkg.foodmood.v1.FoodMoodStatus(
    `127.0.0.1:${port}`,
    credentials.createInsecure() as never,
  );
}
