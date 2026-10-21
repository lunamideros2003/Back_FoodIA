import type { AssistantContext } from "../domain/assistant.ts";
import { findSubstitutionsFor } from "../db/seed/dietary.ts";

/**
 * The offline answers.
 *
 * When there is no model provider configured, or the call fails, the app still
 * has to be useful. These answers are built from the recipe data, so they are
 * always correct about what the recipe contains, and they never invent a
 * quantity that is not in the catalogue.
 */

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** True when the question is really about a missing ingredient. */
export function looksLikeSubstitution(question: string): boolean {
  const text = normalize(question);
  return (
    text.includes("sustit") ||
    text.includes("reemplaz") ||
    text.includes("cambio") ||
    text.includes("en vez de") ||
    text.includes("no tengo") ||
    text.includes("me falta")
  );
}

/** True when the question is about scaling the recipe. */
export function looksLikeAdaptation(question: string): boolean {
  const text = normalize(question);
  return (
    text.includes("porcion") ||
    text.includes("personas") ||
    text.includes("cantidad") ||
    text.includes("doblar") ||
    text.includes("mitad") ||
    text.includes("adapt")
  );
}

/**
 * Finds the ingredient the question is about, by looking for the labels of
 * the recipe inside the question.
 */
export function detectIngredient(question: string, context: AssistantContext): string | null {
  const text = normalize(question);
  let best: { label: string; length: number } | null = null;

  for (const item of context.ingredients) {
    const label = normalize(item.label);
    if (label.length < 3) continue;
    if (!text.includes(label)) continue;
    if (!best || label.length > best.length) best = { label: item.label, length: label.length };
  }

  if (best) return best.label;

  // The question may name a generic ingredient that is not on the label list.
  const generic = ["leche", "mantequilla", "huevo", "azucar", "harina", "crema", "queso"];
  const hit = generic.find((marker) => text.includes(marker));
  return hit ?? null;
}

/**
 * The answer for "I am missing an ingredient". It only offers substitutions
 * that were verified against the catalogue, and it always says what changes.
 */
export function buildSubstitutionAnswer(
  question: string,
  context: AssistantContext,
): { answer: string; uncertain: boolean } | null {
  const ingredient = detectIngredient(question, context);
  if (!ingredient) return null;

  const options = findSubstitutionsFor(ingredient);
  if (options.length === 0) {
    return {
      answer:
        `No tengo una sustitución verificada para ${ingredient} en esta receta. ` +
        `Lo más seguro es dejar esa parte fuera o consultarlo con alguien que cocine esta preparación.`,
      uncertain: true,
    };
  }

  const lines = options
    .slice(0, 2)
    .map(
      (option) =>
        `Puedes usar ${option.replacement}: ${option.quantity}. Ten en cuenta que ${option.note}`,
    );

  const allergenWarning = context.allergens.length > 0
    ? ` Esta receta lleva ${context.allergens.join(", ")}, así que revisa que el sustituto no añada ninguno.`
    : "";

  return {
    answer: `Para ${ingredient}: ${lines.join(" ")}${allergenWarning}`,
    uncertain: false,
  };
}

/**
 * The answer for "how do I scale this?". The quantities come from the recipe
 * itself, so the arithmetic is honest.
 */
export function buildAdaptationAnswer(
  question: string,
  context: AssistantContext,
  targetServings?: number,
): { answer: string; uncertain: boolean } | null {
  const servings = targetServings ?? context.dish.servings;
  const factor = servings / Math.max(1, context.dish.servings);

  if (Math.abs(factor - 1) < 0.01) {
    return {
      answer: `Esta receta está calculada para ${context.dish.servings} porciones, que es justo como está escrita.`,
      uncertain: false,
    };
  }

  if (factor < 1) {
    return {
      answer:
        `Para ${servings} porciones te conviene usar la mitad de las cantidades de la receta ` +
        `(que es para ${context.dish.servings}). A fuego medio y con el fuego un poco más bajo, porque ` +
        `todo se cocina más rápido.`,
      uncertain: true,
    };
  }

  return {
    answer:
      `Para ${servings} porciones multiplica las cantidades por ${Math.round(factor * 100) / 100}. ` +
      `El tiempo de cocción no se multiplica: sigue siendo más o menos el mismo, sólo tardas un poco más en terminar.`,
    uncertain: false,
  };
}

/**
 * The answer for a question about the step the person is on.
 */
export function buildStepAnswer(
  question: string,
  context: AssistantContext,
): { answer: string; uncertain: boolean } | null {
  const step = context.steps[context.stepIndex];
  if (!step) return null;

  const text = normalize(question);
  const words = text
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length > 4)
    .slice(0, 6);

  if (words.length === 0) {
    return {
      answer: `El paso ${context.stepIndex + 1} dice: ${step}`,
      uncertain: false,
    };
  }

  // Find the step that shares the most words with the question.
  let bestIndex = -1;
  let bestScore = 0;
  context.steps.forEach((candidate, index) => {
    const normalized = normalize(candidate);
    const score = words.filter((word) => normalized.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex === -1) {
    return {
      answer:
        `En el paso ${context.stepIndex + 1} la receta dice: ${step} ` +
        `Si me dices qué parte no te queda clara, te la explico más a detalle.`,
      uncertain: true,
    };
  }

  return {
    answer:
      `Revisa el paso ${bestIndex + 1}: ${context.steps[bestIndex]} ` +
      (bestIndex === context.stepIndex
        ? "Es justo el punto en el que estás, así que si algo no te cuadra, dime qué ves."
        : "El siguiente paso es este."),
    uncertain: false,
  };
}

/**
 * The answer used when nothing more specific applies.
 */
export function buildGenericAnswer(
  question: string,
  context: AssistantContext,
): { answer: string; uncertain: boolean } {
  const step = context.steps[context.stepIndex];
  const ingredients = context.ingredients
    .slice(0, 4)
    .map((item) => item.label.toLowerCase())
    .join(", ");

  return {
    answer:
      `Para ${context.dish.nameEs} vas a necesitar ${ingredients}. ` +
      (step ? `Ahora mismo estás en el paso ${context.stepIndex + 1}: ${step} ` : "") +
      `Cuéntame un poco más de tu duda y te la intento resolver con lo que sí está en la receta.`,
    uncertain: true,
  };
}
