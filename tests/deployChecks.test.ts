import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WARNINGS } from "../src/deployChecks.ts";

describe("deployment warnings", () => {
  it("stays quiet outside production", () => {
    assert.deepEqual(WARNINGS({ isProduction: false, corsOrigins: [] }), []);
  });

  it("warns when production only allows localhost", () => {
    const warnings = WARNINGS({
      isProduction: true,
      corsOrigins: ["http://localhost:5173"],
    });
    assert.ok(warnings.some((warning) => warning.includes("solo permite localhost")));
  });

  it("notes that a wildcard origin is open but acceptable for a class", () => {
    const warnings = WARNINGS({ isProduction: true, corsOrigins: ["*"] });
    assert.ok(warnings.some((warning) => warning.includes("«*»")));
  });

  it("warns when no origin looks like a deployed site", () => {
    const warnings = WARNINGS({
      isProduction: true,
      corsOrigins: ["https://example.com"],
    });
    assert.ok(warnings.some((warning) => warning.includes("Ningún origen de CORS")));
  });

  it("accepts a vercel origin without complaining about the domain", () => {
    const warnings = WARNINGS({
      isProduction: true,
      corsOrigins: ["https://foodmood-ia.vercel.app"],
    });
    assert.ok(!warnings.some((warning) => warning.includes("Ningún origen de CORS")));
  });

  it("reminds about the full vercel URL when there are several origins", () => {
    const warnings = WARNINGS({
      isProduction: true,
      corsOrigins: ["https://a.vercel.app", "https://foodmood-ia-abc123.vercel.app"],
    });
    assert.ok(warnings.some((warning) => warning.includes("con guiones")));
  });
});
