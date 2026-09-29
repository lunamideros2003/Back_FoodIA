export interface DishSeed {
  name: string;
  nameEs: string;
  slug: string;
  category: string;
  description: string;
  prepMinutes: number;
  difficulty: "facil" | "media" | "avanzada";
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  priceLevel: 1 | 2 | 3;
  tags: string[];
  axes: {
    comfort: number;
    energy: number;
    speed: number;
    lightness: number;
    richness: number;
    spice: number;
    sweetness: number;
    freshness: number;
    protein: number;
    indulgence: number;
    warmth: number;
    complexity: number;
    value: number;
  };
  ingredients: {
    name: string;
    label: string;
    category: string;
    quantity: string;
    optional?: boolean;
  }[];
  isVegetarian: boolean;
  isVegan: boolean;
  containsGluten: boolean;
}
