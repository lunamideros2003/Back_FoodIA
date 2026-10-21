/**
 * Dietary reference data used by the allergen guardrails and by the assistant
 * when it proposes a substitute for an ingredient.
 *
 * The allergen list is deliberately conservative: it only contains allergens
 * that are regulated and that people actually declare. A dish never gets a
 * "gluten free" badge because a single ingredient looks suspicious, it only
 * gets the allergens that are really in the recipe.
 */
export interface AllergenMarker {
  /** Canonical name shown to the user. */
  allergen: string;
  /** Ingredient labels that carry this allergen. */
  labels: string[];
}

/**
 * Matching is done on the normalized ingredient label, so the entries below
 * are written without accents and in lowercase.
 */
export const ALLERGEN_MARKERS: AllergenMarker[] = [
  {
    allergen: "Gluten",
    labels: [
      "harina de trigo",
      "masa de pizza",
      "pan de masa madre",
      "pasta",
      "espagueti",
      "fideos",
      "macarron",
      "cereal de trigo",
      "avena en hojuelas",
      "pan integral",
      "pan de caja",
      "tortilla de trigo",
    ],
  },
  {
    allergen: "Leche",
    labels: [
      "leche",
      "leche de avena",
      "yogur griego",
      "yogur",
      "crema de leche",
      "crema agria",
      "mantequilla",
      "queso feta",
      "parmesano",
      "mascarpone",
      "mozzarella",
      "queso crema",
      "nata",
    ],
  },
  {
    allergen: "Huevo",
    labels: ["huevo", "huevos", "claras de huevo", "yema"],
  },
  {
    allergen: "Frutos secos",
    labels: [
      "nueces",
      "almendra",
      "cacahuate",
      "mantequilla de cacahuate",
      "avena (copos de cacao)",
      "chocolate con leche",
      "pistacho",
    ],
  },
  {
    allergen: "Sésamo",
    labels: ["sésamo", "pasta de sésamo", "tahini"],
  },
  {
    allergen: "Soya",
    labels: ["soja", "salsa de soya", "tofu", "edamame", "témpano"],
  },
  {
    allergen: "Mariscos",
    labels: ["camarón", "camaron", "gamba", "mejillon", "calamar", "cangrejo"],
  },
  {
    allergen: "Pescado",
    labels: ["lomo de salmon", "salmon", "atun en lata", "atún", "bacalao", "sardina"],
  },
  {
    allergen: "Apio",
    labels: ["apio", "puerro"],
  },
];

export interface SubstitutionOption {
  /** The label of the ingredient that can be replaced. */
  original: string;
  /** What the person can use instead. */
  replacement: string;
  /** How much to use, when the amount can be stated honestly. */
  quantity: string;
  /** What changes in the final dish. */
  note: string;
}

/**
 * Substitutions that were checked against the recipes in the catalogue. Only
 * these are offered: the assistant is not allowed to invent an alternative it
 * cannot justify.
 */
