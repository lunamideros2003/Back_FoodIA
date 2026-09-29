import { createApp } from "../src/app.ts";
import { closeDb } from "../src/db/connection.ts";

const app = createApp();

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", () => resolve()));

const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

const results: { label: string; ok: boolean; detail: string }[] = [];

async function call(label: string, path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await response.json();
    results.push({
      label,
      ok: response.ok,
      detail: `${response.status} · ${JSON.stringify(body).slice(0, 110)}`,
    });
    return body as Record<string, unknown>;
  } catch (error) {
    results.push({ label, ok: false, detail: `EXCEPCIÓN: ${(error as Error).message}` });
    return {};
  }
}

await call("GET /api/health", "/api/health");
const moods = await call("GET /api/moods", "/api/moods");
console.log("  estados de ánimo:", (moods.items as unknown[]).length);
await call("GET /api/categories", "/api/categories");
await call("GET /api/dishes", "/api/dishes?limit=3");
await call("GET /api/dishes/:slug", "/api/dishes/creamy-oat-porridge");
await call("GET /api/dishes/:id/similar", "/api/dishes/1/similar");
await call("GET /api/users", "/api/users");
await call("GET /api/ai/stats", "/api/ai/stats");
await call("GET /api/moods/:key/summary", "/api/moods/stressed/summary");
await call("GET /api/health-conditions", "/api/health-conditions");
await call("GET /api/users/1/health-report", "/api/users/1/health-report");

const recommendations = await call("POST /api/recommendations (tired)", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({ moodKey: "tired", limit: 4 }),
});
const items = (recommendations.items ?? []) as { dish: { nameEs: string }; explanation: string }[];
console.log("\n  Mood: Cansado");
console.log("  Narrativa:", recommendations.narrative);
for (const item of items) {
  console.log(`   · ${item.dish.nameEs.padEnd(32)} ${item.explanation}`);
}

const busy = await call("POST /api/recommendations (in_a_hurry + nota)", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({
    moodKey: "in_a_hurry",
    limit: 3,
    userId: 1,
    freeText: "algo con pollo y que sea barato",
  }),
});
console.log("\n  Mood: Sin tiempo (usuario 1, nota libre)");
console.log("  Narrativa:", busy.narrative);
for (const item of (busy.items ?? []) as { dish: { nameEs: string; prepMinutes: number } }[]) {
  console.log(`   · ${item.dish.nameEs.padEnd(32)} ${item.dish.prepMinutes} min`);
}

const interaction = await call("POST /api/interactions", "/api/interactions", {
  method: "POST",
  body: JSON.stringify({ userId: 1, dishId: 5, moodKey: "happy", action: "like", rating: 5 }),
});
console.log("\n  Interacción registrada:", JSON.stringify(interaction).slice(0, 120));

const after = await call("POST /api/recommendations (tras like)", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({ moodKey: "happy", userId: 1, limit: 3 }),
});
console.log("  Narrativa tras aprender:", after.narrative);

await call("GET /api/users/1/taste", "/api/users/1/taste");
await call("GET /api/users/1/interactions", "/api/users/1/interactions?limit=5");
await call("GET /api/users/1/sessions", "/api/users/1/sessions");

/* ------------------------------------------------------------------ *
 * The sad -> sweet -> balance conversation
 * ------------------------------------------------------------------ */

const sad = await call("POST /api/recommendations (sad)", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({ moodKey: "sad", userId: 1, limit: 3 }),
});
console.log("\n  Mood: Triste");
console.log("  Narrativa:", sad.narrative);
console.log("  Pide info de salud:", sad.needsHealthInfo);
for (const item of (sad.items ?? []) as { dish: { nameEs: string; nutrition: { sugarGrams: number } } }[]) {
  console.log(`   · ${item.dish.nameEs} (${item.dish.nutrition.sugarGrams} g de azúcar)`);
}

const chosen = ((sad.items ?? []) as { dish: { id: number } }[])[0]?.dish.id ?? null;

const balance = await call("POST /api/balance", "/api/balance", {
  method: "POST",
  body: JSON.stringify({
    userId: 1,
    moodKey: "sad",
    justChosenDishId: chosen,
    servingsEaten: 2,
  }),
});
console.log("\n  Balance:", balance.headline);
console.log("  Severidad:", balance.severity);
console.log("  Mensaje:", balance.message);
for (const item of (balance.suggestions ?? []) as { dish: { nameEs: string; calories: number } }[]) {
  console.log(`   · ${item.dish.nameEs} (${item.dish.calories} kcal)`);
}
const comfort = (balance.comfortOption ?? null) as { dish: { nameEs: string } } | null;
console.log("  Opción de consuelo:", comfort ? comfort.dish.nameEs : "ninguna");

await call("PUT /api/users/1/health", "/api/users/1/health", {
  method: "PUT",
  body: JSON.stringify({
    diabetes: true,
    hypertension: false,
    celiac: false,
    lactoseIntolerance: false,
    highCholesterol: false,
    answered: true,
  }),
});

await call("POST /api/recommendations (con diabetes)", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({ moodKey: "sad", userId: 1, freeText: "algo dulce", limit: 3 }),
});

await call("POST /api/users/:id/consumed", "/api/users/1/consumed", {
  method: "POST",
  body: JSON.stringify({ dishId: 1, moodKey: "sad" }),
});

const signupEmail = `smoke-${Date.now()}@foodmood.app`;
await call("POST /api/users (signup)", "/api/users", {
  method: "POST",
  body: JSON.stringify({ email: signupEmail, displayName: "Prueba", preferences: { diet: "vegan", maxPrepMinutes: 25 } }),
});
await call("PATCH /api/users/3/preferences", "/api/users/3/preferences", {
  method: "PATCH",
  body: JSON.stringify({ maxSpiceLevel: 0.3 }),
});
await call("VALIDACIÓN mood inválido", "/api/recommendations", {
  method: "POST",
  body: JSON.stringify({ moodKey: "aburrido" }),
});

console.log("\n──────────── RESULTADOS ────────────");
let failures = 0;
for (const result of results) {
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? "OK  " : "FALLA"} ${result.label.padEnd(34)} ${result.detail}`);
}
console.log(`\n${results.length - failures}/${results.length} endpoints OK\n`);

server.close();
closeDb();
process.exit(failures > 0 ? 1 : 0);
