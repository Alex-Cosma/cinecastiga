import { describe, expect, it } from "vitest";
import { clipCode, clipHref, clipTitle, clipValue, entityKindLabel, mergeSourceEvents, radiografieHref, savedName, type ClipLike } from "./evidence-clip";
import { citationText } from "./evidence-citation";
import { recordParties, sourceEventsFrom } from "./anchete";

const clip = (over: Partial<ClipLike>): ClipLike => ({ id: "c1", kind: "contract", refId: "108082710", spec: null, snapshot: null, note: null, ...over });

describe("a dossier's saved item (owner, 7 November 2026)", () => {
  it("opens a Radiografie selection on its sources page", () => {
    expect(radiografieHref(clip({ kind: "radiografie", refId: "2145315", spec: { type: "slicing", supplierId: "2280391" } })))
      .toBe("/entitati/2145315/radiografie/surse?tip=slicing&furnizor=2280391");
    expect(radiografieHref(clip({ kind: "radiografie", refId: "2145315", spec: { type: "pattern", patternId: "77", expectedFingerprint: "a".repeat(64) } })))
      .toBe(`/entitati/2145315/radiografie/surse?tip=pattern&tipar=77&fingerprint=${"a".repeat(64)}`);
    expect(clipHref(clip({ kind: "radiografie", refId: "2145315", spec: { type: "pattern", patternId: "77" } })))
      .toBe("/entitati/2145315/radiografie/surse?tip=pattern&tipar=77");
    expect(clipHref(clip({ kind: "da", refId: "123101594" }))).toBe("/achizitii/123101594");
  });
  it("keeps the exact value and says what it is", () => {
    expect(clipValue(clip({ snapshot: { contractValueFull: "789004.26", valueRon: "789004", currency: "RON" } }))).toEqual({ exact: "789004.26", label: "valoarea contractului", unit: "lei" });
    // A contract's original value in another currency keeps its currency, never "lei".
    expect(clipValue(clip({ snapshot: { contractValueFull: "1250000", valueRon: null, currency: "EUR" } }))).toEqual({ exact: "1250000", label: "valoarea contractului", unit: "EUR" });
    expect(clipValue(clip({ kind: "entity", refId: "1", capture: { id: "x", version: 1, status: "complete", createdAt: "", startedAt: null, completedAt: null, rowCount: 3, totalExact: "10.5", error: null, methodology: null, scope: { kind: "entity", refId: "1", spec: null, options: {} }, summary: null } })))
      .toEqual({ exact: "10.5", label: "totalul înregistrărilor păstrate", unit: "lei" });
    expect(clipValue(clip({ kind: "entity", snapshot: { valueRon: 259054132 } }))).toBeNull();
  });
  it("names an entity without its leading registry number", () => {
    expect(clipTitle(clip({ kind: "entity", snapshot: { name: "9813902 COSTALEX CONSTRUCT", title: "9813902 COSTALEX CONSTRUCT" } }))).toBe("COSTALEX CONSTRUCT");
  });
});

