import { describe, expect, it } from "vitest";
import type { IntentResult } from "../../lib/intent/types";
import { applySuggestion, matchedPart, pinnedChoice, suggestCue, suggestRows, suggestUrl } from "./ask-suggest";

describe("suggestCue (Z2-08)", () => {
  it("reads the firm being typed after „firma”", () => {
    const cue = suggestCue("Cu ce instituții lucrează firma Dacia");
    expect(cue).toMatchObject({ kind: "supplier", query: "dacia", fragment: "Dacia" });
    expect(suggestUrl(cue!)).toBe("/api/suggest?q=dacia");
  });
  it("searches an institution with the word that opens its name", () => {
    const text = "Ce cumpără spitalul județean Buz";
    const cue = suggestCue(text)!;
    expect(cue).toMatchObject({ kind: "authority", query: "spitalul judetean buz" });
    expect(applySuggestion(text, cue, "SPITALUL JUDETEAN DE URGENTA BUZAU")).toBe("Ce cumpără SPITALUL JUDETEAN DE URGENTA BUZAU");
  });
  it("keeps „primăria” and suggests localities after it, also after „primăria din”", () => {
    expect(suggestCue("cine câștigă la primăria Cisn")).toMatchObject({ kind: "townhall", query: "cisn" });
    expect(suggestCue("Ce cumpără primăria din Râmn")).toMatchObject({ kind: "townhall", query: "ramn" });
    const text = "cine câștigă la primăria Cisn", cue = suggestCue(text)!;
    expect(applySuggestion(text, cue, "Cisnădie")).toBe("cine câștigă la primăria Cisnădie");
  });
  it("suggests places after „în”/„din” and counties after „județul”", () => {
    expect(suggestCue("Cine face iluminatul în Buz")).toMatchObject({ kind: "place", query: "buz" });
    expect(suggestCue("spitalele din județul Clu")).toMatchObject({ kind: "county", query: "clu" });
  });
  it("stays quiet without a cue, before a name is typed, on years and after the question went on", () => {
    expect(suggestCue("medicamente spitale")).toBeNull();
    expect(suggestCue("Cu ce instituții lucrează firma ")).toBeNull();
    expect(suggestCue("Cu ce instituții lucrează firma D")).toBeNull();
    expect(suggestCue("medicamente în 2024")).toBeNull();
    expect(suggestCue("firma Dacia?")).toBeNull();
    expect(suggestCue("ce cumpără primăria Buzău care are")).toBeNull();
  });
});

describe("suggestRows", () => {
  it("names a firm's kind and county, with diacritics, and keeps it to pin", () => {
    const cue = suggestCue("firma Dacia")!;
    const rows = suggestRows(cue, { supplier: [{ name: "DACIA ASPHALT", county: "Bistrita-Nasaud" }], authority: [] }, (c) => c === "Bistrita-Nasaud" ? "Bistrița-Năsăud" : c);
    expect(rows).toEqual([{ insert: "DACIA ASPHALT", name: "DACIA ASPHALT", meta: "firmă · Bistrița-Năsăud", pin: { name: "DACIA ASPHALT", county: "Bistrita-Nasaud" } }]);
  });
  it("says a county as „județul X” after „în” and a locality named as its county as a locality", () => {
    const cue = suggestCue("medicamente în Iaș")!;
    const rows = suggestRows(cue, { places: [
      { id: "county:iasi", name: "Iași", detail: "Județ", kind: "county" },
      { id: "uat:95060", name: "Iași", detail: "Municipiu · Iași", kind: "locality" },
      { id: "uat:70414", name: "Filiași", detail: "Oraș · Dolj", kind: "locality" },
    ] }, (c) => c);
    expect(rows.map((r) => r.insert)).toEqual(["județul Iași", "municipiul Iași", "Filiași"]);
  });
  it("shows only localities after „primăria”", () => {
    const cue = suggestCue("primăria Buz")!;
    const rows = suggestRows(cue, { places: [{ id: "county:buzau", name: "Buzău", detail: "Județ", kind: "county" }, { id: "uat:44818", name: "Buzău", detail: "Municipiu · Buzău", kind: "locality" }] }, (c) => c);
    expect(rows.map((r) => [r.insert, r.meta])).toEqual([["Buzău", "Municipiu · Buzău"]]);
  });
});

describe("matchedPart", () => {
  it("finds the typed part regardless of case and diacritics", () => {
    expect(matchedPart("DACIA FABER S.R.L.", "Dacia")).toEqual([0, 5]);
    expect(matchedPart("Râmnicu Sărat", "ramnicu s")).toEqual([0, 9]);
    expect(matchedPart("ORAS CISNADIE", "cisnă")).toEqual([5, 10]);
  });
});

describe("pinnedChoice", () => {
  const alt = (label: string, id: number) => ({ kind: "entity" as const, label, sentence: `Cu cine lucrează ${label}?`, spec: { block: "network", filters: { supplierId: id } } });
  const result = { spec: null, alternatives: [alt("DACIA SA (Alba)", 1), alt("DACIA ASPHALT (Bistrita-Nasaud)", 2)] } as unknown as IntentResult;
  it("opens the picked firm among its namesakes", () => {
    expect(pinnedChoice(result, { name: "DACIA ASPHALT", county: "Bistrita-Nasaud" }, "firma DACIA ASPHALT")?.label).toBe("DACIA ASPHALT (Bistrita-Nasaud)");
  });
  it("does nothing once the name left the words, or when another county", () => {
    expect(pinnedChoice(result, { name: "DACIA ASPHALT", county: "Bistrita-Nasaud" }, "firma Dacia")).toBeNull();
    expect(pinnedChoice(result, { name: "DACIA SA", county: "Cluj" }, "firma DACIA SA")).toBeNull();
    expect(pinnedChoice(result, null, "firma DACIA SA")).toBeNull();
  });
});
