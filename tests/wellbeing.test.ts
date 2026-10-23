import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GENERAL_SAFETY_NOTE,
  safetyNotesForDish,
  safetyNotesForStep,
} from "../src/ai/safety.ts";
import { buildEmpathyNotice, buildSupportSuggestion, mentionsDistress } from "../src/ai/empathy.ts";
import { findDishBySlug } from "../src/services/repositories.ts";

function bySlug(slug: string) {
  const dish = findDishBySlug(slug);
  if (!dish) throw new Error(`Falta el plato ${slug}`);
  return dish;
}

function ids(notes: { id: string }[]): string[] {
  return notes.map((note) => note.id);
}

describe("safety notes", () => {
  it("warns about cooking a recipe with eggs through", () => {
    const notes = safetyNotesForDish(bySlug("huevos-rancheros"));
    assert.ok(ids(notes).includes("eggs"));
    assert.ok(ids(notes).includes("cook-through"));
  });

  it("warns about keeping dairy cold", () => {
    const notes = safetyNotesForDish(bySlug("creamy-oat-porridge"));
    assert.ok(ids(notes).includes("dairy-storage"));
  });

  it("warns about the oven when a step uses it", () => {
    const notes = safetyNotesForDish(bySlug("homemade-pizza-margherita"));
    assert.ok(ids(notes).includes("oven"));
  });

  it("warns about storing cooked rice", () => {
    const notes = safetyNotesForDish(bySlug("mushroom-risotto"));
    assert.ok(ids(notes).includes("rice-storage"));
  });

  it("does not warn about proteins in a recipe that has none", () => {
    const notes = safetyNotesForDish(bySlug("homemade-lemonade"));
    assert.ok(!ids(notes).includes("cook-through"));
    assert.ok(!ids(notes).includes("eggs"));
  });

  it("never claims the food changes a mood", () => {
    for (const note of safetyNotesForDish(bySlug("huevos-rancheros"))) {
      assert.ok(!/ánimo|felicidad|cura/i.test(note.text));
    }
  });

  it("returns the step note for a step that works with heat", () => {
    const dish = bySlug("huevos-rancheros");
    const index = dish.steps.findIndex((step) => /cocina|hierve|hervir/i.test(step));
    assert.ok(index >= 0, "La receta debe tener un paso con fuego");

    const notes = safetyNotesForStep(dish, index);
    assert.ok(ids(notes).includes("heat-step"));
    for (const note of notes) assert.equal(note.stepIndex, index);
  });

  it("falls back to the recipe warnings when the step has none of its own", () => {
    const dish = bySlug("huevos-rancheros");
    const serving = dish.steps.findIndex((step) => /sirve/i.test(step));
    assert.ok(serving >= 0, "La receta debe tener un paso de servir");

    const notes = safetyNotesForStep(dish, serving);
    assert.ok(ids(notes).includes("eggs"));
  });

  it("returns an empty list for a step that does not exist", () => {
    assert.deepEqual(safetyNotesForStep(bySlug("huevos-rancheros"), 99), []);
  });

  it("always carries a general note", () => {
    assert.ok(GENERAL_SAFETY_NOTE.text.length > 0);
  });
});

describe("empathy layer", () => {
  it("does not react to a plain request", () => {
    assert.equal(mentionsDistress("quiero algo rico para hoy"), false);
    assert.equal(buildSupportSuggestion("quiero algo rico para hoy"), null);
  });

  it("does not treat a single tired word as a crisis", () => {
    assert.equal(mentionsDistress("estoy cansado y con hambre"), false);
  });

  it("recognises a difficult moment", () => {
    assert.equal(mentionsDistress("me siento muy triste"), true);
    assert.ok(buildSupportSuggestion("me siento muy triste"));
  });

  it("offers human support and never promises a cure", () => {
    const notice = buildEmpathyNotice("Triste", "me siento muy triste");
    assert.equal(notice.offerSupport, true);
    assert.ok(notice.supportHint);
    assert.match(notice.text, /Gracias por contarlo/);
    assert.ok(!/curar|curará|medicina/i.test(notice.text));
  });

  it("keeps the ordinary message when there is no distress", () => {
    const notice = buildEmpathyNotice("Feliz", null);
    assert.equal(notice.offerSupport, false);
    assert.match(notice.text, /cómo te sientes hoy/);
  });
});
