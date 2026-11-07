import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatTopicOf } from "../src/ai/chatTopics.ts";

describe("chat topic detection", () => {
  it("recognises food questions", () => {
    assert.equal(chatTopicOf("¿Qué puedo cocinar con arroz y pollo?"), "food");
    assert.equal(chatTopicOf("¿Qué puedo cenar ligero?"), "food");
    assert.equal(chatTopicOf("¿Qué puedo comer si tengo diabetes?"), "food");
  });

  it("recognises questions about the app", () => {
    assert.equal(chatTopicOf("¿Cómo guardo una receta en favoritos?"), "app");
    assert.equal(chatTopicOf("¿Cómo cambio mi contraseña?"), "app");
    assert.equal(chatTopicOf("¿Para qué sirve la despensa?"), "app");
  });

  it("recognises a plain greeting", () => {
    assert.equal(chatTopicOf("hola"), "greeting");
    assert.equal(chatTopicOf("buenas tardes"), "greeting");
  });

  it("rejects sums and arithmetic", () => {
    assert.equal(chatTopicOf("ayúdame con una suma"), "off-topic");
    assert.equal(chatTopicOf("¿cuánto es 2+2?"), "off-topic");
    assert.equal(chatTopicOf("resuelve esta ecuación"), "off-topic");
  });

  it("rejects programming and other tasks", () => {
    assert.equal(chatTopicOf("escríbeme código en Python"), "off-topic");
    assert.equal(chatTopicOf("hazme la tarea de historia"), "off-topic");
    assert.equal(chatTopicOf("cuéntame un chiste"), "off-topic");
  });

  it("rejects weather, sports and politics", () => {
    assert.equal(chatTopicOf("¿va a llover mañana?"), "off-topic");
    assert.equal(chatTopicOf("¿quién ganó el partido de fútbol?"), "off-topic");
    assert.equal(chatTopicOf("¿quién ganó las elecciones?"), "off-topic");
  });

  it("does not mistake recipe quantities for a sum", () => {
    assert.equal(chatTopicOf("¿Se cocina 10-15 minutos?"), "food");
    assert.equal(chatTopicOf("Necesito 200 g de harina"), "food");
  });

  it("keeps a greeting followed by a food question in scope", () => {
    assert.equal(chatTopicOf("hola, ¿qué receta me recomiendas?"), "food");
  });

  it("returns unknown when there is no useful signal", () => {
    assert.equal(chatTopicOf("xyzzy"), "unknown");
    assert.equal(chatTopicOf("   "), "unknown");
  });
});
