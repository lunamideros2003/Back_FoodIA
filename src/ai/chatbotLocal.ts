import type { ChatAnswer, ChatTopic } from "../domain/chatbot.ts";
import { CHAT_SUGGESTIONS, localChatCopy } from "./chatCopy.ts";

/**
 * The answer when the model is not configured, fails, or the question is out
 * of scope. It never invents a recipe or a quantity: it explains what the chat
 * can do and offers the next useful questions.
 */
export function buildLocalChatAnswer(topic: ChatTopic): ChatAnswer {
  return {
    answer: localChatCopy(topic),
    source: "local-model",
    topic,
    inScope: topic !== "off-topic",
    suggestions: CHAT_SUGGESTIONS,
  };
}
