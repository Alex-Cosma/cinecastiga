import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rowFlag, txColumns } from "../../../lib/entity-tx-columns";
import { chipsOf } from "../../../lib/table-filters/describe";
import { emptyState, recordsWord, statusLine } from "./tx-filters";

describe("the records table's words", () => {
  it("filters rows only by the signals marked on them, never by a yearly or entity-wide pattern", () => {
    expect(["da_split", "da_round", "da_above_ceiling"].every(rowFlag)).toBe(true);
    expect(["da_year_end", "da_concentration", "da_dependence", "award_single_bid", "nope"].some(rowFlag)).toBe(false);
    expect(txColumns(true).find((c) => c.key === "semnale")?.labels?.["da_year_end"]).toBeUndefined();
  });

  it("names the records by the one type chosen, else counts records", () => {
    // The page is the pager's words, not the status line's (owner, 17 November 2026).
    expect(statusLine(4536, {})).toBe("4.536 de înregistrări");
    expect(statusLine(14, { tip: { kind: "options", values: ["directe"] } })).toBe("14 achiziții directe");
    expect(statusLine(0, { tip: { kind: "options", values: ["contracte"] } })).toBe("0 contracte");
    expect(recordsWord(1, { tip: { kind: "options", values: ["excluse"] } })).toBe("o achiziție directă exclusă din total");
    expect(recordsWord(3, { tip: { kind: "options", values: ["directe", "contracte"] } })).toBe("3 înregistrări");
  });

  it("counts an institution's rows when consortium contracts join records, and keeps the records beside them", () => {
    expect(statusLine(6810, {}, 6790)).toBe("6.790 de achiziții (6.810 înregistrări)");
    expect(statusLine(15, { tip: { kind: "options", values: ["contracte"] } }, 12)).toBe("12 contracte (15 înregistrări)");
    expect(statusLine(4536, {}, 4536)).toBe("4.536 de înregistrări");
  });

  it("says an empty table is empty because of its filters, and offers to take each out", () => {
    const columns = txColumns(true);
    const chips = chipsOf(columns, { data: { kind: "dates", years: ["2026"], from: null, to: null }, tip: { kind: "options", values: ["contracte"] } });
    const empty = emptyState(chips);
    expect(empty.text).toBe("Nicio înregistrare cu filtrele alese.");
    expect(empty.exits.map((c) => c.value)).toEqual(["anul 2026", "contracte"]);
    expect(emptyState([])).toEqual({ text: "Nicio înregistrare.", exits: [] });
  });
});

describe("the records table", () => {
  const table = readFileSync(new URL("./TxTable.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./entity.css", import.meta.url), "utf8");
  const pager = readFileSync(new URL("./Pager.tsx", import.meta.url), "utf8");
  it("filters from its headers, with the applied filters alone above it", () => {
    for (const key of ["data", "tip", "partener", "cpv", "valoare", "semnale"]) expect(table).toContain(`funnel("${key}"`);
    expect(table).toContain("<FilterBand ");
    expect(table).not.toContain("ask-streamtoggle");
    expect(table).not.toContain("Arată excluse din total");
  });

  it("keeps the old rows dimmed in place while a page loads, the pager focusable, and says where the reader is", () => {
    expect(table).toContain('const stale = loading && rows.length > 0;');
    expect(table).toContain("<tbody inert={stale || undefined}>");
    // The entity pages' one pager (UX audit Z5-29): busy while a page loads, aria-disabled so the focus stays.
    expect(table).toContain('<Pager page={page} pages={pages} busy={loading} onPage={goPage} label="Paginile înregistrărilor" />');
    expect(pager).toMatch(/aria-disabled=\{busy \|\| page <= 1\}/);
    expect(pager).not.toMatch(/\sdisabled=\{/);
    expect(pager).toContain('<span className="ent-pager-pos">pagina {formatInt(page)} din {formatInt(Math.max(1, pages))}</span>');
  });

  it("puts a single bidder among a row's leads, wraps long signals and turns rows into cards below 1000 px", () => {
    expect(table).toContain('<span className="flag-badge sm neutral" title="O singură ofertă raportată în sursă">1 ofertant</span>');
    expect(table).not.toContain("c-bid");
    expect(css).toContain(".ent-tx td.c-flags .flag-badge{white-space:normal");
    expect(css).toContain(".ent-tx th.col-value{width:140px}");
    expect(css).toMatch(/@media \(max-width:1000px\)\{\n {2}\.ent-tx,\.ent-tx tbody/);
  });
});
