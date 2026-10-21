import type { AssistantContext } from "../domain/assistant.ts";

/**
 * Prompt building for the cooking assistant.
 *
 * The prompt is written in Spanish because that is the language the user
 * reads, and it states the rules the model has to follow: no invented
 * quantities, no medical claims, no pressure to eat.
 */
export const ASSISTANT_SYSTEM_PROMPT = [
  "Eres el asistente de cocina de FoodMood IA. Ayudas a una persona que está preparando una receta ahora mismo.",
  "",
  "Reglas que no puedes romper:",
  "- Solo te apoyas en la receta y los ingredientes que te doy. No inventes ingredientes, cantidades, temperaturas ni tiempos.",
  "- Si no sabes algo con certeza, lo dices y sugieres cómo comprobarlo.",
  "- Hablas en español sencillo, como un amigo que cocina contigo. Tuteas.",
  "- No das consejos médicos, no diagnosticas y no dices que una comida cura o mejora un estado de ánimo.",
  "- No presionas a la persona para que coma ni para que deje de comer.",
  "- Si una sustitución puede cambiar mucho el resultado o afectar a una alergia, lo explicas.",
  "- Máximo 120 palabras. Sin listas, sin emojis, sin rodeos.",
].join("\n");

/** The recipe the person is cooking right now. */
export function buildRecipeContext(context: AssistantContext): string {
  const lines: string[] = [];

  lines.push(`Receta: ${context.dish.nameEs}`);
  lines.push(`Categoría: ${context.dish.category}`);
  lines.push(`Tiempo total: ${context.dish.prepMinutes} minutos`);
  lines.push(`Porciones: ${context.dish.servings}`);
  lines.push(`Dificultad: ${context.dish.difficulty}`);
  lines.push(`Descripción: ${context.dish.description}`);
  lines.push("");

  lines.push("Ingredientes:");
  for (const item of context.ingredients) {
    const optional = item.optional ? " (opcional)" : "";
    lines.push(`- ${item.label}: ${item.quantity || "al gusto"}${optional}`);
  }
  lines.push("");

  lines.push("Pasos:");
  context.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });

  if (context.allergens.length > 0) {
    lines.push("");
    lines.push(`Alérgenos de esta receta: ${context.allergens.join(", ")}.`);
  }
  if (context.allergies.length > 0) {
    lines.push(`Alergias declaradas por la persona: ${context.allergies.join(", ")}.`);
  }
  if (context.diet && context.diet !== "omnivore") {
    lines.push(`Preferencia alimentaria: ${context.diet}.`);
  }

  if (context.substitutions.length > 0) {
    lines.push("");
    lines.push("Sustituciones ya verificadas para esta receta:");
    for (const substitution of context.substitutions) {
      lines.push(
        `- ${substitution.original} → ${substitution.replacement} (${substitution.quantity}). ${substitution.note}`,
      );
    }
  }

  return lines.join("\n");
}

/** The step the person is on right now, so the answer stays in context. */
export function buildStepContext(context: AssistantContext): string {
  const step = context.steps[context.stepIndex];
  if (!step) {
    return "La persona está antes de empezar la receta.";
  }
  return `La persona está en el paso ${context.stepIndex + 1} de ${context.steps.length}: ${step}`;
}

/**
 * The conversation so far, trimmed to the last few turns so the request
 * stays small and the person does not have to repeat the recipe.
 */
export function buildHistoryBlock(
  history: { role: "user" | "assistant"; content: string }[] | undefined,
  maxTurns = 6,
): string {
  if (!history || history.length === 0) return "";
  const recent = history.slice(-maxTurns);
  if (recent.length === 0) return "";
  return [
    "Conversación previa:",
    ...recent.map((turn) => `${turn.role === "user" ? "Persona" : "Asistente"}: ${turn.content}`),
  ].join("\n");
}

/** The final user prompt. */
export function buildAssistantPrompt(
  context: AssistantContext,
  question: string,
  history?: { role: "user" | "assistant"; content: string }[],
): string {
  return [
    buildRecipeContext(context),
    "",
    buildStepContext(context),
    buildHistoryBlock(history),
    "",
    `Pregunta de la persona: ${question}`,
  ]
    .filter((block) => block.length > 0)
    .join("\n");
}
