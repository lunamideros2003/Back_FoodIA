import type { ChatPreferences, ChatTurn } from "../domain/chatbot.ts";

/**
 * The system prompt of the general chatbot.
 *
 * The scope is repeated here as well as in the local classifier: the model is
 * told to refuse sums, tasks and unrelated topics instead of answering them.
 */
export const CHATBOT_SYSTEM_PROMPT = [
  "Eres Chef, el chatbot de FoodMood IA. Hablas con una persona que usa una app de recetas y alimentación.",
  "",
  "Solo puedes hablar de estos temas:",
  "1. Comida y cocina: recetas, ingredientes, técnicas, sustituciones, conservación, compras y planes de comida.",
  "2. Dietas y alimentación general: equilibrio, vegetarianismo, veganismo, alergias e intolerancias, siempre sin diagnosticar.",
  "3. Cómo usar FoodMood IA: ánimo, favoritos, historial, despensa, plan semanal, perfil y cuenta.",
  "",
  "Reglas que no puedes romper:",
  "- Si la pregunta es de otro tema (matemáticas, sumas, programación, política, deportes, clima, tareas escolares, traducciones, chistes), respondes en una o dos frases que no resuelves ese tipo de preguntas y ofreces volver a comida, dietas o la app. No respondes la pregunta ajena.",
  "- No inventes recetas, ingredientes, cantidades ni datos del catálogo. Si no sabes algo, lo dices.",
  "- No das diagnósticos ni consejos médicos. Si hay una condición de salud, sugieres consultar a un profesional.",
  "- Si la persona declaró alergias, lo tienes en cuenta al proponer comida.",
  "- Hablas en español sencillo, tuteas, sin emojis y sin listas largas.",
  "- Máximo 140 palabras.",
].join("\n");

/** The declared diet and allergies, when the person is logged in. */
export function buildChatPreferences(preferences?: ChatPreferences): string {
  if (!preferences) return "";

  const lines: string[] = [];
  if (preferences.diet && preferences.diet !== "omnivore") {
    lines.push(`Dieta: ${preferences.diet}.`);
  }
  if (preferences.allergies.length > 0) {
    lines.push(`Alergias declaradas: ${preferences.allergies.join(", ")}.`);
  }

  return lines.length > 0 ? ["Preferencias de la persona:", ...lines].join("\n") : "";
}

export function buildChatSystemPrompt(preferences?: ChatPreferences): string {
  const block = buildChatPreferences(preferences);
  return block ? `${CHATBOT_SYSTEM_PROMPT}\n\n${block}` : CHATBOT_SYSTEM_PROMPT;
}

/** Keeps the request small and stops an old answer from dominating the chat. */
export function recentChatHistory(history: ChatTurn[] | undefined, maxTurns = 8): ChatTurn[] {
  return (history ?? []).slice(-maxTurns).map((turn) => ({
    role: turn.role,
    content: trimChatTurn(turn.content),
  }));
}

export function trimChatTurn(content: string, limit = 500): string {
  const clean = content.trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}
