import type { GeneratedRecipeDraft } from "../src/domain/generatedRecipe.ts";

/** A complete, valid recipe used by the generator tests. */
export function recipeFixture(
  overrides: Partial<GeneratedRecipeDraft> = {},
): GeneratedRecipeDraft {
  return {
    nameEs: "Tarta tibia de calabaza",
    category: "Cena",
    description: "Una tarta salada de calabaza asada con queso y hierbas frescas.",
    prepMinutes: 35,
    difficulty: "facil",
    servings: 2,
    calories: 380,
    proteinGrams: 16,
    carbsGrams: 40,
    fatGrams: 18,
    sugarGrams: 7,
    fiberGrams: 5,
    sodiumMg: 420,
    priceLevel: 2,
    tags: ["calabaza", "horno"],
    ingredients: [
      { name: "pumpkin", label: "Calabaza", category: "Verdura", quantity: "300 g" },
      { name: "flour", label: "Harina de trigo", category: "Grano", quantity: "150 g" },
      { name: "cheese", label: "Queso", category: "Lácteo", quantity: "80 g" },
      { name: "olive_oil", label: "Aceite de oliva", category: "Grasa", quantity: "1 cda" },
    ],
    steps: [
      "Asa la calabaza hasta que esté tierna.",
      "Mezcla la harina con el aceite y forma la base.",
      "Añade la calabaza y el queso, y hornea 20 minutos.",
    ],
    chefTip: "Deja reposar cinco minutos antes de cortar.",
    isVegetarian: true,
    isVegan: false,
    containsGluten: true,
    axes: {
      comfort: 0.8,
      energy: 0.6,
      speed: 0.5,
      lightness: 0.5,
      richness: 0.6,
      spice: 0.1,
      sweetness: 0.2,
      freshness: 0.4,
      protein: 0.5,
      indulgence: 0.4,
      warmth: 0.9,
      complexity: 0.3,
      value: 0.7,
    },
    ...overrides,
  };
}
