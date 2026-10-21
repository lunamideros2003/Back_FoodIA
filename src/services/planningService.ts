import type { Dish, MoodKey } from "../domain/types.ts";
import type { CravingKey } from "../domain/questionnaire.ts";
import {
  MEAL_SLOTS,
  SLOT_CATEGORIES,
  type MealPlanResponse,
  type MealSlot,
  type PlannedDay,
  type PlannedMeal,
  type ShoppingItem,
} from "../domain/planning.ts";
import { cravingScore } from "../ai/taxonomy.ts";
import { listDishes } from "./repositories.ts";

/**
 * A light planning helper. It suggests combinations of recipes that already
 * exist in the catalogue and that match the time, the mood and the
 * ingredients the person wants to use.
 *
 * It is deliberately not a diet plan: no calorie targets, no restrictions it
 * did not receive, and nothing that tells the person what to eat.
 */

export interface PlanOptions {
  days: number;
  moodKey?: MoodKey | null;
  craving?: CravingKey | null;
  availableIngredients?: string[];
  maxPrepMinutes?: number | null;
}

/** The dishes that fit each slot, best first. */
function rankForSlot(
  dishes: Dish[],
  slot: MealSlot,
  options: PlanOptions,
): Dish[] {
  const categories = SLOT_CATEGORIES[slot];

  return dishes
    .filter((dish) => categories.includes(dish.category))
    .filter((dish) => {
      if (options.maxPrepMinutes === null || options.maxPrepMinutes === undefined) return true;
      return dish.prepMinutes <= options.maxPrepMinutes;
    })
    .map((dish) => {
      let score = cravingScore(dish, options.craving) * 0.5;

      // Dishes that use what the person already has get a nudge.
      if (options.availableIngredients && options.availableIngredients.length > 0) {
        const available = options.availableIngredients.map((item) => item.toLowerCase());
        const hits = dish.ingredients.filter((item) =>
          available.some((entry) => item.label.toLowerCase().includes(entry)),
        ).length;
        score += Math.min(0.5, (hits / Math.max(1, dish.ingredients.length)) * 0.5);
      }

      // Shorter dishes first: they are easier to fit in a day.
      score += Math.max(0, 0.2 - dish.prepMinutes / 120);

      return { dish, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.dish);
}

/** The reason shown next to a planned meal, based on the real recipe data. */
export function planReason(dish: Dish, slot: MealSlot): string {
  const parts: string[] = [];

  parts.push(`${dish.prepMinutes} minutos`);
  parts.push(dish.difficulty === "facil" ? "y es fácil" : `y es de dificultad ${dish.difficulty}`);
  if (dish.axes.comfort >= 0.6) parts.push("y se siente reconfortante");
  if (dish.axes.freshness >= 0.6) parts.push("y es fresco");
  if (dish.axes.indulgence >= 0.6) parts.push("y tiene un punto especial");

  return `Encaja para ${slot}: ${parts.join(", ")}.`;
}

/** Builds a plan for a few days without repeating the same dish twice. */
export function buildMealPlan(options: PlanOptions): MealPlanResponse {
  const dishes = listDishes();
  const days = Math.min(7, Math.max(1, options.days));
  const used = new Set<number>();

  const plannedDays: PlannedDay[] = [];

  for (let day = 0; day < days; day += 1) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const isoDate = date.toISOString().slice(0, 10);

    const meals: PlannedMeal[] = [];

    for (const slot of MEAL_SLOTS) {
      const candidates = rankForSlot(dishes, slot, options).filter(
        (dish) => !used.has(dish.id),
      );
      const chosen = candidates[0] ?? rankForSlot(dishes, slot, options)[0];
      if (!chosen) continue;
      used.add(chosen.id);
      meals.push({ slot, dish: chosen, reason: planReason(chosen, slot) });
    }

    plannedDays.push({ date: isoDate, meals });
  }

  return {
    days: plannedDays,
    shoppingList: buildShoppingList(plannedDays),
    note:
      "Es una sugerencia, no un plan alimentario. Puedes cambiar cualquier plato, comprar de más y saltarte lo que no te apetezca.",
  };
}

/**
 * The shopping list is built from the ingredients of the recipes that were
 * actually selected, so every line can be traced back to a dish.
 */
export function buildShoppingList(days: PlannedDay[]): ShoppingItem[] {
  const totals = new Map<
    string,
    { name: string; quantity: string; fromRecipes: number; dishes: Set<string> }
  >();

  for (const day of days) {
    for (const meal of day.meals) {
      for (const item of meal.dish.ingredients) {
        const key = item.label.toLowerCase();
        const current = totals.get(key);
        if (current) {
          current.fromRecipes += 1;
          current.dishes.add(meal.dish.nameEs);
          current.quantity = mergeQuantities(current.quantity, item.quantity);
        } else {
          totals.set(key, {
            name: item.label,
            quantity: item.quantity,
            fromRecipes: 1,
            dishes: new Set([meal.dish.nameEs]),
          });
        }
      }
    }
  }

  return [...totals.values()]
    .map((entry) => ({
      name: entry.name,
      quantity: entry.quantity,
      fromRecipes: entry.fromRecipes,
      dishes: [...entry.dishes],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Adds two quantities of the same unit when it can be done honestly. */
export function mergeQuantities(first: string, second: string): string {
  const parse = (value: string): { amount: number; unit: string } | null => {
    const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) return null;
    const amount = Number.parseFloat(match[1].replace(",", "."));
    if (!Number.isFinite(amount)) return null;
    return { amount, unit: match[2].trim() };
  };

  const a = parse(first);
  const b = parse(second);
  if (!a || !b || a.unit !== b.unit) return first;

  const total = Math.round((a.amount + b.amount) * 100) / 100;
  const nice = Number.isInteger(total) ? String(total) : String(Math.round(total * 10) / 10);
  return b.unit ? `${nice} ${b.unit}` : nice;
}
