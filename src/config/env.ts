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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 4000),
  databaseFile: path.resolve(
    projectRoot,
    process.env.DATABASE_FILE ?? "./data/foodmood.db",
  ),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ai: {
    provider: (process.env.AI_PROVIDER ?? "local") as "local" | "openai",
    baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    /** How long the cooking assistant waits before falling back. */
    assistantTimeoutMs: toInt(process.env.AI_ASSISTANT_TIMEOUT_MS, 9000),
  },
  recentInteractionLimit: toInt(process.env.RECENT_INTERACTION_LIMIT, 40),
};

export const isProduction = env.nodeEnv === "production";
