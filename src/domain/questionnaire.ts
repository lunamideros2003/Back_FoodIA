import type { MoodKey } from "./types.ts";

/**
 * The "Mi ánimo" wizard asks six plain-language questions. They are a UI
 * vocabulary, not a new model: every option is mapped onto one of the six
 * canonical moods the recommender already understands, plus a set of biases
 * that describe what the person is actually asking for.
 */
export type MoodOptionKey =
  | "energized"
  | "low"
  | "stressed_tired"
  | "bored"
  | "calm"
  | "celebrating";

export interface MoodOption {
  key: MoodOptionKey;
  /** What the person reads on the card. */
  label: string;
  /** One short line under the title. */
  description: string;
  /** Name of the line icon the frontend should draw. */
  icon: string;
  /** The canonical mood the model already knows how to rank with. */
  moodKey: MoodKey;
  /** How strongly the craving channel should drive this search, 0..1. */
  cravingWeight: number;
  /** How strongly "try something different" should drive this search, 0..1. */
  noveltyWeight: number;
}

export const MOOD_OPTIONS: MoodOption[] = [
  {
    key: "energized",
    label: "Con energía",
    description: "Me apetece preparar algo rico.",
    icon: "energy",
    moodKey: "happy",
    cravingWeight: 0.7,
    noveltyWeight: 0.35,
  },
  {
    key: "low",
    label: "Con el ánimo bajo",
    description: "Quiero algo reconfortante y fácil de preparar.",
    icon: "comfort",
    moodKey: "sad",
    cravingWeight: 0.75,
    noveltyWeight: 0.1,
  },
  {
    key: "stressed_tired",
    label: "Con estrés o cansancio",
    description: "Prefiero algo sencillo y sin complicaciones.",
    icon: "calm",
    moodKey: "stressed",
    cravingWeight: 0.6,
    noveltyWeight: 0.05,
  },
  {
    key: "bored",
    label: "Aburrido/a",
    description: "Quiero probar algo diferente.",
    icon: "spark",
    moodKey: "no_energy",
    cravingWeight: 0.35,
    noveltyWeight: 1,
  },
  {
    key: "calm",
    label: "Tranquilo/a",
    description: "Tengo ganas de disfrutar cocinando.",
    icon: "leaf",
    moodKey: "tired",
    cravingWeight: 0.55,
    noveltyWeight: 0.3,
  },
  {
    key: "celebrating",
    label: "Con ganas de celebrar",
    description: "Quiero preparar algo especial.",
    icon: "toast",
    moodKey: "happy",
    cravingWeight: 0.85,
    noveltyWeight: 0.2,
  },
];

export function findMoodOption(key: MoodOptionKey): MoodOption | undefined {
  return MOOD_OPTIONS.find((option) => option.key === key);
}

/** How long the person is willing to spend in the kitchen. */
export type TimeBudgetKey = "under_10" | "between_10_30" | "plenty";

export interface TimeBudget {
  key: TimeBudgetKey;
  label: string;
  description: string;
  /** Hard ceiling in minutes. `null` means "no ceiling". */
  maxMinutes: number | null;
}

export const TIME_BUDGETS: TimeBudget[] = [
  {
    key: "under_10",
    label: "Menos de 10 minutos",
    description: "Quiero algo en la mesa casi ya.",
    maxMinutes: 10,
  },
  {
    key: "between_10_30",
    label: "Entre 10 y 30 minutos",
    description: "Tengo media hora para cocinar con calma.",
    maxMinutes: 30,
  },
  {
    key: "plenty",
    label: "Tengo tiempo para cocinar",
    description: "Me quiero quitar la cocina de encima.",
    maxMinutes: null,
  },
];

export function findTimeBudget(key: TimeBudgetKey): TimeBudget | undefined {
  return TIME_BUDGETS.find((budget) => budget.key === key);
}

/** What the person feels like eating. */
export type CravingKey = "sweet" | "savory" | "light" | "comfort" | "surprise";

export interface Craving {
  key: CravingKey;
  label: string;
  description: string;
}

export const CRAVINGS: Craving[] = [
  { key: "sweet", label: "Algo dulce", description: "Me apetece algo con azúcar." },
  { key: "savory", label: "Algo salado", description: "Quiero un plato completo." },
  { key: "light", label: "Algo ligero y fresco", description: "Prefiero algo que no pese." },
  { key: "comfort", label: "Algo reconfortante", description: "Busco algo que se sienta abrazo." },
  { key: "surprise", label: "Me da igual, sorpréndeme", description: "Elige tú lo que mejor encaje." },
];

export function findCraving(key: CravingKey): Craving | undefined {
  return CRAVINGS.find((craving) => craving.key === key);
}

/** The dietary styles the wizard offers in the optional panel. */
export const DIET_OPTIONS = [
  { value: "omnivore", label: "Sin restricciones" },
  { value: "vegetarian", label: "Vegetariano" },
  { value: "vegan", label: "Vegano" },
  { value: "pescatarian", label: "Pescetariano" },
] as const;

export const DIFFICULTY_OPTIONS = [
  { value: "facil", label: "Fácil" },
  { value: "media", label: "Media" },
  { value: "avanzada", label: "Avanzada" },
] as const;

/** The whole wizard, in one object. The frontend posts exactly this shape. */
export interface QuestionnairePayload {
  moodOption: MoodOptionKey;
  /** Optional free text, the person can say whatever they want or nothing. */
  note?: string;
  timeBudget: TimeBudgetKey;
  craving: CravingKey;
  /** Ingredients the person already has at home. */
  availableIngredients?: string[];
  /** Ingredients the person does not want to see. */
  excludedIngredients?: string[];
  /** Hard restriction, never a soft preference. */
  allergies?: string[];
  diet?: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
  difficulty?: "facil" | "media" | "avanzada";
  /** How many people the recipe should serve. */
  servings?: number;
}

export const MAX_NOTE_LENGTH = 240;
export const MAX_INGREDIENT_LENGTH = 40;
export const MAX_INGREDIENTS = 20;
