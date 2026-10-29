import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BLOCK_FILTERS } from "../../../lib/ask/filters/blocks";
import { chooseValue } from "../../../lib/ask/filters/transition";
import type { QuestionSpec } from "../../../lib/ask/question-ui";
import ConditionRow from "./ConditionRow";
import Invitations from "./Invitations";
import Sentence from "./Sentence";
import UnderChips from "./UnderChips";
import { builderView, onlyExclusions, patchDraft, withoutExclusions } from "./view";
import { CURRENT_ROW, bandValues, bandsChoice, currentRow, firmsKindButton, firmsKindChoices, firmsKindSeatOptions, fromSeat, fromTab, fromTabs, listOptions, periodPresets, windowKind } from "./window-model";

/*
 * F1b-builder-a: the builder drawn from the registry (view.ts, window-model.ts)
 * and the kit's components fed with it, as markup (no browser: the live
 * behaviour is in the stage's Playwright notes). The seven questions of this
 * part: stat, table, timeseries, map, breakdown, compare, trend.
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): QuestionSpec => ({ measure: "value", filters: {}, ...spec } as QuestionSpec);
const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const RETIRED = ["Adaugă o condiție", "Mai multe filtre", "Număr minim de înregistrări", "Selecție precisă"];

const SEVEN: Record<string, QuestionSpec> = {
  stat: q({ block: "stat", filters: { cpvTerm: "medicamente", county: "Cluj", authorityKind: "spital", yearFrom: 2025, yearTo: 2025 } }),
  table: q({ block: "table", dim: "supplier", topN: 10, filters: { yearFrom: 2025, yearTo: 2025, minEmployees: 1, maxEmployees: 9 } }),
  timeseries: q({ block: "timeseries", filters: { authorityKind: "comuna", county: "Cluj" } }),
  map: q({ block: "map", filters: { yearFrom: 2025, yearTo: 2025 } }),
  breakdown: q({ block: "breakdown", filters: { authorityKind: "spital", county: "Cluj" } }),
  compare: q({ block: "compare", dim: "supplier", filters: { supplierName: "ERBASU", supplierId: 1, compareWith: "PORR", compareWithId: 2 } }),
  trend: q({ block: "trend", dim: "supplier", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 } }),
};

describe("the builder's view of a draft (P1, P2, P4, P5, P9)", () => {
  it("draws each of the seven questions from the registry: the sentence, its windows, nothing generic", () => {
    for (const [name, spec] of Object.entries(SEVEN)) {
      const view = builderView(spec);
      const markup = renderToStaticMarkup(createElement(Sentence, { tokens: view.sentence }));
      // Every phrase opens a window the view names, titled as R10 says.
      for (const token of view.sentence) if (token.kind === "slot") {
        expect(view.windows[token.id], `${name} ${token.id}`).toBeDefined();
        expect(markup).toContain(`aria-label="${token.slot}: ${token.value}"`);
      }
      const all = [markup, ...view.invites.map((i) => i.label), ...view.under.map((u) => JSON.stringify(u))].join(" ");
      for (const retired of RETIRED) expect(all, `${name}: ${retired}`).not.toContain(retired);
      expect(view.invites.length, name).toBeLessThanOrEqual(4);
      expect(view.scopeLine, name).toBe(false);
    }
  });

  it("reads as the finals say, with today's keys", () => {
    const sentence = (spec: QuestionSpec) => text(renderToStaticMarkup(createElement(Sentence, { tokens: builderView(spec).sentence })));
    expect(sentence(SEVEN.stat!)).toBe("Cât valorează achizițiile pentru „medicamente” făcute de spitalele din județul Cluj, în 2025?");
    // F3: the firms' employees are the row CÂȘTIGĂTORII under the sentence, not a phrase of it (plan §4.2).
    expect(sentence(SEVEN.table!)).toBe("Ce firme câștigă achizițiile făcute de instituțiile publice din toată țara, în 2025?");
    expect(builderView(SEVEN.table!).rows.map((r) => [r.label, r.kind, r.chips.map((c) => [c.label, c.active])])).toEqual([["Câștigătorii", "group", [["1–9 angajați", true]]]]);
    expect(sentence(SEVEN.compare!)).toBe("Compară ERBASU cu PORR la toate achizițiile, în toți anii.");
    expect(sentence(SEVEN.trend!)).toBe("Ce firme au cea mai mare schimbare între 2024 și 2025?");
    // P5 only where it changes the query.
    expect(builderView(SEVEN.table!).presentation.map((t) => t.kind === "slot" ? t.value : t.kind === "text" ? t.text : "").join("")).toBe("Arată primele 10, după valoarea înregistrată.");
    expect(builderView(SEVEN.stat!).presentation).toEqual([]);
  });

  it("invites the fragments the sentence does not show, named, in its order (P2)", () => {
    expect(builderView(SEVEN.stat!).invites.map((i) => i.label)).toEqual(["De la cine", "Mărimea achiziției"]);
    // F4: the firms' seat first, glued to the subject once set (kit §5.28). The size of purchase waits for a place, a
    // kind or a domain on a national ranking (S4 review: it read both marts whole), as in Cluj.
    expect(builderView(SEVEN.table!).invites.map((i) => i.label)).toEqual(["Sediul firmei", "Administrator", "Ce s-a cumpărat"]);
    const cluj = { ...SEVEN.table!, filters: { ...SEVEN.table!.filters, county: "Cluj" } };
    expect(builderView(cluj).invites.map((i) => i.label)).toEqual(["Sediul firmei", "Administrator", "Ce s-a cumpărat", "Mărimea achiziției"]);
    expect(builderView(SEVEN.trend!).invites.map((i) => i.label)).toEqual(["Ce s-a cumpărat", "Cine a cumpărat", "Ce fel de achiziții"]);
    const markup = renderToStaticMarkup(createElement(Invitations, { items: builderView(SEVEN.trend!).invites }));
    expect(text(markup)).toBe("+Ce s-a cumpărat+Cine a cumpărat+Ce fel de achiziții");
    // An invitation opens its own window (R10): "+ De la cine" asks "De la cine?".
    const from = builderView(SEVEN.stat!).invites[0]!;
    expect(builderView(SEVEN.stat!).windows[from.id]!.title).toBe("De la cine?");
  });

  it("puts a link's conditions under the sentence: applied ones as chips, refused ones blocking the run with the engine's reason", () => {
    const link = q({ block: "table", dim: "supplier", topN: 10, dataset: "contracts", minimumRecords: { role: "supplier", count: 5 }, filters: { singleBidder: true, county: "Cluj" } });
    const view = builderView(link);
    expect(view.under.map((u) => u.kind)).toEqual(["only", "legacy"]);
    expect(view.under[0]).toMatchObject({ label: "Selecție avansată: firme cu cel puțin 5 înregistrări în selecție" });
    expect(view.under[1]).toMatchObject({ words: "doar contractele cu o singură ofertă" });
    expect(view.refused).toEqual([]);
    const markup = renderToStaticMarkup(createElement(UnderChips, { items: view.under, onRemove: () => {} }));
    expect(text(markup)).toContain("Din link: doar contractele cu o singură ofertă");
    expect(markup).toContain('aria-label="Scoate «Din link: doar contractele cu o singură ofertă»"');

    const refused = builderView(q({ block: "trend", dim: "supplier", topN: 10, minimumRecords: { role: "supplier", count: 5 }, filters: { yearFrom: 2024, yearTo: 2025 } }));
    expect(refused.refused.map((c) => c.key)).toEqual(["minimumRecords"]);
    // The chip says why in a few words (S2 review, problem 4); the engine's paragraph stays its answer.
    expect(refused.refused[0]!.reason).toMatch(/^Filtrul «cel puțin N înregistrări»/);
    expect(refused.under).toEqual([expect.objectContaining({ kind: "legacy", tip: { title: "Din link", text: "Un prag de înregistrări nu se aplică diferenței dintre doi ani." } })]);
  });

  it("keeps another page's selection under its own label, not «Din link»", () => {
    const relation = q({ block: "stat", filters: { authorityId: 1, authorityName: "X" }, population: { operator: "or", groups: [
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"] }, { field: "supplier", op: "in", values: ["101"] }] },
      { operator: "and", conditions: [{ field: "authority", op: "in", values: ["1"] }, { field: "supplier", op: "in", values: ["102"] }] },
    ] } });
    expect(builderView(relation).under).toEqual([expect.objectContaining({ kind: "origin", prefix: "Selecția relației", words: "2 firme" })]);
  });

  it("reads exclusions as «Fără X», collapsed from three, and removes them one by one", () => {
    const one = q({ block: "map", population: { operator: "and", groups: [{ operator: "and", conditions: [{ field: "authority", op: "not_in", values: ["7"], labels: ["CJ Cluj"] }] }] } });
    expect(builderView(one).under).toEqual([{ kind: "exclude", id: "x:authority:7", label: "Fără CJ Cluj" }]);
    const three = q({ block: "map", population: { operator: "and", groups: [
      { operator: "and", conditions: [{ field: "supplier", op: "not_in", values: ["1", "2", "3"], labels: ["A", "B", "C"] }] },
      { operator: "and", conditions: [{ field: "value", op: "gte", value: "1000" }] },
    ] } });
    const view = builderView(three);
    expect(view.under.find((u) => u.kind === "exclude")).toEqual({ kind: "exclude", id: "x:supplier", label: "Fără 3 firme", collapsed: true });
    expect(windowKind(view.windows["x:supplier"]!)).toBe("exclusions");
    const fewer = withoutExclusions(three.population, [{ field: "supplier", value: "2" }]);
    expect(fewer?.groups[0]?.conditions[0]).toEqual({ field: "supplier", op: "not_in", values: ["1", "3"], labels: ["A", "C"] });
    expect(withoutExclusions(one.population, [{ field: "authority", value: "7" }])).toBeUndefined();
    // "Selecție avansată" without the rest of the precise selection keeps the exclusions.
    expect(onlyExclusions(three.population)).toEqual({ operator: "and", groups: [three.population!.groups[0]] });
  });

  it("draws the partners' row by role (P3b) with its chips' values", () => {
    const network = q({ block: "network", dim: "authority", filters: { authorityId: 1, authorityName: "Spitalul X", minEmployees: 1, maxEmployees: 9 } });
    const view = builderView(network);
    expect(view.rows).toEqual([{ label: "Furnizorii", kind: "selection", chips: [
      { key: "r:firmSeat", id: "firmSeat", label: "Sediul firmei", name: "Sediul firmei", active: false },
      { key: "r:employees", id: "employees", label: "1–9 angajați", name: "Angajați", active: true },
      { key: "r:networkSignals", id: "networkSignals", label: "Cu semnale", name: "Cu semnale", active: false, toggle: true },
      { key: "r:admin", id: "admin", label: "Administrator", name: "Administrator", active: false },
    ] }]);
    // F4: a set seat reads as its chip ("Cu sediul în alt județ"), the switch as pressed.
    const set = builderView(q({ ...network, filters: { ...network.filters, firmSeat: "other" }, network: { signals: true } }));
    expect(set.rows[0]!.chips.filter((c) => c.active).map((c) => c.label)).toEqual(["Cu sediul în alt județ", "1–9 angajați", "Cu semnale"]);
    const firm = builderView(q({ block: "sankey", dim: "supplier", filters: { supplierId: 2, supplierName: "PORR", authorityKind: "spital" } }));
    expect(firm.rows[0]!.label).toBe("Clienții");
    expect(firm.rows[0]!.chips.map((c) => c.label)).toEqual(["Județul instituției", "Spitale"]);
    const markup = renderToStaticMarkup(createElement(ConditionRow, { label: view.rows[0]!.label, kind: view.rows[0]!.kind, children: null }));
    expect(markup).toContain('aria-label="Furnizorii"');
    expect(markup).toContain("qb-row--select");
  });

  it("offers «⋯ › Selecție avansată» where P9 applies, never on a comparison", () => {
    expect(builderView(SEVEN.table!).advanced.map((s) => s.id)).toEqual(["population", "minimumRecords"]);
    expect(builderView(SEVEN.trend!).advanced.map((s) => s.id)).toEqual(["population"]);
    expect(builderView(SEVEN.compare!).advanced).toEqual([]);
    expect(builderView(SEVEN.table!).windows.advanced?.title).toBe("Selecție avansată");
  });

  it("opens a window from every chip under the sentence drawn as an opener, «Selecție avansată: …» included (F1b-tests)", async () => {
    // The browser check found «Selecție avansată: firme cu cel puțin 5 înregistrări în selecție» drawn with ▾ and opening nothing.
    const { legacyCorpus } = await import("../../../lib/ask/fixtures/legacy-corpus");
    const { FIXTURE_IDENTITIES } = await import("../../../lib/ask/fixtures/golden-fixture");
    const { restoreLink } = await import("../../../lib/ask/filters/restore");
    let openers = 0;
    for (const entry of legacyCorpus(FIXTURE_IDENTITIES)) {
      const restored = restoreLink(entry.spec);
      if (restored.kind !== "draft") continue;
      const view = builderView(restored.spec);
      for (const item of view.under) {
        const opener = item.kind === "only" || item.kind === "auto" || (item.kind === "exclude" && item.collapsed);
        if (!opener) continue;
        openers++;
        const win = view.windows[item.id];
        expect(win, `${entry.id} ${item.id}`).toBeDefined();
        if (item.id.startsWith("a:")) expect(windowKind(win!), entry.id).toBe("advanced");
      }
    }
    expect(openers).toBeGreaterThan(0);
    const leader = builderView({ block: "entity_card", dim: "supplier", measure: "value", rankBy: "value", minimumRecords: { role: "supplier", count: 5 }, filters: {} } as QuestionSpec);
    expect(leader.under.map((u) => u.id)).toContain("a:minimumRecords");
    expect(leader.windows["a:minimumRecords"]?.title).toBe("Selecție avansată");
  });

  it("writes a strip change into the draft alone (stripPatch)", () => {
    const draft = q({ block: "breakdown", filters: { yearFrom: 2023, yearTo: 2025 } });
    expect(patchDraft(draft, { path: "dataset", value: "da" })).toEqual({ ...draft, dataset: "da", filters: draft.filters });
    expect(patchDraft(draft, { path: "measure", value: "count" }).measure).toBe("count");
    expect(draft.dataset).toBeUndefined();
  });
});

describe("the windows (component 9 and the composed pickers)", () => {
  const win = (spec: QuestionSpec, label: string) => {
    const view = builderView(spec);
    const token = view.sentence.find((t) => t.kind === "slot" && t.slot === label);
    if (!token || token.kind !== "slot") throw new Error(`no phrase ${label}`);
    return view.windows[token.id]!;
  };

  it("open the control of their place", () => {
    expect(windowKind(win(SEVEN.table!, "Ce clasăm"))).toBe("subject");
    expect(windowKind(win(SEVEN.stat!, "Cine a cumpărat"))).toBe("buyer");
    expect(windowKind(win(SEVEN.stat!, "Unde"))).toBe("place");
    expect(windowKind(win(SEVEN.stat!, "Perioada"))).toBe("period");
    expect(windowKind(win(SEVEN.stat!, "Ce s-a cumpărat"))).toBe("cpv");
    expect(windowKind(win(SEVEN.stat!, "Achizițiile"))).toBe("list");
    expect(windowKind(builderView(SEVEN.table!).windows["r:employees"]!)).toBe("employees");
    expect(windowKind(win(SEVEN.compare!, "Despre cine"))).toBe("focal");
    expect(windowKind(win(SEVEN.compare!, "Cu cine comparăm"))).toBe("compareWith");
    expect(windowKind(win(SEVEN.timeseries!, "Ce măsori"))).toBe("list");
    expect(fromTabs(builderView(SEVEN.stat!).windows[builderView(SEVEN.stat!).invites[0]!.id]!)).toEqual(["supplier", "admin", "employees"]);
  });

  // F2-sentence: the phrase of the change opens "Ce fel de schimbare?" (trend final §3.1); the window's other words are the builder part's.
  it("list a trend's changes with their rules, the group noun after the selection, the current one checked", () => {
    const changes = (spec: QuestionSpec) => listOptions(win(spec, "Felul schimbării"), spec);
    const legacy = changes(SEVEN.trend!);
    expect(win(SEVEN.trend!, "Felul schimbării").title).toBe("Ce fel de schimbare?");
    expect(legacy.options.map((o) => [o.label, o.detail])).toEqual([
      ["Creștere", "În ambii ani, mai mult în 2025."], ["Firme noi", "Nicio înregistrare în 2024, cel puțin una în 2025."],
      ["Scădere", "În ambii ani, mai puțin în 2025."], ["Nu mai apar", "Înregistrări în 2024, niciuna în 2025."], ["Toate schimbările", "Toate grupurile, după diferența în lei."],
    ]);
    // An old link without the key is every change.
    expect(legacy.value).toBe('"all"');
    const clients = changes(q({ ...SEVEN.trend!, dim: "authority", filters: { yearFrom: 2024, yearTo: 2025, supplierName: "DR.MAX", supplierId: 8 }, trend: { change: "new" } }));
    expect(clients.options.find((o) => o.value === '"new"')?.label).toBe("Clienți noi");
    expect(clients.value).toBe('"new"');
    // The counties' new and gone are sure to be empty without a firm or a domain: not offered (trend final §3.1).
    expect(changes(q({ ...SEVEN.trend!, dim: "county" })).options.map((o) => o.label)).toEqual(["Creștere", "Scădere", "Toate schimbările"]);
    // Each change with the square of its button in the answer: the sentence's word, the window and the buttons are one control.
    expect(legacy.options.map((o) => o.swatch)).toEqual(["up", "new", "down", "gone", "all"]);
    // New institutions without a chosen firm: often an old one under another identity (trend final §3.1).
    const institutions = changes(q({ ...SEVEN.trend!, dim: "authority", filters: { yearFrom: 2024, yearTo: 2025 }, trend: { change: "new" } }));
    expect(institutions.options.find((o) => o.value === '"new"')).toMatchObject({ label: "Instituții noi",
      detail: "Nicio înregistrare în 2024, cel puțin una în 2025. Des: reorganizări, asociații, beneficiari privați." });
    expect(clients.options.find((o) => o.value === '"new"')?.detail).toBe("Nicio înregistrare în 2024, cel puțin una în 2025.");
    // Across other years only the year without records is sure (trend final §1).
    const apart = changes(q({ ...SEVEN.trend!, filters: { yearFrom: 2023, yearTo: 2025 }, trend: { change: "new" } }));
    expect(apart.options.map((o) => o.label)).toEqual(["Creștere", "Firme fără înregistrări în 2023", "Scădere", "Fără înregistrări în 2025", "Toate schimbările"]);
  });

  it("list the stream as the kit names it, the current one checked", () => {
    const { options, value } = listOptions(win(SEVEN.stat!, "Achizițiile"), SEVEN.stat!);
    expect(options.map((o) => [o.label, o.detail])).toEqual([["Toate achizițiile", "Directe și din proceduri"], ["Achizițiile directe", "Fără licitație"], ["Contractele din proceduri", "Licitații și alte proceduri"]]);
    expect(value).toBe('"all"');
  });

  it("start the buyer's window with «Toate instituțiile publice» and show a one-row ranking disabled with its reason (R1)", () => {
    const kinds = listOptions(win(SEVEN.stat!, "Cine a cumpărat"), SEVEN.stat!, "authorityKind");
    expect(kinds.options[0]).toMatchObject({ label: "Toate instituțiile publice", detail: "inclusiv companii de stat și utilități" });
    expect(kinds.options.map((o) => o.label).slice(1)).toEqual(["Primării de comună", "Primării de oraș și municipiu", "Consilii județene", "Spitale", "Școli"]);
    expect(kinds.value).toBe('"spital"');
    // Choosing the first row clears the whole window: the institutions, whatever the kind.
    const cleared = chooseValue(SEVEN.stat!, win(SEVEN.stat!, "Cine a cumpărat").slot, kinds.options[0]!.choice);
    expect(cleared.spec.filters.authorityKind).toBeUndefined();

    const inCluj = q({ block: "table", dim: "supplier", topN: 10, filters: { county: "Cluj" } });
    const subject = listOptions(win(inCluj, "Ce clasăm"), inCluj);
    expect(subject.options.find((o) => o.label === "Județe")).toMatchObject({ disabled: "Scoate județul ca să clasezi județele.", group: "Județe" });
    expect(subject.options.map((o) => o.group)).toContain("Instituții");
  });

  it("say the period presets with their years, the current year with how far its data go (kit §4)", () => {
    const span = { from: "2018-04-02", to: "2026-09-25" };
    const { presets, value } = periodPresets(SEVEN.stat!, span, 2026);
    expect(presets.map((p) => [p.label, p.detail ?? ""])).toEqual([["2026", "până la 25 sept."], ["2025", ""], ["Ultimii 3 ani compleți", "2023–2025"], ["Toți anii", "apr. 2018 – 25 sept. 2026"]]);
    expect(value).toBe("previous");
    expect(periodPresets(q({ block: "map", filters: { yearFrom: 2026, yearTo: 2026 } }), null, 2026).value).toBe("current");
    expect(periodPresets(SEVEN.timeseries!, null, 2026).value).toBe("all");
    const trend = periodPresets(SEVEN.trend!, span, 2026);
    expect(trend.presets[0]).toMatchObject({ label: "2024 și 2025", period: { yearFrom: 2024, yearTo: 2025 } });
    expect(trend.value).toBe("pair-1");
    // A verification's "Când?" (final fact_check §3.1): "Până acum" first, the sentence's default, which writes no year.
    const fact = periodPresets(q({ block: "fact_check", filters: { authorityId: 1, supplierId: 2 } }), span, 2026);
    expect(fact.presets.map((p) => p.label)).toEqual(["Până acum", "Ultimii 3 ani compleți", "2026", "2025"]);
    expect(fact.presets[0]!.period).toBeUndefined();
    expect(fact.value).toBe("all");
  });

  it("lead a searched window with its current choice, checked, so it is never «nothing chosen»", () => {
    expect(currentRow("place", SEVEN.stat!)).toMatchObject({ value: CURRENT_ROW, label: "Județul Cluj" });
    expect(currentRow("place", q({ block: "stat", filters: { county: "București" } }))?.label).toBe("București");
    expect(currentRow("place", q({ block: "stat", filters: {} }))).toBeNull();
    expect(currentRow("buyer", q({ block: "stat", filters: { authorityName: "MUNICIPIUL BUZAU", authorityId: 7 } }))?.label).toBe("MUNICIPIUL BUZAU");
    expect(currentRow("buyer", q({ block: "stat", filters: { uatSiruta: 54975, uatName: "Municipiul Cluj-Napoca (Cluj)" } }))?.label).toBe("Primăria Cluj-Napoca");
    expect(currentRow("cpv", SEVEN.stat!)?.label).toBe("„medicamente”");
    expect(currentRow("cpv", q({ block: "stat", filters: { cpvTerm: "45" } }))?.label).toBe("CPV 45");
    const from = q({ block: "stat", filters: { supplierName: "URBAN SCOPE", supplierId: 3 } });
    expect(currentRow("from", from, ["supplier", "admin", "employees"])?.label).toBe("URBAN SCOPE");
    expect(currentRow("from", SEVEN.table!, ["supplier", "admin", "employees"])?.label).toBe("Firme cu 1–9 angajați");
    expect(currentRow("from", q({ block: "stat", filters: { adminName: "ION", adminPersonKey: "k" } }), ["supplier", "admin"])?.label).toBe("Firmele conduse azi de ION");
  });

  it("hold the sellers' seat in „De la cine › Ce fel de firme” on institutions (S4r-from-seat): tab, current row, chips, button", () => {
    const institutions = q({ block: "table", dim: "authority", topN: 10, filters: { county: "Cluj" } });
    const view = builderView(institutions);
    const invite = view.windows[view.invites.find((i) => i.label === "De la cine")!.id]!;
    expect([fromTabs(invite), fromSeat(invite), fromTab(invite, institutions)]).toEqual([["supplier", "admin", "employees"], true, "supplier"]);
    // The total's tab keeps the size alone.
    const stat = builderView(SEVEN.stat!);
    expect(fromSeat(stat.windows[stat.invites[0]!.id]!)).toBe(false);
    const seated = q({ block: "table", dim: "authority", topN: 10, filters: { county: "Cluj", firmSeat: "other" } });
    const phrase = win(seated, "De la cine");
    expect([fromSeat(phrase), fromTab(phrase, seated), currentRow("from", seated, fromTabs(phrase), true)?.label]).toEqual([true, "employees", "Firme cu sediul în alt județ"]);
    expect(firmsKindSeatOptions(seated, false).map((o) => [o.label, o.disabled ?? ""])).toEqual([["Oriunde", ""], ["În județul Cluj", ""], ["În alt județ", ""], ["În străinătate", ""]]);
    // Beside a band, abroad says why: a foreign firm has no filing.
    expect(firmsKindSeatOptions(seated, true)[3]!.disabled).toBe("Firmele străine nu au bilanț și nici număr la Registrul Comerțului. Scoate angajații sau alege alt sediu.");
    expect(firmsKindButton(seated, bandsChoice(["1-9"]), "other")).toBe("Firme cu 1–9 angajați, cu sediul în alt județ");
    expect(firmsKindButton(seated, bandsChoice([]), "same")).toBe("Firme cu sediul în județul Cluj");
    expect(firmsKindButton(seated, bandsChoice([]), "none")).toBe("Orice firmă");
    expect(firmsKindChoices(bandsChoice([]), "none")).toEqual([{ filter: "employees", value: undefined }, { filter: "firmSeat", value: undefined }]);
  });

  it("count a year whose data reach 31 Dec as complete («compleți»: without a year still running)", () => {
    const span = { from: "2018-04-02", to: "2025-12-31" };
    const stat = periodPresets(SEVEN.stat!, span, 2026).presets;
    expect(stat.map((p) => [p.label, p.detail ?? ""])).toEqual([["2025", ""], ["2024", ""], ["Ultimii 3 ani compleți", "2023–2025"], ["Toți anii", "apr. 2018 – 31 dec. 2025"]]);
    const trend = periodPresets(SEVEN.trend!, span, 2026).presets;
    expect(trend.map((p) => [p.label, p.detail ?? ""])).toEqual([["2024 și 2025", "ultimii doi ani compleți"], ["2023 și 2024", ""]]);
  });

  it("never count the calendar year as complete before the archive's span is read", () => {
    const fact = periodPresets(q({ block: "fact_check", filters: { authorityId: 1, supplierId: 2 } }), null, 2026).presets;
    expect(fact.map((p) => [p.label, p.detail ?? ""])).toEqual([["Până acum", ""], ["Ultimii 3 ani compleți", "2023–2025"], ["2026", ""], ["2025", ""]]);
    expect(periodPresets(SEVEN.trend!, null, 2026).presets[0]).toMatchObject({ label: "2024 și 2025", detail: "ultimii doi ani compleți" });
  });

  it("give a trend the complete years of its default (every channel's «complet până la», trend final §3.2), not of the data's last day", () => {
    const periods = (until: string | null) => ({ da: { from: "2018-04-02", to: "2027-01-20", completeUntil: "2027-01-15" }, contracts: { from: "2018-01-03", to: "2027-01-20", completeUntil: until } });
    const span = { from: "2018-04-02", to: "2027-01-20" };
    // January 2027, December's contracts not complete yet: the default stays 2024 → 2025, and 2026 is on the same months.
    const january = periodPresets(SEVEN.trend!, span, 2027, periods("2026-11-30"));
    expect(january.presets.map((p) => [p.label, p.detail ?? ""])).toEqual([["2024 și 2025", "ultimii doi ani compleți"], ["2025 și 2026", "pe aceleași luni"], ["2023 și 2024", ""]]);
    // Once they are: 2025 → 2026 is complete, and January 2027 runs on the same months.
    const march = periodPresets(SEVEN.trend!, span, 2027, periods("2027-01-15"));
    expect(march.presets.map((p) => [p.label, p.detail ?? ""])).toEqual([["2025 și 2026", "ultimii doi ani compleți"], ["2026 și 2027", "pe aceleași luni · 2027: până la 20 ian."], ["2024 și 2025", ""]]);
    // Without the periods: the data's last day, as before.
    expect(periodPresets(SEVEN.trend!, span, 2027).presets[0]).toMatchObject({ label: "2025 și 2026" });
  });

  it("give the year chart intervals only, none before 2018 (plan §4.3, final timeseries §3.7)", () => {
    const span = { from: "2018-04-02", to: "2026-09-25", first: "2000-01-06" };
    const { presets, value } = periodPresets(SEVEN.timeseries!, span, 2026);
    expect(presets.map((p) => [p.label, p.detail ?? ""])).toEqual([["Toți anii", "apr. 2018 – 25 sept. 2026"], ["Ultimii 5 ani compleți", "2021–2025"], ["Ultimii 3 ani compleți", "2023–2025"]]);
    expect(presets[1]!.period).toEqual({ yearFrom: 2021, yearTo: 2025 });
    expect(value).toBe("all");
    expect(periodPresets(SEVEN.timeseries!, { from: "2018-04-02", to: "2020-05-01" }, 2020).presets[1]).toMatchObject({ detail: "2018–2019" });
  });

  it("choose employees on the kit's bands, an old link's range on none", () => {
    expect(bandValues(SEVEN.table!)).toEqual(["1-9"]);
    expect(bandsChoice(["1-9", "10-49"])).toEqual({ filter: "employees", value: { minEmployees: 1, maxEmployees: 49 } });
    expect(bandsChoice(["250+"])).toEqual({ filter: "employees", value: { minEmployees: 250 } });
    expect(bandsChoice([])).toEqual({ filter: "employees", value: undefined });
    expect(bandValues(q({ block: "table", dim: "supplier", filters: { maxEmployees: 4 } }))).toEqual([]);
  });

  it("cover every place BLOCK_FILTERS offers on the seven questions", () => {
    for (const [name, spec] of Object.entries(SEVEN)) {
      const view = builderView(spec);
      for (const target of Object.values(view.windows)) expect(windowKind(target), `${name} ${target.key}`).toMatch(/^(subject|focal|buyer|from|period|cpv|place|seat|locality|employees|admin|compareWith|list|advanced|exclusions|size)$/);
      expect(BLOCK_FILTERS[spec.block as keyof typeof BLOCK_FILTERS]).toBeDefined();
    }
  });
});
