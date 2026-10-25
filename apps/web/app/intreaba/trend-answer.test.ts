import { describe, expect, it } from "vitest";
import { DOWN, FOREIGN, GONE, NEW, UP, trendFixture, trendGroups, trendSpec } from "../../lib/ask/fixtures/trend-screen";
import {
  TREND_LIST_CSV, compositionHead, drawerWatchBlocked, emptyGroupsLine, firstOptions, groupTerm, labelLegend, newSubLabel, partialStars, percentTerm,
  retimeScopeLabel, shownTrendList, signedRon, trendButtons, trendEmpty, trendGroupHeader, trendRest, trendRowView, trendTotal, trendWatch, trendWatchNote,
  withoutFilingWords,
} from "./trend-answer";
import { answerCsv } from "./answer-csv";
import { TREND_LIST_LABELS } from "../../lib/ask/filters/defs/trend";
import { questionTitle } from "../../lib/ask/filters/title";
import { TREND_LISTS, specTrendPartLabel, trendListSpec, type TrendList } from "../../lib/ask/trend-shared";
import { watchedGroupLabel } from "../../lib/monitoring-input";

/*
 * TB-screen (plan §4.7 P6, P8; trend final §3.1, §3.4, §4.4): the words of the
 * trend's answer from the data it already holds: the buttons, the head, the
 * rows of the applied list, their labels and partner line, the empty groups,
 * the total line, the watch on a group and the group drawer's header.
 */

const data = trendFixture();
const firms = trendSpec({ change: "up", months: "auto" });

describe("the list on screen", () => {
  it("is the applied question's, from the lists the answer holds (no request)", () => {
    expect(shownTrendList(data, firms)).toEqual({ list: "up", rows: [UP] });
    expect(shownTrendList(data, trendSpec({ change: "new" })).rows).toEqual([NEW, FOREIGN]);
    expect(shownTrendList(data, trendSpec({ change: "new", firstOnly: true })).rows).toEqual([NEW]);
    expect(shownTrendList(data, trendSpec()).list).toBe("all");
  });

  it("is the answer's only list when it was stored before trend-2", () => {
    const old = trendFixture({ groups: undefined, composition: undefined, list: undefined, rowFacts: undefined });
    expect(shownTrendList(old, trendSpec({ change: "gone" }))).toEqual({ list: "all", rows: [UP] });
  });
});

