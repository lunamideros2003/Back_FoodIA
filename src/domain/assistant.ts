import type { Dish, DishIngredient } from "./types.ts";

/**
 * The "Cocinar conmigo" assistant. The frontend never talks to a model
 * provider directly: it sends the question plus the recipe context to this
 * backend, and the backend decides whether to answer from the local rules or
 * from the configured provider.
 */
export type AssistantTopic = "question" | "substitution" | "adaptation" | "support";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  /** The question as the person typed it. */
  question: string;
  /** Zero-based index of the step the person is on. */
  stepIndex?: number;
  /** Short conversation history so the context survives between questions. */
  history?: AssistantTurn[];
  /** The ingredient the person is missing, for substitution questions. */
  ingredient?: string;
  /** Target number of servings, for adaptation questions. */
  servings?: number;
  userId?: number;
}

export interface AssistantAnswer {
  /** The answer the user reads. */
  answer: string;
  /** Where the answer came from. */
  source: "local-model" | "llm" | "llm-fallback";
  /** Safety notes that must be shown next to the answer. */
  safetyNotes: string[];
  /** The step the answer refers to, when the assistant could resolve it. */
  stepContext: {
    index: number;
    title: string;
    instruction: string;
  } | null;
  /** True when the model could not produce a confident answer. */
  uncertain: boolean;
}

export interface AssistantContext {
  dish: Dish;
  ingredients: DishIngredient[];
  steps: string[];
  stepIndex: number;
  allergens: string[];
  substitutions: VerifiedSubstitution[];
  /** Restrictions the person declared, used to keep the answer safe. */
  allergies: string[];
  diet: string;
}

/**
 * A substitution that has been reviewed against the recipe, so the assistant
 * can offer it with a real quantity and an honest note about what changes.
 */
export interface VerifiedSubstitution {
  original: string;
  replacement: string;
  quantity: string;
  note: string;
}
