import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TxYearCounts } from "../../../lib/marts";
import {
  EMPTY_SELECTION, channelOf, channelTotal, emptyState, rowFlag, selectionFromParams, selectionSearch, statusLine, yearOptions,
} from "./tx-filters";

// The records table's selection (critique of 2 November 2026, owner's pick of the mockups), on Spitalul Orășenesc
// Agnita's real counts: 4.530 direct acquisitions over 2018–2026, 6 contracts, all in 2021.
const AGNITA: TxYearCounts = {
  da: { "2018": 783, "2019": 513, "2020": 524, "2021": 497, "2022": 437, "2023": 430, "2024": 524, "2025": 504, "2026": 318 },
  contracts: { "2021": 6 },
};

describe("the records table's selection", () => {
  it("filters rows only by the signals marked on them, never by a yearly or entity-wide pattern", () => {
    expect(["da_split", "da_round", "da_above_ceiling"].every(rowFlag)).toBe(true);
    expect(["da_year_end", "da_concentration", "da_dependence", "award_single_bid", "nope"].some(rowFlag)).toBe(false);
  });

  it("shows the channel a signal or the excluded records impose", () => {
    expect(channelOf({ ...EMPTY_SELECTION, src: "contracts" })).toBe("contracts");
    expect(channelOf({ ...EMPTY_SELECTION, flag: "da_split" })).toBe("da");
    expect(channelOf({ ...EMPTY_SELECTION, src: "contracts", excluded: true })).toBe("da");
  });

  it("keeps the selection in the address, beside the page's own parameters, and reads it back", () => {
    const sel = { src: "all" as const, years: ["2024"], flag: "da_split", excluded: false };
    const search = selectionSearch("?rol=autoritate&an=2019", sel);
    expect(search).toBe("?rol=autoritate&an=2024&sem=da_split");
    const back = new URLSearchParams(search);
    expect(selectionFromParams((k) => back.get(k))).toEqual(sel);
    expect(selectionSearch("?canal=directe&an=2021", { ...EMPTY_SELECTION, src: "contracts", years: ["2021"] })).toBe("?canal=contracte&an=2021");
    expect(selectionSearch("?canal=directe&an=2021&sem=da_split", EMPTY_SELECTION)).toBe("");
    // A yearly pattern or a malformed year from an old link is left out.
    expect(selectionFromParams((k) => ({ sem: "da_year_end", an: "2021,20x1,2021", canal: "x" } as Record<string, string>)[k])).toEqual({ ...EMPTY_SELECTION, years: ["2021"] });
  });

  it("counts each year's records in the shown channel and greys the empty ones", () => {
    const contracts = yearOptions(AGNITA, "contracts", []);
    expect(contracts.map((o) => o.year)).toEqual(["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"]);
    expect(contracts.filter((o) => !o.disabled)).toEqual([{ year: "2021", n: 6, disabled: false }]);
    // A year already picked stays reachable, so it can be unticked.
    expect(yearOptions(AGNITA, "contracts", ["2026"])[0]).toEqual({ year: "2026", n: 0, disabled: false });
    expect(yearOptions(AGNITA, "all", []).find((o) => o.year === "2021")).toEqual({ year: "2021", n: 503, disabled: false });
    expect([channelTotal(AGNITA, "all"), channelTotal(AGNITA, "da"), channelTotal({ ...AGNITA, contracts: { "2021": 6, "": 2 } }, "contracts")]).toEqual([4536, 4530, 8]);
  });

  it("says why a table is empty and offers its ways out", () => {
    expect(emptyState({ ...EMPTY_SELECTION, src: "contracts", years: ["2026"] }, AGNITA)).toEqual({
      text: "Niciun contract în 2026.",
      exits: [{ kind: "years", label: "Toți anii · 6 contracte" }, { kind: "src", label: "Toate sursele · 318 în 2026" }],
    });
    expect(emptyState({ ...EMPTY_SELECTION, flag: "da_split", years: ["2021", "2019"] }, { da: { "2024": 14, "2025": 12, "2023": 3 }, contracts: {} })).toEqual({
      text: "Nicio achiziție directă cu semnalul „Achiziții repetate, peste plafon cumulat” în 2019 și 2021.",
      exits: [{ kind: "years", label: "Toți anii · 29 de achiziții directe" }, { kind: "flag", label: "Fără semnal" }],
    });
    expect(emptyState({ ...EMPTY_SELECTION, excluded: true }, null)).toEqual({ text: "Nicio achiziție directă exclusă din total.", exits: [{ kind: "excluded", label: "Înapoi la total" }] });
  });

  it("names the channel in the status line when it is not both", () => {
    expect(statusLine(4536, 1, 454, "all")).toBe("4.536 înregistrări · pagina 1 din 454");
    expect(statusLine(14, 1, 2, "da")).toBe("14 înregistrări · achiziții directe · pagina 1 din 2");
    expect(statusLine(0, 1, 1, "contracts")).toBe("0 înregistrări · contracte");
  });
});

describe("the records table", () => {
  const table = readFileSync(new URL("./TxTable.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./entity.css", import.meta.url), "utf8");
  it("keeps the old rows dimmed in place while a page loads, the pager focusable, and says where the reader is", () => {
    expect(table).toContain('const stale = loading && rows.length > 0;');
    expect(table).toContain("<tbody inert={stale || undefined}>");
    expect(table).toMatch(/aria-disabled=\{loading \|\| page <= 1\}/);
    expect(table).not.toMatch(/\sdisabled=\{loading/);
    expect(table).toContain('<span className="ask-pager-pos">pagina {formatInt(page)} din {formatInt(pages)}</span>');
  });

  it("puts a single bidder among a row's leads, wraps long signals and turns rows into cards below 1000 px", () => {
    expect(table).toContain('<span className="flag-badge sm neutral" title="O singură ofertă raportată în sursă">1 ofertant</span>');
    expect(table).not.toContain("c-bid");
    expect(css).toContain(".ent-tx td.c-flags .flag-badge{white-space:normal");
    expect(css).toContain(".ent-tx th.col-value{width:140px}");
    expect(css).toMatch(/@media \(max-width:1000px\)\{\n {2}\.ent-tx,\.ent-tx tbody/);
  });
});
