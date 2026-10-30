import { describe, expect, it } from "vitest";
import { decodeSpec } from "../../lib/ask/permalink";
import type { BlockData } from "../../lib/ask/compile";
import type { AskSpec } from "../../lib/ask/spec";
import { answerCsv, leiDifference } from "./answer-csv";
import {
  PROCEDURE_STREAM, SINGLE_OFFER_STREAM, STRIP_QUERY_KEYS, answerHoldsList, appliedAfterStrip, appliedAfterTrendList, deeperThread, readThread, shownWords, streamOptions, threadCrumbs, threadHref, threadWords,
  totalConditionWords,
} from "./answer-state";
import { patchDraft, trendListSwitch } from "./builder/view";
import { chooseValue } from "../../lib/ask/filters/transition";
import { questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import { trendFixture, trendGroups, trendSpec } from "../../lib/ask/fixtures/trend-screen";

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
    // F3: a procedure is a contract's; a size above the DA ceiling holds no direct acquisition.
    const open = streamOptions({ filters: { ...breakdown.filters, procedure: "deschisa" } });
    expect(open.map((o) => [o.value, o.disabled ?? null])).toEqual([["all", PROCEDURE_STREAM], ["da", PROCEDURE_STREAM], ["contracts", null]]);
    const huge = streamOptions({ filters: { ...breakdown.filters, purchaseValueMin: 5_000_000 } });
    expect(huge.map((o) => o.disabled ?? null)).toEqual([null, "Achizițiile directe se numără până la 2 mil. lei. Alege o limită mai mică sau și contractele.", null]);
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
    // F5 (map final §4): `inregistrari`, the card's and the seat's columns (empty until the county facts are read).
    expect(lens.text.split("\r\n")[0]).toBe("﻿judet,valoare_lei,inregistrari,firme_din_judet,firme_alte_judete,din_care_bucuresti,firme_straine,sediu_necunoscut," +
      "cel_mai_mare_cumparator,pondere_cumparator,cea_mai_mare_inregistrare,pondere_inregistrare,harta_arata");
    expect(lens.filename).toBe("harta-inregistrari.csv");
    const plain = answerCsv(map, { block: "map", measure: "value", filters: {} }, "Hartă");
    expect(plain.text).toBe('﻿judet,valoare_lei,inregistrari,firme_din_judet,firme_alte_judete,din_care_bucuresti,firme_straine,sediu_necunoscut,' +
      'cel_mai_mare_cumparator,pondere_cumparator,cea_mai_mare_inregistrare,pondere_inregistrare\r\n"Cluj",5,3,,,,,,"",,,\r\n');
    expect(plain.filename).toBe("harta.csv");
  });

  it("names a firm's place its seat and says the band CÂȘTIGĂTORII narrows to (S4t-firm-csv-column, S4t-band-csv)", () => {
    const table = (county: string): BlockData => ({ block: "table", rows: [{ entityId: 1, name: "PORR", county, value: 10, count: 2 }] }) as unknown as BlockData;
    const firms = answerCsv(table("Bucuresti"), { block: "table", dim: "supplier", measure: "value", filters: {} }, "Firme").text.replace(/^﻿/, "").split("\r\n");
    expect(firms.slice(0, 2)).toEqual(["nume,sediu,valoare_lei,achizitii,populatie", '"PORR","Bucuresti",10,2,']);
    const band = answerCsv(table("Cluj"), { block: "table", dim: "supplier", measure: "value", filters: { minEmployees: 1, maxEmployees: 9 } }, "Firme").text.replace(/^﻿/, "").split("\r\n");
    expect(band.slice(0, 2)).toEqual(["nume,sediu,valoare_lei,achizitii,populatie,angajati", '"PORR","Cluj",10,2,,"1–9 angajați"']);
    const none = answerCsv(table("Cluj"), { block: "table", dim: "supplier", measure: "value", filters: { maxEmployees: 0 } }, "Firme").text.split("\r\n");
    expect(none[1]).toBe('"PORR","Cluj",10,2,,"fără angajați"');
    // An institution's place stays its county; a ranking of institutions has no band of firms.
    const institutions = answerCsv(table("Cluj"), { block: "table", dim: "authority", measure: "value", filters: { minEmployees: 1, maxEmployees: 9 } }, "Instituții").text;
    expect(institutions.replace(/^﻿/, "").split("\r\n")[0]).toBe("nume,judet,valoare_lei,achizitii,populatie");
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

  it("are one control with the sentence's group: a group the answer holds is switched to, with no request (F2-merge-fixes)", () => {
    // The builder's window writes the change as the sentence does (chooseValue), on the applied question.
    const applied = answered as unknown as QuestionSpec;
    const choose = (draft: QuestionSpec, value: string) => chooseValue(draft, { id: "trendChange" }, { filter: "trendChange", value }).spec;
    const toNew = choose(applied, "new");
    expect(trendListSwitch(toNew, applied)).toBe("new");
    expect(answerHoldsList(trendFixture(), "new")).toBe(true);
    // AskPanel applies it like the button; the StripPatch then gives the draft the applied `trend`: no „modificat”.
    const shown = appliedAfterTrendList(answered, answered, "new");
    const patched = patchDraft(toNew, { path: "trend", value: "new", trend: shown.trend ?? null });
    expect(questionKey(patched)).toBe(questionKey(shown as unknown as QuestionSpec));
    // Back to the growths from the sentence: the answered order and base come back with the list.
    const back = appliedAfterTrendList(shown, answered, trendListSwitch(choose(patched, "up"), patched)!);
    expect(back.trend).toEqual(answered.trend);
    // The same group, another key edited too (here the months), or no answer to switch: the draft waits for a run.
    expect(trendListSwitch(choose(applied, "up"), applied)).toBeNull();
    const months = { ...applied, trend: { ...answered.trend, months: [1, 5] } } as QuestionSpec;
    expect(trendListSwitch(choose(months, "new"), applied)).toBeNull();
    expect(trendListSwitch(toNew, null)).toBeNull();
    expect(answerHoldsList(trendFixture({ groups: undefined, composition: undefined }), "new")).toBe(false);
    expect(answerHoldsList(trendFixture({ groups: trendGroups({ gone: undefined }) }), "gone")).toBe(false);
    // An old link without the key: Creșteri from the sentence is a list the answer holds; Toate gives back the bare link.
    const old = trendSpec() as unknown as QuestionSpec;
    expect(trendListSwitch(choose(old, "up"), old)).toBe("up");
    expect(appliedAfterTrendList(trendSpec({ change: "up" }), trendSpec(), "all")).toEqual(trendSpec());
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
    // A firm's seat beside it (F4, owner-seat-switch), as on screen; a foreign firm's country, as on screen.
    expect(lines[0]).toBe("nume,sediu,2024,2025,diferenta_lei,etichete,partener,grupa,luni");
    expect(lines[1]).toBe('"BETA SERV SRL","București",0,900,900,"fără CUI valid; prima dată în 2025; 1 achiziție directă: 100%","100% de la PRIMARIA EXEMPLU","noi","ian.–mai"');
    expect(lines[2]).toBe('"GAMMA GMBH","Germania",0,300,300,"activă din 2019","","noi","ian.–mai"');
    expect(lines).toHaveLength(4);
    expect(filename).toBe("ce-firme-noi-apar-in-2025-noi-ian-mai.csv");
  });

  it("keeps the county of an institution, no county column on counties, and an old answer's one list", () => {
    const institutions = answerCsv(trendFixture({ noun: "instituții" }), trendSpec({ change: "down" }, { dim: "authority" }), "T", { group: "scaderi" });
    expect(institutions.text.split("\r\n")[0]).toBe("﻿nume,judet,2024,2025,diferenta_lei,etichete,partener,grupa");
    expect(institutions.text.split("\r\n")[1]).toBe('"DELTA SA","București",800,200,-600,"în asociere","în 2024: 50% de la SPITALUL EXEMPLU","scaderi"');
    const counties = answerCsv(trendFixture({ noun: "județe", rowFacts: undefined, groups: trendGroups({ up: [{ entityId: null, name: "Cluj", county: null, valueA: 10, valueB: 20 }] }) }),
      trendSpec({ change: "up" }, { dim: "county" }), "T");
    expect(counties.text.split("\r\n").slice(0, 2)).toEqual(["﻿nume,2024,2025,diferenta_lei,etichete,partener", '"Cluj",10,20,10,"",""']);
    const old = answerCsv(trendFixture({ groups: undefined, composition: undefined, list: undefined, rowFacts: undefined }), trendSpec(), "T");
    expect(old.text.split("\r\n").slice(0, 2)).toEqual(["﻿nume,sediu,2024,2025,diferenta_lei,etichete,partener", '"ALFA CONSTRUCT SRL","București",100,1500,1400,"",""']);
  });

  it("writes the names as shown and the difference to the ban, without a float's noise", () => {
    const row = { entityId: "1", name: "RO123456 ALFA CONSTRUCT SRL", county: null, valueA: 481_712_345.67, valueB: 1_130_000_000.12 };
    const csv = answerCsv(trendFixture({ groups: trendGroups({ up: [row] }) }), trendSpec({ change: "up" }), "T");
    expect(csv.text.split("\r\n")[1]).toMatch(/^"ALFA CONSTRUCT SRL","",481712345.67,1130000000.12,648287654.45,/);
    expect([leiDifference(2_323_775_461.47, 0), leiDifference(0.1, 0.3)]).toEqual([-2_323_775_461.47, 0.2]);
  });
});

describe("the total line's conditions (G8) as the answer ran", () => {
  it("say a trend's `auto` months as they resolved, and none on whole years, like the pills", () => {
    const spec = trendSpec({ change: "up", months: "auto" });
    expect(totalConditionWords(spec, [1, 5])).toContain("pe aceleași luni: ian.–mai");
    expect(totalConditionWords(spec, [1, 12]).some((w) => w.includes("aceleași luni"))).toBe(false);
    // An answer that does not say what it ran keeps the words of the question.
    expect(totalConditionWords(spec)).toContain("pe aceleași luni");
    expect(totalConditionWords(trendSpec({ change: "up", months: "whole" }), [1, 12])).toContain("pe ani întregi");
  });
});
