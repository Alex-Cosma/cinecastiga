import { describe, expect, it } from "vitest";
import { inactiveIncludedWords, inactiveLeftOutWords } from "./signal-list-words";

describe("the lines of /semnale's lists (UX audit Z6-01)", () => {
  it("says the inactive profiles left out in Întreabă's words, and those included", () => {
    expect(inactiveLeftOutWords(1409)).toBe("1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni, nu sunt în listă.");
    expect(inactiveIncludedWords(1409)).toBe("Sunt incluse și cele 1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni.");
    expect(inactiveIncludedWords(120)).toBe("Sunt incluse și cele 120 de profiluri inactive, fără înregistrări în ultimele 24 de luni.");
    expect(inactiveIncludedWords(1)).toBe("Este inclus și profilul inactiv, fără înregistrări în ultimele 24 de luni.");
  });
});
