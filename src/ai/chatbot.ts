import { env } from "../config/env.ts";
import { llmActive } from "./provider.ts";
import type { ChatAnswer, ChatPreferences, ChatTurn } from "../domain/chatbot.ts";
import { CHAT_SUGGESTIONS } from "./chatCopy.ts";
import { buildLocalChatAnswer } from "./chatbotLocal.ts";
import { buildChatSystemPrompt, recentChatHistory } from "./chatbotPrompt.ts";
import { chatTopicOf } from "./chatTopics.ts";

/**
 * The general chatbot.
 *
 * The order matters: the local classifier runs first, so an obvious off-topic
 * question is refused without spending a model call. The provider is used only
 * for in-scope questions, and any failure falls back to the local copy instead
 * of leaving the person without an answer.
 */

const MAX_ANSWER_WORDS = 180;

export interface ChatOptions {
  /** Diet and allergies of the logged-in user, when there is one. */
  preferences?: ChatPreferences;
  /** How long to wait for the provider, in milliseconds. */
  timeoutMs?: number;
}

function trimToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

async function callProvider(
  message: string,
  history: ChatTurn[] | undefined,
  options: ChatOptions,
): Promise<string | null> {
  if (!llmActive()) return null;

  try {
    const response = await fetch(`${env.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.4,
        max_tokens: 450,
        messages: [
          { role: "system", content: buildChatSystemPrompt(options.preferences) },
          ...recentChatHistory(history).map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
          { role: "user", content: message },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? env.ai.chatTimeoutMs),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    return trimToWords(text, MAX_ANSWER_WORDS);
  } catch {
    return null;
  }
}

/** Answers a general question about food, diets or the app. */
export async function answerChat(
  message: string,
  history?: ChatTurn[],
  options: ChatOptions = {},
): Promise<ChatAnswer> {
  const trimmed = message.trim();
  if (!trimmed) return buildLocalChatAnswer("unknown");

  const topic = chatTopicOf(trimmed);

  // A sum or an unrelated task never reaches the provider.
  if (topic === "off-topic") return buildLocalChatAnswer("off-topic");

  const fromProvider = await callProvider(trimmed, history, options);
  if (fromProvider) {
    return {
      answer: fromProvider,
      source: "llm",
      topic,
      inScope: true,
      suggestions: CHAT_SUGGESTIONS,
    };
  }

  return {
    ...buildLocalChatAnswer(topic),
    source: llmActive() ? "llm-fallback" : "local-model",
  };
}
