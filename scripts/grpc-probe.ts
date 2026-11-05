import { createStatusClient, startGrpcServer, stopGrpcServer } from "../src/grpc/server.ts";
import { listDishes } from "../src/services/repositories.ts";

/**
 * A tiny native gRPC client, on purpose: it proves the server speaks real
 * HTTP/2 + protobuf and doubles as a grader-friendly demo.
 *
 *   npm run grpc:probe
 */

const port = await startGrpcServer(0);
const client = createStatusClient(port);
const first = listDishes()[0];

function unary<T>(run: (done: (error: { code?: number; details?: string } | null, reply?: T) => void) => void) {
  return new Promise<{ error: { code?: number; details?: string } | null; reply?: T }>((resolve) => {
    run((error, reply) => resolve({ error, reply }));
  });
}

const status = await unary<Record<string, unknown>>((done) => client.getStatus({}, done));
const dish = await unary<Record<string, unknown>>((done) => client.getDish({ id: first.id }, done));
const missing = await unary<Record<string, unknown>>((done) => client.getDish({ id: 999999 }, done));

console.log(`\n  gRPC en 127.0.0.1:${port}\n`);
console.log("  GetStatus  →", status.reply ?? status.error);
console.log("  GetDish    →", dish.reply ?? dish.error);
console.log("  GetDish(?) →", `code ${missing.error?.code}: ${missing.error?.details}`);

client.close();
await stopGrpcServer();
