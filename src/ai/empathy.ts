/**
 * Empathy layer.
 *
 * The app is a recipe app, not a therapist. When somebody says they are
 * having a hard time, the useful thing to do is to be warm, to keep offering
 * food without making claims about what food does for the mind, and to point
 * at human support when the words suggest the situation is bigger than a
 * recipe.
 *
 * Nothing in here diagnoses, nothing in here treats, and nothing in here
 * tells somebody they have to eat (or stop eating) anything.
 */

/** Phrases that suggest the person is going through something difficult. */
const DISTRESS_MARKERS = [
  "muy triste",
  "triste",
  "deprimid",
  "depresion",
  "ansiedad",
  "ansios",
  "no puedo mas",
  "no puedo más",
  "sin ganas de vivir",
  "sin ganas de nada",
  "todo es demais",
  "todo es demasiado",
  "me siento solo",
  "me siento sola",
  "no tengo ganas",
  "desanimad",
  "agotad",
  "desesperad",
  "miedo",
  "solo",
  "nadie me entiende",
];

/** Words that mean the person is asking about a habit, not a crisis. */
const CASUAL_MARKERS = ["cansad", "estres", "estresad", "con energia", "animado", "feliz"];

/**
 * Whether the free text suggests a persistent or serious emotional
 * situation. It is a light heuristic, never a diagnosis.
 */
export function mentionsDistress(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const distress = DISTRESS_MARKERS.some((marker) => normalized.includes(marker));
  if (!distress) return false;

  // A single tired word is not a crisis.
  const casual = CASUAL_MARKERS.some((marker) => normalized.includes(marker));
  return !casual || normalized.length > 120;
}

export interface EmpathyNotice {
  /** The short paragraph shown above the recipes. */
  text: string;
  /** True when it is worth pointing at human support. */
  offerSupport: boolean;
  /** The support hint, when it applies. */
  supportHint?: string;
}

/**
 * The hint that points at human support. It is only offered when the words
 * suggest the situation is bigger than a recipe, and it never tells the person
 * what is wrong with them.
 */
export function buildSupportSuggestion(text: string | null | undefined): string | null {
  if (!mentionsDistress(text)) return null;
  return (
    "Si llevas mucho tiempo con este ánimo, habla con alguien de confianza o con un profesional. " +
    "Esta app de recetas no puede sustituir esa ayuda."
  );
}

/**
 * The paragraph shown above the recommendations. It never says that a recipe
 * will change how somebody feels; it only says what the app can do, which is
 * to find something that matches the moment.
 */
export function buildEmpathyNotice(
  moodLabel: string,
  text: string | null | undefined,
): EmpathyNotice {
  const distress = mentionsDistress(text);

  if (!distress) {
    return {
      text: "Vamos a buscar algo que encaje con cómo te sientes hoy.",
      offerSupport: false,
    };
  }

  return {
    text:
      "Gracias por contarlo. Te voy a buscar algo que se sienta bien y que puedas preparar sin mucho esfuerzo, " +
      "para que al menos el rato en la cocina sea tranquilo.",
    offerSupport: true,
    supportHint:
      "Si llevas mucho tiempo con este ánimo, habla con alguien de confianza o con un profesional. Esta app de recetas no puede sustituir esa ayuda.",
  };
}
