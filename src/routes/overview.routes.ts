import { Router } from "express";
import { HttpError } from "../middleware/error.ts";
import { findUserById } from "../services/repositories.ts";
import { listFavorites } from "../services/favoriteRepository.ts";
import {
  countPrepared,
  listRecipeEntries,
} from "../services/historyRepository.ts";
import { listSavedPreferences } from "../services/preferenceRepository.ts";

export const overviewRouter = Router();

/**
 * A single call that gives the home page everything it needs about a user:
 * how much they saved, how much they cooked and what they already told the
 * app they like. It avoids five round trips on the first paint.
 */
overviewRouter.get("/users/:id/overview", (req, res) => {
  const id = Number(req.params.id);
  const user = Number.isInteger(id) ? findUserById(id) : null;
  if (!user) throw new HttpError(404, "Usuario no encontrado.");

  const favorites = listFavorites(id);
  const entries = listRecipeEntries(id);
  const prepared = entries.filter((entry) => entry.status === "prepared");
  const saved = listSavedPreferences(id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      preferences: user.preferences,
    },
    counts: {
      favorites: favorites.length,
      prepared: countPrepared(id),
      viewed: entries.length - prepared.length,
      notes: entries.filter((entry) => entry.note || entry.feelingNote).length,
      savedPreferences: saved.length,
    },
    favorites: favorites.slice(0, 4).map((entry) => ({
      dishId: entry.dishId,
      createdAt: entry.createdAt,
      dish: entry.dish,
    })),
    recent: entries.slice(0, 5).map((entry) => ({
      dishId: entry.dishId,
      status: entry.status,
      rating: entry.rating,
      note: entry.note,
      updatedAt: entry.updatedAt,
      dish: entry.dish,
    })),
    savedPreferences: saved.map((preference) => ({
      key: preference.key,
      value: preference.value,
    })),
  });
});
