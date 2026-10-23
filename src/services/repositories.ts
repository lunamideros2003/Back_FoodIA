import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/connection.ts";
import type {
  Dish,
  DishAxes,
  HealthProfile,
  Interaction,
  Mood,
  MoodKey,
  User,
  UserPreferences,
} from "../domain/types.ts";
import { EMPTY_HEALTH_PROFILE } from "../domain/types.ts";

interface DishRow {
  id: number;
  name: string;
  name_es: string;
  slug: string;
  category: string;
  description: string;
  prep_minutes: number;
  difficulty: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  price_level: number;
  image_url: string;
  tags: string;
  axes: string;
  is_vegetarian: number;
  is_vegan: number;
  contains_gluten: number;
  servings: number;
  steps: string;
  chef_tip: string | null;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
}

interface IngredientRow {
  dish_id: number;
  ingredient_id: number;
  name: string;
  label: string;
  category: string;
  quantity: string;
  optional: number;
}

interface MoodRow {
  id: number;
  key: string;
  label: string;
  emoji: string;
  description: string;
  accent: string;
  sort_order: number;
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

interface PreferencesRow {
  user_id: number;
  diet: string;
  max_prep_minutes: number | null;
  max_spice_level: number;
  max_price_level: number;
  allergies: string;
  disliked_ingredients: string;
  health: string;
  daily_calorie_goal: number;
}

interface InteractionRow {
  id: number;
  user_id: number;
  dish_id: number;
  mood_key: string | null;
  action: string;
  rating: number | null;
  servings: number;
  created_at: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapDish(row: DishRow, ingredients: IngredientRow[]): Dish {
  return {
    id: row.id,
    name: row.name,
    nameEs: row.name_es,
    slug: row.slug,
    category: row.category,
    description: row.description,
    prepMinutes: row.prep_minutes,
    difficulty: row.difficulty as Dish["difficulty"],
    calories: row.calories,
    proteinGrams: row.protein_g,
    carbsGrams: row.carbs_g,
    fatGrams: row.fat_g,
    priceLevel: row.price_level as 1 | 2 | 3,
    imageUrl: row.image_url,
    tags: parseJson<string[]>(row.tags, []),
    axes: parseJson<DishAxes>(row.axes, {} as DishAxes),
    ingredients: ingredients
      .filter((item) => item.dish_id === row.id)
      .map((item) => ({
        ingredientId: item.ingredient_id,
        name: item.name,
        label: item.label,
        quantity: item.quantity,
        optional: item.optional === 1,
      })),
    isVegetarian: row.is_vegetarian === 1,
    isVegan: row.is_vegan === 1,
    containsGluten: row.contains_gluten === 1,
    servings: row.servings,
    steps: parseJson<string[]>(row.steps, []),
    chefTip: row.chef_tip,
    nutrition: {
      calories: row.calories,
      proteinGrams: row.protein_g,
      carbsGrams: row.carbs_g,
      fatGrams: row.fat_g,
      sugarGrams: row.sugar_g,
      fiberGrams: row.fiber_g,
      sodiumMg: row.sodium_mg,
    },
  };
}

export function listDishes(db: DatabaseSync = getDb()): Dish[] {
  const rows = db.prepare(`SELECT * FROM dishes ORDER BY id`).all() as unknown as DishRow[];
  const ingredients = db
    .prepare(
      `SELECT di.dish_id, di.quantity, di.optional, i.id AS ingredient_id, i.name,
              COALESCE(di.label, i.label) AS label, i.category
       FROM dish_ingredients di
       JOIN ingredients i ON i.id = di.ingredient_id
       ORDER BY di.dish_id, i.label`,
    )
    .all() as unknown as IngredientRow[];

  return rows.map((row) => mapDish(row, ingredients));
}

export function findDishBySlug(slug: string, db: DatabaseSync = getDb()): Dish | null {
  const dishes = listDishes(db);
  return dishes.find((dish) => dish.slug === slug) ?? null;
}

export function listMoods(db: DatabaseSync = getDb()): Mood[] {
  const rows = db
    .prepare(`SELECT * FROM moods ORDER BY sort_order`)
    .all() as unknown as MoodRow[];
  return rows.map((row) => ({
    id: row.id,
    key: row.key as MoodKey,
    label: row.label,
    emoji: row.emoji,
    description: row.description,
    accent: row.accent,
    sortOrder: row.sort_order,
  }));
}

export function findMood(key: MoodKey, db: DatabaseSync = getDb()): Mood | null {
  return listMoods(db).find((mood) => mood.key === key) ?? null;
}

function mapPreferences(row: PreferencesRow | undefined): UserPreferences {
  if (!row) {
    return {
      diet: "omnivore",
      maxPrepMinutes: null,
      maxSpiceLevel: 1,
      maxPriceLevel: 3,
      allergies: [],
      dislikedIngredients: [],
      health: { ...EMPTY_HEALTH_PROFILE },
      dailyCalorieGoal: 2000,
    };
  }
  return {
    diet: row.diet as UserPreferences["diet"],
    maxPrepMinutes: row.max_prep_minutes,
    maxSpiceLevel: row.max_spice_level,
    maxPriceLevel: row.max_price_level,
    allergies: parseJson<string[]>(row.allergies, []),
    dislikedIngredients: parseJson<string[]>(row.disliked_ingredients, []),
    health: { ...EMPTY_HEALTH_PROFILE, ...parseJson<Partial<HealthProfile>>(row.health, {}) },
    dailyCalorieGoal: row.daily_calorie_goal || 2000,
  };
}

export function findUserById(id: number, db: DatabaseSync = getDb()): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  if (!row) return null;

  const preferences = db
    .prepare(`SELECT * FROM user_preferences WHERE user_id = ?`)
    .get(id) as PreferencesRow | undefined;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    preferences: mapPreferences(preferences),
  };
}

export function findUserByEmail(email: string, db: DatabaseSync = getDb()): User | null {
  const row = db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email.toLowerCase()) as UserRow | undefined;
  return row ? findUserById(row.id, db) : null;
}

export function listUsers(db: DatabaseSync = getDb()): User[] {
  const rows = db.prepare(`SELECT * FROM users ORDER BY id`).all() as unknown as UserRow[];
  return rows.map((row) => findUserById(row.id, db)).filter((user): user is User => user !== null);
}

export function listInteractions(
  options: { userId?: number; limit?: number } = {},
  db: DatabaseSync = getDb(),
): Interaction[] {
  const clauses: string[] = [];
  const params: (number | string)[] = [];

  if (options.userId !== undefined) {
    clauses.push(`user_id = ?`);
    params.push(options.userId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options.limit ? `LIMIT ${Math.max(1, Math.floor(options.limit))}` : "";

  const rows = db
    .prepare(
      `SELECT * FROM interactions ${where} ORDER BY created_at DESC, id DESC ${limit}`,
    )
    .all(...params) as unknown as InteractionRow[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    dishId: row.dish_id,
    moodKey: row.mood_key as MoodKey | null,
    action: row.action as Interaction["action"],
    rating: row.rating,
    servings: row.servings,
    createdAt: row.created_at,
  }));
}
