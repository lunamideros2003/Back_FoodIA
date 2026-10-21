import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { listDishes, findUserById } from "../services/repositories.ts";
import {
  explainIngredientMatch,
  matchByIngredients,
} from "../services/ingredientService.ts";
import { buildMealPlan } from "../services/planningService.ts";
import type { CravingKey } from "../domain/questionnaire.ts";
import type { MoodKey } from "../domain/types.ts";

export const discoveryRouter = Router();

const ingredientSchema = z.object({
  ingredients: z.array(z.string().max(60)).max(30),
  limit: z.number().int().min(1).max(30).optional(),
  maxPrepMinutes: z.number().int().min(1).max(240).nullish(),
  onlyComplete: z.boolean().optional(),
  craving: z.enum(["sweet", "savory", "light", "comfort", "surprise"]).optional(),
  userId: z.number().int().positive().optional(),
});

const planSchema = z.object({
  days: z.number().int().min(1).max(7),
  moodKey: z.enum(["tired", "happy", "stressed", "sad", "no_energy", "in_a_hurry"]).optional(),
  craving: z.enum(["sweet", "savory", "light", "comfort", "surprise"]).optional(),
  availableIngredients: z.array(z.string().max(60)).max(30).optional(),
  maxPrepMinutes: z.number().int().min(1).max(240).nullish(),
  userId: z.number().int().positive().optional(),
});

/**
 * "What can I cook with what I have?". The answer only contains recipes that
 * really exist in the catalogue, with the share of the recipe they cover.
 */
discoveryRouter.post("/discover/by-ingredients", (req, res) => {
  const body = ingredientSchema.parse(req.body);

  const cleaned = body.ingredients.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new HttpError(400, "Escribe al menos un ingrediente para buscar.");
  }

  const user = body.userId ? findUserById(body.userId) : null;
  if (body.userId && !user) {
    throw new HttpError(404, "Usuario no encontrado.");
  }

  const matches = matchByIngredients(listDishes(), cleaned, {
    limit: body.limit ?? 12,
    maxPrepMinutes: body.maxPrepMinutes ?? user?.preferences.maxPrepMinutes ?? null,
    onlyComplete: body.onlyComplete ?? false,
    craving: (body.craving ?? null) as CravingKey | null,
  });

  res.json({
    ingredients: cleaned,
    items: matches.map((match) => ({
      dish: match.dish,
      coverage: match.coverage,
      matched: match.matched,
      missing: match.missing,
      almostThere: match.almostThere,
      reason: explainIngredientMatch(match),
    })),
  });
});

/**
 * An optional helper to organise the meals of the next few days. It only
 * suggests dishes from the catalogue and it never imposes a diet.
 */
discoveryRouter.post("/planning/meals", (req, res) => {
  const body = planSchema.parse(req.body);

  const user = body.userId ? findUserById(body.userId) : null;
  if (body.userId && !user) {
    throw new HttpError(404, "Usuario no encontrado.");
  }

  const plan = buildMealPlan({
    days: body.days,
    moodKey: (body.moodKey ?? null) as MoodKey | null,
    craving: (body.craving ?? null) as CravingKey | null,
    availableIngredients: body.availableIngredients,
    maxPrepMinutes: body.maxPrepMinutes ?? null,
  });

  res.json(plan);
});
