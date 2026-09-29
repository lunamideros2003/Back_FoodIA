import { env } from "../config/env.ts";
import type { Mood, RecommendedDish } from "../domain/types.ts";
import type { RecommendationRequest } from "../domain/types.ts";

/**
 * Narrative layer. It turns the model's score breakdown into the sentence the
 * user actually reads.
 *
 * `local` mode is a deterministic composer that always works offline.
 * `openai` mode asks an LLM for a warmer, more conversational version and
 * silently falls back to the local composer if the call fails.
 */

interface NarrativeInput {
  mood: Mood;
  items: RecommendedDish[];
  request: RecommendationRequest;
  alternatives: { dish: { nameEs: string }; reason: string }[];
}

export interface NarrativeResult {
  text: string;
  source: "local-model" | "llm" | "llm-fallback";
}

const OPENERS: Record<string, string> = {
  tired: "Suena a día largo, así que vamos con cosas que se sienten abrazo:",
  happy: "Buen humor, buen apetito. Estos son los que brillan hoy:",
  stressed: "Respira. Nada de complicarse:",
  no_energy: "Sin batería, pero sin resignarte:",
  in_a_hurry: "Reloj en contra y producción en marcha:",
};

export function composeLocalNarrative(input: NarrativeInput): string {
  const opener = OPENERS[input.mood.key] ?? "Hoy te va bien esto:";
  const notes: string[] = [];

  if (input.request.freeText?.trim()) {
    notes.push(`Leí tu nota («${input.request.freeText.trim()}») y la usé como filtro.`);
  }
  if (input.request.maxPrepMinutes) {
    notes.push(`Prioricé lo que se hace en ${input.request.maxPrepMinutes} minutos o menos.`);
  }

  const top = input.items[0];
  if (top) {
    notes.push(`Mi apuesta principal es ${top.dish.nameEs}: ${firstReason(top.explanation)}.`);
  }

  const body = notes.length > 0 ? ` ${notes.join(" ")}` : "";
  const tail =
    input.alternatives.length > 0
      ? ` Si ninguno te convence, prueba con ${input.alternatives
          .slice(0, 2)
          .map((item) => item.dish.nameEs.toLowerCase())
          .join(" o ")}.`
      : "";

  return `${opener}${body}${tail}`.replace(/\s+\./g, ".");
}

function firstReason(explanation: string): string {
  const match = explanation.match(/^Porque\s+(.+?)\.\s/);
  return match ? match[1] : explanation;
}

function buildPrompt(input: NarrativeInput): string {
  const lines = input.items
    .slice(0, 4)
    .map(
      (item, index) =>
        `${index + 1}. ${item.dish.nameEs} (${item.dish.category}, ${item.dish.prepMinutes} min, ${item.dish.calories} kcal) — ${item.explanation}`,
    )
    .join("\n");

  return [
    "Eres FoodMood IA, un asistente de cocina que recomienda comida según el estado de ánimo.",
    `El usuario está "${input.mood.label}" y le recomendamos estos platos:`,
    lines,
    "",
    "Escribe 2 frases cortas en español de México, en tono cálido y cercano, que expliquen por qué el primero es la mejor opción. Sin listas, sin emojis, sin rodeos, máximo 55 palabras.",
  ].join("\n");
}

export async function buildNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const local = composeLocalNarrative(input);

  if (env.ai.provider !== "openai" || !env.ai.apiKey) {
    return { text: local, source: "local-model" };
  }

  try {
    const response = await fetch(`${env.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.7,
        max_tokens: 220,
        messages: [
          { role: "system", content: "Respondes siempre en español, breve y cálido." },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`LLM ${response.status}`);

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("LLM devolvió una respuesta vacía");

    return { text, source: "llm" };
  } catch {
    return { text: local, source: "llm-fallback" };
  }
}
