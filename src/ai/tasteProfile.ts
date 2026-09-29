import type { Dish, InteractionAction } from "../domain/types.ts";
import { buildTfidfModel, centroid, tokenize, vectorizeQuery, type TfidfModel } from "./text.ts";
import { clamp, cosine } from "./vector.ts";

/**
 * Content-based side of the recommender. Each dish becomes a TF-IDF document
 * built from its name, description, tags and ingredient list. A user's taste
 * vector is the weighted centroid of the dishes they reacted to positively,
 * which lets the model generalise to dishes the user has never seen.
 */

const POSITIVE_ACTIONS = new Set<InteractionAction>(["like", "save", "cook"]);
const NEGATIVE_ACTIONS = new Set<InteractionAction>(["dislike"]);

export interface TasteSignal {
  dishId: number;
  weight: number;
}

export class TasteProfile {
  private model: TfidfModel | null = null;
  private readonly dishById = new Map<number, Dish>();

  fit(dishes: Dish[]): void {
    this.dishById.clear();
    for (const dish of dishes) this.dishById.set(dish.id, dish);

    this.model = buildTfidfModel(
      dishes.map((dish) => ({
        id: dish.id,
        text: [
          dish.name,
          dish.nameEs,
          dish.category,
          dish.description,
          dish.tags.join(" "),
          dish.ingredients.map((item) => item.label).join(" "),
        ].join(" "),
      })),
    );
  }

  get vocabularySize(): number {
    return this.model?.vocabulary.length ?? 0;
  }

  documentVector(dishId: number): number[] {
    return this.model?.vectors.get(dishId) ?? [];
  }

  /** Weighted centroid of the reactions the user gave. */
  buildUserVector(signals: TasteSignal[]): number[] | null {
    if (!this.model || signals.length === 0) return null;
    const vectors: number[][] = [];
    const weights: number[] = [];

    for (const signal of signals) {
      const vector = this.model.vectors.get(signal.dishId);
      if (!vector) continue;
      vectors.push(vector);
      weights.push(Math.abs(signal.weight));
    }
    if (vectors.length === 0) return null;

    const average = centroid(vectors);
    return average.map((value, index) => value * (weights[index] ?? 1));
  }

  /**
   * Blend the learned taste vector with a free-text query from the user. Both
   * sides are L2-normalised first, otherwise the learned centroid (a sum of
   * document vectors) would swamp the single query vector and the note the
   * user typed would have no effect.
   */
  combineWithQuery(userVector: number[] | null, freeText: string | null): number[] | null {
    if (!this.model) return null;
    const queryVector = freeText?.trim() ? vectorizeQuery(this.model, freeText) : null;
    if (!queryVector) return userVector;
    if (!userVector) return normalizeL2(queryVector);

    return userVector.map(
      (value, index) =>
        normalizeL2(userVector)[index] * 0.45 + normalizeL2(queryVector)[index] * 0.55,
    );
  }

  similarity(vector: number[] | null, dishId: number): number {
    if (!vector) return 0;
    const document = this.documentVector(dishId);
    if (document.length === 0) return 0;
    return clamp(cosine(vector, document));
  }

  /** Which stored terms best explain a match, for the API explanation field. */
  topMatchingTerms(vector: number[] | null, dishId: number, limit = 3): string[] {
    if (!this.model || !vector) return [];
    const document = this.documentVector(dishId);
    const scored: { term: string; score: number }[] = [];
    for (let index = 0; index < document.length; index += 1) {
      if (document[index] <= 0) continue;
      scored.push({
        term: this.model.vocabulary[index],
        score: document[index] * (vector[index] ?? 0),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((item) => item.term);
  }

  static toSignals(
    interactions: { dishId: number; action: InteractionAction; rating?: number | null }[],
  ): TasteSignal[] {
    const signals: TasteSignal[] = [];
    for (const interaction of interactions) {
      let weight = 0;
      if (POSITIVE_ACTIONS.has(interaction.action)) {
        weight = interaction.action === "cook" ? 1.3 : 1;
      } else if (NEGATIVE_ACTIONS.has(interaction.action)) {
        weight = -1.2;
      } else if (interaction.action === "rate" && typeof interaction.rating === "number") {
        weight = (clamp(interaction.rating / 5) - 0.5) * 2;
      }
      if (weight === 0) continue;
      signals.push({ dishId: interaction.dishId, weight });
    }
    return signals;
  }

  get dishCount(): number {
    return this.dishById.size;
  }

  static keywords(text: string): string[] {
    return tokenize(text);
  }
}

function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce<number>((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