describe("the group buttons", () => {
  it("are „Toate” first, then the four groups, each with its count and change in lei", () => {
    const buttons = trendButtons(data, firms)!;
    expect(buttons.map((b) => [b.value, b.name, b.count, b.all ?? false])).toEqual([
      ["all", "Toate", "6 · +1.950 lei", true], ["up", "Creșteri", "1 · +1.400 lei", false], ["new", "Noi", "2 · +1.200 lei", false],
      ["down", "Scăderi", "1 · −600 lei", false], ["gone", "Nu mai apar", "1 · −50 lei", false],
    ]);
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    expect(emptyGroupsLine(buttons)).toBeNull();
  });

  it("disable a group of 0 with why, in the selection's noun", () => {
    const counties = trendFixture({ noun: "județe", composition: { ...data.composition, new: { count: 0, valueA: 0, valueB: 0 }, gone: { count: 0, valueA: 0, valueB: 0 } } });
    const buttons = trendButtons(counties, trendSpec({ change: "up" }, { dim: "county" }))!;
    expect(buttons.find((b) => b.value === "new")?.disabled).toBe("Niciun județ nou în această selecție.");
    expect(buttons.find((b) => b.value === "gone")?.disabled).toBe("Niciun județ care să nu mai apară.");
    expect(buttons.find((b) => b.value === "up")?.disabled).toBeUndefined();
    // Visibly too, in one line under the buttons, the reasons in its (?) (kit R1).
    const line = emptyGroupsLine(buttons)!;
    expect(line.text).toBe("Grupuri goale: Noi, Nu mai apar");
    expect("text" in line.tip && line.tip.text).toBe("Niciun județ nou în această selecție. Niciun județ care să nu mai apară.");
    expect(emptyGroupsLine([{ name: "Prima dată în 2025", disabled: "Nicio firmă aflată prima dată în date în 2025." }])?.text).toBe("Grup gol: Prima dată în 2025");
  });

  it("keep the partition in percent (trend final §3.9: the composition does not change): the growths are all of them, and add up to „Toate”", () => {
    const percent = trendFixture({ composition: { ...data.composition, eligible: { count: 3, valueA: 3_000_000, valueB: 9_000_000 } } });
    const buttons = trendButtons(percent, trendSpec({ change: "up", order: "percent", minBase: 1_000_000 }))!;
    expect(buttons.find((b) => b.value === "up")?.count).toBe("1 · +1.400 lei");
    // No growth from the base, some growths: Creșteri stays a choice; its list says why it is empty (trendEmpty).
    const none = trendFixture({ composition: { ...data.composition, eligible: { count: 0, valueA: 0, valueB: 0 } } });
    expect(trendButtons(none, trendSpec({ change: "up", order: "percent", minBase: 1e9 }))!.find((b) => b.value === "up")?.disabled).toBeUndefined();
  });

  it("are not drawn without a composition (an old answer, a watch's fixed members)", () => {
    expect(trendButtons(trendFixture({ composition: undefined }), firms)).toBeNull();
    expect(trendButtons(trendFixture({ composition: { up: { count: 1, valueA: 1, valueB: 2 } } }), firms)).toBeNull();
  });

  it("say the change with its sign, an amount under a million with its unit", () => {
    expect([signedRon(0), signedRon(652_800_000), signedRon(-1_130_000_000), signedRon(-60_650)]).toEqual(["0", "+652,8 mil.", "−1,1 mld.", "−60.650 lei"]);
  });
});

describe("the head and „Prima dată”", () => {
  it("counts the selection in its noun and months, with what the groups mean", () => {
    const head = compositionHead(data, firms)!;
    expect([head.text, head.total]).toEqual(["Firme în 2024 sau 2025:", "6"]);
    expect("text" in head.tip && head.tip.text).toContain("1 are aceeași valoare în ambii ani; apare doar la „Toate”.");
    expect("text" in head.tip && head.tip.text).toContain("Firmele străine și cele fără CUI valid");
    const months = compositionHead(trendFixture({ noun: "clienți", months: { from: 1, to: 5, mode: "auto" } }), trendSpec({}, { dim: "authority" }))!;
    expect(months.text).toBe("Clienți în ian.–mai 2024 sau 2025:");
    expect("text" in months.tip && months.tip.text).not.toContain("CUI");
  });

  it("offers „Toate · Prima dată în 2025” on the new ones only", () => {
    expect(firstOptions(data, "new", firms)).toEqual([
      { value: "new", label: "Toate", count: "2" }, { value: "first", label: "Prima dată în 2025", count: "1" },
    ]);
    expect(firstOptions(data, "first", firms)?.length).toBe(2);
    expect(firstOptions(data, "up", firms)).toBeNull();
    expect(firstOptions(trendFixture({ groups: trendGroups({ first: undefined }) }), "new", firms)).toBeNull();
    // „Noi” with its year (kit §4), beside the two segments.
    expect(newSubLabel(data, firms)).toBe("Firme noi față de 2024:");
    expect(newSubLabel(trendFixture({ noun: "clienți" }), firms)).toBe("Clienți noi față de 2024:");
  });
});

