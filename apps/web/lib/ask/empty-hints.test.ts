import { describe, expect, it } from "vitest";
import { broaderOf, cpvStem, narrowSelection } from "./empty-hints";
import type { AskSpec } from "./spec";

/* Cisnădie feedback, 13 November 2026: „iluminat” at the town hall in 2026 found nothing, while the town hall had
   bought an electrical installation (45310000) and lamps (31500000), the categories holding two lighting classes. */
const searched = [
  { code: "31527200-8", name: "Iluminat exterior" },
  { code: "34993000-4", name: "Iluminat stradal" },
  { code: "45316000-5", name: "Lucrări de instalare de sisteme de iluminare şi de semnalizare" },
];
const names = new Map([["45310000-3", "Lucrări de instalaţii electrice"], ["31500000-1", "Aparatură de iluminat"], ["45233142-6", "Lucrări de reparare a drumurilor"], ["45000000-7", "Lucrări de construcţii"]]);

describe("an empty answer's broader categories", () => {
  it("reads a code's significant digits", () => {
    expect(cpvStem("45310000-3")).toBe("4531");
    expect(cpvStem("03200000-3")).toBe("032");
    expect(cpvStem("31527200-8")).toBe("315272");
  });

  it("keeps the codes that hold a searched one, from the group level, the largest first", () => {
    const rows = [
      { code: "45310000-3", n: 1, v: 300000 },
      { code: "31500000-1", n: 1, v: 19250 },
      // a sibling, not a parent
      { code: "45233142-6", n: 1, v: 139200 },
      // a division holds everything built: too broad
      { code: "45000000-7", n: 2, v: 900000 },
    ];
    expect(broaderOf(rows, searched, names)).toEqual([
      { code: "45310000-3", name: "Lucrări de instalaţii electrice", n: 1, v: 300000, contains: "Lucrări de instalare de sisteme de iluminare şi de semnalizare" },
      { code: "31500000-1", name: "Aparatură de iluminat", n: 1, v: 19250, contains: "Iluminat exterior" },
    ]);
  });

  it("groups live only a narrow selection", () => {
    const spec = (filters: AskSpec["filters"]) => ({ block: "stat", measure: "value", filters }) as AskSpec;
    expect(narrowSelection(spec({ cpvTerm: "iluminat", uatSiruta: 143735 }))).toBe(true);
    expect(narrowSelection(spec({ cpvTerm: "iluminat", county: "Sibiu" }))).toBe(false);
  });
});