describe("names, not codes (UX audit Z8-01, Z8-35)", () => {
  it("names a question by its sentence, never by its pills or its kind", () => {
    const spec = { block: "timeseries", measure: "value", filters: { authorityId: 2144659, authorityName: "Orasul Cisnadie" } };
    expect(clipTitle(clip({ kind: "query", refId: null, spec, snapshot: { pills: ["evoluție pe ani", "Orasul Cisnadie"] } }))).toBe("Cum evoluează valoarea tuturor achizițiilor făcute de Orasul Cisnadie, an de an?");
    expect(clipTitle(clip({ kind: "query", refId: null, spec, snapshot: { verification: "queued" } }))).not.toBe("Întrebare salvată");
    // The title the answer showed when it was saved wins over the sentence rebuilt without its labels.
    expect(clipTitle(clip({ kind: "query", refId: null, spec, snapshot: {}, label: "Titlul răspunsului" }))).toBe("Titlul răspunsului");
  });
  it("names an acquisition and a notice by their object, the code apart", () => {
    const da = clip({ kind: "da", refId: "119998450", snapshot: { title: "DA38378700" }, label: "Lucrări de construcţii de linii electrice" });
    expect(clipTitle(da)).toBe("Lucrări de construcţii de linii electrice");
    expect(clipCode(da)).toBe("DA38378700");
    const notice = clip({ kind: "notice", refId: "100114992", snapshot: { title: "SCNA1031122", noticeNo: "SCNA1031122" }, label: "Lucrări de construcţii" });
    expect([clipTitle(notice), clipCode(notice)]).toEqual(["Lucrări de construcţii", "SCNA1031122"]);
    // Without a kept name (an old save), the code is still a name rather than an id.
    expect(clipTitle(clip({ kind: "da", refId: "1", snapshot: { title: "DA1" } }))).toBe("DA1");
  });
  it("uses the name saved with the item while its sources are not kept, the id only when nothing is known", () => {
    expect(clipTitle(clip({ kind: "entity", refId: "2144659", snapshot: { verification: "queued" }, label: "Orasul Cisnadie" }))).toBe("Orasul Cisnadie");
    expect(clipTitle(clip({ kind: "signal", refId: "1", snapshot: { title: "Adunate, trec de plafon" }, label: "Adunate, trec de plafon · TOPO CAD · 2021" }))).toBe("Adunate, trec de plafon · TOPO CAD · 2021");
    expect(clipTitle(clip({ kind: "contract", refId: "107371750", snapshot: { verification: "queued" } }))).toBe("Contract · 107371750");
  });
  it("reads the saved name and code from the item's own row", () => {
    expect(savedName({ verification: "queued", saved: { name: " Orasul Cisnadie ", code: null, kind: "Instituție" } })).toEqual({ label: "Orasul Cisnadie", code: null, kindLabel: "Instituție" });
    expect(savedName({ verification: "queued" })).toEqual({ label: null, code: null, kindLabel: null });
  });
  it("says an entity's kind as a reader does", () => {
    expect(entityKindLabel({ roles: { authority: {} } })).toBe("Instituție");
    expect(entityKindLabel({ roles: { supplier: {} } })).toBe("Firmă");
    expect(entityKindLabel({}, "Firmă")).toBe("Firmă");
  });
});

describe("the citation", () => {
  it("names the item, its exact value, the capture and the links, the total once for a selection", () => {
    const text = citationText({ title: "DA41271870", kind: "Achiziție directă", value: { exact: "80000", label: "valoarea achiziției", unit: "lei" }, rowCount: 1, totalExact: "80000",
      capturedAt: "2026-11-07 10:16:23.15+00", version: 1, fingerprint: "ab".repeat(32), publicUrl: "https://x/achizitii/1", sourceUrl: "https://e-licitatie.ro/1", sheetUrl: "https://x/anchete/i/dovezi/c" });
    expect(text.split("\n")).toEqual([
      "„DA41271870” (achiziție directă)",
      // The public links first, so a reader of the article can open something (Z8-41); the private sheet last.
      "Pagina: https://x/achizitii/1", "Sursa SEAP: https://e-licitatie.ro/1",
      "Valoarea achiziției: 80.000 lei (valoare înregistrată, nu plată).",
      "Păstrat: 1 înregistrare · 80.000 lei · 07.11.2026, 12:16 (ora României) · versiunea 1.",
      "Valori înregistrate în SEAP/SICAP, nu plăți. Prelucrare: cinecâștigă?.",
      `Amprentă SHA-256 (rows.csv din export): ${"ab".repeat(32)}`,
      "Fișa de probă (privată, doar pentru tine și colaboratori): https://x/anchete/i/dovezi/c"]);
    // A saved question's answer on the site shows today's data: the citation says so.
    expect(citationText({ title: "Cum evoluează…?", kind: "Întrebare salvată", rowCount: 2, totalExact: "1", capturedAt: null, version: 1, fingerprint: null, publicUrl: "https://x/intreaba?spec=a", publicIsAnswer: true, sheetUrl: "u" }).split("\n")[1])
      .toBe("Răspunsul pe site (datele de azi, nu versiunea păstrată): https://x/intreaba?spec=a");
    const selection = citationText({ title: "X", kind: "Entitate", value: { exact: "10", label: "totalul înregistrărilor păstrate", unit: "lei" }, rowCount: 20, totalExact: "10", capturedAt: null, version: 2, fingerprint: null, sheetUrl: "u" });
    expect(selection).not.toContain("Totalul");
    expect(selection).toContain("20 de înregistrări · 10 lei · moment necunoscut");
  });
});

