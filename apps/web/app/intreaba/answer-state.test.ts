import { describe, expect, it } from "vitest";
import { decodeSpec } from "../../lib/ask/permalink";
import type { BlockData } from "../../lib/ask/compile";
import type { AskSpec } from "../../lib/ask/spec";
import { answerCsv } from "./answer-csv";
import { SINGLE_OFFER_STREAM, STRIP_QUERY_KEYS, appliedAfterStrip, appliedAfterTrendList, deeperThread, readThread, shownWords, streamOptions, threadCrumbs, threadHref, threadWords } from "./answer-state";
import { patchDraft } from "./builder/view";
import { trendFixture, trendSpec } from "../../lib/ask/fixtures/trend-screen";

/*
 * F1b-builder-a, the answer's side of the strip (plan §2.3): the applied
 * question after a strip change, the server's words of each display state,
 * the breakdown's thread in the URL and the shown result's CSV with the
 * strip's state.
 */

const breakdown: AskSpec = { block: "breakdown", measure: "value", filters: { authorityKind: "spital", county: "Cluj", yearFrom: 2025, yearTo: 2025 } };
const specOf = (href: string) => decodeSpec(decodeURIComponent(new URL(href, "http://x").searchParams.get("spec")!)) as AskSpec;

describe("the applied question and the strip", () => {
  it("changes only the strip's key: the stream is a new query, the map's lens is not", () => {
    expect(appliedAfterStrip(breakdown, "dataset", "da")).toEqual({ ...breakdown, dataset: "da" });
    expect(appliedAfterStrip({ ...breakdown, block: "map" }, "measure", "count").measure).toBe("count");
    expect(STRIP_QUERY_KEYS.has("dataset")).toBe(true);
    expect(STRIP_QUERY_KEYS.has("measure")).toBe(false);
  });

  it("keeps an old link's «o singură ofertă» on procedures: the other streams are shown with the reason, not chosen", () => {
    expect(streamOptions(breakdown).map((o) => o.disabled ?? null)).toEqual([null, null, null]);
    const single = streamOptions({ filters: { ...breakdown.filters, singleBidder: true } });
    expect(single.map((o) => [o.value, o.disabled ?? null])).toEqual([["all", SINGLE_OFFER_STREAM], ["da", SINGLE_OFFER_STREAM], ["contracts", null]]);
  });

  it("shows the server's pills and SQL of the lens on screen, without a new request (variants)", () => {
    const answer = { pills: ["Total (lei)"], displaySql: "select county, sum(closing_value)", variants: { measure: {
      value: { pills: ["Total (lei)"], displaySql: "select county, sum(closing_value)" },
      count: { pills: ["numărul de înregistrări"], displaySql: "select county, count(*)" },
    } } };
    const map: AskSpec = { block: "map", measure: "count", filters: {} };
    expect(shownWords(answer, map)).toEqual({ pills: ["numărul de înregistrări"], displaySql: "select county, count(*)" });
    expect(shownWords({ pills: ["a"], displaySql: "s" }, map)).toEqual({ pills: ["a"], displaySql: "s" });
  });
});

