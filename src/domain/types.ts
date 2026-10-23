export type MoodKey =
  | "tired"
  | "happy"
  | "stressed"
  | "sad"
  | "no_energy"
  | "in_a_hurry";

export type {
  CravingKey,
  MoodOptionKey,
  TimeBudgetKey,
} from "./questionnaire.ts";

import type {
  CravingKey,
  MoodOptionKey,
  TimeBudgetKey,
} from "./questionnaire.ts";

/** Health conditions the recommender must account for when ranking dishes. */
export type HealthCondition =
  | "diabetes"
  | "hypertension"
  | "celiac"
  | "lactose_intolerance"
  | "high_cholesterol";

export interface HealthProfile {
  diabetes: boolean;
  hypertension: boolean;
  celiac: boolean;
  lactoseIntolerance: boolean;
  highCholesterol: boolean;
  /** Set when the user explicitly answered, so we stop asking. */
  answeredAt: string | null;
}

export const EMPTY_HEALTH_PROFILE: HealthProfile = {
  diabetes: false,
  hypertension: false,
  celiac: false,
  lactoseIntolerance: false,
  highCholesterol: false,
  answeredAt: null,
};

export type InteractionAction =
  | "impression"
  | "view"
  | "like"
  | "save"
  | "cook"
  | "eat"
  | "rate"
  | "dislike";

export interface Mood {
  id: number;
  key: MoodKey;
  label: string;
  emoji: string;
  description: string;
  accent: string;
  sortOrder: number;
}

export interface Ingredient {
  id: number;
  name: string;
  label: string;
  category: string;
}

export interface DishIngredient {
  ingredientId: number;
  name: string;
  label: string;
  quantity: string;
  optional: boolean;
}
export interface DishAxes {
  comfort: number;
  energy: number;
  speed: number;
  lightness: number;
  richness: number;
  spice: number;
  sweetness: number;
  freshness: number;
  protein: number;
  indulgence: number;
  warmth: number;
  complexity: number;
  value: number;
}

export type AxisName = keyof DishAxes;

export const AXIS_NAMES: AxisName[] = [
  "comfort",
  "energy",
  "speed",
  "lightness",
  "richness",
  "spice",
  "sweetness",
  "freshness",
  "protein",
  "indulgence",
  "warmth",
  "complexity",
  "value",
];

export const AXIS_LABELS_ES: Record<AxisName, string> = {
  comfort: "nivel de consuelo",
  energy: "aporte de energía",
  speed: "rapidez",
  lightness: "ligereza",
  richness: "riqueza sabrosa",
  spice: "picor",
  sweetness: "dulzor",
  freshness: "frescura",
  protein: "proteína",
  indulgence: "antojo",
  warmth: "calidez",
  complexity: "complejidad",
  value: "precio accesible",
};

/** Grammatical gender of each axis label, used to build readable sentences. */
export const AXIS_FEMININE_ES: Record<AxisName, boolean> = {
  comfort: true,
  energy: true,
  speed: true,
  lightness: true,
  richness: true,
  spice: true,
  sweetness: true,
  freshness: true,
  protein: false,
  indulgence: false,
  warmth: true,
  complexity: true,
  value: true,
};

/**
 * Ready-made Spanish clauses for each axis. Using fixed verb phrases instead of
 * templating an adjective guarantees the generated sentence always reads
 * naturally, whatever the model's numbers say.
 */
export const AXIS_PHRASES_ES: Record<AxisName, string> = {
  comfort: "se siente como un abrazo",
  energy: "te devuelve la energía",
  speed: "se arma en nada",
  lightness: "no te pesa nada",
  richness: "es rico de verdad",
  spice: "trae el picante justo",
  sweetness: "te da ese dulce que se te antoja",
  freshness: "se siente fresquísimo",
  protein: "llena con proteína",
  indulgence: "es puro antojo",
  warmth: "sirve caliente y reconforta",
  complexity: "es sencillo y sin complicarte",
  value: "sale barato",
};

export interface Dish {
  id: number;
  name: string;
  nameEs: string;
  slug: string;
  category: string;
  description: string;
  prepMinutes: number;
  difficulty: "facil" | "media" | "avanzada";
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  priceLevel: 1 | 2 | 3;
  imageUrl: string;
  tags: string[];
  axes: DishAxes;
  ingredients: DishIngredient[];
  isVegetarian: boolean;
  isVegan: boolean;
  containsGluten: boolean;
}

export interface UserPreferences {
  diet: "omnivore" | "vegetarian" | "vegan" | "pescatarian";
  maxPrepMinutes: number | null;
  maxSpiceLevel: number;
  maxPriceLevel: number;
  allergies: string[];
  dislikedIngredients: string[];
  health: HealthProfile;
  /** Daily energy target used by the nutritional balance endpoint. */
  dailyCalorieGoal: number;
}

