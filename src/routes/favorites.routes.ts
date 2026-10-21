import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { findUserById, listDishes } from "../services/repositories.ts";
import {
  addFavorite,
  listFavoriteIds,
  listFavorites,
  removeFavorite,
  toggleFavorite,
} from "../services/favoriteRepository.ts";
import { recordInteraction } from "../services/interactionService.ts";

export const favoritesRouter = Router();

const favoriteSchema = z.object({
  dishId: z.number().int().positive(),
});

function requireUser(userId: number) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");
  return user;
}

function requireDish(dishId: number) {
  const dish = listDishes().find((candidate) => candidate.id === dishId);
  if (!dish) throw new HttpError(404, "El plato no existe.");
  return dish;
}

/** The recipes the user decided to keep. */
favoritesRouter.get("/users/:id/favorites", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);
  res.json({ items: listFavorites(id) });
});

/** Saves a recipe. Saving the same recipe twice is a no-op. */
favoritesRouter.post("/users/:id/favorites", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const body = favoriteSchema.parse(req.body);
  requireDish(body.dishId);

  const favorite = addFavorite(id, body.dishId);
  res.status(201).json({ saved: true, favorite, ids: listFavoriteIds(id) });
});

/** Removes a recipe from the favourites. */
favoritesRouter.delete("/users/:id/favorites/:dishId", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const dishId = Number(req.params.dishId);
  if (!Number.isInteger(dishId)) {
    throw new HttpError(400, "El id del plato no es válido.");
  }

  const removed = removeFavorite(id, dishId);
  res.json({ saved: false, removed, ids: listFavoriteIds(id) });
});

/**
 * Flips the state of a recipe. It is the endpoint the heart button uses, so
 * the answer always carries the full list of ids the frontend needs.
 */
favoritesRouter.post("/users/:id/favorites/toggle", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const body = favoriteSchema.parse(req.body);
  const dish = requireDish(body.dishId);

  const result = toggleFavorite(id, body.dishId);

  // A favourite is a real signal about what the person likes, so it feeds
  // the model exactly like an explicit "save" interaction would.
  try {
    recordInteraction({
      userId: id,
      dishId: body.dishId,
      action: result.saved ? "save" : "dislike",
    });
  } catch {
    // Telemetry must never break the toggle.
  }

  res.json({
    saved: result.saved,
    favorite: result.favorite,
    ids: listFavoriteIds(id),
    dishId: dish.id,
  });
});