describe("the breakdown's thread (fir)", () => {
  const thread = deeperThread(null, breakdown, "33", "Echipamente medicale");
  const deeper = { ...breakdown, filters: { ...breakdown.filters, cpvTerm: "33" } };

  it("starts where the question's domains start and grows one level at a time", () => {
    expect(thread).toEqual({ root: null, steps: [{ code: "33", name: "Echipamente medicale" }] });
    expect(deeperThread(thread, deeper, "331", "Echipamente medicale (aparate)").steps.map((s) => s.code)).toEqual(["33", "331"]);
    expect(deeperThread(null, { ...breakdown, filters: { cpvTerm: "medicamente" } }, "3360", "Produse farmaceutice").root).toBe("medicamente");
    expect(threadWords(deeperThread(thread, deeper, "331", "Aparate"))).toBe("toate › Echipamente medicale › Aparate");
  });

  it("is read back only for the level it leads to", () => {
    const raw = JSON.stringify(thread);
    expect(readThread(raw, deeper)).toEqual(thread);
    expect(readThread(raw, breakdown)).toBeNull();
    expect(readThread(raw, { ...deeper, block: "stat" })).toBeNull();
    expect(readThread("{not json", deeper)).toBeNull();
  });

  it("leads back: each crumb is its level's question, the root without a domain or the thread", () => {
    const two = deeperThread(thread, deeper, "331", "Aparate");
    const { items, current } = threadCrumbs(two, { ...breakdown, filters: { ...breakdown.filters, cpvTerm: "331" } });
    expect(current).toBe("Aparate");
    expect(items.map((i) => i.label)).toEqual(["toate", "Echipamente medicale"]);
    expect(specOf(items[0]!.href).filters.cpvTerm).toBeUndefined();
    expect(new URL(items[0]!.href, "http://x").searchParams.get("fir")).toBeNull();
    expect(specOf(items[1]!.href).filters.cpvTerm).toBe("33");
    expect(JSON.parse(new URL(items[1]!.href, "http://x").searchParams.get("fir")!)).toEqual(thread);
    // The deeper link keeps the question's other conditions and its measure.
    expect(specOf(threadHref(breakdown, "33", thread))).toMatchObject({ block: "breakdown", filters: { authorityKind: "spital", county: "Cluj", yearFrom: 2025, cpvTerm: "33" } });
  });
});

describe("«Rezultatul afișat · CSV» with the strip's state", () => {
  const data: BlockData = { block: "breakdown", slices: [{ code: "33", name: "Echipamente medicale", value: 10, count: 2 }], other: { value: 1, count: 1 } } as BlockData;

  it("adds the strip's columns to the header and every row, and its values to the file name", () => {
    const { text, filename } = answerCsv(data, breakdown, "Ce cumpără spitalele?", { stream: "da", thread: "toate › Echipamente medicale" });
    const lines = text.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("categorie,cod,valoare_lei,achizitii,canal,fir");
    expect(lines[1]).toBe('"Echipamente medicale",33,10,2,"directe","toate › Echipamente medicale"');
    expect(lines[2]).toBe('"alte domenii",,1,1,"directe","toate › Echipamente medicale"');
    expect(filename).toBe("ce-cumpara-spitalele-directe-toate-echipamente-medicale.csv");
  });

  it("says the map's lens, and keeps today's file when the strip has nothing", () => {
    const map: BlockData = { block: "map", counties: [{ county: "Cluj", value: 5, count: 3 }], unknown: { value: 0, count: 0 } } as BlockData;
    const lens = answerCsv(map, { block: "map", measure: "count", filters: {} }, "Hartă", { lens: "count" });
    expect(lens.text.split("\r\n")[0]).toBe("﻿judet,valoare_lei,achizitii,harta_arata");
    expect(lens.filename).toBe("harta-inregistrari.csv");
    const plain = answerCsv(map, { block: "map", measure: "value", filters: {} }, "Hartă");
    expect(plain.text).toBe('﻿judet,valoare_lei,achizitii\r\n"Cluj",5,3\r\n');
    expect(plain.filename).toBe("harta.csv");
  });
});

