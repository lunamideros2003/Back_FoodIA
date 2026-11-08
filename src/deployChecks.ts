/**
 * Startup checks for the mistakes that are invisible from the browser but
 * fatal on a hosted platform. Each one is a console line, never a crash: the
 * server still starts, the developer just finds out in the logs instead of
 * three confusing browser errors later.
 */

interface CheckInput {
  isProduction: boolean;
  corsOrigins: string[];
  /** False when the app fell back to the SQLite file. */
  hasDatabaseUrl?: boolean;
}

const PRODUCTION_FRONTEND_HINTS = ["vercel.app", "netlify.app", "pages.dev", "onrender.com"];

export function WARNINGS({ isProduction, corsOrigins, hasDatabaseUrl }: CheckInput): string[] {
  const warnings: string[] = [];

  if (!isProduction) return warnings;

  if (hasDatabaseUrl === false) {
    warnings.push(
      "Without DATABASE_URL the database is still a SQLite file: on Render without a disk " +
        "it is wiped on every deploy. Connect Supabase and paste its connection string into DATABASE_URL.",
    );
  }

  const localhostOnly = corsOrigins.every((origin) => origin.includes("localhost"));
  const allowsAnyOrigin = corsOrigins.includes("*");

  if (allowsAnyOrigin) {
    warnings.push(
      "CORS_ORIGIN is set to «*». It works, but leaves the API open. That is fine for a class project.",
    );
  } else if (localhostOnly) {
    warnings.push(
      "CORS_ORIGIN only allows localhost. Your Vercel frontend will be blocked: " +
        "add the site URL, separated by commas.",
    );
  } else if (
    corsOrigins.length === 0 ||
    !corsOrigins.some((origin) => PRODUCTION_FRONTEND_HINTS.some((hint) => origin.includes(hint)))
  ) {
    warnings.push(
      "No CORS origin looks like a deployed site (vercel.app, netlify.app…). " +
        `Check CORS_ORIGIN: ${corsOrigins.join(", ") || "(empty)"}`,
    );
  }

  if (corsOrigins.length > 1) {
    warnings.push("If Vercel gave you a URL with dashes (foodmood-ia-abc123.vercel.app), add it exactly as is.");
  }

  return warnings;
}