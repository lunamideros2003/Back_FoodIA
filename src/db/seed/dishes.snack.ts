import type { DishSeed } from "./types.ts";

export const SNACK_DISHES: DishSeed[] = [
  {
    name: "Instant Miso Ramen",
    nameEs: "Ramen de miso instantáneo",
    slug: "instant-miso-ramen",
    category: "Snack",
    description:
      "Caldo de miso con fideos, huevo molido, cebolleta y maíz dulce en 8 minutos. El consuelo más rápido del mundo.",
    prepMinutes: 8,
    difficulty: "facil",
    calories: 480,
    proteinGrams: 20,
    carbsGrams: 58,
    fatGrams: 18,
    priceLevel: 1,
    tags: ["instantáneo", "rápido", "comfort food", "japonés", "medianoche"],
    axes: { comfort: 0.97, energy: 0.66, speed: 0.98, lightness: 0.5, richness: 0.85, spice: 0.4, sweetness: 0.2, freshness: 0.25, protein: 0.55, indulgence: 0.75, warmth: 0.98, complexity: 0.02, value: 0.98 },
    ingredients: [
      { name: "instant_noodles", label: "Fideos instantáneos", category: "Grano", quantity: "1 paquete" },
      { name: "miso_paste", label: "Pasta de miso", category: "Condimento", quantity: "1 cda" },
      { name: "egg", label: "Huevo", category: "Huevo", quantity: "1 unidad" },
      { name: "scallion", label: "Cebolleta", category: "Verdura", quantity: "2 unidades" },
      { name: "corn", label: "Maíz dulce", category: "Verdura", quantity: "80 g" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Avocado Nachos with Lime Crema",
    nameEs: "Nachos de aguacate con crema de lima",
    slug: "avocado-nachos-lime-crema",
    category: "Snack",
    description: "Totopos de maíz con aguacate, tomate cherry, feta y lima. Picoteo sin culpa.",
    prepMinutes: 12,
    difficulty: "facil",
    calories: 420,
    proteinGrams: 10,
    carbsGrams: 46,
    fatGrams: 24,
    priceLevel: 1,
    tags: ["picoteo", "compartir", "mexicano", "rápido", "social"],
    axes: { comfort: 0.78, energy: 0.68, speed: 0.95, lightness: 0.5, richness: 0.7, spice: 0.35, sweetness: 0.08, freshness: 0.75, protein: 0.3, indulgence: 0.85, warmth: 0.6, complexity: 0.08, value: 0.85 },
    ingredients: [
      { name: "corn_chips", label: "Totopos de maíz", category: "Grano", quantity: "150 g" },
      { name: "avocado", label: "Aguacate", category: "Fruta", quantity: "1 unidad" },
      { name: "cherry_tomato", label: "Tomate cherry", category: "Verdura", quantity: "150 g" },
      { name: "feta", label: "Queso feta", category: "Lácteo", quantity: "50 g" },
      { name: "lime", label: "Lima", category: "Fruta", quantity: "1 unidad" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Chickpea Smash Sandwich",
    nameEs: "Sándwich de garbanzos majados",
    slug: "chickpea-smash-sandwich",
    category: "Snack",
    description:
      "Garbanzos majados con pimiento asado, cilantro y tahini en pan tostado. Cinco ingredientes, cinco minutos.",
    prepMinutes: 6,
    difficulty: "facil",
    calories: 390,
    proteinGrams: 16,
    carbsGrams: 52,
    fatGrams: 13,
    priceLevel: 1,
    tags: ["vegetariano", "barato", "sin cocinar", "rápido", "almuerzo ligero"],
    axes: { comfort: 0.68, energy: 0.7, speed: 0.98, lightness: 0.72, richness: 0.55, spice: 0.3, sweetness: 0.12, freshness: 0.7, protein: 0.68, indulgence: 0.25, warmth: 0.35, complexity: 0.05, value: 1 },
    ingredients: [
      { name: "chickpea", label: "Garbanzos", category: "Legumbre", quantity: "200 g" },
      { name: "sourdough", label: "Pan de masa madre", category: "Panadería", quantity: "2 rebanadas" },
      { name: "tahini", label: "Tahini", category: "Fruto seco", quantity: "1 cda" },
      { name: "bell_pepper", label: "Pimiento asado", category: "Verdura", quantity: "1/2 unidad" },
      { name: "lemon", label: "Limón", category: "Fruta", quantity: "1/2 unidad" }
    ],
    isVegetarian: true,
    isVegan: true,
    containsGluten: true
  },
  {
    name: "Caprese Bruschetta",
    nameEs: "Bruschetta caprese",
    slug: "caprese-bruschetta",
    category: "Snack",
    description:
      "Pan de masa madre con tomate, mozzarella, albahaca y aceite de oliva. Cinco minutos, cinco ingredientes.",
    prepMinutes: 6,
    difficulty: "facil",
    calories: 340,
    proteinGrams: 13,
    carbsGrams: 36,
    fatGrams: 16,
    priceLevel: 1,
    tags: ["italiano", "verano", "sin cocinar", "fresco", "picoteo"],
    axes: { comfort: 0.6, energy: 0.6, speed: 0.98, lightness: 0.8, richness: 0.6, spice: 0.02, sweetness: 0.25, freshness: 0.95, protein: 0.48, indulgence: 0.3, warmth: 0.3, complexity: 0.05, value: 0.9 },
    ingredients: [
      { name: "sourdough", label: "Pan de masa madre", category: "Panadería", quantity: "2 rebanadas" },
      { name: "tomato", label: "Tomate", category: "Verdura", quantity: "2 unidades" },
      { name: "mozzarella", label: "Mozzarella", category: "Lácteo", quantity: "100 g" },
      { name: "basil", label: "Albahaca", category: "Hierba", quantity: "un puñado" },
      { name: "olive_oil", label: "Aceite de oliva", category: "Condimento", quantity: "1 cda" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  },
  {
    name: "Nut Butter Energy Bites",
    nameEs: "Bolas de energía de crema de cacahuate",
    slug: "nut-butter-energy-bites",
    category: "Snack",
    description:
      "Avena, crema de cacahuate, miel y chocolate. Sin horno, se hace en 8 minutos y dura la semana.",
    prepMinutes: 9,
    difficulty: "facil",
    calories: 220,
    proteinGrams: 8,
    carbsGrams: 24,
    fatGrams: 11,
    priceLevel: 1,
    tags: ["sin horno", "meal prep", "dulce", "energía", "vegetariano", "barato"],
    axes: { comfort: 0.72, energy: 0.88, speed: 0.9, lightness: 0.5, richness: 0.6, spice: 0, sweetness: 0.85, freshness: 0.2, protein: 0.45, indulgence: 0.7, warmth: 0.2, complexity: 0.1, value: 0.95 },
    ingredients: [
      { name: "rolled_oats", label: "Avena en hojuelas", category: "Grano", quantity: "120 g" },
      { name: "peanut_butter", label: "Mantequilla de cacahuate", category: "Fruto seco", quantity: "100 g" },
      { name: "orange_blossom_honey", label: "Miel de azahar", category: "Endulzante", quantity: "3 cdas" },
      { name: "dark_chocolate", label: "Chocolate 70%", category: "Endulzante", quantity: "60 g" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: false
  },
  {
    name: "Espresso Tiramisu Toast",
    nameEs: "Tostada tiramisú con espresso",
    slug: "espresso-tiramisu-toast",
    category: "Snack",
    description:
      "Tostada untada de crema de mascarpone y cacao, rematada con un espresso corto y canela.",
    prepMinutes: 10,
    difficulty: "facil",
    calories: 450,
    proteinGrams: 13,
    carbsGrams: 52,
    fatGrams: 21,
    priceLevel: 2,
    tags: ["dulce", "café", "italiano", "indulgente"],
    axes: { comfort: 0.86, energy: 0.82, speed: 0.92, lightness: 0.25, richness: 0.82, spice: 0.03, sweetness: 0.88, freshness: 0.15, protein: 0.45, indulgence: 0.85, warmth: 0.7, complexity: 0.15, value: 0.55 },
    ingredients: [
      { name: "sourdough", label: "Pan de masa madre", category: "Panadería", quantity: "2 rebanadas" },
      { name: "mascarpone", label: "Mascarpone", category: "Lácteo", quantity: "80 g" },
      { name: "espresso", label: "Espresso", category: "Infusión", quantity: "60 ml" },
      { name: "dark_chocolate", label: "Cacao en polvo", category: "Endulzante", quantity: "1 cdta" },
      { name: "cinnamon", label: "Canela", category: "Condimento", quantity: "1 pizca" }
    ],
    isVegetarian: true,
    isVegan: false,
    containsGluten: true
  }
];
