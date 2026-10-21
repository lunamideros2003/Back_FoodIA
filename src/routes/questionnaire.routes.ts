import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import {
  CRAVINGS,
  DIET_OPTIONS,
  DIFFICULTY_OPTIONS,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_LENGTH,
  MAX_NOTE_LENGTH,
  MOOD_OPTIONS,
  TIME_BUDGETS,
} from "../domain/questionnaire.ts";
import { mapMoodOption, timeBudgetCeiling } from "../ai/taxonomy.ts";
import { recommend } from "../services/recommendationService.ts";
import { findUserById } from "../services/repositories.ts";
import type { RecommendationRequest } from "../domain/types.ts";

export const questionnaireRouter = Router();

const moodOptionKeys = MOOD_OPTIONS.map((option) => option.key) as [
  (typeof MOOD_OPTIONS)[number]["key"],
  ...(typeof MOOD_OPTIONS)[number]["key"][],
];
const timeBudgetKeys = TIME_BUDGETS.map((budget) => budget.key) as [
  (typeof TIME_BUDGETS)[number]["key"],
  ...(typeof TIME_BUDGETS)[number]["key"][],
];
const cravingKeys = CRAVINGS.map((craving) => craving.key) as [
  (typeof CRAVINGS)[number]["key"],
  ...(typeof CRAVINGS)[number]["key"][],
];

const ingredientList = z
  .array(z.string().max(MAX_INGREDIENT_LENGTH))
  .max(MAX_INGREDIENTS)
  .optional();

const questionnaireSchema = z.object({
  moodOption: z.enum(moodOptionKeys),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
  timeBudget: z.enum(timeBudgetKeys),
  craving: z.enum(cravingKeys),
  availableIngredients: ingredientList,
  excludedIngredients: ingredientList,
  allergies: ingredientList,
  diet: z.enum(["omnivore", "vegetarian", "vegan", "pescatarian"]).optional(),
  difficulty: z.enum(["facil", "media", "avanzada"]).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  userId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

/**
 * The vocabulary of the wizard. The frontend renders the options from here,
 * so the wording lives in one place.
 */
questionnaireRouter.get("/questionnaire", (_req, res) => {
  res.json({
    moods: MOOD_OPTIONS.map((option) => ({
      key: option.key,
      label: option.label,
      description: option.description,
      icon: option.icon,
    })),
    timeBudgets: TIME_BUDGETS.map((budget) => ({
      key: budget.key,
      label: budget.label,
      description: budget.description,
      maxMinutes: budget.maxMinutes,
    })),
    cravings: CRAVINGS.map((craving) => ({
      key: craving.key,
      label: craving.label,
      description: craving.description,
    })),
    diets: DIET_OPTIONS,
    difficulties: DIFFICULTY_OPTIONS,
  });
});

/**
 * Turns the answers of the wizard into recommendations.
 *
 * The frontend only sends the answers; the mapping to the model happens
 * here, so both sides always agree on what "con el ánimo bajo" means.
 */
questionnaireRouter.post("/questionnaire/recommend", async (req, res, next) => {
  try {
    const body = questionnaireSchema.parse(req.body);

    const user = body.userId ? findUserById(body.userId) : null;
    if (body.userId && !user) {
      throw new HttpError(404, "Usuario no encontrado.");
    }

    const mapped = mapMoodOption(body.moodOption);
    const ceiling = timeBudgetCeiling(body.timeBudget);

    const request: RecommendationRequest = {
      moodKey: mapped.moodKey,
      userId: body.userId,
      limit: body.limit ?? 3,
      freeText: body.note?.trim() ? body.note.trim() : undefined,
      moodOption: body.moodOption,
      timeBudget: body.timeBudget,
      craving: body.craving,
      maxPrepMinutes: ceiling ?? undefined,
      availableIngredients: body.availableIngredients,
      excludedIngredients: body.excludedIngredients,
      allergies: body.allergies,
      diet: body.diet,
      difficulty: body.difficulty,
    };

    const response = await recommend(request);

    res.json({
      ...response,
      questionnaire: {
        moodOption: body.moodOption,
        moodLabel: mapped.optionLabel,
        timeBudget: body.timeBudget,
        craving: body.craving,
        maxPrepMinutes: ceiling,
        matchedMood: mapped.moodKey,
      },
    });
  } catch (error) {
    next(error);
  }
});
