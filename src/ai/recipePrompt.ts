import type { GeneratedRecipeInput } from "../domain/generatedRecipe.ts";

/** The categories the catalogue and its filters already understand. */
export const RECIPE_CATEGORIES = [
  "Desayuno",
  "Almuerzo",
  "Cena",
  "Merienda",
  "Postre",
  "Bebida",
] as const;

/** The axes the recommender uses to place a dish next to the moods. */
export const RECIPE_AXES = [
  "comfort",
  "energy",
  "speed",
  "lightness",
  "richness",
  "spice",
  "sweetness",
  "freshness",
  "protein",
  "indulgence",
  "warmth",
  "complexity",
  "value",
] as const;

export const RECIPE_SYSTEM_PROMPT = [
  "Eres un cocinero que crea recetas nuevas para FoodMood IA, una app de comida y dietas.",
  "Devuelves únicamente un objeto JSON válido, sin markdown, sin explicaciones y sin texto antes o después.",
  "",
  "La receta debe ser realista, cocinable y segura:",
  "- Usa ingredientes comunes y cantidades coherentes para el número de porciones.",
  "- Pasos claros, en orden, con temperaturas y tiempos cuando haga falta.",
  "- Buenas prácticas de higiene y cocción; nada de carne cruda ni conservación peligrosa.",
  "- No des consejos médicos ni afirmes que la comida cura algo.",
  "- Respeta la dieta y las alergias indicadas sin excepción.",
  "",
  "Estructura exacta del JSON:",
  "{",
  '  "nameEs": "nombre en español, máximo 70 caracteres",',
  '  "category": "Desayuno | Almuerzo | Cena | Merienda | Postre | Bebida",',
  '  "description": "una o dos frases, máximo 240 caracteres",',
  '  "prepMinutes": 25,',
  '  "difficulty": "facil | media | avanzada",',
  '  "servings": 2,',
  '  "calories": 420,',
  '  "proteinGrams": 20,',
  '  "carbsGrams": 45,',
  '  "fatGrams": 14,',
  '  "sugarGrams": 8,',
  '  "fiberGrams": 6,',
  '  "sodiumMg": 450,',
  '  "priceLevel": 2,',
  '  "tags": ["rapida", "vegetariana"],',
  '  "ingredients": [',
  '    { "name": "chicken", "label": "Pollo", "category": "Carne", "quantity": "200 g", "optional": false }',
  "  ],",
  '  "steps": ["Primer paso.", "Segundo paso.", "Tercer paso."],',
  '  "chefTip": "un consejo breve",',
  '  "isVegetarian": false,',
  '  "isVegan": false,',
  '  "containsGluten": false,',
  '  "axes": {',
  '    "comfort": 0.5, "energy": 0.6, "speed": 0.7, "lightness": 0.5,',
  '    "richness": 0.5, "spice": 0.1, "sweetness": 0.2, "freshness": 0.4,',
  '    "protein": 0.6, "indulgence": 0.4, "warmth": 0.7, "complexity": 0.3,',
  '    "value": 0.6',
  "  }",
  "}",
  "",
  "Reglas de los campos:",
  "- `calories`, macros, azúcar, fibra y sodio son POR PORCIÓN.",
  "- `prepMinutes` entre 5 y 240; `servings` entre 1 y 12; `priceLevel` 1, 2 o 3.",
  "- Entre 3 y 20 ingredientes; entre 2 y 15 pasos.",
  "- `name` del ingrediente en minúsculas y sin espacios (ej. chicken, olive_oil); `label` es lo que lee la persona.",
  "- Los 13 ejes van de 0 a 1 y describen el plato, no la persona.",
  "- `containsGluten` es true si hay trigo, cebada, centeno o avena no certificada.",
].join("\n");

/** The specific request, including diet and allergies when they exist. */
export function buildRecipePrompt(input: GeneratedRecipeInput): string {
  const lines = [
    `Idea de la persona: ${input.idea?.trim() || "una receta nueva, variada y apetecible"}.`,
    `Dieta: ${input.diet ?? "omnivore"}.`,
    `Porciones: ${input.servings ?? 2}.`,
  ];

  if (input.allergies && input.allergies.length > 0) {
    lines.push(
      `Alergias declaradas (no pueden aparecer): ${input.allergies.join(", ")}.`,
    );
  }

  lines.push(
    "No repitas una receta clásica exacta: dale un toque propio y un nombre distinto.",
    "Devuelve solo el JSON.",
  );

  return lines.join("\n");
}
