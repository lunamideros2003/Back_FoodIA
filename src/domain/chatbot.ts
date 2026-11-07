/**
 * The general FoodMood chatbot.
 *
 * Unlike the recipe assistant, this chat is not tied to a dish: people can ask
 * about food, diets or how to use the app. The backend decides the topic before
 * spending a model call, so an off-topic question is refused deterministically.
 */

export type ChatTopic = "food" | "app" | "greeting" | "off-topic" | "unknown";

export type ChatSource = "local-model" | "llm" | "llm-fallback";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** The preferences the chat may use to keep an answer relevant and safe. */
export interface ChatPreferences {
  diet: string;
  allergies: string[];
}

export interface ChatRequest {
  message: string;
  history?: ChatTurn[];
  userId?: number;
}

export interface ChatAnswer {
  /** The answer the person reads. */
  answer: string;
  source: ChatSource;
  topic: ChatTopic;
  /** False when the question was outside food, diets or the app. */
  inScope: boolean;
  /** Follow-up questions the UI can offer as chips. */
  suggestions: string[];
}
