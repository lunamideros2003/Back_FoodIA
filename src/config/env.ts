import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv();

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type AiProvider = "local" | "openai" | "groq";

/**
 * Every provider is OpenAI-compatible, they only disagree on the default
 * endpoint and the name of the model they serve.
 */
interface ProviderDefaults {
  baseUrl: string;
  model: string;
}

const PROVIDER_DEFAULTS: Partial<Record<AiProvider, ProviderDefaults>> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

const AI_PROVIDER = (process.env.AI_PROVIDER ?? "local") as AiProvider;
const providerDefault = PROVIDER_DEFAULTS[AI_PROVIDER];

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 4000),
  databaseFile: path.resolve(
    projectRoot,
    process.env.DATABASE_FILE ?? "./data/foodmood.db",
  ),
  /**
   * Set this to the Supabase connection string to switch the whole backend to
   * Postgres. Empty means SQLite, which is what local development and the test
   * suite use. `pglite://memory` is the in-process Postgres used by tests.
   */
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  databaseSsl: process.env.DATABASE_SSL !== "false",
  databaseTimeoutMs: toInt(process.env.DATABASE_TIMEOUT_MS, 30_000),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ai: {
    provider: AI_PROVIDER as AiProvider,
    baseUrl: process.env.AI_BASE_URL ?? providerDefault?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? providerDefault?.model ?? "gpt-4o-mini",
    /** How long the cooking assistant waits before falling back. */
    assistantTimeoutMs: toInt(process.env.AI_ASSISTANT_TIMEOUT_MS, 9000),
  },
  /** Native gRPC (HTTP/2) endpoint; 0 disables the layer entirely. */
  grpcPort: process.env.GRPC_PORT === "0" ? 0 : toInt(process.env.GRPC_PORT, 4002),
  recentInteractionLimit: toInt(process.env.RECENT_INTERACTION_LIMIT, 40),
};

export const isProduction = env.nodeEnv === "production";
