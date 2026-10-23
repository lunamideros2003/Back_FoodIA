import { env } from "../config/env.ts";
import { llmActive } from "./provider.ts";
import type { AssistantAnswer, AssistantContext, AssistantTurn } from "../domain/assistant.ts";
import {
  buildAdaptationAnswer,
  buildGenericAnswer,
  buildStepAnswer,
  buildSubstitutionAnswer,
  looksLikeAdaptation,
  looksLikeSubstitution,
} from "./assistantLocal.ts";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantPrompt,
} from "./assistantPrompt.ts";
import { safetyNotesForStep } from "./safety.ts";

/**
 * The cooking assistant.
 *
 * The call order is deliberate: the local answers are tried first, because
 * they are built from the recipe data and are always correct. The model is
 * only used for the open questions the recipe cannot answer by itself, and
 * when the provider is not configured or fails, the local answers are used
 * again. The app is never left without an answer.
 */

const MAX_ANSWER_WORDS = 160;

export interface AssistantOptions {
  /** Target number of servings, when the question is about scaling. */
  servings?: number;
  /** How long to wait for the provider, in milliseconds. */
  timeoutMs?: number;
}

function localAnswer(
  question: string,
  context: AssistantContext,
  options: AssistantOptions,
): AssistantAnswer {
  const stepIndex = context.stepIndex;

  let result =
    (looksLikeSubstitution(question) ? buildSubstitutionAnswer(question, context) : null) ??
    (looksLikeAdaptation(question)
      ? buildAdaptationAnswer(question, context, options.servings)
      : null) ??
    buildStepAnswer(question, context) ??
    buildGenericAnswer(question, context);

  const safetyNotes = safetyNotesForStep(context.dish, stepIndex).map((note) => note.text);

  return {
    answer: result.answer,
    source: "local-model",
    safetyNotes,
    stepContext: {
      index: stepIndex,
      title: `Paso ${stepIndex + 1}`,
      instruction: context.steps[stepIndex] ?? "",
    },
    uncertain: result.uncertain,
  };
}

async function callProvider(
  question: string,
  context: AssistantContext,
  history: AssistantTurn[] | undefined,
  timeoutMs: number,
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
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
          { role: "user", content: buildAssistantPrompt(context, question, history) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
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

function trimToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Answers a question about the recipe the person is cooking.
 */
export async function answerAssistantQuestion(
  question: string,
  context: AssistantContext,
  history?: AssistantTurn[],
  options: AssistantOptions = {},
): Promise<AssistantAnswer> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: "Escribe tu duda y te la resuelvo con la receta a la vista.",
      source: "local-model",
      safetyNotes: [],
      stepContext: null,
      uncertain: true,
    };
  }

  const timeoutMs = options.timeoutMs ?? env.ai.assistantTimeoutMs;

  // A question the recipe can answer on its own does not need the model.
  const direct =
    (looksLikeSubstitution(trimmed) ? buildSubstitutionAnswer(trimmed, context) : null) ??
    (looksLikeAdaptation(trimmed)
      ? buildAdaptationAnswer(trimmed, context, options.servings)
      : null);

  if (direct && !direct.uncertain) {
    return localAnswer(trimmed, context, options);
  }

  const fromProvider = await callProvider(trimmed, context, history, timeoutMs);

  if (fromProvider) {
    return {
      answer: fromProvider,
      source: "llm",
      safetyNotes: safetyNotesForStep(context.dish, context.stepIndex).map((note) => note.text),
      stepContext: {
        index: context.stepIndex,
        title: `Paso ${context.stepIndex + 1}`,
        instruction: context.steps[context.stepIndex] ?? "",
      },
      uncertain: false,
    };
  }

  const fallback = localAnswer(trimmed, context, options);
  return {
    ...fallback,
    source: llmActive() ? "llm-fallback" : "local-model",
  };
}