describe("an empty group (trend final §4.4)", () => {
  it("says so in the selection's noun and offers another list of the same answer", () => {
    expect(trendEmpty(trendFixture({ noun: "furnizori" }), "gone", firms)).toEqual({
      message: "Niciun furnizor care să nu mai apară. Toți furnizorii din 2024 au înregistrări și în 2025, în această selecție.",
      to: { label: "Vezi toate schimbările", list: "all" },
    });
    expect(trendEmpty(trendFixture({ noun: "firme" }), "new", firms).message).toBe("Nicio firmă nouă în această selecție.");
    expect(trendEmpty(trendFixture({ noun: "instituții" }), "first", firms)).toEqual({
      message: "Nicio instituție aflată prima dată în date în 2025.", to: { label: "Arată toate instituțiile noi", list: "new" },
    });
    expect(trendEmpty(trendFixture({ noun: "clienți" }), "first", firms).to?.label).toBe("Arată toți clienții noi");
  });

  it("lowers the base of the growths in percent (a new question), down to 100.000 lei", () => {
    const percent = (minBase: number) => trendSpec({ change: "up", order: "percent", minBase });
    expect(trendEmpty(data, "up", percent(1_000_000))).toEqual({
      message: "Nicio firmă cu cel puțin 1 mil. lei în 2024.", base: { label: "Coboară pragul la 100.000 lei", minBase: 100_000 },
    });
    expect(trendEmpty(data, "up", percent(10_000_000)).base?.minBase).toBe(1_000_000);
    expect(trendEmpty(data, "up", percent(100_000)).base).toBeUndefined();
  });
});

