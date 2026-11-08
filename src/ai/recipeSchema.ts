import { z } from "zod";
import type { GeneratedRecipeDraft } from "../domain/generatedRecipe.ts";

/**
 * The contract the model has to satisfy before a generated recipe can reach
 * the database. A model can be creative; it cannot be trusted to return the
 * right types, quantities or list sizes.
 */

const axesSchema = z.object({
  comfort: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  lightness: z.number().min(0).max(1),
  richness: z.number().min(0).max(1),
  spice: z.number().min(0).max(1),
  sweetness: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  protein: z.number().min(0).max(1),
  indulgence: z.number().min(0).max(1),
  warmth: z.number().min(0).max(1),
  complexity: z.number().min(0).max(1),
  value: z.number().min(0).max(1),
});

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  quantity: z.string().trim().min(1).max(40),
  optional: z.boolean().optional(),
});

export const generatedRecipeSchema = z.object({
  nameEs: z.string().trim().min(3).max(90),
  category: z.enum(["Desayuno", "Almuerzo", "Cena", "Merienda", "Postre", "Bebida"]),
  description: z.string().trim().min(10).max(300),
  prepMinutes: z.number().int().min(5).max(240),
  difficulty: z.enum(["facil", "media", "avanzada"]),
  servings: z.number().int().min(1).max(12),
  calories: z.number().int().min(50).max(2500),
  proteinGrams: z.number().min(0).max(250),
  carbsGrams: z.number().min(0).max(300),
  fatGrams: z.number().min(0).max(200),
  sugarGrams: z.number().min(0).max(200),
  fiberGrams: z.number().min(0).max(60),
  sodiumMg: z.number().min(0).max(6000),
  priceLevel: z.number().int().min(1).max(3),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
  ingredients: z.array(ingredientSchema).min(3).max(20),
  steps: z.array(z.string().trim().min(5).max(400)).min(2).max(15),
  chefTip: z.string().trim().min(5).max(240),
  isVegetarian: z.boolean(),
  isVegan: z.boolean(),
  containsGluten: z.boolean(),
  axes: axesSchema,
});

/** Pulls the JSON object out of a reply that may contain fences or prose. */
export function extractRecipeJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("La respuesta no contiene un objeto JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Validates and normalizes the model reply into the draft the writer uses. */
export function parseGeneratedRecipe(text: string): GeneratedRecipeDraft {
  const parsed = generatedRecipeSchema.parse(extractRecipeJson(text));

  return {
    ...parsed,
    priceLevel: parsed.priceLevel as 1 | 2 | 3,
    nameEs: clean(parsed.nameEs),
    description: clean(parsed.description),
    tags: [...new Set(parsed.tags.map(clean))].slice(0, 8),
    ingredients: parsed.ingredients.map((item) => ({
      ...item,
      name: item.name.trim(),
      label: clean(item.label),
      category: clean(item.category),
      quantity: clean(item.quantity),
    })),
    steps: parsed.steps.map(clean),
    chefTip: clean(parsed.chefTip),
  };
}
