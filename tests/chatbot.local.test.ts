import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLocalChatAnswer } from "../src/ai/chatbotLocal.ts";
import { CHAT_SUGGESTIONS, OFF_TOPIC_ANSWER } from "../src/ai/chatCopy.ts";

describe("local chatbot answers", () => {
  it("refuses an off-topic question without pretending to answer", () => {
    const answer = buildLocalChatAnswer("off-topic");

    assert.equal(answer.inScope, false);
    assert.equal(answer.topic, "off-topic");
    assert.equal(answer.answer, OFF_TOPIC_ANSWER);
    assert.match(answer.answer, /No resuelvo sumas/);
    assert.match(answer.answer, /comida, dietas/);
  });

  it("welcomes greetings and repeats the scope", () => {
    const answer = buildLocalChatAnswer("greeting");

    assert.equal(answer.inScope, true);
    assert.match(answer.answer, /comida|dietas|app/);
  });

  it("redirects an unknown message back to the scope", () => {
    const answer = buildLocalChatAnswer("unknown");

    assert.equal(answer.inScope, true);
    assert.match(answer.answer, /comida, las dietas y esta app/);
  });

  it("offers follow-up suggestions", () => {
    assert.deepEqual(buildLocalChatAnswer("food").suggestions, CHAT_SUGGESTIONS);
    assert.ok(CHAT_SUGGESTIONS.length >= 3);
  });
});
