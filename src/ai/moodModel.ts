import type { AxisName, DishAxes, InteractionAction, MoodKey } from "../domain/types.ts";
import { AXIS_NAMES, AXIS_LABELS_ES } from "../domain/types.ts";
import { clamp } from "./vector.ts";

/**
 * Mood model: an explainable, continuously-trained model that maps a mood to a
 * target flavour profile.
 *
 * Two stages:
 *  1. A curated prior (target profile + axis importance) so the app behaves
 *     sensibly on the very first request, with no interaction history.
 *  2. Online learning. Every like / dislike / cook / rate updates per-mood,
 *     per-axis statistics. As evidence accumulates the prior is blended out
 *     and replaced by what this user base actually responds to.
 */

export interface MoodPrior {
  target: Partial<DishAxes>;
  importance: Partial<Record<AxisName, number>>;
}

export const MOOD_PRIORS: Record<MoodKey, MoodPrior> = {
  tired: {
    target: { comfort: 0.9, warmth: 0.9, richness: 0.75, sweetness: 0.55, spice: 0.2, speed: 0.6, freshness: 0.3, complexity: 0.3 },
    importance: { comfort: 1, warmth: 0.8, richness: 0.7, sweetness: 0.5, speed: 0.45, complexity: 0.4, spice: 0.4 },
  },
  happy: {
    target: { comfort: 0.7, warmth: 0.65, indulgence: 0.7, freshness: 0.65, spice: 0.55, speed: 0.6, richness: 0.7, value: 0.6 },
    importance: { indulgence: 1, freshness: 0.75, comfort: 0.7, spice: 0.6, speed: 0.55, value: 0.5 },
  },
  stressed: {
    target: { comfort: 0.95, warmth: 0.9, complexity: 0.15, spice: 0.2, sweetness: 0.6, speed: 0.7, lightness: 0.35, richness: 0.75 },
    importance: { comfort: 1, complexity: 0.9, warmth: 0.8, speed: 0.7, sweetness: 0.55, spice: 0.55 },
  },
  sad: {
    // The one mood where sugar is the point, not a side effect. A sad person
    // asking for food wants something that actually feels like a treat.
    target: { sweetness: 0.9, indulgence: 0.9, comfort: 0.85, warmth: 0.75, richness: 0.75, spice: 0.15, freshness: 0.3, lightness: 0.3 },
    importance: { sweetness: 1, indulgence: 1, comfort: 0.9, warmth: 0.7, richness: 0.7, spice: 0.6, lightness: 0.5 },
  },
  no_energy: {
    target: { energy: 0.9, freshness: 0.85, lightness: 0.8, protein: 0.75, spice: 0.2, richness: 0.4, comfort: 0.55, speed: 0.65 },
    importance: { energy: 1, lightness: 0.85, freshness: 0.8, protein: 0.7, comfort: 0.5, spice: 0.55 },
  },
  in_a_hurry: {
    target: { speed: 0.95, complexity: 0.1, value: 0.85, comfort: 0.7, protein: 0.6, richness: 0.6, freshness: 0.5 },
    importance: { speed: 1, complexity: 0.85, value: 0.7, comfort: 0.55, protein: 0.5, richness: 0.45 },
  },
};

const POSITIVE_ACTIONS = new Set<InteractionAction>(["like", "cook", "save"]);
const NEGATIVE_ACTIONS = new Set<InteractionAction>(["dislike"]);
const NEUTRAL_ACTIONS = new Set<InteractionAction>(["view", "impression", "rate", "eat"]);

export interface AxisStats {
  positiveMass: number;
  negativeMass: number;
  positiveSum: number;
  negativeSum: number;
}

export type MoodStats = Record<AxisName, AxisStats>;

export function createEmptyStats(): MoodStats {
  const stats = {} as MoodStats;
  for (const axis of AXIS_NAMES) {
    stats[axis] = { positiveMass: 0, negativeMass: 0, positiveSum: 0, negativeSum: 0 };
  }
  return stats;
}

function emptyMoodStats(): Record<MoodKey, MoodStats> {
  return {
    tired: createEmptyStats(),
    happy: createEmptyStats(),
    stressed: createEmptyStats(),
    sad: createEmptyStats(),
    no_energy: createEmptyStats(),
    in_a_hurry: createEmptyStats(),
  };
}

export interface TrainingSample {
  moodKey: MoodKey;
  axes: DishAxes;
  action: InteractionAction;
  rating?: number | null;
}

export class MoodModel {
  private readonly stats: Record<MoodKey, MoodStats> = emptyMoodStats();
  private observations = 0;

  get observationCount(): number {
    return this.observations;
  }

