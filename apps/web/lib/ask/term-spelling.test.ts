import { afterEach, describe, expect, it } from "vitest";
import { forgetTermSpelling, learnTermSpelling, spellTerm, termSpelling } from "./term-spelling";

afterEach(forgetTermSpelling);

describe("the written form of a subject stored without diacritics", () => {
  it("picks the words of a term that have one", () => {
    expect(termSpelling("lucrari drumuri + poduri", new Map([["lucrari", "lucrări"], ["scoli", "școli"]]))).toEqual({ lucrari: "lucrări" });
    expect(termSpelling("poduri", new Map([["lucrari", "lucrări"]]))).toBeNull();
  });
  it("writes a term with the forms the page learnt, never touching a word typed with diacritics", () => {
    expect(spellTerm("lucrari drumuri")).toBe("lucrari drumuri");
    learnTermSpelling({ lucrari: "lucrări", bogus: "altceva" });
    expect(spellTerm("lucrari drumuri")).toBe("lucrări drumuri");
    expect(spellTerm("Lucrari")).toBe("Lucrari");
    expect(spellTerm("bogus")).toBe("bogus");
  });
});