describe("a trend's group buttons (TB-screen, owner-R-facts-all-lists)", () => {
  const answered = trendSpec({ change: "up", months: "auto", order: "percent", minBase: 1_000_000 }, { dataset: "da" });

  it("change only the applied question's `trend`, as the answered question lists that group", () => {
    // The applied question may differ from the answered one elsewhere (here a later topN): only `trend` changes.
    const applied = { ...answered, topN: 25 };
    expect(appliedAfterTrendList(applied, answered, "new")).toEqual({ ...applied, trend: { change: "new", months: "auto" } });
    expect(appliedAfterTrendList(applied, answered, "first").trend).toEqual({ change: "new", months: "auto", firstOnly: true });
    // Back to the growths: the order and the base their list was computed with.
    expect(appliedAfterTrendList({ ...applied, trend: { change: "gone", months: "auto" } }, answered, "up").trend).toEqual(answered.trend);
    // An old link without the key: back on „Toate” it has no key again.
    const old = trendSpec();
    expect(appliedAfterTrendList({ ...old, trend: { change: "new" } }, old, "all")).toEqual(old);
  });

  it("tell the builder the same `trend`: its draft and applied question follow, without „modificat”", () => {
    const draft = { ...answered, filters: { ...answered.filters, county: "Cluj" } };
    const next = patchDraft(draft as never, { path: "trend", value: "new", trend: { change: "new", months: "auto" } });
    expect(next.trend).toEqual({ change: "new", months: "auto" });
    expect(next.filters).toEqual(draft.filters);
    expect(patchDraft(draft as never, { path: "trend", value: "all", trend: null }).trend).toBeUndefined();
    expect(draft.trend).toEqual(answered.trend);
  });

  it("show the server's pills and SQL of the list on screen (variants.trend)", () => {
    const answer = { pills: ["creșteri"], displaySql: "having up", variants: { trend: {
      up: { pills: ["creșteri"], displaySql: "having up" }, new: { pills: ["noi față de 2024"], displaySql: "having new" },
    } } };
    expect(shownWords(answer, trendSpec({ change: "new" }))).toEqual({ pills: ["noi față de 2024"], displaySql: "having new" });
    // A list the server did not describe (an old answer): the answer's own words.
    expect(shownWords({ pills: ["a"], displaySql: "s" }, trendSpec({ change: "gone" }))).toEqual({ pills: ["a"], displaySql: "s" });
  });
});

describe("«Rezultatul afișat · CSV» of a trend", () => {
  const data = trendFixture();

  it("exports the list on screen with its columns, the group and the months beside it", () => {
    const { text, filename } = answerCsv(data, trendSpec({ change: "new", months: "auto" }), "Ce firme noi apar în 2025?", { group: "noi", months: "ian.–mai" });
    const lines = text.replace(/^﻿/, "").split("\r\n");
    // No county beside a firm (owner-seat-switch), as on screen.
    expect(lines[0]).toBe("nume,2024,2025,diferenta_lei,etichete,partener,grupa,luni");
    expect(lines[1]).toBe('"BETA SERV SRL",0,900,900,"fără CUI valid; prima dată în 2025; 1 achiziție directă: 100%","100% de la PRIMARIA EXEMPLU","noi","ian.–mai"');
    expect(lines[2]).toBe('"GAMMA GMBH",0,300,300,"activă din 2019","","noi","ian.–mai"');
    expect(lines).toHaveLength(4);
    expect(filename).toBe("ce-firme-noi-apar-in-2025-noi-ian-mai.csv");
  });

  it("keeps the county of an institution, a county's name, and an old answer's one list", () => {
    const institutions = answerCsv(trendFixture({ noun: "instituții" }), trendSpec({ change: "down" }, { dim: "authority" }), "T", { group: "scaderi" });
    expect(institutions.text.split("\r\n")[0]).toBe("﻿nume,judet,2024,2025,diferenta_lei,etichete,partener,grupa");
    expect(institutions.text.split("\r\n")[1]).toBe('"DELTA SA","București",800,200,-600,"în asociere","în 2024: 50% de la SPITALUL EXEMPLU","scaderi"');
    const old = answerCsv(trendFixture({ groups: undefined, composition: undefined, list: undefined, rowFacts: undefined }), trendSpec(), "T");
    expect(old.text.split("\r\n").slice(0, 2)).toEqual(["﻿nume,2024,2025,diferenta_lei,etichete,partener", '"ALFA CONSTRUCT SRL",100,1500,1400,"",""']);
  });
});
