import type { Dish, HealthCondition, HealthProfile } from "../domain/types.ts";
import { EMPTY_HEALTH_PROFILE } from "../domain/types.ts";
import { clamp } from "./vector.ts";

/**
 * Health-aware layer.
 *
 * Mood ranking answers "what sounds good right now". This layer answers "what
 * is safe for this person", which is a different question and has to win when
 * they conflict. Conditions are hard exclusions because a wrong suggestion
 * matters much more than a bland one.
 */

export const CONDITION_LABELS: Record<HealthCondition, string> = {
  diabetes: "Diabetes",
  hypertension: "Hipertensión",
  celiac: "Celiaquía",
  lactose_intolerance: "Intolerancia a la lactosa",
  high_cholesterol: "Colesterol alto",
};

/**
 * Per-serving limits used to flag a dish as risky, not to ban it outright.
 * The values are calibrated against the catalogue's real distribution
 * (sugar 0-26 g, sodium 0-1580 mg, fat 0-34 g per serving) so the filters
 * actually bite instead of never triggering.
 */
const LIMITS = {
  /** Above this per serving a diabetic gets a warning. */
  sugarWarningGrams: 15,
  /** Sugar ceiling for a dish that gets fully filtered out. */
  sugarBlockGrams: 22,
  /** Sodium above this per serving matters for hypertension. */
  sodiumWarningMg: 400,
  sodiumBlockMg: 800,
  /** Saturated-fat proxy: fat grams for a dish under 400 kcal. */
  cholesterolWarningFatGrams: 22,
  cholesterolBlockFatGrams: 30,
  /** Under this fiber a dish is a poor fit for anyone managing blood sugar. */
  fiberPreferredGrams: 6,
} as const;

/** Reference intake for free sugars, used by the light-mode ranking too. */
export const DAILY_SUGAR_REFERENCE_G = 50;

export interface HealthVerdict {
  /** null when the dish is fine for this person. */
  blockingReason: string | null;
  warnings: string[];
  /** 0..1, how well the dish fits the whole health picture. */
  score: number;
}

export function conditionsOf(
  profile: HealthProfile | null | undefined,
  extra: HealthCondition[] = [],
): HealthCondition[] {
  const set = new Set<HealthCondition>(extra);
  if (profile) {
    if (profile.diabetes) set.add("diabetes");
    if (profile.hypertension) set.add("hypertension");
    if (profile.celiac) set.add("celiac");
    if (profile.lactoseIntolerance) set.add("lactose_intolerance");
    if (profile.highCholesterol) set.add("high_cholesterol");
  }
  return [...set];
}

export function hasAnyCondition(conditions: HealthCondition[]): boolean {
  return conditions.length > 0;
}

const LACTOSE_FOODS = new Set([
  "leche", "yogur griego", "yogur", "crema de leche", "mantequilla", "queso feta",
  "parmesano", "mascarpone", "mozzarella", "queso crema", "nata",
]);

const LACTOSE_FOODS_NORMALIZED = new Set(
  [...LACTOSE_FOODS].map((item) => normalize(item)),
);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasLactose(dish: Dish): boolean {
  return dish.ingredients.some((item) =>
    LACTOSE_FOODS_NORMALIZED.has(normalize(item.label)),
  );
}

export function evaluateDish(
  dish: Dish,
  conditions: HealthCondition[],
  dailyCalorieGoal: number,
): HealthVerdict {
  const warnings: string[] = [];
  let blockingReason: string | null = null;
  let score = 1;

  const calorieRatio = dailyCalorieGoal > 0 ? dish.calories / dailyCalorieGoal : 0;

  for (const condition of conditions) {
    switch (condition) {
      case "diabetes": {
        if (dish.nutrition.sugarGrams > LIMITS.sugarBlockGrams) {
          blockingReason = "Tiene demasiado azúcar para tu diabetes";
        } else if (dish.nutrition.sugarGrams > LIMITS.sugarWarningGrams) {
          warnings.push("Cuidado: es una opción alta en azúcar");
          score -= 0.3;
        }
        if (dish.nutrition.fiberGrams < LIMITS.fiberPreferredGrams) {
          score -= 0.15;
        }
        // Protein and fiber slow the glucose spike, so they push back up.
        if (dish.proteinGrams >= 25) score += 0.15;
        if (dish.nutrition.fiberGrams >= LIMITS.fiberPreferredGrams) score += 0.15;
        break;
      }

      case "hypertension": {
        if (dish.nutrition.sodiumMg > LIMITS.sodiumBlockMg) {
          blockingReason = "Demasiado sodio para tu presión";
        } else if (dish.nutrition.sodiumMg > LIMITS.sodiumWarningMg) {
          warnings.push("Cuidado: tiene bastante sodio");
          score -= 0.25;
        }
        if (dish.nutrition.fiberGrams >= LIMITS.fiberPreferredGrams) score += 0.1;
        break;
      }

      case "celiac": {
        if (dish.containsGluten) {
          blockingReason = "Contiene gluten";
        }
        break;
      }

      case "lactose_intolerance": {
        if (hasLactose(dish)) {
          blockingReason = "Contiene lactosa";
        }
        break;
      }

      case "high_cholesterol": {
        const fatIsDense = dish.fatGrams > LIMITS.cholesterolBlockFatGrams;
        if (fatIsDense) {
          blockingReason = "Demasiada grasa saturada para tu colesterol";
        } else if (dish.fatGrams > LIMITS.cholesterolWarningFatGrams) {
          warnings.push("Cuidado: es alta en grasa");
          score -= 0.2;
        }
        if (dish.isVegetarian && dish.nutrition.fiberGrams >= 6) score += 0.12;
        break;
      }
    }
  }

  // A single dish should not be most of the day's energy for anyone.
    if (calorieRatio > 0.45) {
      warnings.push("Es un plato grande: mejor acompáñalo con algo ligero");
      score -= 0.15;
    }

  return { blockingReason, warnings, score: clamp(score) };
}

/**
 * True when the top picks are heavy enough that we should ask about health
 * conditions before the user commits to eating.
 */
export function shouldAskAboutHealth(
  dishes: Dish[],
  conditions: HealthCondition[],
  healthAnswered: boolean,
): boolean {
  if (healthAnswered || hasAnyCondition(conditions)) return false;
  if (dishes.length === 0) return false;

  const risky = dishes.filter(
    (dish) =>
      dish.nutrition.sugarGrams > LIMITS.sugarWarningGrams ||
      dish.nutrition.sodiumMg > LIMITS.sodiumWarningMg ||
      dish.fatGrams > LIMITS.cholesterolWarningFatGrams,
  );

  return risky.length / dishes.length >= 0.4;
}

export const HEALTH_QUESTION =
  "Antes de armarte el plan: ¿tienes alguna condición de salud que debamos tener en cuenta? Podemos filtrar por diabetes, hipertensión, celiaquía, intolerancia a la lactosa o colesterol alto. Si prefieres no decirnos nada, también está bien.";

export { EMPTY_HEALTH_PROFILE, LIMITS as HEALTH_LIMITS };
