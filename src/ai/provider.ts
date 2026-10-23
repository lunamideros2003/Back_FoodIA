import { env } from "../config/env.ts";

/**
 * Groq speaks the OpenAI chat-completions protocol, so one check covers both
 * hosted providers; anything else keeps the honest local answers.
 */
export function llmActive(): boolean {
  return (env.ai.provider === "openai" || env.ai.provider === "groq") && Boolean(env.ai.apiKey);
}
