import type { DishSeed } from "./types.ts";

export const DINNER_DISHES: DishSeed[] = [
  {
    name: "Homemade Pizza Margherita",
    nameEs: "Pizza margarita casera",
    slug: "homemade-pizza-margherita",
    category: "Cena",
    description:
      "Masa fermentada 48 horas, tomate San Marzano y mozzarella. Horneada al máximo, como debe ser.",
    prepMinutes: 45,
    difficulty: "avanzada",
    calories: 780,
    proteinGrams: 32,
    carbsGrams: 96,
    fatGrams: 28,
    priceLevel: 2,
    tags: ["italiano", "comfort food", "celebración", "carb fix", "pizza"],
    axes: { comfort: 0.94, energy: 0.7, speed: 0.25, lightness: 0.3, richness: 0.9, spice: 0.05, sweetness: 0.3, freshness: 0.6, protein: 0.7, indulgence: 0.92, warmth: 0.95, complexity: 0.85, value: 0.45 },
    ingredients: [
      { name: "pizza_dough", label: "Masa de pizza", category: "Grano", quantity: "300 g" },
      { name: "mozzarella", label: "Mozzarella", category: "Lácteo", quantity: "200 g" },
      { name: "canned_tomato", label: "Tomate San Marzano", category: "Verdura", quantity: "200 g" },
      { name: "basil", label: "Albahaca", category: "Hierba", quantity: "un puñado" },
      { name: "olive_oil", label: "Aceite de oliva", category: "Condimento", quantity: "2 cdas" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Japanese Curry Rice",
    nameEs: "Arroz con curry japonés",
    slug: "japanese-curry-rice",
    category: "Cena",
    description:
      "Curry japonés suave con pollo, zanahoria y patata, coronado con arroz blanco. Reconfortante y barato.",
    prepMinutes: 40,
    difficulty: "facil",
    calories: 700,
    proteinGrams: 34,
    carbsGrams: 92,
    fatGrams: 22,
    priceLevel: 1,
    tags: ["japonés", "comfort food", "picante suave", "familia", "batch"],
    axes: { comfort: 0.93, energy: 0.78, speed: 0.42, lightness: 0.4, richness: 0.84, spice: 0.5, sweetness: 0.25, freshness: 0.4, protein: 0.7, indulgence: 0.55, warmth: 0.96, complexity: 0.35, value: 0.95 },
    ingredients: [
      { name: "chicken_breast", label: "Pechuga de pollo", category: "Proteína", quantity: "250 g" },
      { name: "rice", label: "Arroz blanco", category: "Grano", quantity: "200 g" },
      { name: "potato", label: "Patata", category: "Verdura", quantity: "2 unidades" },
      { name: "carrot", label: "Zanahoria", category: "Verdura", quantity: "2 unidades" },
      { name: "curry_roux", label: "Curry en polvo", category: "Condimento", quantity: "2 cdas" },
      { name: "onion", label: "Cebolla", category: "Verdura", quantity: "1 unidad" }
    ],
    isVegetarian: false,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Shrimp Tacos with Lime Slaw",
    nameEs: "Tacos de camarón con ensalada de lima",
    slug: "shrimp-tacos-lime-slaw",
    category: "Cena",
    description:
      "Camarón salteado con ajo y chile, tortillas de maíz, ensalada de col con lima y cilantro.",
    prepMinutes: 18,
    difficulty: "facil",
    calories: 480,
    proteinGrams: 34,
    carbsGrams: 44,
    fatGrams: 18,
    priceLevel: 2,
    tags: ["marisco", "picante", "fresco", "rápido", "verano"],
    axes: { comfort: 0.65, energy: 0.8, speed: 0.9, lightness: 0.7, richness: 0.6, spice: 0.75, sweetness: 0.15, freshness: 0.9, protein: 0.88, indulgence: 0.45, warmth: 0.65, complexity: 0.3, value: 0.6 },
    ingredients: [
      { name: "shrimp", label: "Camarón", category: "Proteína", quantity: "250 g" },
      { name: "corn_tortilla", label: "Tortilla de maíz", category: "Grano", quantity: "6 unidades" },
      { name: "cabbage", label: "Col", category: "Verdura", quantity: "200 g" },
      { name: "lime", label: "Lima", category: "Fruta", quantity: "2 unidades" },
      { name: "cilantro", label: "Cilantro", category: "Hierba", quantity: "un puñado" },
      { name: "garlic", label: "Ajo", category: "Condimento", quantity: "2 dientes" }
    ],
    isVegetarian: false,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Grilled Salmon with Lemon Greens",
    nameEs: "Salmón a la plancha con verduras al limón",
    slug: "grilled-salmon-lemon-greens",
    category: "Cena",
    description:
      "Lomo de salmón a la plancha con espárragos, judías verdes y limón asado. Proteína y omega 3 en 20 minutos.",
    prepMinutes: 20,
    difficulty: "facil",
    calories: 520,
    proteinGrams: 42,
    carbsGrams: 18,
    fatGrams: 30,
    priceLevel: 3,
    tags: ["saludable", "alto en proteína", "fresco", "omega 3", "bajo en carbohidratos"],
    axes: { comfort: 0.55, energy: 0.86, speed: 0.88, lightness: 0.85, richness: 0.65, spice: 0.05, sweetness: 0.05, freshness: 0.95, protein: 0.98, indulgence: 0.3, warmth: 0.6, complexity: 0.25, value: 0.4 },
    ingredients: [
      { name: "salmon", label: "Lomo de salmón", category: "Proteína", quantity: "220 g" },
      { name: "asparagus", label: "Espárragos", category: "Verdura", quantity: "200 g" },
      { name: "green_bean", label: "Judía verde", category: "Verdura", quantity: "150 g" },
      { name: "lemon", label: "Limón", category: "Fruta", quantity: "1 unidad" },
      { name: "olive_oil", label: "Aceite de oliva", category: "Condimento", quantity: "1 cda" }
    ],
    isVegetarian: false,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Shakshuka",
    nameEs: "Shakshuka",
    slug: "shakshuka",
    category: "Cena",
    description:
      "Huevos poché en salsa de tomate con pimiento dulce, comino y feta. Un solo sartén, cena resuelta.",
    prepMinutes: 28,
    difficulty: "facil",
    calories: 450,
    proteinGrams: 24,
    carbsGrams: 26,
    fatGrams: 28,
    priceLevel: 1,
    tags: ["vegetariano", "una sartén", "medio Oriente", "picante suave", "fácil"],
    axes: { comfort: 0.85, energy: 0.75, speed: 0.72, lightness: 0.55, richness: 0.75, spice: 0.5, sweetness: 0.3, freshness: 0.6, protein: 0.82, indulgence: 0.4, warmth: 0.9, complexity: 0.3, value: 0.95 },
    ingredients: [
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "4 unidades" },
      { name: "canned_tomato", label: "Tomate triturado", category: "Verdura", quantity: "400 g" },
      { name: "bell_pepper", label: "Pimiento", category: "Verdura", quantity: "1 unidad" },
      { name: "feta", label: "Queso feta", category: "Lácteo", quantity: "80 g" },
      { name: "cumin", label: "Comino", category: "Condimento", quantity: "1 cdta" },
      { name: "garlic", label: "Ajo", category: "Condimento", quantity: "3 dientes" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Tuna Nicoise Salad",
    nameEs: "Ensalada nicosa con atún",
    slug: "tuna-nicoise-salad",
    category: "Cena",
    description:
      "Atún, papa cocida, huevo, judía verde, tomate y aceitunas con vinagreta de mostaza. Fresca y completa.",
    prepMinutes: 22,
    difficulty: "facil",
    calories: 460,
    proteinGrams: 38,
    carbsGrams: 32,
    fatGrams: 22,
    priceLevel: 2,
    tags: ["ensalada", "fresco", "alto en proteína", "ligero", "verano"],
    axes: { comfort: 0.55, energy: 0.8, speed: 0.85, lightness: 0.9, richness: 0.55, spice: 0.05, sweetness: 0.1, freshness: 0.94, protein: 0.9, indulgence: 0.25, warmth: 0.3, complexity: 0.3, value: 0.7 },
    ingredients: [
      { name: "tuna", label: "Atún en lata", category: "Proteína", quantity: "150 g" },
      { name: "potato", label: "Papa", category: "Verdura", quantity: "2 unidades" },
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "2 unidades" },
      { name: "green_bean", label: "Judía verde", category: "Verdura", quantity: "150 g" },
      { name: "tomato", label: "Tomate", category: "Verdura", quantity: "2 unidades" },
      { name: "olive", label: "Aceituna negra", category: "Fruto seco", quantity: "50 g" }
    ],
    isVegetarian: false,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Tomato Basil Soup",
    nameEs: "Sopa de tomate y albahaca",
    slug: "tomato-basil-soup",
    category: "Cena",
    description:
      "Tomate asado, cebolla caramelizada y albahaca fresca licuados hasta quedar una crema suave.",
    prepMinutes: 30,
    difficulty: "facil",
    calories: 320,
    proteinGrams: 7,
    carbsGrams: 30,
    fatGrams: 19,
    priceLevel: 1,
    tags: ["sopa", "vegetariano", "ligero", "caliente", "invierno", "comfort food"],
    axes: { comfort: 0.88, energy: 0.65, speed: 0.6, lightness: 0.6, richness: 0.7, spice: 0.08, sweetness: 0.4, freshness: 0.55, protein: 0.3, indulgence: 0.25, warmth: 0.95, complexity: 0.2, value: 0.98 },
    ingredients: [
      { name: "canned_tomato", label: "Tomate triturado", category: "Verdura", quantity: "600 g" },
      { name: "onion", label: "Cebolla", category: "Verdura", quantity: "1 unidad" },
      { name: "basil", label: "Albahaca", category: "Hierba", quantity: "un puñado" },
      { name: "heavy_cream", label: "Crema de leche", category: "Lácteo", quantity: "60 ml", optional: true },
      { name: "vegetable_stock", label: "Caldo de verduras", category: "Caldo", quantity: "400 ml" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Mushroom and Thyme Risotto",
    nameEs: "Risotto de hongos y tomillo",
    slug: "mushroom-thyme-risotto",
    category: "Cena",
    description:
      "Risotto de setas con tomillo fresco, parmesano y vino blanco. Lento y profundamente reconfortante.",
    prepMinutes: 40,
    difficulty: "avanzada",
    calories: 580,
    proteinGrams: 16,
    carbsGrams: 72,
    fatGrams: 24,
    priceLevel: 2,
    tags: ["comfort food", "vegetariano", "cremoso", "italiano", "hongos"],
    axes: { comfort: 0.95, energy: 0.6, speed: 0.28, lightness: 0.25, richness: 0.94, spice: 0.05, sweetness: 0.15, freshness: 0.35, protein: 0.4, indulgence: 0.7, warmth: 0.96, complexity: 0.8, value: 0.55 },
    ingredients: [
      { name: "arborio_rice", label: "Arroz arborio", category: "Grano", quantity: "300 g" },
      { name: "mushroom", label: "Setas", category: "Verdura", quantity: "300 g" },
      { name: "parmesan", label: "Parmesano", category: "Lácteo", quantity: "80 g" },
      { name: "butter", label: "Mantequilla", category: "Lácteo", quantity: "40 g" },
      { name: "thyme", label: "Tomillo", category: "Hierba", quantity: "unas ramas" },
      { name: "vegetable_stock", label: "Caldo de verduras", category: "Caldo", quantity: "1 L" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  }
];
