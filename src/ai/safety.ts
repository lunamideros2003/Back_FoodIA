import type { Dish } from "../domain/types.ts";

/**
 * Safety notes that must travel with an answer when they apply.
 *
 * The rules are deliberately simple and factual. They never tell the user
 * that a food cures a mood, and they never replace professional advice.
 */

/** Ingredients that need a specific cooking treatment. */
const RAW_PROTEINS = [
  "huevo",
  "huevos",
  "pollo",
  "pavo",
  "res",
  "camaron",
  "salmon",
  "atun",
  "carne",
  "tocino",
  "jamon",
];

const DAIRY_FRESH = ["leche", "crema", "yogur", "queso", "mantequilla"];

const MAYONNAISE_FRESH = ["mayonesa", "crema agria"];

/** Temperatures and times that only make sense for real cooking. */
export interface SafetyNote {
  id: string;
  /** The note the user reads. */
  text: string;
  /** The step the note belongs to, when it is step specific. */
  stepIndex?: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * The safety notes that apply to a recipe, derived from its ingredients and
 * from what the step is actually doing.
 */
export function safetyNotesForDish(dish: Dish): SafetyNote[] {
  const notes: SafetyNote[] = [];
  const labels = dish.ingredients.map((item) => normalize(item.label));

  const hasRawProtein = labels.some((label) =>
    RAW_PROTEINS.some((marker) => label.includes(marker)),
  );
  if (hasRawProtein) {
    notes.push({
      id: "cook-through",
      text: "La proteína tiene que quedar bien cocida por dentro: sin zonas crudas ni translúcidas.",
    });
  }

  const hasEgg = labels.some((label) => label.includes("huevo"));
  if (hasEgg) {
    notes.push({
      id: "eggs",
      text: "Si el huevo lleva clara, tiene que cuajar por completo; la yema puede quedar líquida a gusto, pero la clara no.",
    });
  }

  const hasDairy = labels.some((label) =>
    DAIRY_FRESH.some((marker) => label.includes(marker)),
  );
  if (hasDairy) {
    notes.push({
      id: "dairy-storage",
      text: "Lo que lleva leche o queso se guarda en el refrigerador y se usa en pocos días.",
    });
  }

  const hasFreshCream = labels.some((label) =>
    MAYONNAISE_FRESH.some((marker) => label.includes(marker)),
  );
  if (hasFreshCream) {
    notes.push({
      id: "cold-dishes",
      text: "Esta preparación se come fría: mantenla en el refrigerador hasta servirla.",
    });
  }

  const hasOven = dish.steps.some((step) => {
    const text = normalize(step);
    return text.includes("horno") || text.includes("hornea");
  });
  if (hasOven) {
    notes.push({
      id: "oven",
      text: "El horno debe estar bien precalentado antes de meter la bandeja, si no la preparación no se cuece parejo.",
    });
  }

  const hasRice = labels.some((label) => label.includes("arroz"));
  if (hasRice) {
    notes.push({
      id: "rice-storage",
      text: "El arroz cocido no se guarda a temperatura ambiente: al refri dentro de dos horas.",
    });
  }

  return notes;
}

/**
 * Notes for one specific step of the recipe, so the panel can show them next
 * to the instruction the person is reading.
 */
export function safetyNotesForStep(dish: Dish, stepIndex: number): SafetyNote[] {
  const step = dish.steps[stepIndex];
  if (!step) return [];

  const notes = safetyNotesForDish(dish);
  const text = normalize(step);

  const stepNotes: SafetyNote[] = [];

  if (text.includes("frio") || text.includes("refriger")) {
    stepNotes.push({
      id: "cold-step",
      text: "Este paso se trabaja en frío: usa una superficie y un recipiente limpios.",
      stepIndex,
    });
  }
  if (text.includes("horno") || text.includes("hornea")) {
    stepNotes.push({
      id: "oven-step",
      text: "Precalienta el horno antes de empezar, a la temperatura que indique la receta.",
      stepIndex,
    });
  }
  if (text.includes("microondas")) {
    stepNotes.push({
      id: "microwave-step",
      text: "En el microondas el tiempo depende mucho del aparato: detente a revisar antes de servir.",
      stepIndex,
    });
  }
  if (text.includes("hierve") || text.includes("hervir") || text.includes("cocina")) {
    stepNotes.push({
      id: "heat-step",
      text: "Al hervir no te alejes: el fuego puede pasarse en segundos.",
      stepIndex,
    });
  }

  return stepNotes.length > 0 ? stepNotes : notes.filter((note) => note.stepIndex === stepIndex);
}

/**
 * A general note that is always worth showing next to a cooking answer.
 */
export const GENERAL_SAFETY_NOTE: SafetyNote = {
  id: "general",
  text: "Si algo no te queda claro o el punto te da cosa, escríbelo: es mejor preguntar que servir algo a medias.",
};
