export interface RecipeDetail {
  servings: number;
  steps: string[];
  chefTip: string | null;
  /** Per serving. Sugar, fiber and sodium drive the health-aware ranking. */
  sugarGrams: number;
  fiberGrams: number;
  sodiumMg: number;
}

export type RecipeMap = Record<string, RecipeDetail>;
