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
import { asGrpcServiceDefinition, foodMoodDefinition } from "./service.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROTO_FILE = path.resolve(here, "..", "..", "grpc", "foodmood.proto");

let grpcServer: Server | null = null;
let grpcPort = 0;

/**
 * Small, honest contract: load the .proto at boot (no generated code to
 * forget), bind the handlers from service.ts and expose HTTP/2 + protobuf on
 * its own port so the REST API is untouched.
 */
export async function startGrpcServer(port: number): Promise<number> {
  const packageDefinition = protoLoader.loadSync(PROTO_FILE, {
    keepCase: false,
    defaults: true,
    oneofs: true,
  });
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
  await new Promise<void>((resolve) => {
    server.tryShutdown(() => resolve());
  });
}

/** A client pointing at the local insecure server; used by tests and scripts. */
export function createStatusClient(port: number) {
  const packageDefinition = protoLoader.loadSync(PROTO_FILE, {
    keepCase: false,
    defaults: true,
    oneofs: true,
  });
  const pkg = loadPackageDefinition(packageDefinition) as unknown as {
    foodmood: {
      v1: {
        FoodMoodStatus: new (
          address: string,
          creds: { insecure: () => never },
        ) => {
          getStatus: (
            request: Record<string, never>,
            callback: (error: unknown, response: unknown) => void,
          ) => void;
          getDish: (
            request: { id: number },
            callback: (error: unknown, response: unknown) => void,
          ) => void;
        };
      };
    };
  };

  return new pkg.foodmood.v1.FoodMoodStatus(
    `127.0.0.1:${port}`,
    credentials.createInsecure() as never,
  );
}
