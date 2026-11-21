import { describe, expect, it } from "vitest";
import { inactiveIncludedWords, inactiveLeftOutWords, underIncludedWords, underLeftOutWords } from "./signal-list-words";

describe("the lines of /semnale's lists (UX audit Z6-01)", () => {
  it("says the inactive profiles left out in Întreabă's words, and those included", () => {
    expect(inactiveLeftOutWords(1409)).toBe("1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni, nu sunt în listă.");
    expect(inactiveIncludedWords(1409)).toBe("Sunt incluse și cele 1.409 profiluri inactive, fără înregistrări în ultimele 24 de luni.");
    expect(inactiveIncludedWords(120)).toBe("Sunt incluse și cele 120 de profiluri inactive, fără înregistrări în ultimele 24 de luni.");
    expect(inactiveIncludedWords(1)).toBe("Este inclus și profilul inactiv, fără înregistrări în ultimele 24 de luni.");
  });
  it("says the groups under 1,2× the ceiling left out of the national list, and those included (Z6-04)", () => {
    expect(underLeftOutWords(5848)).toBe("5.848 de cazuri sub 1,2× plafonul nu intră în scor și nu sunt în listă.");
    expect(underLeftOutWords(12)).toBe("12 cazuri sub 1,2× plafonul nu intră în scor și nu sunt în listă.");
    expect(underLeftOutWords(1)).toBe("Un caz sub 1,2× plafonul nu intră în scor și nu e în listă.");
    expect(underIncludedWords(5848)).toBe("Sunt incluse și cele 5.848 de cazuri sub 1,2× plafonul, care nu intră în scor.");
  });
});

describe("the national list's column heads (Z6-17)", () => {
  it("names each column from the pattern and the role, as the rows fill them", async () => {
    const { signalListHeads } = await import("./signal-list-words");
    expect(signalListHeads("da_dependence", "supplier")).toEqual({ entity: "Firma", partner: "Clientul public principal", meter: "Ponderea lui", amount: "Valoare" });
    expect(signalListHeads("da_split", "authority")).toMatchObject({ entity: "Instituția", partner: "Firma", meter: "Față de plafon" });
    expect(signalListHeads("da_split", "supplier")).toMatchObject({ entity: "Firma", partner: "Instituția" });
    expect(signalListHeads("award_single_bid", "supplier")).toEqual({ entity: "Instituția", partner: "Câștigătorii", meter: "", amount: "Valoare" });
    expect(signalListHeads("fin_tiny_staff", "supplier")).toMatchObject({ partner: "", meter: "" });
  });
});