describe("dates and parties read from the saved records", () => {
  const records = new Map([
    ["k1", [{ refId: "108082710", date: "2026-09-07", authorityId: "2139059", authority: "COMUNA FELNAC", supplierId: "1", supplier: "A", sourceUrl: "https://s/1" },
      { refId: "108082710", date: "2026-09-07", authorityId: "2139059", authority: "COMUNA FELNAC", supplierId: "2", supplier: "B", sourceUrl: "https://s/1" }]],
    ["k2", [{ refId: "123101594", date: "2026-09-25", daCode: "DA41271870", valueExact: "80000", sourceUrl: "https://s/2" }]],
    ["k3", [{ refId: "9", date: "2025-01-02", daCode: "SCN1", contractValueFull: "5.5" }, { refId: "9", date: "2025-01-02" }, { refId: "10", date: "2024-03-04" }]],
  ]);
  const clips = [
    { id: "k1", kind: "contract" as const, refId: "108082710", snapshot: { title: "Contract", date: "2026-09-07", contractValueFull: "789004.26" }, capture: null },
    { id: "k2", kind: "da" as const, refId: "123101594", snapshot: { title: "DA41271870", valueExact: "80000" }, capture: null },
    { id: "k3", kind: "notice" as const, refId: "55", snapshot: { noticeNo: "SCN1" }, capture: null },
    { id: "k4", kind: "entity" as const, refId: "1", snapshot: {}, capture: null },
  ];
  it("gives one event per contract, acquisition and awarded contract, by date", () => {
    expect(sourceEventsFrom(clips, records).map((e) => [e.date, e.label, e.href, e.valueExact])).toEqual([
      ["2024-03-04", "Contract din anunțul SCN1", "/contracte/10", null],
      ["2025-01-02", "Contract din anunțul SCN1", "/contracte/9", "5.5"],
      ["2026-09-07", "Data contractului", "/contracte/108082710", "789004.26"],
      ["2026-09-25", "Achiziție directă finalizată", "/achizitii/123101594", "80000"],
    ]);
  });
  it("names who bought from whom, each supplier once", () => {
    expect(recordParties(records.get("k1")!)).toEqual({ authorityId: "2139059", authority: "COMUNA FELNAC", suppliers: [{ id: "1", name: "A" }, { id: "2", name: "B" }] });
    expect(recordParties([])).toBeNull();
  });
});

describe("the timeline from the sources (Z8-42)", () => {
  const base = { date: "2020-01-15", unit: "lei", sourceUrl: null } as const;
  it("says a contract once when its contract and its notice are both saved", () => {
    const merged = mergeSourceEvents([
      { ...base, clipId: "n", kind: "contract", label: "Contract din anunțul SCNA1031122", title: "SCNA1031122", valueExact: "4930170", href: "/contracte/100427344" },
      { ...base, clipId: "c", kind: "contract", label: "Data contractului", title: "Contract de lucrări", valueExact: "4930170", href: "/contracte/100427344" },
      { ...base, clipId: "d", kind: "da", label: "Achiziție directă finalizată", title: "DA1", valueExact: "10", href: "/achizitii/1" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ label: "Contract semnat", title: "Contract de lucrări", noticeNo: "SCNA1031122", clips: [{ clipId: "n", kind: "notice" }, { clipId: "c", kind: "contract" }] });
    expect(merged[1]).toMatchObject({ label: "Achiziție directă finalizată", clips: [{ clipId: "d", kind: "da" }] });
  });
  it("keeps different contracts and days apart", () => {
    expect(mergeSourceEvents([
      { ...base, clipId: "a", kind: "contract", label: "Data contractului", title: "A", valueExact: "1", href: "/contracte/1" },
      { ...base, clipId: "b", kind: "contract", label: "Data contractului", title: "B", valueExact: "1", href: "/contracte/2" },
    ])).toHaveLength(2);
  });
});
