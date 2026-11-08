import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db/connection.ts";
import { findDishBySlug, listDishes } from "./repositories.ts";
import { allergensFromLabels } from "../ai/allergens.ts";
import { findSubstitutionsFor } from "../db/seed/dietary.ts";
import type { Dish } from "../domain/types.ts";
import type { GeneratedRecipeDraft } from "../domain/generatedRecipe.ts";

/** A URL-safe slug, without accents and with one dash per separator. */
export function recipeSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "receta-con-ia";
}

function uniqueSlug(db: DatabaseSync, name: string): string {
  const base = recipeSlug(name);
  let slug = base;
  let suffix = 2;

  while (findDishBySlug(slug, db)) {
    slug = `${base.slice(0, 55)}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

/**
 * Stores a model-generated recipe in the same tables as the curated ones.
 *
 * From here on it is an ordinary dish: it appears in the catalogue, can be
 * searched, saved, cooked and recommended. Allergens are derived from the
 * ingredient labels, never trusted from the model's own flags.
 */
export function saveGeneratedRecipe(draft: GeneratedRecipeDraft): Dish {
  const slug = transaction((db) => {
    const insertIngredient = db.prepare(
      `INSERT OR IGNORE INTO ingredients (name, label, category) VALUES (?, ?, ?)`,
    );
    const findIngredient = db.prepare(`SELECT id FROM ingredients WHERE name = ?`);
    const insertDish = db.prepare(
      `INSERT INTO dishes (
         name, name_es, slug, category, description, prep_minutes, difficulty,
         calories, protein_g, carbs_g, fat_g, price_level, image_url, tags, axes,
         is_vegetarian, is_vegan, contains_gluten,
         servings, steps, chef_tip, sugar_g, fiber_g, sodium_mg,
         allergens, verified_substitutions
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const linkIngredient = db.prepare(
      `INSERT OR IGNORE INTO dish_ingredients (dish_id, ingredient_id, quantity, optional, label)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const dishSlug = uniqueSlug(db, draft.nameEs);
    const labels = draft.ingredients.map((item) => item.label);
    const allergens = allergensFromLabels(labels, draft.containsGluten);
    const substitutions = [
      ...new Map(
        labels
          .flatMap((label) => findSubstitutionsFor(label))
          .map((option) => [`${option.original}|${option.replacement}`, option]),
      ).values(),
    ];
    const tags = [...new Set(["creada con IA", ...draft.tags])].slice(0, 10);

    for (const item of draft.ingredients) {
      insertIngredient.run(item.name, item.label, item.category);
    }

    const result = insertDish.run(
      draft.nameEs,
      draft.nameEs,
      dishSlug,
      draft.category,
      draft.description,
      draft.prepMinutes,
      draft.difficulty,
      draft.calories,
      draft.proteinGrams,
      draft.carbsGrams,
      draft.fatGrams,
      draft.priceLevel,
      JSON.stringify(tags),
      JSON.stringify(draft.axes),
      draft.isVegetarian ? 1 : 0,
      draft.isVegan ? 1 : 0,
      draft.containsGluten ? 1 : 0,
      draft.servings,
      JSON.stringify(draft.steps),
      draft.chefTip,
      draft.sugarGrams,
      draft.fiberGrams,
      draft.sodiumMg,
      JSON.stringify(allergens),
      JSON.stringify(substitutions),
    );

    const dishId = Number(result.lastInsertRowid);
    for (const item of draft.ingredients) {
      const found = findIngredient.get(item.name) as { id: number };
      linkIngredient.run(dishId, found.id, item.quantity, item.optional ? 1 : 0, item.label);
    }

    return dishSlug;
  });

  const dish = findDishBySlug(slug);
  if (!dish) {
    throw new Error("La receta se guardó pero no se pudo volver a leer.");
  }
  return dish;
}

/** The catalogue size after a generation, for the API response. */
export function catalogueSize(): number {
  return listDishes().length;
}
