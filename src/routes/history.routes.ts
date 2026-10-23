import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { requireAuthUser } from "../middleware/auth.ts";
import { findUserById, listDishes } from "../services/repositories.ts";
import {
  clearRecipeEntries,
  countPrepared,
  deleteRecipeEntry,
  listRecipeEntries,
  upsertRecipeEntry,
} from "../services/historyRepository.ts";

export const historyRouter = Router();

const entrySchema = z.object({
  dishId: z.number().int().positive(),
  status: z.enum(["viewed", "prepared"]),
  rating: z.number().min(1).max(5).nullish(),
  note: z.string().max(500).nullish(),
  feelingNote: z.string().max(500).nullish(),
});

const patchSchema = z.object({
  status: z.enum(["viewed", "prepared"]).optional(),
  rating: z.number().min(1).max(5).nullish(),
  note: z.string().max(500).nullish(),
  feelingNote: z.string().max(500).nullish(),
});

const historyQuerySchema = z.object({
  status: z.enum(["viewed", "prepared"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(1000).optional(),
});

function requireUser(req: import("express").Request, userId: number) {
  requireAuthUser(req, userId);
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");
  return user;
}

function requireDish(dishId: number) {
  const dish = listDishes().find((candidate) => candidate.id === dishId);
  if (!dish) throw new HttpError(404, "El plato no existe.");
  return dish;
}

/**
 * The kitchen trail: the recipes the user opened and the ones they cooked.
 */
historyRouter.get("/users/:id/history", (req, res) => {
  const id = Number(req.params.id);
  requireUser(req, id);

  const query = historyQuerySchema.parse(req.query);
  const all = listRecipeEntries(id, query.status ? { status: query.status } : {});
  const total = all.length;
  const offset = query.offset ?? 0;
  let items = all;
  if (offset > 0) items = items.slice(offset);
  if (query.limit) items = items.slice(0, query.limit);

  res.json({
    items,
    total,
    offset,
    limit: query.limit ?? null,
    prepared: countPrepared(id),
  });
});

/** Marks a recipe as viewed or as prepared, with the optional notes. */
historyRouter.post("/users/:id/history", (req, res) => {
  const id = Number(req.params.id);
  requireUser(req, id);

  const body = entrySchema.parse(req.body);
  requireDish(body.dishId);

  const entry = upsertRecipeEntry(id, body.dishId, {
    status: body.status,
    rating: body.rating ?? null,
    note: body.note ?? null,
    feelingNote: body.feelingNote ?? null,
  });

  res.status(201).json(entry);
});

/**
 * Updates what the user wrote about a recipe. The rating, the note and the
 * feeling note are all voluntary and can be cleared.
 */
historyRouter.patch("/users/:id/history/:dishId", (req, res) => {
  const id = Number(req.params.id);
  requireUser(req, id);

  const dishId = Number(req.params.dishId);
  if (!Number.isInteger(dishId)) {
    throw new HttpError(400, "El id del plato no es válido.");
  }
  requireDish(dishId);

  const body = patchSchema.parse(req.body);
  const current = listRecipeEntries(id, {}).find((entry) => entry.dishId === dishId);

  const entry = upsertRecipeEntry(id, dishId, {
    status: body.status ?? current?.status ?? "viewed",
    rating: body.rating === undefined ? current?.rating ?? null : body.rating,
    note: body.note === undefined ? current?.note ?? null : body.note,
    feelingNote:
      body.feelingNote === undefined ? current?.feelingNote ?? null : body.feelingNote,
  });

  res.json(entry);
});

/** Clears the whole trail of a user. The notes go with it. */
historyRouter.delete("/users/:id/history", (req, res) => {
  const id = Number(req.params.id);
  requireUser(req, id);
  const removed = clearRecipeEntries(id);
  res.json({ ok: true, removed });
});

/** Removes a recipe from the trail. */
historyRouter.delete("/users/:id/history/:dishId", (req, res) => {
  const id = Number(req.params.id);
  requireUser(req, id);

  const dishId = Number(req.params.dishId);
  if (!Number.isInteger(dishId)) {
    throw new HttpError(400, "El id del plato no es válido.");
  }

  const removed = deleteRecipeEntry(id, dishId);
  res.json({ ok: true, removed });
});
