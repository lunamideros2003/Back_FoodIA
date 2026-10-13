/**
 * Startup checks for the mistakes that are invisible from the browser but
 * fatal on a hosted platform. Each one is a console line, never a crash: the
 * server still starts, the developer just finds out in the logs instead of
 * three confusing browser errors later.
 */

interface CheckInput {
  isProduction: boolean;
  corsOrigins: string[];
}

const PRODUCTION_FRONTEND_HINTS = ["vercel.app", "netlify.app", "pages.dev", "onrender.com"];

export function WARNINGS({ isProduction, corsOrigins }: CheckInput): string[] {
  const warnings: string[] = [];

  if (!isProduction) return warnings;

  const localhostOnly = corsOrigins.every((origin) => origin.includes("localhost"));
  const allowsAnyOrigin = corsOrigins.includes("*");

  if (allowsAnyOrigin) {
    warnings.push(
      "CORS_ORIGIN está en «*». Funciona, pero deja abierto el API. En un proyecto de clase está bien.",
    );
  } else if (localhostOnly) {
    warnings.push(
      "CORS_ORIGIN solo permite localhost. Tu frontend en Vercel será bloqueado: " +
        "agrega la URL del sitio, separada por coma.",
    );
  } else if (
    corsOrigins.length === 0 ||
    !corsOrigins.some((origin) => PRODUCTION_FRONTEND_HINTS.some((hint) => origin.includes(hint)))
  ) {
    warnings.push(
      "Ningún origen de CORS parece un sitio desplegado (vercel.app, netlify.app…). " +
        `Revisa CORS_ORIGIN: ${corsOrigins.join(", ") || "(vacío)"}`,
    );
  }

  if (corsOrigins.length > 1) {
    warnings.push("Si Vercel te dio una URL con guiones (foodmood-ia-abc123.vercel.app), agrégala tal cual.");
  }

  return warnings;
}