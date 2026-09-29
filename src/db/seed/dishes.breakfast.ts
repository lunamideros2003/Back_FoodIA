import type { DishSeed } from "./types.ts";

export const BREAKFAST_DISHES: DishSeed[] = [
  {
    name: "Creamy Oat Porridge",
    nameEs: "Avena cremosa con fruta",
    slug: "creamy-oat-porridge",
    category: "Desayuno",
    description:
      "Avena cocida en leche con canela, plátano maduro y nueces. Calentita y lista en un solo paso.",
    prepMinutes: 10,
    difficulty: "facil",
    calories: 420,
    proteinGrams: 14,
    carbsGrams: 62,
    fatGrams: 13,
    priceLevel: 1,
    tags: ["caliente", "dulce", "fibra", "barato", "cuatro ingredientes"],
    axes: { comfort: 0.86, energy: 0.72, speed: 0.9, lightness: 0.55, richness: 0.62, spice: 0.05, sweetness: 0.68, freshness: 0.3, protein: 0.55, indulgence: 0.35, warmth: 0.92, complexity: 0.12, value: 0.92 },
    ingredients: [
      { name: "rolled_oats", label: "Avena en hojuelas", category: "Grano", quantity: "60 g" },
      { name: "milk", label: "Leche", category: "Lácteo", quantity: "200 ml", optional: true },
      { name: "banana", label: "Plátano", category: "Fruta", quantity: "1 unidad" },
      { name: "walnut", label: "Nueces", category: "Fruto seco", quantity: "20 g" },
      { name: "cinnamon", label: "Canela", category: "Condimento", quantity: "1 pizca" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: false
  },
  {
    name: "Fluffy Blueberry Pancakes",
    nameEs: "Hotcakes de arándanos",
    slug: "fluffy-blueberry-pancakes",
    category: "Desayuno",
    description:
      "Tres hotcakes esponjosos con arándanos, mantequilla de cacahuate y sirope de maple. Receta de fin de semana.",
    prepMinutes: 20,
    difficulty: "facil",
    calories: 560,
    proteinGrams: 18,
    carbsGrams: 74,
    fatGrams: 20,
    priceLevel: 2,
    tags: ["dulce", "fin de semana", "carnañol", "arándanos", "abuelo"],
    axes: { comfort: 0.9, energy: 0.8, speed: 0.62, lightness: 0.35, richness: 0.8, spice: 0, sweetness: 0.92, freshness: 0.35, protein: 0.5, indulgence: 0.85, warmth: 0.85, complexity: 0.35, value: 0.6 },
    ingredients: [
      { name: "flour", label: "Harina de trigo", category: "Grano", quantity: "200 g" },
      { name: "milk", label: "Leche", category: "Lácteo", quantity: "250 ml" },
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "2 unidades" },
      { name: "blueberry", label: "Arándanos", category: "Fruta", quantity: "100 g" },
      { name: "peanut_butter", label: "Mantequilla de cacahuate", category: "Fruto seco", quantity: "2 cdas" },
      { name: "maple_syrup", label: "Jabón de maple", category: "Endulzante", quantity: "1 cda" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Avocado Toast with Poached Egg",
    nameEs: "Tostada de aguacate con huevo poché",
    slug: "avocado-toast-poached-egg",
    category: "Desayuno",
    description:
      "Pan de masa madre tostado, aguacate en rodajas, huevo poché y copos de chile suave.",
    prepMinutes: 15,
    difficulty: "media",
    calories: 430,
    proteinGrams: 19,
    carbsGrams: 38,
    fatGrams: 22,
    priceLevel: 2,
    tags: ["saludable", "fibra", "grasa buena", "moderno", "toast"],
    axes: { comfort: 0.7, energy: 0.78, speed: 0.78, lightness: 0.6, richness: 0.68, spice: 0.25, sweetness: 0.05, freshness: 0.72, protein: 0.78, indulgence: 0.4, warmth: 0.7, complexity: 0.4, value: 0.65 },
    ingredients: [
      { name: "sourdough", label: "Pan de masa madre", category: "Panadería", quantity: "2 rebanadas" },
      { name: "avocado", label: "Aguacate", category: "Fruta", quantity: "1 unidad" },
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "2 unidades" },
      { name: "chili_flakes", label: "Copos de chile", category: "Condimento", quantity: "1 pizca" },
      { name: "lemon", label: "Limón", category: "Fruta", quantity: "1/2 unidad" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Greek Yogurt Power Bowl",
    nameEs: "Bowl de yogur griego y granola",
    slug: "greek-yogurt-power-bowl",
    category: "Desayuno",
    description:
      "Yogur griego alto en proteína con granola crujiente, frutos rojos y miel de azahar.",
    prepMinutes: 5,
    difficulty: "facil",
    calories: 340,
    proteinGrams: 24,
    carbsGrams: 40,
    fatGrams: 9,
    priceLevel: 2,
    tags: ["proteína", "sin cocinar", "rápido", "fresco", "desayuno"],
    axes: { comfort: 0.6, energy: 0.76, speed: 0.98, lightness: 0.78, richness: 0.42, spice: 0, sweetness: 0.5, freshness: 0.85, protein: 0.95, indulgence: 0.3, warmth: 0.25, complexity: 0.05, value: 0.6 },
    ingredients: [
      { name: "greek_yogurt", label: "Yogur griego", category: "Lácteo", quantity: "200 g" },
      { name: "granola", label: "Granola", category: "Grano", quantity: "50 g" },
      { name: "mixed_berries", label: "Frutos rojos", category: "Fruta", quantity: "100 g" },
      { name: "orange_blossom_honey", label: "Miel de azahar", category: "Endulzante", quantity: "1 cdta" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Huevos Rancheros",
    nameEs: "Huevos rancheros",
    slug: "huevos-rancheros",
    category: "Desayuno",
    description:
      "Huevos con yema líquida sobre tortillas de maíz, frijol negro, pico de gallo y aguacate.",
    prepMinutes: 25,
    difficulty: "media",
    calories: 520,
    proteinGrams: 26,
    carbsGrams: 48,
    fatGrams: 24,
    priceLevel: 2,
    tags: ["mexicano", "picante suave", "saturado", "fin de semana", "familia"],
    axes: { comfort: 0.85, energy: 0.8, speed: 0.55, lightness: 0.5, richness: 0.82, spice: 0.55, sweetness: 0.1, freshness: 0.7, protein: 0.88, indulgence: 0.55, warmth: 0.88, complexity: 0.5, value: 0.7 },
    ingredients: [
      { name: "corn_tortilla", label: "Tortilla de maíz", category: "Grano", quantity: "4 unidades" },
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "3 unidades" },
      { name: "black_bean", label: "Frijol negro", category: "Legumbre", quantity: "150 g" },
      { name: "salsa", label: "Salsa fresca", category: "Salsa", quantity: "100 g" },
      { name: "avocado", label: "Aguacate", category: "Fruta", quantity: "1/2 unidad" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Strawberry Overnight Oats",
    nameEs: "Avena nocturna con fresas",
    slug: "strawberry-overnight-oats",
    category: "Desayuno",
    description:
      "Avena, yogur y leche reposados en la nevera con fresas frescas y semillas. Listo al despertar.",
    prepMinutes: 5,
    difficulty: "facil",
    calories: 380,
    proteinGrams: 20,
    carbsGrams: 56,
    fatGrams: 10,
    priceLevel: 1,
    tags: ["fresco", "dulce", "sin cocinar", "desayuno", "fibra"],
    axes: { comfort: 0.7, energy: 0.72, speed: 0.95, lightness: 0.72, richness: 0.5, spice: 0, sweetness: 0.7, freshness: 0.9, protein: 0.7, indulgence: 0.35, warmth: 0.15, complexity: 0.05, value: 0.95 },
    ingredients: [
      { name: "rolled_oats", label: "Avena en hojuelas", category: "Grano", quantity: "60 g" },
      { name: "greek_yogurt", label: "Yogur griego", category: "Lácteo", quantity: "150 g" },
      { name: "milk", label: "Leche", category: "Lácteo", quantity: "150 ml" },
      { name: "strawberry", label: "Fresa", category: "Fruta", quantity: "120 g" },
      { name: "chia", label: "Semillas de chía", category: "Semilla", quantity: "10 g" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  }
];
