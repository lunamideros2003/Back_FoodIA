import type { DishSeed } from "./types.ts";

export const DRINK_DISHES: DishSeed[] = [
  {
    name: "Green Detox Smoothie",
    nameEs: "Smoothie verde detox",
    slug: "green-detox-smoothie",
    category: "Bebidas",
    description: "Espinaca, plátano, kiwi, agua de coco y un toque de jengibre. Sin cocinar, se bate en dos minutos.",
    prepMinutes: 5,
    difficulty: "facil",
    calories: 210,
    proteinGrams: 5,
    carbsGrams: 44,
    fatGrams: 3,
    priceLevel: 1,
    tags: ["bebida", "desintoxicante", "fresco", "vegetariano", "verano"],
    axes: { comfort: 0.35, energy: 0.7, speed: 0.98, lightness: 0.95, richness: 0.15, spice: 0.1, sweetness: 0.55, freshness: 0.98, protein: 0.18, indulgence: 0.15, warmth: 0.05, complexity: 0.05, value: 0.85 },
    ingredients: [
      { name: "spinach", label: "Espinaca", category: "Vegetal", quantity: "40 g" },
      { name: "banana", label: "Plátano", category: "Fruta", quantity: "1 unidad" },
      { name: "kiwi", label: "Kiwi", category: "Fruta", quantity: "1 unidad" },
      { name: "coconut_water", label: "Agua de coco", category: "Bebida", quantity: "250 ml" },
      { name: "ginger", label: "Jengibre", category: "Condimento", quantity: "1 rodaja" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false
  },
  {
    name: "Homemade Lemonade",
    nameEs: "Limonada casera de limón",
    slug: "homemade-lemonade",
    category: "Bebidas",
    description: "Limón, agua fría, azúcar y un poco de menta fresca. El refresco más sencillo y efectivo.",
    prepMinutes: 6,
    difficulty: "facil",
    calories: 140,
    proteinGrams: 0,
    carbsGrams: 36,
    fatGrams: 0,
    priceLevel: 1,
    tags: ["bebida", "fresco", "verano", "sin alcohol", "rápido"],
    axes: { comfort: 0.5, energy: 0.75, speed: 0.98, lightness: 0.98, richness: 0.1, spice: 0, sweetness: 0.95, freshness: 0.9, protein: 0, indulgence: 0.5, warmth: 0.05, complexity: 0.02, value: 0.98 },
    ingredients: [
      { name: "lemon", label: "Limón", category: "Fruta", quantity: "4 unidades" },
      { name: "sugar", label: "Azúcar", category: "Endulzante", quantity: "80 g" },
      { name: "mint", label: "Menta", category: "Hierba", quantity: "unas hojas" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false
  },
  {
    name: "Iced Matcha Oat Latte",
    nameEs: "Matcha con avena y hielo",
    slug: "iced-matcha-oat-latte",
    category: "Bebidas",
    description: "Matcha ceremonial batido con leche de avena y hielo. Energía constante sin pico ni caída.",
    prepMinutes: 5,
    difficulty: "facil",
    calories: 190,
    proteinGrams: 4,
    carbsGrams: 28,
    fatGrams: 7,
    priceLevel: 2,
    tags: ["bebida", "energía", "japonés", "sin lactosa", "foco"],
    axes: { comfort: 0.5, energy: 0.9, speed: 0.98, lightness: 0.85, richness: 0.35, spice: 0, sweetness: 0.4, freshness: 0.7, protein: 0.28, indulgence: 0.35, warmth: 0.15, complexity: 0.05, value: 0.55 },
    ingredients: [
      { name: "matcha", label: "Matcha", category: "Infusión", quantity: "1 cdta" },
      { name: "oat_milk", label: "Leche de avena", category: "Lácteo", quantity: "250 ml" },
      { name: "ice", label: "Hielo", category: "Otros", quantity: "al gusto" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false
  },
  {
    name: "Hot Chocolate with Cinnamon",
    nameEs: "Chocolate caliente con canela",
    slug: "hot-chocolate-cinnamon",
    category: "Bebidas",
    description: "Cacao en polvo, leche y canela batidos hasta quedar espesos y cremosos. Cinco minutos de consuelo.",
    prepMinutes: 7,
    difficulty: "facil",
    calories: 280,
    proteinGrams: 8,
    carbsGrams: 34,
    fatGrams: 12,
    priceLevel: 1,
    tags: ["bebida", "dulce", "comfort food", "noche", "caliente"],
    axes: { comfort: 0.95, energy: 0.72, speed: 0.92, lightness: 0.2, richness: 0.85, spice: 0.1, sweetness: 0.95, freshness: 0.05, protein: 0.35, indulgence: 0.9, warmth: 0.98, complexity: 0.05, value: 0.92 },
    ingredients: [
      { name: "dark_chocolate", label: "Cacao en polvo", category: "Endulzante", quantity: "30 g" },
      { name: "milk", label: "Leche", category: "Lácteo", quantity: "250 ml" },
      { name: "cinnamon", label: "Canela", category: "Condimento", quantity: "1/2 cdta" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Cold Brew Tonic",
    nameEs: "Cold brew con tónica",
    slug: "cold-brew-tonic",
    category: "Bebidas",
    description: "Café de cold brew con tónica, hielo y cáscara de naranja. Amargor limpio y mucha cafeína.",
    prepMinutes: 4,
    difficulty: "facil",
    calories: 90,
    proteinGrams: 1,
    carbsGrams: 20,
    fatGrams: 0,
    priceLevel: 1,
    tags: ["bebida", "energía", "verano", "sin lactosa", "sin azúcar"],
    axes: { comfort: 0.45, energy: 0.98, speed: 0.98, lightness: 0.95, richness: 0.15, spice: 0, sweetness: 0.2, freshness: 0.6, protein: 0.05, indulgence: 0.4, warmth: 0.02, complexity: 0.02, value: 0.85 },
    ingredients: [
      { name: "cold_brew", label: "Cold brew", category: "Infusión", quantity: "200 ml" },
      { name: "tonic_water", label: "Agua tónica", category: "Bebida", quantity: "150 ml" },
      { name: "orange", label: "Naranja", category: "Fruta", quantity: "1/2 unidad" },
      { name: "ice", label: "Hielo", category: "Otros", quantity: "al gusto" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false
  }
];
