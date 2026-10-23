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
  email: z.string().email().max(120),
  password: z.string().min(8).max(120),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().min(2).max(40),
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
    const user = findUserByEmail(body.email.toLowerCase());

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
