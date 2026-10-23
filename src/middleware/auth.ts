import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./error.ts";
import { resolveSession } from "../services/authService.ts";
import type { User } from "../domain/types.ts";

declare global {
  // Expressed this way because Express's default types have no locals map.
  // Res.locals.user is the only state this middleware adds.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
    interface Locals {
      user: User;
    }
  }
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ") || header.length <= "Bearer ".length) return null;
  return header.slice("Bearer ".length);
}

export function authToRequest(req: Request, _res: Response, next: NextFunction): void {
  const user = resolveSession(bearerToken(req));
  if (user) {
    req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = resolveSession(bearerToken(req));
  if (!user) {
    res.status(401).json({
      error: "Necesitas iniciar sesión para hacer eso.",
      code: "auth.required",
    });
    return;
  }
  res.locals.user = user;
  next();
}

export function requireAuthUser(
  req: Request,
  userId: number,
): User {
  const user = resolveSession(bearerToken(req));
  if (!user) {
    throw new HttpError(401, "Necesitas iniciar sesión para hacer eso.");
  }
  if (user.id !== userId) {
    throw new HttpError(403, "Solo puedes usar tu propio perfil.");
  }
  return user;
}

export function currentUser(req: Request): User | null {
  return resolveSession(bearerToken(req));
}