export const VERIFIED_SUBSTITUTIONS: SubstitutionOption[] = [
  {
    original: "Leche",
    replacement: "Leche de avena o de soya sin azúcar",
    quantity: "la misma cantidad",
    note: "El resultado queda un poco menos cremoso y con un toque más dulce.",
  },
  {
    original: "Leche de avena",
    replacement: "Leche de soya o de almendra sin azúcar",
    quantity: "la misma cantidad",
    note: "La textura se mantiene; cambia ligeramente el sabor.",
  },
  {
    original: "Yogur griego",
    replacement: "Yogur de soya natural o queso crema vegetal",
    quantity: "la misma cantidad",
    note: "El gusto es más ácido y el plato queda menos denso.",
  },
  {
    original: "Mantequilla",
    replacement: "Aceite de oliva o de girasol",
    quantity: "la misma cantidad",
    note: "Sustituye el sabor a mano, pero la textura queda algo menos cremosa.",
  },
  {
    original: "Mantequilla de cacahuate",
    replacement: "Tahini o pasta de girasol",
    quantity: "la misma cantidad",
    note: "El sabor cambia hacia el sésamo; el dulzor es parecido.",
  },
  {
    original: "Crema de leche",
    replacement: "Crema de coco o nata vegetal",
    quantity: "la misma cantidad",
    note: "Añade un toque dulce propio; sirve bien en sopas y risottos.",
  },
  {
    original: "Crema agria",
    replacement: "Yogur griego o yogur vegetal natural",
    quantity: "la misma cantidad",
    note: "El plato queda un poco más ácido.",
  },
  {
    original: "Huevo",
    replacement: "Sustituto de huevo comercial (2 cdas por huevo) o puré de manzana y lino",
    quantity: "1 unidad de sustituto por huevo",
    note: "La textura no es idéntica: el plato queda más frágil y con menos aire.",
  },
  {
    original: "Harina de trigo",
    replacement: "Harina de arroz o de almendra (1:1)",
    quantity: "la misma cantidad",
    note: "La masa queda menos elástica y puede ser más quebradiza.",
  },
  {
    original: "Espagueti",
    replacement: "Espagueti de arroz o de amaranto",
    quantity: "la misma cantidad",
    note: "El sabor es más suave y el tiempo de cocción cambia un poco.",
  },
  {
    original: "Pechuga de pollo",
    replacement: "Tofu firme o setas (champiñones)",
    quantity: "el mismo peso",
    note: "El aporte de proteína baja y cambia el sabor de la marinada.",
  },
  {
    original: "Camarón",
    replacement: "Surimi o setas",
    quantity: "el mismo peso",
    note: "El sabor del mar se pierde casi por completo.",
  },
  {
    original: "Atún en lata",
    replacement: "Jackfruit en agua o atún sustituto de legumbre",
    quantity: "el mismo peso escurrido",
    note: "La textura es más suave y menos firme.",
  },
  {
    original: "Azúcar",
    replacement: "Miel o agave",
    quantity: "un poco menos (miel o agave endulzan más)",
    note: "El resultado queda algo más húmedo.",
  },
  {
    original: "Cacao en polvo",
    replacement: "Cacao puro sin azúcar",
    quantity: "la misma cantidad",
    note: "Sabe más intenso y menos dulce.",
  },
  {
    original: "Caldo de verduras",
    replacement: "Caldo casero o agua con un cubo vegetal",
    quantity: "la misma cantidad",
    note: "El sabor queda más suave si el caldo es casero.",
  },
  {
    original: "Espinaca",
    replacement: "Acelga o bok choy",
    quantity: "la misma cantidad",
    note: "La acelga es más amarga y el bok choy más dulce.",
  },
  {
    original: "Limón",
    replacement: "Lima o naranja",
    quantity: "la misma cantidad",
    note: "La lima es más ácida y la naranja mucho más dulce.",
  },
  {
    original: "Queso feta",
    replacement: "Queso panela o tofu firme desmenuzado",
    quantity: "el mismo peso",
    note: "El sabor salado es más suave.",
  },
  {
    original: "Parmesano",
    replacement: "Levadura nutritional o queso vegetal rallado",
    quantity: "la misma cantidad",
    note: "El sabor del queso curado es más débil, pero el toque salado se mantiene.",
  },
  {
    original: "Granola",
    replacement: "Avena en hojuelas con nueces y maple",
    quantity: "la misma cantidad",
    note: "Queda menos crujiente si la mezcla está fresca.",
  },
  {
    original: "Arroz arborio",
    replacement: "Arroz basmati o arroz jazmín",
    quantity: "la misma cantidad",
    note: "El risotto queda menos cremoso porque el arroz absorbe distinto.",
  },
  {
    original: "Masa de pizza",
    replacement: "Masa de pizza sin gluten o base de coliflor",
    quantity: "una base para el mismo tamaño",
    note: "La masa no queda igual de crujiente ni se sostiene igual.",
  },
];

export function findSubstitutionsFor(original: string): SubstitutionOption[] {
  const needle = original.trim().toLowerCase();
  if (!needle) return [];
  return VERIFIED_SUBSTITUTIONS.filter(
    (option) =>
      option.original.toLowerCase() === needle ||
      option.original.toLowerCase().includes(needle) ||
      needle.includes(option.original.toLowerCase()),
  );
}
