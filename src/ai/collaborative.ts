import type { InteractionAction } from "../domain/types.ts";
import { clamp } from "./vector.ts";

/**
 * Item-based collaborative filtering (ItemKNN) over the implicit feedback table.
 *
 * Every recorded interaction becomes a weighted signal, the per-item user
 * vectors are compared with cosine similarity, and a user's next pick is
 * predicted by propagating their own history through those similarities.
 */

const ACTION_STRENGTH: Record<InteractionAction, number> = {
  impression: 0.2,
  view: 0.4,
  like: 1,
  save: 1.1,
  cook: 1.3,
  // "ate it" is the strongest possible confirmation, but it is a statement
  // about the past, not a taste signal, so it stays close to a cook.
  eat: 1.2,
  rate: 1,
  dislike: -1.4,
};

/** Minimum number of users two dishes must share before ItemKNN trusts them. */
const MIN_SHARED_USERS = 2;

export interface InteractionRecord {
  userId: number;
  dishId: number;
  action: InteractionAction;
  rating?: number | null;
}

export interface SimilarItem {
  dishId: number;
  similarity: number;
  supportedBy: number;
}

export class CollaborativeFilter {
  private readonly itemUsers = new Map<number, Map<number, number>>();
  private readonly userItems = new Map<number, Map<number, number>>();
  private readonly cache = new Map<string, SimilarItem[]>();

  fit(records: InteractionRecord[]): void {
    for (const record of records) {
      let strength = ACTION_STRENGTH[record.action] ?? 0;
      if (record.action === "rate" && typeof record.rating === "number") {
        strength = (clamp(record.rating / 5) - 0.4) * 1.6;
      }
      if (record.action === "view" || record.action === "impression") {
        strength *= 0.5;
      }
      if (strength === 0) continue;

      const userMap = this.itemUsers.get(record.dishId) ?? new Map<number, number>();
      userMap.set(record.userId, (userMap.get(record.userId) ?? 0) + strength);
      this.itemUsers.set(record.dishId, userMap);

      const itemMap = this.userItems.get(record.userId) ?? new Map<number, number>();
      itemMap.set(record.dishId, (itemMap.get(record.dishId) ?? 0) + strength);
      this.userItems.set(record.userId, itemMap);
    }
    this.cache.clear();
  }

  get itemCount(): number {
    return this.itemUsers.size;
  }

  get userCount(): number {
    return this.userItems.size;
  }

  similarItems(dishId: number, limit = 10): SimilarItem[] {
    const key = `${dishId}:${limit}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const target = this.itemUsers.get(dishId);
    const result: SimilarItem[] = [];

    if (target && target.size > 0) {
      const targetNorm = norm(this.itemUsers.get(dishId)!);

      for (const [candidateId, candidate] of this.itemUsers) {
        if (candidateId === dishId) continue;

        let dot = 0;
        let overlap = 0;
        for (const [userId, value] of target) {
          const other = candidate.get(userId);
          if (other === undefined) continue;
          dot += value * other;
          overlap += 1;
        }
        if (overlap === 0) continue;

        // Cosine over the FULL candidate vector, not just the shared users.
        // Normalising over the overlap alone would make every candidate look
        // equally similar no matter how differently the user rated them.
        const candidateNorm = norm(candidate);
        const denominator = targetNorm * candidateNorm;
        if (denominator === 0) continue;

        const similarity = dot / denominator;
        // A pair that only one user has in common carries almost no signal, and
        // with a single rating both vectors are parallel so cosine would be a
        // flat 1.0 for every candidate. Require real co-evidence.
        if (overlap < MIN_SHARED_USERS) continue;

        const confidence = overlap / (overlap + 1.5);
        const score = similarity * confidence;
        if (score > 0.01) {
          result.push({ dishId: candidateId, similarity: score, supportedBy: overlap });
        }
      }
    }

    result.sort((a, b) => b.similarity - a.similarity);
    const top = result.slice(0, limit);
    this.cache.set(key, top);
    return top;
  }

  predict(userId: number, excludeDishIds: Set<number> = new Set()): Map<number, number> {
    const history = this.userItems.get(userId);
    const predictions = new Map<number, number>();
    if (!history) return predictions;

    const neighbours = new Map<number, { weight: number; evidence: number }>();
    for (const [dishId, strength] of history) {
      if (strength <= 0) continue;
      for (const neighbour of this.similarItems(dishId, 8)) {
        if (neighbour.dishId === dishId) continue;
        const current = neighbours.get(neighbour.dishId) ?? { weight: 0, evidence: 0 };
        current.weight += neighbour.similarity * strength;
        current.evidence += neighbour.similarity;
        neighbours.set(neighbour.dishId, current);
      }
    }

    for (const [dishId, value] of neighbours) {
      if (excludeDishIds.has(dishId)) continue;
      const normalized = value.weight / Math.sqrt(Math.max(1, value.evidence));
      predictions.set(dishId, clamp(normalized, 0, 1));
    }
    return predictions;
  }

  /** Most-liked dish vector, used as a popularity prior. */
  popularity(limit = 10): { dishId: number; score: number }[] {
    const scored: { dishId: number; score: number }[] = [];
    for (const [dishId, users] of this.itemUsers) {
      let total = 0;
      for (const value of users.values()) if (value > 0) total += value;
      if (total > 0) scored.push({ dishId, score: total });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

function norm(values: Map<number, number>): number {
  let total = 0;
  for (const value of values.values()) total += value * value;
  return Math.sqrt(total);
}
