import { normalize } from "./text.ts";
import type { UserPreferences } from "../domain/types.ts";

type Diet = UserPreferences["diet"];

/**
 * Lightweight natural-language intent layer.
 *
 * The TF-IDF channel can tell that "algo con pollo" is about chicken, but it
 * cannot tell that "no quiero nada picante" is the exact opposite. This module
 * reads the surface form of a sentence and extracts hard constraints, so the
 * recommender can honour negations instead of merely de-ranking them.
 *
 * All patterns are compiled against accent-free text (see `rx`), which is what
 * `normalize()` produces, so "rápido" and "rapido" behave identically.
 */

export interface ExtractedIntent {
  maxSpiceLevel: number | null;
  maxSweetness: number | null;
  minLightness: number | null;
  minWarmth: number | null;
  maxPrepMinutes: number | null;
  maxPriceLevel: number | null;
  diet: Diet | null;
  /** Spanish phrases that produced the constraints, for the explanation. */
  signals: string[];
}

function emptyIntent(): ExtractedIntent {
  return {
    maxSpiceLevel: null,
    maxSweetness: null,
    minLightness: null,
    minWarmth: null,
    maxPrepMinutes: null,
    maxPriceLevel: null,
    diet: null,
    signals: [],
  };
}

/**
 * Lowercases and strips accents from a pattern source while keeping regex
 * metacharacters intact. `normalize()` cannot be reused here because it also
 * strips punctuation, which would flatten every pattern into plain text.
 */
function deaccent(source: string): string {
  return source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Compile a pattern that will be tested against accent-free normalized text. */
function rx(source: string, flags = "i"): RegExp {
  return new RegExp(deaccent(source), flags);
}

const NEGATION =
  "(?:no\\s+(?:quiero|me\\s+gusta|puedo|aguanto|me\\s+apesta)|nada\\s+(?:de\\s+)?|sin\\s+|evita(?:r)?\\s+|aleja(?:r)?\\s+de\\s+|prefiero\\s+evitar\\s+)";

interface Rule {
  pattern: RegExp;
  signal: string;
  apply: (intent: ExtractedIntent) => void;
}

const RULES: Rule[] = [
  {
    // Must be tested before the "wants spicy" rule, which also matches
    // "quiero ... picante" inside "no quiero nada picante".
    pattern: rx(`${NEGATION}.{0,26}?(picante|picor|picos|picosa|pico|chile|mexicano|mexicana)`),
    signal: "sin picante",
    apply: (intent) => {
      intent.maxSpiceLevel = Math.min(intent.maxSpiceLevel ?? 1, 0.2);
    },
  },
  {
    pattern: rx("muy\\s+(picante|picosa|picoso)|bien\\s+(picante|picoso|picosa)|que\\s+(si\\s+)?pique|picante\\s+de\\s+verdad"),
    signal: "con picante",
    apply: (intent) => {
      intent.maxSpiceLevel = null;
    },
  },
  {
    pattern: rx(`${NEGATION}.{0,26}?(dulce|dulces|azucar|postre|empalagoso)`),
    signal: "sin dulce",
    apply: (intent) => {
      intent.maxSweetness = Math.min(intent.maxSweetness ?? 1, 0.35);
    },
  },
  {
    pattern: rx(`${NEGATION}.{0,26}?(carne|res|cerdo|pollo|embutido|jamon|carnes)`),
    signal: "sin carne",
    apply: (intent) => {
      intent.diet = "vegetarian";
    },
  },
  {
    pattern: rx(`${NEGATION}.{0,26}?(carne|res|cerdo|pollo|pescado|marisco|cerveza)`),
    signal: "sin proteína animal",
    apply: (intent) => {
      intent.diet = "vegetarian";
    },
  },
  {
    pattern: rx("\\bvegano\\b|\\bvegana\\b|\\bvegano\\s+por\\s+favor\\b"),
    signal: "vegano",
    apply: (intent) => {
      intent.diet = "vegan";
    },
  },
  {
    pattern: rx("\\bpescetariano\\b|\\bpescetariana\\b"),
    signal: "pescetariano",
    apply: (intent) => {
      intent.diet = "pescatarian";
    },
  },
  {
    pattern: rx("\\bvegetariano\\b|\\bvegetariana\\b|\\bsin\\s+carne\\b"),
    signal: "vegetariano",
    apply: (intent) => {
      if (intent.diet !== "vegan") intent.diet = "vegetarian";
    },
  },
  {
    pattern: rx("\\b(rapid[oa]|rapidisim[oa]|prisa|prisas|urgente|volando|rapido)\\b|\\bse\\s+me\\s+apura\\b"),
    signal: "que sea rápido",
    apply: (intent) => {
      intent.maxPrepMinutes = Math.min(intent.maxPrepMinutes ?? 999, 20);
    },
  },
  {
    pattern: rx("\\b(barat[oa]|baratito|baratita|economico|economica|sencill[oa]|bajo\\s+presupuesto)\\b"),
    signal: "que sea barato",
    apply: (intent) => {
      intent.maxPriceLevel = Math.min(intent.maxPriceLevel ?? 3, 1);
    },
  },
  {
    pattern: rx("\\b(liger[oa]|light|sin\\s+grasa|bajo\\s+en\\s+calorias)\\b"),
    signal: "que sea ligero",
    apply: (intent) => {
      intent.minLightness = Math.max(intent.minLightness ?? 0, 0.6);
    },
  },
  {
    pattern: rx("\\b(calid[oa]|calientito|calientita|abrigador|abrigadora|reconfortante|que\\s+abraque)\\b"),
    signal: "que esté caliente",
    apply: (intent) => {
      intent.minWarmth = Math.max(intent.minWarmth ?? 0, 0.6);
    },
  },
];

export function extractIntent(text: string | null | undefined): ExtractedIntent {
  if (!text?.trim()) return emptyIntent();

  const normalized = normalize(text);
  const intent = emptyIntent();

  for (const rule of RULES) {
    if (!rule.pattern.test(normalized)) continue;
    rule.apply(intent);
    if (!intent.signals.includes(rule.signal)) intent.signals.push(rule.signal);
  }

  return intent;
}

export function hasHardConstraints(intent: ExtractedIntent): boolean {
  return (
    intent.maxSpiceLevel !== null ||
    intent.maxSweetness !== null ||
    intent.minLightness !== null ||
    intent.minWarmth !== null ||
    intent.maxPrepMinutes !== null ||
    intent.maxPriceLevel !== null ||
    intent.diet !== null
  );
}