describe("a row (trend final §3.4, §4.8)", () => {
  it("says its labels, its main partner and the change of a growth", () => {
    const view = trendRowView(UP, "up", data, firms);
    expect(view.facts).toEqual([{ text: "1 contract: 86%", tone: "caveat" }]);
    expect(view.partner).toBe("40% de la PRIMARIA EXEMPLU");
    expect(view.years).toEqual([{ label: "2024", value: "100 lei" }, { label: "2025", value: "1.500 lei" }]);
    expect([view.delta, view.pct, view.pctFirst, view.up]).toEqual(["+1.400 lei", { text: "×15", words: "de 15 ori mai mult" }, false, true]);
    expect(view.scope).toEqual({ entityIds: ["1"], role: "supplier" });
    expect(view.scopeLabel).toBe("ALFA CONSTRUCT SRL · 2024 și 2025");
  });

  it("makes the percent the main figure when the growths are ordered in percent (trend final §3.9 Afișare)", () => {
    expect(trendRowView(UP, "up", data, trendSpec({ change: "up", order: "percent", minBase: 100_000 })).pctFirst).toBe(true);
    expect(trendRowView(UP, "all", data, trendSpec({ change: "all" })).pctFirst).toBe(false);
  });

  it("never says −100% of a fall that leaves money", () => {
    const fell = trendRowView({ ...DOWN, valueA: 170_500_000, valueB: 4_180 }, "down", data, firms);
    expect([fell.pct, fell.years[1]?.value, fell.delta]).toEqual([{ text: "<−99%", words: "scădere de peste 99%" }, "4.180 lei", "−170,5 mil."]);
    expect(trendRowView({ ...DOWN, valueA: 1_000, valueB: 6 }, "down", data, firms).pct?.text).toBe("−99%");
  });

  it("puts no county beside a firm (owner-seat-switch, until F4), an institution's county, a foreign firm's country", () => {
    expect(trendRowView(UP, "up", data, firms).place).toBeNull();
    expect(trendRowView(UP, "up", trendFixture({ noun: "instituții" }), trendSpec({}, { dim: "authority" })).place).toBe("București");
    const foreign = trendRowView(FOREIGN, "new", data, firms);
    expect(foreign.place).toBe("Germania");
    // A foreign firm shows its country, not "fără CUI valid"; it was active before.
    expect(foreign.facts.map((f) => f.text)).toEqual(["activă din 2019"]);
  });

  it("treats an identity flagged foreign with country RO as domestic: no „România”, and „fără CUI valid” (FCC CONSTRUCCION S.A.)", () => {
    const flagged = trendFixture({ rowFacts: { ...data.rowFacts, "5": { ...data.rowFacts!["5"]!, country: "RO" } } });
    const view = trendRowView(FOREIGN, "new", flagged, firms);
    expect(view.place).toBeNull();
    expect(view.facts.map((f) => f.text)).toEqual(["fără CUI valid", "activă din 2019"]);
  });

  it("stars a partly covered year on every list: the two years, and the one year of a new or gone row", () => {
    const stars = partialStars(data, [{ year: 2025 }]);
    expect(stars).toEqual(["", "*"]);
    expect(trendRowView(UP, "up", data, firms, stars).years.map((y) => y.label)).toEqual(["2024", "2025*"]);
    expect(trendRowView(NEW, "new", data, firms, stars).single?.when).toBe("în 2025*");
    expect(trendRowView(GONE, "gone", data, firms, partialStars(data, [{ year: 2024 }])).single?.when).toBe("în 2024*");
    expect(trendRowView(GONE, "gone", data, firms, stars).single?.when).toBe("în 2024");
  });

  it("names the reloaded answer's months in a row's drawer label after a 409", () => {
    const before = trendFixture({ months: { from: 1, to: 5, mode: "auto" } }), after = trendFixture({ months: { from: 1, to: 6, mode: "auto" } });
    const label = trendRowView(UP, "up", before, firms).scopeLabel;
    expect(label).toBe("ALFA CONSTRUCT SRL · ian.–mai 2024 și ian.–mai 2025");
    expect(retimeScopeLabel(label, before, after)).toBe("ALFA CONSTRUCT SRL · ian.–iun. 2024 și ian.–iun. 2025");
    expect(retimeScopeLabel(label, before, data)).toBe("ALFA CONSTRUCT SRL · 2024 și 2025");
    expect(retimeScopeLabel("selecția aleasă", before, after)).toBe("selecția aleasă");
  });

  it("says the year of the partner where the list is not about it: on „Toate” and on the decreases", () => {
    expect(trendRowView(UP, "all", data, firms).partner).toBe("în 2025: 40% de la PRIMARIA EXEMPLU");
    const down = trendRowView(DOWN, "down", data, firms);
    expect([down.partner, down.facts.map((f) => f.text), down.pct?.text, down.delta, down.up]).toEqual(["în 2024: 50% de la SPITALUL EXEMPLU", ["în asociere"], "−75%", "−600 lei", false]);
  });

  it("shows a new or gone row's one value in its own list, and „nouă” among all the changes", () => {
    const fresh = trendRowView(NEW, "new", data, firms);
    expect(fresh.facts.map((f) => f.text)).toEqual(["fără CUI valid", "prima dată în 2025", "1 achiziție directă: 100%"]);
    expect([fresh.single, fresh.years, fresh.pct]).toEqual([{ value: "900 lei", when: "în 2025" }, [], null]);
    expect(trendRowView(NEW, "all", data, firms).pct).toEqual({ text: "nouă", words: "nouă" });
    const gone = trendRowView(GONE, "gone", data, firms);
    expect([gone.single, gone.facts.map((f) => f.text)]).toEqual([{ value: "50 lei", when: "în 2024" }, ["activă în 2026"]]);
    expect(trendRowView(GONE, "all", data, firms).pct?.text).toBe("nu mai apare");
  });

  it("opens a county row's own records by its county, with the answer's months in its label", () => {
    const counties = trendFixture({ noun: "județe", rowFacts: undefined, months: { from: 1, to: 5, mode: "auto" } });
    const view = trendRowView({ entityId: null, name: "Cluj", county: null, valueA: 10, valueB: 20 }, "up", counties, trendSpec({}, { dim: "county" }));
    expect([view.scope, view.place, view.href, view.scopeLabel]).toEqual([{ county: "Cluj" }, null, null, "Cluj · ian.–mai 2024 și ian.–mai 2025"]);
    expect(view.years[0]).toEqual({ label: "ian.–mai 2024", value: "10 lei" });
  });

  it("explains „Noi” and „Nu mai apar” under their lists, with the glossary's words", () => {
    expect(groupTerm("new", data)).toEqual({ text: "Noi față de 2024", tip: { id: "firma-noua" } });
    expect(groupTerm("gone", data)).toEqual({ text: "Nu mai apar în 2025", tip: { id: "nu-mai-apare" } });
    expect(groupTerm("up", data)).toBeNull();
  });

  it("explains each label kind once, under the list", () => {
    const legend = labelLegend(new Set(["joint", "oneRecord", "noValidCui"] as const), data);
    expect(legend.map((l) => l.fact.text)).toEqual(["fără CUI valid", "1 contract: N%", "în asociere"]);
    expect(legend.every((l) => "title" in l.tip)).toBe(true);
  });
});

