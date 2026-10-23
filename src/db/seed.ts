import type { DatabaseSync } from "node:sqlite";
import { getDb, transaction } from "./connection.ts";
import { ALL_DISHES, MOODS } from "./seed/index.ts";
import { RECIPES } from "./seed/recipes.ts";
import { DEMO_INTERACTIONS } from "./seed/demo-interactions.ts";
import { findSubstitutionsFor } from "./seed/dietary.ts";
import { allergensFromLabels } from "../ai/allergens.ts";

export interface SeedReport {
  moods: number;
  dishes: number;
  ingredients: number;
  users: number;
  interactions: number;
  alreadySeeded: boolean;
}

export function isSeeded(db: DatabaseSync = getDb()): boolean {
  const row = db.prepare("SELECT COUNT(*) AS total FROM dishes").get() as {
    total: number;
  };
  return row.total > 0;
}

export function seed(force = false): SeedReport {
  const db = getDb();

  if (isSeeded(db) && !force) {
    const counts = readCounts(db);
    return { ...counts, alreadySeeded: true };
  }

  return transaction((conn) => {
    if (force) {
      conn.exec("DELETE FROM interactions;");
      conn.exec("DELETE FROM recommendation_sessions;");
      conn.exec("DELETE FROM dish_ingredients;");
      conn.exec("DELETE FROM dishes;");
      conn.exec("DELETE FROM ingredients;");
      conn.exec("DELETE FROM user_preferences;");
      conn.exec("DELETE FROM users;");
      conn.exec("DELETE FROM moods;");
      // Without this, AUTOINCREMENT keeps climbing and a forced reseed would
      // hand out different ids than the demo data and docs expect.
      conn.exec(
        "DELETE FROM sqlite_sequence WHERE name IN ('users','dishes','ingredients','moods','interactions','recommendation_sessions');",
      );
    }

    seedMoods(conn);
    const dishCount = seedDishes(conn);
    const userCount = seedDemoUsers(conn);
    const interactionCount = seedDemoInteractions(conn);

    return {
      moods: MOODS.length,
      dishes: dishCount,
      ingredients: readCounts(conn).ingredients,
      users: userCount,
      interactions: interactionCount,
      alreadySeeded: false,
    };
  });
}

function perServing(total: number, servings: number): number {
  return Math.round((total / Math.max(1, servings)) * 10) / 10;
}

function readCounts(db: DatabaseSync) {  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number })
      .total;

  return {
    moods: count("moods"),
    dishes: count("dishes"),
    ingredients: count("ingredients"),
    users: count("users"),
    interactions: count("interactions"),
  };
}

