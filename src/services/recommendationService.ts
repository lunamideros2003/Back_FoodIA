import { getDb } from "../db/connection.ts";
import { diversify, MODEL_VERSION, rankDishes, STRATEGY, buildReason, type RecommenderContext } from "../ai/recommender.ts";
import { buildNarrative } from "../ai/narrative.ts";
import { conditionsOf, HEALTH_QUESTION, shouldAskAboutHealth } from "../ai/health.ts";
import { listDishes, listInteractions, findMood, findUserById } from "./repositories.ts";
import { modelStore } from "./modelStore.ts";
import { env } from "../config/env.ts";
import type {
  Dish,
  Mood,
  MoodKey,
  RecommendationRequest,
  RecommendationResponse,
  RecommendedDish,
} from "../domain/types.ts";

const DEFAULT_LIMIT = 6;
const ALTERNATIVE_COUNT = 3;

function resolveLimit(requested: number | undefined): number {
  if (!requested) return DEFAULT_LIMIT;
  return Math.min(12, Math.max(1, Math.floor(requested)));
}

export async function recommend(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  modelStore.ensureReady();

  const mood = findMood(request.moodKey as MoodKey);
  if (!mood) {
    throw Object.assign(new Error(`Estado de ánimo desconocido: ${request.moodKey}`), {
      statusCode: 400,
    });
  }

  const user = request.userId ? findUserById(request.userId) : null;
  const dishes = listDishes();
  const interactions = listInteractions();

  const limit = resolveLimit(request.limit);

  const context: RecommenderContext = {
    dishes,
    mood,
    interactions,
    user,
    request,
    moodModel: modelStore.moodModel,
    tasteProfile: modelStore.tasteProfile,
    collaborative: modelStore.collaborative,
  };

  const ranked = rankDishes(context);
  if (ranked.length === 0) {
    throw Object.assign(
      new Error("No encontramos platos que cumplan con esas restricciones."),
      { statusCode: 422 },
    );
  }

  const top = diversify(ranked, limit);
  const alternatives = diversify(ranked.slice(top.length), ALTERNATIVE_COUNT);

  // If the shortlist is heavy on sugar, salt or fat and we know nothing about
  // this person's health, the UI should ask before they commit to eating.
  const needsHealthInfo = shouldAskAboutHealth(
    top.map((item) => item.dish),
    conditionsOf(user?.preferences.health, request.conditions),
    Boolean(user?.preferences.health.answeredAt),
  );

  const buildItemExplanation = (item: (typeof top)[number]): string =>
    buildReason(item.dish, item.breakdown, mood, request.freeText);

  const narrative = await buildNarrative({
    mood,
    items: top.map((item) => ({
      dish: item.dish,
      score: item.breakdown.total,
      breakdown: item.breakdown,
      explanation: buildItemExplanation(item),
      aiSource: "local-model" as const,
      modelVersion: MODEL_VERSION,
    })),
    request,
    alternatives: alternatives.map((item) => ({ dish: item.dish, reason: "" })),
  });

  const items: RecommendedDish[] = top.map((item, index) => ({
    dish: item.dish,
    score: item.breakdown.total,
    breakdown: item.breakdown,
    explanation:
      index === 0 && narrative.source !== "local-model"
        ? narrative.text
        : buildItemExplanation(item),
    aiSource: narrative.source,
    modelVersion: MODEL_VERSION,
  }));

  const response: RecommendationResponse = {
    mood,
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    strategy: STRATEGY,
    narrative: narrative.text,
    items,
    alternatives: alternatives.map((item) => ({
      dish: item.dish,
      score: item.breakdown.total,
      reason: buildItemExplanation(item),
    })),
    needsHealthInfo,
    healthQuestion: needsHealthInfo ? HEALTH_QUESTION : null,
  };

  persistSession(user?.id ?? null, mood.key, response);
  return response;
}

function persistSession(
  userId: number | null,
  moodKey: MoodKey,
  response: RecommendationResponse,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO recommendation_sessions (user_id, mood_key, model_version, strategy, payload)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        moodKey,
        response.modelVersion,
        response.strategy,
        JSON.stringify({
          narrative: response.narrative,
          items: response.items.map((item) => ({
            dishId: item.dish.id,
            score: item.score,
          })),
        }),
      );
  } catch {
    // Logging a session must never break a recommendation.
  }
}

export function listRecentSessions(userId: number, limit = 10) {
  return getDb()
    .prepare(
      `SELECT id, mood_key, model_version, strategy, created_at
       FROM recommendation_sessions
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(userId, Math.min(50, Math.max(1, limit)));
}

export type { Dish };