describe("the group's total line and the rest", () => {
  it("says who is in the group and their sums, in the answer's months", () => {
    expect(trendTotal(data, "up", firms)).toEqual({ lead: "Creșteri: 1 firmă", values: [{ label: "2024", value: "100 lei" }, { label: "→ 2025", value: "1.500 lei" }], unit: "" });
    expect(trendTotal(data, "new", firms)).toEqual({ lead: "Noi față de 2024: 2 firme", values: [{ label: null, value: "1.200 lei în 2025" }], unit: "" });
    expect(trendTotal(data, "first", firms)?.lead).toBe("Noi față de 2024 · prima dată în 2025: 1 firmă");
    expect(trendTotal(data, "gone", firms)).toEqual({ lead: "Nu mai apar în 2025: 1 firmă", values: [{ label: null, value: "50 lei în 2024" }], unit: "" });
    const percent = trendFixture({ composition: { ...data.composition, eligible: { count: 3, valueA: 3, valueB: 9 } } });
    expect(trendTotal(percent, "up", trendSpec({ change: "up", order: "percent", minBase: 1_000_000 }))?.lead).toBe("Creșteri de la cel puțin 1 mil. lei în 2024: 3 firme, din 1");
    const millions = trendFixture({ composition: { ...data.composition, up: { count: 1, valueA: 486_800_000, valueB: 1_600_000_000 } } });
    expect(trendTotal(millions, "up", firms)).toMatchObject({ values: [{ value: "486,8 mil." }, { value: "1,6 mld." }], unit: " lei" });
  });

  it("stars a partly covered year in every group's line, the one-year lines too (trend final §4.3, also on `whole`)", () => {
    const stars = partialStars(data, [{ year: 2025 }]);
    expect(trendTotal(data, "gone", firms, stars)).toMatchObject({ lead: "Nu mai apar în 2025*: 1 firmă", values: [{ value: "50 lei în 2024" }] });
    expect(trendTotal(data, "new", firms, stars)).toMatchObject({ lead: "Noi față de 2024: 2 firme", values: [{ value: "1.200 lei în 2025*" }] });
    expect(trendTotal(data, "up", firms, stars)?.values.map((v) => v.label)).toEqual(["2024", "→ 2025*"]);
    expect(trendTotal(data, "new", firms, partialStars(data, [{ year: 2024 }]))?.lead).toBe("Noi față de 2024*: 2 firme");
  });

  it("explains the growths in percent under their list, as a lead to check (trend final §3.9)", () => {
    const percent = trendFixture({ composition: { ...data.composition, eligible: { count: 3, valueA: 3, valueB: 9 } } });
    const term = percentTerm(percent, "up", trendSpec({ change: "up", order: "percent", minBase: 1_000_000 }))!;
    expect(term.text).toBe("Creșterea în procente");
    expect("text" in term.tip && term.tip.text).toBe("Procentul se calculează doar pentru firmele prezente în ambii ani, de la pragul ales (1 mil. lei în 2024). "
      + "Un salt de zeci de ori vine de obicei dintr-un singur contract sau dintr-o asociere: e un indiciu de verificat în surse, nu o concluzie.");
    const suppliers = percentTerm(trendFixture({ ...percent, noun: "furnizori" }), "up", trendSpec({ change: "up", order: "percent" }))!;
    expect("text" in suppliers.tip && suppliers.tip.text).toContain("furnizorii prezenți");
    expect(percentTerm(percent, "up", firms)).toBeNull();
    expect(percentTerm(data, "up", trendSpec({ change: "up", order: "percent" }))).toBeNull();
  });

  it("counts the rows the list leaves out", () => {
    expect(trendRest(data, "up", 1, firms)).toBeNull();
    expect(trendRest(data, "all", 5, firms)).toBe("o altă firmă");
    const many = trendFixture({ noun: "furnizori", composition: { ...data.composition, new: { count: 32, valueA: 0, valueB: 1 } } });
    expect(trendRest(many, "new", 10, firms)).toBe("alți 22 de furnizori");
  });

  it("says how many firms of the group an employees band leaves out", () => {
    expect(withoutFilingWords(trendFixture({ withoutFiling: { new: 5406 } }), "new")).toBe("Fără bilanț, nu intră: 5.406 firme");
    expect(withoutFilingWords(data, "new")).toBeNull();
  });
});

