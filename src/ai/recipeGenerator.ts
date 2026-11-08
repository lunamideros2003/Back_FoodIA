import { env } from "../config/env.ts";
import { HttpError } from "../middleware/error.ts";
import { llmActive } from "./provider.ts";
import { buildRecipePrompt, RECIPE_SYSTEM_PROMPT } from "./recipePrompt.ts";
import { parseGeneratedRecipe } from "./recipeSchema.ts";
import type { GeneratedRecipeDraft, GeneratedRecipeInput } from "../domain/generatedRecipe.ts";

/**
 * Asks the provider for one new recipe.
 *
 * The model is used only when it is configured. Everything it returns passes
 * through the schema first, so a malformed answer never reaches the database.
 */
export async function generateRecipeDraft(
  input: GeneratedRecipeInput,
): Promise<GeneratedRecipeDraft> {
  if (!llmActive()) {
    throw new HttpError(
      503,
      "La generación de recetas con IA no está configurada. Añade AI_API_KEY en el servidor.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${env.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.85,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RECIPE_SYSTEM_PROMPT },
          { role: "user", content: buildRecipePrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(env.ai.recipeTimeoutMs),
    });
  } catch {
    throw new HttpError(502, "La IA no respondió a tiempo. Inténtalo otra vez.");
  }

  if (!response.ok) {
    throw new HttpError(502, "La IA no pudo crear la receta. Inténtalo otra vez.");
  }

  let text = "";
  try {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    throw new HttpError(502, "La IA devolvió una respuesta ilegible. Inténtalo otra vez.");
  }

  if (!text) {
    throw new HttpError(502, "La IA devolvió una receta vacía. Inténtalo otra vez.");
  }

  try {
    return parseGeneratedRecipe(text);
  } catch {
    throw new HttpError(
      502,
      "La IA devolvió una receta incompleta. Inténtalo otra vez o cambia la idea.",
    );
  }
}