  train(samples: TrainingSample[]): void {
    for (const sample of samples) {
      const bucket = this.stats[sample.moodKey];
      if (!bucket) continue;

      let weight = 0;
      if (POSITIVE_ACTIONS.has(sample.action)) weight = 1;
      else if (NEGATIVE_ACTIONS.has(sample.action)) weight = -1;
      else if (sample.action === "rate" && typeof sample.rating === "number") {
        weight = (clamp(sample.rating / 5) - 0.5) * 2;
      }

      if (NEUTRAL_ACTIONS.has(sample.action) && weight === 0) continue;
      if (weight === 0) continue;

      for (const axis of AXIS_NAMES) {
        const value = sample.axes[axis];
        const slot = bucket[axis];
        if (weight > 0) {
          slot.positiveMass += weight;
          slot.positiveSum += value * weight;
        } else {
          slot.negativeMass += -weight;
          slot.negativeSum += value * -weight;
        }
      }
      this.observations += 1;
    }
  }

  /**
   * How much to trust the data over the curated prior. With so few signals per
   * mood the prior must dominate, otherwise three interactions can flip the
   * meaning of a mood.
   */
  private confidence(moodKey: MoodKey): number {
    const comfort = this.stats[moodKey]?.comfort;
    const samples = comfort ?? { positiveMass: 0, negativeMass: 0 };
    const total = samples.positiveMass + samples.negativeMass;
    return total / (total + 8);
  }

  private meanPositive(moodKey: MoodKey, axis: AxisName, fallback: number): number {
    const slot = this.stats[moodKey]?.[axis];
    if (!slot || slot.positiveMass === 0) return fallback;
    return slot.positiveSum / slot.positiveMass;
  }

  private meanNegative(moodKey: MoodKey, axis: AxisName, fallback: number): number {
    const slot = this.stats[moodKey]?.[axis];
    if (!slot || slot.negativeMass === 0) return fallback;
    return slot.negativeSum / slot.negativeMass;
  }

  /** Learned goal vector for the mood: what positively-rated food looks like. */
  learnedTarget(moodKey: MoodKey): DishAxes {
    const prior = MOOD_PRIORS[moodKey].target;
    const confidence = this.confidence(moodKey);
    const target = {} as DishAxes;

    for (const axis of AXIS_NAMES) {
      const fallback = prior[axis] ?? 0.5;
      const positiveMean = this.meanPositive(moodKey, axis, fallback);
      const negativeMean = this.meanNegative(moodKey, axis, fallback);
      // Move the target in the direction that separates likes from dislikes.
      const separated = positiveMean - (negativeMean - positiveMean) * 0.35;
      target[axis] = clamp(fallback * (1 - confidence) + separated * confidence, 0, 1);
    }
    return target;
  }

  /**
   * How discriminating each axis is for this mood, 0..1.
   *
   * The prior defines which axes are meaningful for a mood at all, and the data
   * only modulates their intensity. A mood like "tired" keeps weighting comfort
   * and warmth no matter what, while an axis the prior ignores (speed, for
   * example) can only creep in with a small, capped weight.
   */
  learnedImportance(moodKey: MoodKey): DishAxes {
    const prior = MOOD_PRIORS[moodKey].importance;
    const confidence = this.confidence(moodKey);
    const importance = {} as DishAxes;

    for (const axis of AXIS_NAMES) {
      const priorWeight = prior[axis] ?? 0;
      const positiveMean = this.meanPositive(moodKey, axis, 0.5);
      const negativeMean = this.meanNegative(moodKey, axis, 0.5);
      const separation = Math.abs(positiveMean - negativeMean);
      const evidence = Math.min(1, separation * 2.2);

      importance[axis] =
        priorWeight > 0
          ? clamp(priorWeight * (1 - 0.4 * confidence * (1 - evidence)))
          : clamp(0.15 * confidence * evidence);
    }
    return importance;
  }

  /**
   * Score how well a dish fits the mood and return the individual axis
   * contributions so the API can explain the recommendation.
   */
  affinity(
    moodKey: MoodKey,
    axes: DishAxes,
  ): { score: number; contributions: { axis: AxisName; contribution: number; weight: number; gap: number }[] } {
    const target = this.learnedTarget(moodKey);
    const importance = this.learnedImportance(moodKey);

    let weighted = 0;
    let weightSum = 0;
    const contributions: { axis: AxisName; contribution: number; weight: number; gap: number }[] = [];

    for (const axis of AXIS_NAMES) {
      const weight = importance[axis];
      if (weight <= 0.01) continue;
      const gap = 1 - Math.abs(axes[axis] - target[axis]);
      const contribution = weight * gap;
      weighted += contribution;
      weightSum += weight;
      contributions.push({ axis, contribution, weight, gap });
    }

    contributions.sort((a, b) => b.contribution - a.contribution);
    const score = weightSum === 0 ? 0 : clamp(weighted / weightSum);

    return { score, contributions };
  }

  snapshot() {
    return {
      observations: this.observations,
      perMood: Object.fromEntries(
        (Object.keys(this.stats) as MoodKey[]).map((mood) => [
          mood,
          {
            confidence: Number(this.confidence(mood).toFixed(3)),
            target: this.learnedTarget(mood),
            importance: this.learnedImportance(mood),
          },
        ]),
      ),
    };
  }
}

export function describeAxis(axis: AxisName): string {
  return AXIS_LABELS_ES[axis];
}