export interface Nutrition {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  sugarGrams: number;
  fiberGrams: number;
  sodiumMg: number;
}

export interface Dish {
  id: number;
  name: string;
  nameEs: string;
  slug: string;
  category: string;
  description: string;
  prepMinutes: number;
  difficulty: "facil" | "media" | "avanzada";
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  priceLevel: 1 | 2 | 3;
  imageUrl: string;
  tags: string[];
  axes: DishAxes;
  ingredients: DishIngredient[];
  isVegetarian: boolean;
  isVegan: boolean;
  containsGluten: boolean;
  servings: number;
  steps: string[];
  chefTip: string | null;
  nutrition: Nutrition;
}

export interface User {
  id: number;
  email: string;
  displayName: string;
  createdAt: string;
  preferences: UserPreferences;
}

export interface Interaction {
  id: number;
  userId: number;
  dishId: number;
  moodKey: MoodKey | null;
  action: InteractionAction;
  rating: number | null;
  servings: number;
  createdAt: string;
}

export interface RecommendationRequest {
  moodKey: MoodKey;
  userId?: number;
  limit?: number;
  freeText?: string;
  excludeDishIds?: number[];
  maxPrepMinutes?: number;
  diet?: UserPreferences["diet"];
  /** Per-request health conditions, for users without a saved profile yet. */
  conditions?: HealthCondition[];
  /** The plain-language mood the person picked in the wizard. */
  moodOption?: MoodOptionKey;
  /** How much time the person said they have. */
  timeBudget?: TimeBudgetKey;
  /** What the person feels like eating. */
  craving?: CravingKey;
  /** Ingredients the person already has at home. */
  availableIngredients?: string[];
  /** Ingredients the person does not want to see. */
  excludedIngredients?: string[];
  /** Hard restriction, treated like an allergy and never as a preference. */
  allergies?: string[];
  /** Difficulty ceiling for this search only. */
  difficulty?: "facil" | "media" | "avanzada";
}

export interface ScoreBreakdown {
  moodAffinity: number;
  tasteMatch: number;
  collaborative: number;
  preferenceFit: number;
  novelty: number;
  popularity: number;
  healthFit: number;
  /** How well the dish answers "what do I feel like eating". */
  cravingFit: number;
  /** How well the dish fits the time the person said they have. */
  timeFit: number;
  total: number;
  topReasons: { axis: AxisName; contribution: number; weight: number }[];
  healthNotes: string[];
}

export interface RecommendedDish {
  dish: Dish;
  score: number;
  breakdown: ScoreBreakdown;
  explanation: string;
  aiSource: "local-model" | "llm" | "llm-fallback";
  modelVersion: string;
}

/**
 * The structured form of a recommendation. The backend validates it, so the
 * frontend can render the "why" of every recipe without parsing prose.
 */
export interface StructuredRecommendation {
  recipeId: number;
  /** The short reason, written from the real recipe data. */
  reason: string;
  /** True when the recipe fits the time the person said they had. */
  timeMatch: boolean;
  /** The answers of the wizard this recipe satisfies. */
  preferencesSatisfied: string[];
  /** Anything the user should know before cooking it. */
  warnings: string[];
}

export interface RecommendationResponse {
  mood: Mood;
  generatedAt: string;
  modelVersion: string;
  strategy: string;
  narrative: string;
  items: RecommendedDish[];
  alternatives: { dish: Dish; score: number; reason: string }[];
  /**
   * True when the top matches are risky for someone with an unknown health
   * condition, so the UI should ask before serving the answer.
   */
  needsHealthInfo: boolean;
  healthQuestion: string | null;
  /** A warm, short paragraph shown above the results. */
  summary: string;
  /**
   * Set when the words the user typed suggest a situation that is bigger than
   * a recipe. It points at human support without diagnosing anything.
   */
  supportHint: string | null;
  /** The same results in a shape the backend has already validated. */
  structured: StructuredRecommendation[];
}

/* ------------------------------------------------------------------ *
 * Nutritional balance
 * ------------------------------------------------------------------ */

export interface ConsumedDish {
  dishId: number;
  nameEs: string;
  servings: number;
  calories: number;
  sugarGrams: number;
  eatenAt: string;
}

export interface BalanceResponse {
  consumed: ConsumedDish[];
  totals: {
    calories: number;
    sugarGrams: number;
    proteinGrams: number;
    fiberGrams: number;
    goalCalories: number;
  };
  /** Share of the daily goal already covered, 0..1+. */
  calorieProgress: number;
  severity: "ok" | "watch" | "high" | "over";
  headline: string;
  message: string;
  /** Lighter options for the rest of the day. */
  suggestions: RecommendedDish[];
  /** Shown when the mood is still low: a gentler comfort option. */
  comfortOption: RecommendedDish | null;
}
