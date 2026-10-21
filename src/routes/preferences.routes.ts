import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error.ts";
import { findUserById } from "../services/repositories.ts";
import {
  clearSavedPreferences,
  deletePreference,
  listSavedPreferences,
  savePreferences,
} from "../services/preferenceRepository.ts";
import { SAVED_PREFERENCE_LABELS_ES, SAVED_PREFERENCE_KEYS } from "../domain/saved.ts";

export const preferencesRouter = Router();

const savedSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        value: z.string().max(200),
      }),
    )
    .max(20),
});

function requireUser(userId: number) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "Usuario no encontrado.");
  return user;
}

/**
 * The preferences the user agreed to keep. Nothing is stored automatically:
 * the user has to accept each one.
 */
preferencesRouter.get("/users/:id/saved-preferences", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  res.json({
    items: listSavedPreferences(id),
    available: SAVED_PREFERENCE_KEYS.map((key) => ({
      key,
      label: SAVED_PREFERENCE_LABELS_ES[key],
    })),
  });
});

/** Saves the preferences the user accepted. */
preferencesRouter.put("/users/:id/saved-preferences", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const body = savedSchema.parse(req.body);
  const items = savePreferences(id, body.items);

  res.json({
    items: listSavedPreferences(id),
    saved: items.length,
    rejected: body.items.length - items.length,
  });
});

/** Removes one saved preference. */
preferencesRouter.delete("/users/:id/saved-preferences/:key", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const key = req.params.key;
  const removed = deletePreference(id, key);

  res.json({ ok: true, removed, items: listSavedPreferences(id) });
});

/** Removes every saved preference of the user. */
preferencesRouter.delete("/users/:id/saved-preferences", (req, res) => {
  const id = Number(req.params.id);
  requireUser(id);

  const removed = clearSavedPreferences(id);
  res.json({ ok: true, removed, items: listSavedPreferences(id) });
});
