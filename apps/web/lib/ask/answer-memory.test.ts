import { afterEach, describe, expect, it } from "vitest";
import { forgetAnswers, keepAnswer, KEPT_ANSWERS, KEPT_MINUTES, recallAnswer } from "./answer-memory";

describe("the answers a tab keeps for «Înapoi»", () => {
  afterEach(forgetAnswers);

  it("gives an answer back under any of its keys while it is fresh", () => {
    keepAnswer(["asked", "ran"], { ok: true }, 0);
    expect(recallAnswer("asked", 1000)).toEqual({ ok: true });
    expect(recallAnswer("ran", KEPT_MINUTES * 60_000)).toEqual({ ok: true });
    expect(recallAnswer("other", 1000)).toBeUndefined();
  });

  it("forgets an answer older than the time it is kept", () => {
    keepAnswer(["a"], 1, 0);
    expect(recallAnswer("a", KEPT_MINUTES * 60_000 + 1)).toBeUndefined();
    expect(recallAnswer("a", 0)).toBeUndefined();
  });

  it("keeps the newest keys only, a key kept again counting as new", () => {
    for (let i = 0; i < KEPT_ANSWERS; i++) keepAnswer([`k${i}`], i, i);
    keepAnswer(["k0"], "again", 100);
    keepAnswer(["new"], "new", 101);
    expect(recallAnswer("k1", 102)).toBeUndefined();
    expect(recallAnswer("k0", 102)).toBe("again");
    expect(recallAnswer("new", 102)).toBe("new");
    expect(recallAnswer(`k${KEPT_ANSWERS - 1}`, 102)).toBe(KEPT_ANSWERS - 1);
  });
});