describe("the watch on a group and its sources", () => {
  it("follows a group (its members fixed at activation), never „Toate”; too large a group says how to narrow it", () => {
    expect(trendWatch(data, trendSpec({ change: "all" }))).toBeNull();
    expect(trendWatch(data, trendSpec())).toBeNull();
    expect(trendWatch(data, trendSpec({ change: "new" }))).toEqual({ label: "Urmărește grupa", blocked: null });
    const national = trendFixture({ composition: { ...data.composition, new: { count: 17_633, valueA: 0, valueB: 1 } } });
    expect(trendWatch(national, trendSpec({ change: "new" }))?.blocked).toBe("Grupa are 17.633 de firme; restrânge perioada sau locul.");
    expect(trendWatch(national, trendSpec({ change: "new" }, { dim: "authority" }))?.blocked).toBe("Grupa are 17.633 de instituții; restrânge perioada sau locul.");
    const empty = trendFixture({ composition: { ...data.composition, gone: { count: 0, valueA: 0, valueB: 0 } } });
    expect(trendWatch(empty, trendSpec({ change: "gone" }))?.blocked).toBe("Grupa nu are niciun membru în această selecție.");
    // In percent the watch fixes the growths from the base (the server's „eligible”).
    const percent = trendFixture({ composition: { ...data.composition, up: { count: 9_000, valueA: 1, valueB: 2 }, eligible: { count: 300, valueA: 1, valueB: 2 } } });
    expect(trendWatch(percent, trendSpec({ change: "up", order: "percent", minBase: 1_000_000 }))?.blocked).toBeNull();
  });

  it("blocks the drawer's „Urmărește această selecție” on a group's records over the same limit (DrillResult.group)", () => {
    expect(drawerWatchBlocked(trendSpec({ change: "new" }), { members: 17_633 })).toBe("Grupa are 17.633 de firme; restrânge perioada sau locul.");
    expect(drawerWatchBlocked(trendSpec({ change: "new" }, { dim: "county" }), { members: 0 })).toBe("Grupa nu are niciun membru în această selecție.");
    expect(drawerWatchBlocked(trendSpec({ change: "new" }), { members: 5_000 })).toBeNull();
    // A row's drawer, or any other question's: no group, nothing to block.
    expect(drawerWatchBlocked(trendSpec({ change: "new" }), undefined)).toBeNull();
  });

  it("says before activation what the watch fixes", () => {
    expect(trendWatchNote(trendSpec({ change: "new", firstOnly: true }))).toBe("Firmele grupei „Noi față de 2024 · prima dată în 2025” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.");
    expect(trendWatchNote(trendSpec({ change: "gone" }, { dim: "county" }))).toBe("Județele grupei „Nu mai apar în 2025” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.");
    // In percent the watch fixes the growths from the base: its name says the base (the server's „eligible”).
    expect(trendWatchNote(trendSpec({ change: "up", order: "percent" }))).toBe("Firmele grupei „Creșteri de la cel puțin 1 mil. lei în 2024” se fixează la activare; cele care intră sau ies din grupă apar doar ca notă.");
    expect(trendWatchNote(trendSpec())).toBeNull();
    expect(trendWatchNote({ ...trendSpec({ change: "up" }), block: "table" })).toBeNull();
  });

  it("names the group in its drawer, with its value of the selection's (DrillResult.group)", () => {
    expect(trendGroupHeader(trendSpec({ change: "new" }), { part: "new", members: 17_633, selection: { value: "141900000000.55" } }, "10960000000.1"))
      .toBe("Grupa „Noi față de 2024”: 17.633 de firme · 11 mld. lei din 141,9 mld. lei");
    expect(trendGroupHeader(trendSpec({ change: "up", order: "percent", minBase: 1_000_000 }), { part: "eligible", members: 1, selection: null }, "5"))
      .toBe("Grupa „Creșteri de la cel puțin 1 mil. lei în 2024”: 1 firmă · 5 lei");
    expect(trendGroupHeader(trendSpec({ change: "new", firstOnly: true }, { dim: "county" }), { part: "first", members: 2, selection: null }, "5"))
      .toBe("Grupa „Noi față de 2024 · prima dată în 2025”: 2 județe · 5 lei");
  });

  it("names the group in the shown CSV and its file", () => {
    expect(TREND_LIST_CSV).toEqual({ all: "toate", up: "cresteri", new: "noi", first: "prima-data", down: "scaderi", gone: "nu-mai-apar" });
  });

  it("says each group in one vocabulary: buttons, title, drawer header, watch and the CSV's grupa (F2-merge-fixes)", () => {
    // The title's word for each list: the sentence's phrase (defs/trend.ts TREND_CHANGE_PHRASE and the buttons' words).
    const titleWord: Record<TrendList, string> = { all: "schimbare", up: "creștere", new: "noi", first: "noi apar prima dată", down: "scădere", gone: "nu mai apar" };
    const buttons = new Map(trendButtons(data, firms)!.map((b) => [b.value, b.name]));
    for (const list of TREND_LISTS) {
      const spec = trendListSpec(firms, list);
      const part = specTrendPartLabel(spec);
      // The short name on its button (or under Noi) starts the part's name everywhere else.
      const short = list === "first" ? firstOptions(data, "first", spec)!.find((o) => o.value === "first")!.label : buttons.get(list)!;
      expect(short).toBe(list === "first" ? `${TREND_LIST_LABELS.first} în 2025` : TREND_LIST_LABELS[list]);
      expect(part.startsWith(list === "first" ? TREND_LIST_LABELS.new : TREND_LIST_LABELS[list])).toBe(true);
      if (list === "first") expect(part).toContain(short.toLocaleLowerCase("ro-RO"));
      expect(questionTitle(spec)).toContain(titleWord[list]);
      if (list !== "all") {
        expect(trendGroupHeader(spec, { part: list as Exclude<TrendList, "all">, members: 3, selection: null }, "5")).toBe(`Grupa „${part}”: 3 firme · 5 lei`);
        expect(watchedGroupLabel(spec as never)).toBe(`„${part}”`);
        expect(trendWatchNote(spec)).toContain(`„${part}”`);
      }
      const { text, filename } = answerCsv(data, spec, "T", { group: part, groupFile: TREND_LIST_CSV[list] });
      expect(text.split("\r\n")[1]).toContain(`"${part}"`);
      expect(filename).toBe(`t-${TREND_LIST_CSV[list]}.csv`);
    }
    // In percent the growths are those from the base, by that name in every place but the button.
    const percent = trendSpec({ change: "up", months: "auto", order: "percent", minBase: 1_000_000 });
    expect(specTrendPartLabel(percent)).toBe("Creșteri de la cel puțin 1 mil. lei în 2024");
    expect(watchedGroupLabel(percent as never)).toBe("„Creșteri de la cel puțin 1 mil. lei în 2024”");
    expect(buttons.get("up")).toBe("Creșteri");
  });
});
