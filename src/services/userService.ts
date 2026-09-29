import { getDb, transaction } from "../db/connection.ts";
import { findUserByEmail, findUserById, listUsers } from "./repositories.ts";
import type { User, UserPreferences } from "../domain/types.ts";
import { EMPTY_HEALTH_PROFILE } from "../domain/types.ts";

export interface CreateUserInput {
  email: string;
  displayName: string;
  preferences?: Partial<UserPreferences>;
}

const DIETS: UserPreferences["diet"][] = ["omnivore", "vegetarian", "vegan", "pescatarian"];

function normalizePreferences(input?: Partial<UserPreferences>): UserPreferences {
  return {
    diet: input?.diet && DIETS.includes(input.diet) ? input.diet : "omnivore",
    maxPrepMinutes:
      typeof input?.maxPrepMinutes === "number" && input.maxPrepMinutes > 0
        ? Math.floor(input.maxPrepMinutes)
        : null,
    maxSpiceLevel:
      typeof input?.maxSpiceLevel === "number"
        ? Math.min(1, Math.max(0, input.maxSpiceLevel))
        : 1,
    maxPriceLevel:
      typeof input?.maxPriceLevel === "number"
        ? Math.min(3, Math.max(1, Math.floor(input.maxPriceLevel)))
        : 3,
    allergies: input?.allergies ?? [],
    dislikedIngredients: input?.dislikedIngredients ?? [],
    health: input?.health ? { ...EMPTY_HEALTH_PROFILE, ...input.health } : { ...EMPTY_HEALTH_PROFILE },
    dailyCalorieGoal:
      typeof input?.dailyCalorieGoal === "number"
        ? Math.min(5000, Math.max(800, Math.floor(input.dailyCalorieGoal)))
        : 2000,
  };
}

export function createUser(input: CreateUserInput): User {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!email.includes("@")) {
    throw Object.assign(new Error("El correo no tiene un formato válido."), { statusCode: 400 });
  }
  if (displayName.length < 2) {
    throw Object.assign(new Error("El nombre debe tener al menos 2 caracteres."), { statusCode: 400 });
  }
  if (findUserByEmail(email)) {
    throw Object.assign(new Error("Ya existe una cuenta con ese correo."), { statusCode: 409 });
  }

  const preferences = normalizePreferences(input.preferences);

  const userId = transaction((db) => {
    const result = db
      .prepare(`INSERT INTO users (email, display_name) VALUES (?, ?)`)
      .run(email, displayName);

    const id = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO user_preferences
         (user_id, diet, max_prep_minutes, max_spice_level, max_price_level,
          allergies, disliked_ingredients, health, daily_calorie_goal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      preferences.diet,
      preferences.maxPrepMinutes,
      preferences.maxSpiceLevel,
      preferences.maxPriceLevel,
      JSON.stringify(preferences.allergies),
      JSON.stringify(preferences.dislikedIngredients),
      JSON.stringify(preferences.health),
      preferences.dailyCalorieGoal,
    );
    return id;
  });

  return findUserById(userId)!;
}

export function updatePreferences(
  userId: number,
  patch: Partial<UserPreferences>,
): User {
  const existing = findUserById(userId);
  if (!existing) {
    throw Object.assign(new Error("Usuario no encontrado."), { statusCode: 404 });
  }

  const merged = normalizePreferences({ ...existing.preferences, ...patch });

  getDb()
    .prepare(
      `UPDATE user_preferences
       SET diet = ?, max_prep_minutes = ?, max_spice_level = ?, max_price_level = ?,
           allergies = ?, disliked_ingredients = ?, health = ?, daily_calorie_goal = ?
       WHERE user_id = ?`,
    )
    .run(
      merged.diet,
      merged.maxPrepMinutes,
      merged.maxSpiceLevel,
      merged.maxPriceLevel,
      JSON.stringify(merged.allergies),
      JSON.stringify(merged.dislikedIngredients),
      JSON.stringify(merged.health),
      merged.dailyCalorieGoal,
      userId,
    );

  return findUserById(userId)!;
}

export function getUser(id: number): User | null {
  return findUserById(id);
}

export function getAllUsers(): User[] {
  return listUsers();
}
