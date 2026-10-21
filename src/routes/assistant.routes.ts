import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { findDishBySlug, findUserById } from "../services/repositories.ts";
import { allergensOf } from "../ai/allergens.ts";
import { answerAssistantQuestion } from "../ai/assistant.ts";
import { findSubstitutionsFor } from "../db/seed/dietary.ts";
import { adaptRecipe } from "../services/adaptationService.ts";
import type { AssistantContext } from "../domain/assistant.ts";
import type { Dish } from "../domain/types.ts";

export const assistantRouter = Router();

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1000),
});

const assistantSchema = z.object({
  question: z.string().min(1).max(600),
  stepIndex: z.number().int().min(0).max(50).optional(),
  history: z.array(turnSchema).max(12).optional(),
  ingredient: z.string().max(60).optional(),
  servings: z.number().int().min(1).max(20).optional(),
  userId: z.number().int().positive().optional(),
});

const substituteSchema = z.object({
  ingredient: z.string().min(1).max(60),
  userId: z.number().int().positive().optional(),
});

const adaptSchema = z.object({
  servings: z.number().int().min(1).max(20).optional(),
  diet: z.enum(["omnivore", "vegetarian", "vegan", "pescatarian"]).optional(),
  excludeIngredients: z.array(z.string().max(60)).max(10).optional(),
});

function requireDish(slug: string): Dish {
  const dish = findDishBySlug(slug);
  if (!dish) throw new HttpError(404, "No encontramos ese plato.");
  return dish;
}

/** The allergens of a recipe, taken from the real ingredient list. */
assistantRouter.get("/recipes/:slug/allergens", (req, res) => {
  const dish = requireDish(req.params.slug);
  res.json({
    slug: dish.slug,
    nameEs: dish.nameEs,
    allergens: allergensOf(dish),
    containsGluten: dish.containsGluten,
    isVegetarian: dish.isVegetarian,
    isVegan: dish.isVegan,
  });
});

/**
 * The "Cocinar conmigo" assistant. It always receives the recipe, so the
 * person never has to explain what they are cooking.
 */
assistantRouter.post("/recipes/:slug/assistant", async (req, res, next) => {
  try {
    const dish = requireDish(req.params.slug);
    const body = assistantSchema.parse(req.body);

    const user = body.userId ? findUserById(body.userId) : null;
    const stepIndex = Math.min(
      Math.max(0, body.stepIndex ?? 0),
      Math.max(0, dish.steps.length - 1),
    );

    const context: AssistantContext = {
      dish,
      ingredients: dish.ingredients,
      steps: dish.steps,
      stepIndex,
      allergens: allergensOf(dish),
      substitutions: findSubstitutionsFor(dish.ingredients[0]?.label ?? ""),
      allergies: user?.preferences.allergies ?? [],
      diet: user?.preferences.diet ?? "omnivore",
    };

    const answer = await answerAssistantQuestion(body.question, context, body.history, {
      servings: body.servings,
    });

    res.json(answer);
  } catch (error) {
    next(error);
  }
});

/**
 * The alternatives for an ingredient the person does not have. Only the
 * substitutions that were verified against the catalogue are offered.
 */
assistantRouter.post("/recipes/:slug/substitute", (req, res) => {
  const dish = requireDish(req.params.slug);
  const body = substituteSchema.parse(req.body);

  const user = body.userId ? findUserById(body.userId) : null;
  const declared = (user?.preferences.allergies ?? []).map((item) => item.toLowerCase());
  const dishAllergens = allergensOf(dish);

  const options = findSubstitutionsFor(body.ingredient).map((option) => ({
    original: option.original,
    replacement: option.replacement,
    quantity: option.quantity,
    note: option.note,
    /** A substitution that adds an allergen the user declared is not offered. */
    safe: !declared.some((allergy) =>
      option.replacement.toLowerCase().includes(allergy),
    ),
  }));

  res.json({
    ingredient: body.ingredient,
    options,
    allergens: dishAllergens,
    note:
      options.length === 0
        ? "No tenemos una sustitución verificada para ese ingrediente."
        : "Estas son las sustituciones que ya revisamos para esta receta.",
  });
});

/**
 * Adapts the recipe to a different number of portions or a different diet.
 */
assistantRouter.post("/recipes/:slug/adapt", (req, res) => {
  const dish = requireDish(req.params.slug);
  const body = adaptSchema.parse(req.body);

  const result = adaptRecipe(dish, {
    servings: body.servings,
    diet: body.diet,
    excludeIngredients: body.excludeIngredients,
  });

  res.json({
    slug: dish.slug,
    nameEs: dish.nameEs,
    servings: body.servings ?? dish.servings,
    ingredients: result.ingredients,
    steps: result.steps,
    substitutions: result.substitutions,
    notes: result.notes,
    warnings: result.warnings,
  });
});
