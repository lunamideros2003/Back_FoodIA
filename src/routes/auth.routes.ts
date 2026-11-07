import { Router } from "express";
import { z } from "zod";
import { asyncRoute, HttpError } from "../middleware/error.ts";
import { bearerToken, requireAuth } from "../middleware/auth.ts";
import { createUser } from "../services/userService.ts";
import {
  createSession,
  destroySession,
  hashPassword,
  purgeExpiredSessions,
  resolveSession,
  verifyPassword,
} from "../services/authService.ts";
import { findUserByEmail } from "../services/repositories.ts";
import type { User } from "../domain/types.ts";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Escribe tu correo. Ejemplo: nombre@correo.com.")
    .max(120, "El correo es demasiado largo (máximo 120 caracteres).")
    .email("El correo debe incluir una @ y un dominio válido, por ejemplo: nombre@correo.com."),
  password: z
    .string()
    .min(8, "La contraseña necesita al menos 8 caracteres.")
    .max(120, "La contraseña es demasiado larga (máximo 120 caracteres)."),
});

const registerSchema = credentialsSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(40, "El nombre es demasiado largo (máximo 40 caracteres)."),
  preferences: z
    .object({
      diet: z.enum(["omnivore", "vegetarian", "vegan", "pescatarian"]).optional(),
      maxPrepMinutes: z.number().int().min(1).max(240).nullish(),
      dailyCalorieGoal: z.number().int().min(800).max(5000).optional(),
      allergies: z.array(z.string().max(40)).max(20).optional(),
      dislikedIngredients: z.array(z.string().max(40)).max(20).optional(),
    })
    .optional(),
});

function publicUser(user: User): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    preferences: user.preferences,
  };
}

authRouter.post(
  "/register",
  asyncRoute(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();

    purgeExpiredSessions();
    if (findUserByEmail(email)) {
      throw new HttpError(409, "Ya existe una cuenta con ese correo.");
    }

    const user = createUser({
      email,
      displayName: body.displayName.trim(),
      preferences: body.preferences,
      passwordHash: hashPassword(body.password),
      withPassword: true,
    });

    const session = createSession(user.id);
    res.status(201).json({ user: publicUser(session.user), token: session.token, expiresAt: session.expiresAt });
  }),
);

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const body = credentialsSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const user = findUserByEmail(email);

    if (!user || !verifyPassword(body.password, user.getPasswordHash?.() ?? null)) {
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    }

    const session = createSession(user.id);
    res.json({ user: publicUser(session.user), token: session.token, expiresAt: session.expiresAt });
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(res.locals.user) });
});

authRouter.post("/logout", (req, res) => {
  const destroyed = destroySession(bearerToken(req));
  res.json({ ok: true, destroyed });
});

authRouter.get("/session", (req, res) => {
  const user = resolveSession(bearerToken(req));
  if (!user) res.json({ session: null });
  else res.json({ user: publicUser(user) });
});
