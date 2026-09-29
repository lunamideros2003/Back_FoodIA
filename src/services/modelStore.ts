import { getDb } from "../db/connection.ts";
import { seed } from "../db/seed.ts";
import { CollaborativeFilter } from "../ai/collaborative.ts";
import { MoodModel } from "../ai/moodModel.ts";
import { TasteProfile } from "../ai/tasteProfile.ts";
import { MODEL_VERSION, prepareModels } from "../ai/recommender.ts";
import { listDishes, listInteractions } from "./repositories.ts";

/**
 * Holds the trained models in memory and retrains them whenever the catalogue
 * or the interaction log changes. Retraining is cheap at this data size
 * (tens of dishes, hundreds of interactions) and keeps the service stateless.
 */

class ModelStore {
  readonly moodModel = new MoodModel();
  readonly tasteProfile = new TasteProfile();
  readonly collaborative = new CollaborativeFilter();
  readonly version = MODEL_VERSION;

  private trainedAt: string | null = null;
  private trainingMs = 0;
  private trained = false;

  ensureReady(): void {
    if (this.trained) return;
    this.retrain();
  }

  retrain(): void {
    const started = performance.now();
    seed();
    const dishes = listDishes();
    const interactions = listInteractions();
    prepareModels(dishes, interactions, this.moodModel, this.tasteProfile, this.collaborative);
    this.trainingMs = performance.now() - started;
    this.trainedAt = new Date().toISOString();
    this.trained = true;
  }

  stats() {
    this.ensureReady();
    return {
      version: this.version,
      trainedAt: this.trainedAt,
      trainingMs: Math.round(this.trainingMs),
      dishes: this.tasteProfile.dishCount,
      vocabulary: this.tasteProfile.vocabularySize,
      observations: this.moodModel.observationCount,
      collaborativeUsers: this.collaborative.userCount,
      collaborativeItems: this.collaborative.itemCount,
      moodModel: this.moodModel.snapshot(),
    };
  }
}

export const modelStore = new ModelStore();

export function invalidateModels(): void {
  modelStore.retrain();
}

export function db() {
  return getDb();
}
