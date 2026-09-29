import { getDb } from "../db/connection.ts";
import { listInteractions } from "./repositories.ts";
import { modelStore } from "./modelStore.ts";
import type { Interaction, InteractionAction, MoodKey } from "../domain/types.ts";

const ACTIONS: InteractionAction[] = [
  "impression",
  "view",
  "like",
  "save",
  "cook",
  "rate",
  "dislike",
];

/** Positive actions feed the model, impressions do not. */
const TRAINING_ACTIONS: InteractionAction[] = ["like", "save", "cook", "rate", "dislike"];

export interface RecordInteractionInput {
  userId: number;
  dishId: number;
  moodKey?: MoodKey | null;
  action: InteractionAction;
  rating?: number | null;
}

export function recordInteraction(input: RecordInteractionInput): Interaction {
  if (!ACTIONS.includes(input.action)) {
    throw Object.assign(new Error("Acción de interacción no válida."), { statusCode: 400 });
  }

  const dish = getDb().prepare(`SELECT id FROM dishes WHERE id = ?`).get(input.dishId);
  if (!dish) {
    throw Object.assign(new Error("El plato no existe."), { statusCode: 404 });
  }

  const rating =
    typeof input.rating === "number"
      ? Math.min(5, Math.max(1, Math.round(input.rating)))
      : null;

  const result = getDb()
    .prepare(
      `INSERT INTO interactions (user_id, dish_id, mood_key, action, rating)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.userId, input.dishId, input.moodKey ?? null, input.action, rating);

  if (TRAINING_ACTIONS.includes(input.action)) {
    modelStore.retrain();
  }

  return {
    id: Number(result.lastInsertRowid),
    userId: input.userId,
    dishId: input.dishId,
    moodKey: input.moodKey ?? null,
    action: input.action,
    rating,
    createdAt: new Date().toISOString(),
  };
}

export function getInteractionHistory(userId: number, limit = 30): Interaction[] {
  return listInteractions({ userId, limit });
}

export interface UserTasteSummary {
  totalInteractions: number;
  topCategories: { category: string; count: number }[];
  favouriteDishes: { dishId: number; nameEs: string; category: string; times: number }[];
  moodDistribution: { moodKey: string; count: number }[];
}

export function summarizeTaste(userId: number): UserTasteSummary {
  const db = getDb();
  const interactions = listInteractions({ userId });

  const dishRows = db
    .prepare(
      `SELECT d.id, d.name_es, d.category,
              SUM(CASE WHEN i.action IN ('like','save','cook') THEN 1 ELSE 0 END) AS likes
       FROM interactions i
       JOIN dishes d ON d.id = i.dish_id
       WHERE i.user_id = ?
       GROUP BY d.id
       ORDER BY likes DESC, d.id ASC
       LIMIT 5`,
    )
    .all(userId) as unknown as {
    id: number;
    name_es: string;
    category: string;
    likes: number;
  }[];

  const categoryRows = db
    .prepare(
      `SELECT d.category, COUNT(*) AS total
       FROM interactions i
       JOIN dishes d ON d.id = i.dish_id
       WHERE i.user_id = ?
       GROUP BY d.category
       ORDER BY total DESC
       LIMIT 4`,
    )
    .all(userId) as unknown as { category: string; total: number }[];

  const moodRows = db
    .prepare(
      `SELECT mood_key, COUNT(*) AS total
       FROM interactions
       WHERE user_id = ? AND mood_key IS NOT NULL
       GROUP BY mood_key
       ORDER BY total DESC`,
    )
    .all(userId) as unknown as { mood_key: string; total: number }[];

  return {
    totalInteractions: interactions.length,
    topCategories: categoryRows.map((row) => ({ category: row.category, count: row.total })),
    favouriteDishes: dishRows
      .filter((row) => row.likes > 0)
      .map((row) => ({
        dishId: row.id,
        nameEs: row.name_es,
        category: row.category,
        times: row.likes,
      })),
    moodDistribution: moodRows.map((row) => ({ moodKey: row.mood_key, count: row.total })),
  };
}
