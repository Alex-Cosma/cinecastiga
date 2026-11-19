import { describe, expect, it } from "vitest";
import { filterParams, readFilters } from "../table-filters/codec";
import { SCATTER_LIST_PAGE_SIZE, scatterListColumns } from "./scatter-list-columns";

describe("the columns of the risk map's list", () => {
  it("names the first column by the role and offers the role's own patterns", () => {
    const authority = scatterListColumns("authority"), supplier = scatterListColumns("supplier");
    expect(authority.map((c) => c.key)).toEqual(["nume", "judet", "tipare", "valoare", "risc", "achizitii"]);
    expect([authority[0]!.label, supplier[0]!.label]).toEqual(["Instituție", "Firmă"]);
    expect(Object.keys(authority[2]!.labels!)).toEqual(["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"]);
    // A firm's patterns are its own (no December, no main supplier).
    expect(Object.keys(supplier[2]!.labels!)).toContain("da_split");
    expect(Object.keys(supplier[2]!.labels!)).not.toContain("da_year_end");
    expect(authority[2]!.labels!["da_split"]).toBe("Adunate, trec de plafon");
    expect(SCATTER_LIST_PAGE_SIZE).toBe(10);
  });

  it("reads and writes its filters in a request's address, a county with diacritics among them", () => {
    const columns = scatterListColumns("authority");
    const state = {
      judet: { kind: "pick" as const, values: ["Caraș-Severin", "București"] }, tipare: { kind: "options" as const, values: ["da_round"] },
      risc: { kind: "range" as const, min: 40, max: null }, nume: { kind: "pick" as const, values: ["2143189"] },
    };
    const params = filterParams(columns, state);
    expect(params.get("risc")).toBe("40..");
    const back = readFilters(columns, (key) => params.get(key));
    expect(back["judet"]).toEqual({ kind: "pick", values: ["București", "Caraș-Severin"] });
    expect(back["tipare"]).toEqual(state.tipare);
    expect(back["risc"]).toEqual(state.risc);
    expect(back["nume"]).toEqual(state.nume);
    // A value that is no id, no pattern's code or no county's name is dropped.
    expect(readFilters(columns, (key) => ({ nume: "abc", tipare: "DROP TABLE", judet: "x;y" })[key] ?? null)).toEqual({});
  });
});
