import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  /** Length of the window, in milliseconds. */
  windowMs: number;
  /** How many requests a single client may make inside the window. */
  max: number;
  /** Message shown when the limit is reached. */
  message?: string;
}

/**
 * A small in-memory limiter for the endpoints that can call a model provider.
 *
 * It is intentionally simple: the app runs on a single process, and the goal
 * is to stop one person from hammering the assistant, not to police a whole
 * network. The state is per process; a restart resets it.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const message =
    options.message ?? "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.";

  const hits = new Map<string, number[]>();

  function purge(now: number): void {
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((time) => now - time < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }

  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (hits.size > 500) purge(now);

    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: message, retryAfter });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
