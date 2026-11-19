import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcWords, caveatKind, shownWords, splitCaveats } from "./caveat-kinds";
import { CONTRACT_CAP_CAVEAT, DA_PLAFOND_CAVEAT, PERIOD_UNKNOWN_CAVEAT, TREND_2018_NOTE, countyCaveat, partialYearsCaveat, seatNote, uatScopeCaveat } from "./compile";
import { POPULATION_CARD_NOTE, perCapitaCaveat } from "./per-capita";
import { kindLeftOutNote } from "./purchase";
import type { AskSpec } from "./spec";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const compile = source("./compile.ts"), describeSource = source("./filters/describe.ts");

/** The notes compile.ts writes inline: each opening is still in the source, so a reworded note fails here. */
const INLINE: readonly [opening: string, kind: ReturnType<typeof caveatKind>, from?: string][] = [
  ["Sursă: DOAR contractele din proceduri.", "general"],
  ["Sursă: DOAR achiziții directe.", "general"],
  ["Sursă: achiziții directe + contracte din proceduri, fără dubluri.", "general"],
  ["Sursă: profiluri istorice de achiziții directe acceptate", "general"],
  ["Doar achizițiile directe acceptate («Ofertă acceptată»)", "general"],
  ["Riscul (0–100) este un semnal statistic", "general"],
  ["„O singură ofertă”: numărul de oferte e cunoscut doar", "general"],
  ["Filtrul pe angajați folosește ultimul bilanț", "general"],
  ["Filtrul «conduse azi de» folosește reprezentanții legali", "general"],
  ["Mărimea e valoarea întregului contract sau a achiziției directe", "general", "describe"],
  ["Riscul și semnalele sunt calculate pe TOATĂ activitatea entității", "shown"],
  ["Am restrâns perioada la acoperirea reală a datelor:", "shown"],
  ["Am interpretat „", "shown"],
  ["Am ales „", "shown"],
  ["Pentru a doua entitate am ales „", "shown"],
  ["Din „", "calc"],
  ["Despre „", "calc"],
  ["Ambii ani se compară pe aceleași luni:", "calc"],
  ["Fiecare an e numărat pe aceleași luni:", "calc"],
  ["Păstrăm ", "calc", "describe"],
  ["Selecție precisă aplicată:", "calc", "describe"],
];

describe("where an answer's notes are read", () => {
  it("sorts the notes written inline, and each is still worded so", () => {
    for (const [opening, kind, from] of INLINE) {
      expect(from === "describe" ? describeSource : compile, opening).toContain(opening);
      expect(caveatKind(`${opening} restul notei.`), opening).toBe(kind);
    }
  });

  it("keeps the site's rules and the fixed definitions for the guide", () => {
    const spec = (filters: AskSpec["filters"]) => ({ block: "table", measure: "value", filters }) as AskSpec;
    for (const text of [
      CONTRACT_CAP_CAVEAT, DA_PLAFOND_CAVEAT, POPULATION_CARD_NOTE, seatNote(true), seatNote(false),
      countyCaveat(spec({ county: "Cluj" }), "authority"), countyCaveat(spec({ county: "Cluj" }), "supplier"),
      perCapitaCaveat({ local: 3000, sector: 6, county: 41 }),
    ]) expect(caveatKind(text), text).toBe("general");
  });

  it("puts the reading of this question in „Cum am calculat”", () => {
    for (const text of [uatScopeCaveat("Municipiul Buzău (Buzău)", 2), kindLeftOutNote("lucrari", "medicamente"), "O notă pe care fișierul nu o cunoaște."])
      expect(caveatKind(text), text).toBe("calc");
  });

  it("shows a partly covered year under the answer, by its first sentence", () => {
    const provisional = partialYearsCaveat([{ year: 2026, note: "date până la 25.09.2026", provisional: true }], "series")!;
    const plain = partialYearsCaveat([{ year: 2016, note: "x" }, { year: 2017, note: "x" }], "selection")!;
    const compared = partialYearsCaveat([{ year: 2026, note: "ian.–oct." }], "comparison")!;
    for (const text of [provisional, plain, compared, PERIOD_UNKNOWN_CAVEAT, TREND_2018_NOTE.all!, TREND_2018_NOTE.contracts!]) expect(caveatKind(text), text).toBe("shown");
    expect(shownWords(provisional)).toBe("An cu date parțiale sau provizorii: 2026 (date până la 25.09.2026).");
    expect(shownWords(plain)).toBe("Perioada aleasă include ani acoperiți parțial de date: 2016, 2017 (x).");
    expect(shownWords(compared)).toBe("An acoperit parțial de date: 2026 (ian.–oct.).");
    expect(shownWords(PERIOD_UNKNOWN_CAVEAT)).toBe(PERIOD_UNKNOWN_CAVEAT);
    expect(shownWords("Am ales „Firma A”. Alte potriviri: Firma B.")).toBe("Am ales „Firma A”. Alte potriviri: Firma B.");
  });

  it("splits an answer's notes for the page: the rules out, a cut note whole in the details", () => {
    const partial = partialYearsCaveat([{ year: 2026, note: "ian.–oct.", provisional: true }], "series")!;
    const scope = uatScopeCaveat("Municipiul Buzău (Buzău)", 1);
    expect(splitCaveats(["Sursă: DOAR achiziții directe.", DA_PLAFOND_CAVEAT, scope, "Am ales „Firma A”. Alte potriviri: Firma B.", partial])).toEqual({
      shown: ["Am ales „Firma A”. Alte potriviri: Firma B.", "An cu date parțiale sau provizorii: 2026 (ian.–oct.)."],
      calc: ["Localitatea „Municipiul Buzău (Buzău)”: includ doar administrația locală a UAT-ului (primăria / consiliul local), nu și școlile, spitalele sau alte instituții din localitate.", partial],
    });
    // București: the sectors' sentence stays, the matching rule goes.
    expect(calcWords(uatScopeCaveat("Municipiul București", 1, 179132))).toMatch(/Primăriile celor șase sectoare sunt autorități separate și nu sunt incluse\.$/);
    expect(calcWords("Din „x” nu sunt numărate: y.")).toBe("Din „x” nu sunt numărate: y.");
    expect(splitCaveats(["Sursă: achiziții directe + contracte din proceduri, fără dubluri. TED nu se adună.", CONTRACT_CAP_CAVEAT])).toEqual({ shown: [], calc: [] });
  });
});