function seedMoods(db: DatabaseSync): void {
  const stmt = db.prepare(
    `INSERT INTO moods (key, label, emoji, description, accent, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const mood of MOODS) {
    stmt.run(
      mood.key,
      mood.label,
      mood.emoji,
      mood.description,
      mood.accent,
      mood.sortOrder,
    );
  }
}

function seedDishes(db: DatabaseSync): number {
  const insertIngredient = db.prepare(
    `INSERT INTO ingredients (name, label, category) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET label = excluded.label, category = excluded.category`,
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

  for (const dish of ALL_DISHES) {
    for (const item of dish.ingredients) {
      insertIngredient.run(item.name, item.label, item.category);
    }

    const recipe = RECIPES[dish.slug];
    if (!recipe) {
      throw new Error(`Falta la receta del plato "${dish.slug}"`);
    }

    const allergens = allergensFromLabels(
      dish.ingredients.map((item) => item.label),
      dish.containsGluten,
    );
    const verified = [
      ...new Map(
        dish.ingredients
          .flatMap((item) => findSubstitutionsFor(item.label))
          .map((option) => [`${option.original}|${option.replacement}`, option]),
      ).values(),
    ];

    const result = insertDish.run(
      dish.name,
      dish.nameEs,
      dish.slug,
      dish.category,
      dish.description,
      dish.prepMinutes,
      dish.difficulty,
      dish.calories,
      dish.proteinGrams,
      dish.carbsGrams,
      dish.fatGrams,
      dish.priceLevel,
      JSON.stringify(dish.tags),
      JSON.stringify(dish.axes),
      dish.isVegetarian ? 1 : 0,
      dish.isVegan ? 1 : 0,
      dish.containsGluten ? 1 : 0,
      recipe.servings,
      JSON.stringify(recipe.steps),
      recipe.chefTip,
      // Sugar, fiber and sodium are authored as recipe totals, so they are
      // divided here to match the per-serving macros. A whole lemonades pitch
      // of 32 g becomes 8 g per glass.
      perServing(recipe.sugarGrams, recipe.servings),
      perServing(recipe.fiberGrams, recipe.servings),
      perServing(recipe.sodiumMg, recipe.servings),
      JSON.stringify(allergens),
      JSON.stringify(verified),
    );

    const dishId = Number(result.lastInsertRowid);
    for (const item of dish.ingredients) {
      const found = findIngredient.get(item.name) as { id: number };
      linkIngredient.run(
        dishId,
        found.id,
        item.quantity,
        item.optional ? 1 : 0,
        item.label,
      );
    }
  }

  return ALL_DISHES.length;
}

function seedDemoUsers(db: DatabaseSync): number {
  const users = [
    {
      email: "lucia@foodmood.app",
      displayName: "Lucía",
      diet: "omnivore",
      maxPrep: 30,
      spice: 0.8,
      price: 3,
      allergies: [] as string[],
      disliked: ["champiñón"] as string[],
      health: { answeredAt: null } as Record<string, unknown>,
      goal: 2000,
    },
    {
      email: "demo@foodmood.app",
      displayName: "Ana",
      diet: "vegetarian",
      maxPrep: null,
      spice: 0.6,
      price: 2,
      allergies: [] as string[],
      disliked: [] as string[],
      // A user with a real condition, so the health filters are visible
      // out of the box instead of only in theory.
      health: { diabetes: true } as Record<string, unknown>,
      goal: 1800,
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (email, display_name) VALUES (?, ?)
     ON CONFLICT(email) DO NOTHING`,
  );
  const insertPrefs = db.prepare(
    `INSERT OR REPLACE INTO user_preferences
       (user_id, diet, max_prep_minutes, max_spice_level, max_price_level,
        allergies, disliked_ingredients, health, daily_calorie_goal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const user of users) {
    insertUser.run(user.email, user.displayName);
    const found = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(user.email) as { id: number };
    insertPrefs.run(
      found.id,
      user.diet,
      user.maxPrep,
      user.spice,
      user.price,
      JSON.stringify(user.allergies),
      JSON.stringify(user.disliked),
      JSON.stringify(user.health),
      user.goal,
    );
  }

  return users.length;
}

function seedDemoInteractions(db: DatabaseSync): number {
  const findUser = db.prepare(`SELECT id FROM users WHERE email = ?`);
  const findDish = db.prepare(`SELECT id FROM dishes WHERE slug = ?`);
  const insert = db.prepare(
    `INSERT INTO interactions (user_id, dish_id, mood_key, action, rating, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
  );

  let total = 0;
  for (const block of DEMO_INTERACTIONS) {
    const user = findUser.get(block.email) as { id: number } | undefined;
    if (!user) continue;

    for (const item of block.items) {
      const dish = findDish.get(item.slug) as { id: number } | undefined;
      if (!dish) continue;
      insert.run(
        user.id,
        dish.id,
        item.moodKey,
        item.action,
        item.rating ?? null,
        `-${item.hoursAgo} hours`,
      );
      total += 1;
    }
  }

  return total;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;

if (isDirectRun) {
  const report = seed(process.argv.includes("--force"));
  console.log("[seed] Base de datos lista:", report);
}
