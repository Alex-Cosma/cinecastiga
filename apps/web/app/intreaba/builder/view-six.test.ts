import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PROFILE_REFUSAL, TREND_REFUSALS } from "../../../lib/ask/filters/legacy-conditions";
import { choicesOf } from "../../../lib/ask/filters/pickers";
import { chooseValue } from "../../../lib/ask/filters/transition";
import type { FilterSpec } from "../../../lib/ask/filters/types";
import type { QuestionSpec } from "../../../lib/ask/question-ui";
import Sentence from "./Sentence";
import OptionList from "./pickers/OptionList";
import { builderView, type BuilderWindowSpec } from "./view";
import { listOptions, windowKind, windowTip, OTHER_INSTITUTIONS } from "./window-model";

/*
 * F1b-builder-b: the other six questions drawn from the registry (view.ts,
 * window-model.ts): network, sankey, fact_check, distribution, scatter and
 * "Cine conduce?". The relations' partner rows, the verification's pair, the
 * profiles' line and their subject, the comparison group, the axis and its
 * parked row, the fixed phrase. The live behaviour is in the stage's
 * Playwright notes (S2-F1b/F1b-builder-b.md).
 */

const q = (spec: Partial<QuestionSpec> & { block: string }): QuestionSpec => ({ measure: "value", filters: {}, ...spec } as QuestionSpec);
const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sentence = (spec: QuestionSpec) => text(renderToStaticMarkup(createElement(Sentence, { tokens: builderView(spec).sentence })));
const RETIRED = ["Adaugă o condiție", "Mai multe filtre", "Număr minim de înregistrări", "Selecție precisă"];
const BUZAU = { authorityName: "MUNICIPIUL BUZAU", authorityId: 2144364 };
const URBAN = { supplierName: "URBAN SCOPE", supplierId: 2064733 };
const PORR = { supplierName: "PORR CONSTRUCT", supplierId: 22 };

const SIX: Record<string, QuestionSpec> = {
  network: q({ block: "network", dim: "authority", filters: { ...BUZAU } }),
  sankey: q({ block: "sankey", dim: "supplier", filters: { ...PORR, yearFrom: 2024, yearTo: 2025 } }),
  fact_check: q({ block: "fact_check", filters: { ...BUZAU, ...URBAN } }),
  distribution: q({ block: "distribution", dim: "authority", filters: { ...BUZAU } }),
  scatter: q({ block: "scatter", dim: "authority", rankBy: "risk", filters: { authorityKind: "consiliu_judetean" } }),
  entity_card: q({ block: "entity_card", dim: "supplier", rankBy: "value", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 } }),
};
/** The window of the phrase a reader names "{slot}". */
const win = (spec: QuestionSpec, label: string): BuilderWindowSpec => {
  const view = builderView(spec);
  const token = view.sentence.find((t) => t.kind === "slot" && t.slot === label);
  if (!token || token.kind !== "slot") throw new Error(`no phrase ${label}`);
  return view.windows[token.id]!;
};

describe("the six questions from the registry (F1b-builder-b)", () => {
  it("draw their sentence and windows, nothing generic, the profile line on the profiles only", () => {
    for (const [name, spec] of Object.entries(SIX)) {
      const view = builderView(spec);
      const markup = renderToStaticMarkup(createElement(Sentence, { tokens: view.sentence }));
      for (const token of view.sentence) if (token.kind === "slot") {
        expect(view.windows[token.id], `${name} ${token.id}`).toBeDefined();
        expect(windowKind(view.windows[token.id]!), `${name} ${token.id}`).toMatch(/^(subject|focal|buyer|from|peers|period|cpv|place|locality|employees|admin|compareWith|list)$/);
      }
      const all = [markup, ...view.invites.map((i) => i.label), ...view.rows.flatMap((r) => r.chips.map((c) => c.label))].join(" ");
      for (const retired of RETIRED) expect(all, `${name}: ${retired}`).not.toContain(retired);
      expect(view.invites.length, name).toBeLessThanOrEqual(4);
      expect(view.scopeLine, name).toBe(["distribution", "scatter"].includes(name));
    }
    expect(builderView(q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: {} })).scopeLine).toBe(true);
  });

  it("read as the finals say, with today's keys", () => {
    expect(sentence(SIX.network!)).toBe("Cu cine lucrează MUNICIPIUL BUZAU, în toți anii?");
    expect(sentence(q({ block: "sankey", dim: "authority", filters: { ...BUZAU } }))).toBe("Ce cumpără MUNICIPIUL BUZAU și de la cine, în toți anii?");
    expect(sentence(SIX.sankey!)).toBe("Cine cumpără ce de la PORR CONSTRUCT, în 2024–2025?");
    expect(sentence(SIX.fact_check!)).toBe("A cumpărat MUNICIPIUL BUZAU de la URBAN SCOPE până acum?");
    expect(sentence(SIX.distribution!)).toBe("Unde se situează MUNICIPIUL BUZAU după indicele de risc, față de toate instituțiile publice?");
    // A county council has one per county: "din toată țara" is a fixed phrase, text and not a button (component 1b).
    const councils = renderToStaticMarkup(createElement(Sentence, { tokens: builderView(SIX.scatter!).sentence }));
    expect(text(councils.replace(/<span class="term[\s\S]*?<\/span><\/span>(?=<\/span>)/, ""))).toBe("Ce consilii județene din toată țara ies din tipar după risc și valoarea achizițiilor directe?");
    expect(councils).toContain('<span class="fk-phrase fk-phrase--fixed"><span>din toată țara</span></span>');
    // Its (?) says why it cannot change (plan §4.12, final scatter).
    expect(builderView(SIX.scatter!).sentence.find((t) => t.kind === "fixed")).toEqual({ kind: "fixed", text: "din toată țara", tip: "Un consiliu pe județ." });
    expect(councils).toContain("Un consiliu pe județ.");
    expect(sentence(q({ block: "scatter", dim: "supplier", rankBy: "risk", filters: { county: "Buzău" } }))).toBe("Ce firme cu sediul în județul Buzău ies din tipar după risc și valoarea achizițiilor directe?");
    expect(sentence(SIX.entity_card!)).toBe("Care firmă câștigă cel mai mult din achizițiile pentru „medicamente” făcute de instituțiile publice din toată țara, în 2025?");
    expect(sentence(q({ block: "entity_card", dim: "supplier", rankBy: "risk", filters: { county: "Cluj" } }))).toBe("Care firmă cu sediul în județul Cluj are cel mai ridicat indice de risc?");
  });

  it("draw the partners by role: the network's firms by size and person, the flow's by size, the clients by place and kind (P3b)", () => {
    expect(builderView(SIX.network!).rows.map((r) => [r.label, r.kind, r.chips.map((c) => c.name)])).toEqual([["Furnizorii", "selection", ["Angajați", "Administrator"]]]);
    // The flow's final leaves the person to the network and the verification: a link's person is its chip.
    const flow = q({ block: "sankey", dim: "authority", filters: { ...BUZAU, adminPersonKey: "k", adminName: "ION" } });
    expect(builderView(flow).rows.map((r) => r.chips.map((c) => c.name))).toEqual([["Angajați"]]);
    expect(builderView(flow).under).toEqual([expect.objectContaining({ kind: "legacy", words: "firmele conduse azi de ION" })]);
    const clients = builderView(q({ block: "sankey", dim: "supplier", filters: { ...PORR, county: "Ilfov" } }));
    expect(clients.rows[0]!.chips.map((c) => [c.label, c.active])).toEqual([["Județul Ilfov", true], ["Tipul instituției", false]]);
    // Only the domain is invited: the stream is the strip's.
    expect(builderView(SIX.network!).invites.map((i) => i.label)).toEqual(["Ce s-a cumpărat"]);
  });

  it("keep the verification's pair: each phrase searches one entity, without an «any» row (R1)", () => {
    for (const label of ["Cine a cumpărat", "De la cine"]) {
      const target = win(SIX.fact_check!, label);
      expect(windowKind(target), label).toBe("focal");
      expect(target.slot.required, label).toBe(true);
      expect(choicesOf(target.slot, SIX.fact_check as FilterSpec).some((c) => c.value === undefined), label).toBe(false);
    }
    expect(builderView(SIX.fact_check!).invites.map((i) => i.label)).toEqual(["Ce s-a cumpărat", "Ce fel de achiziții"]);
  });

  it("open «Față de cine?» on the group with today's keys: a kind and a county for institutions, the seat for firms", () => {
    const group = win(SIX.distribution!, "Față de cine");
    expect([windowKind(group), group.title]).toEqual(["peers", "Față de cine?"]);
    const kinds = listOptions(group, SIX.distribution!, "authorityKind");
    expect(kinds.options.map((o) => o.label)).toEqual(["Toate instituțiile publice", "Primării de comună", "Primării de oraș și municipiu", "Consilii județene", "Spitale", "Școli"]);
    expect(kinds.rest).toEqual([{ label: OTHER_INSTITUTIONS, after: kinds.options.at(-1)!.value }]);
    const chosen = chooseValue(SIX.distribution!, group.slot, { filter: "county", value: "Buzău" });
    expect(sentence(chosen.spec)).toBe("Unde se situează MUNICIPIUL BUZAU după indicele de risc, față de instituțiile publice din județul Buzău?");
    const firm = q({ block: "distribution", dim: "supplier", filters: { ...URBAN, county: "Bucuresti" } });
    expect(sentence(firm)).toBe("Unde se situează URBAN SCOPE după indicele de risc, față de firmele cu sediul în București?");
    expect(win(firm, "Față de cine").slot.writes ?? []).toEqual([]);
    expect(windowTip(group, SIX.distribution!)).toMatchObject({ title: "Grupul de comparație" });
  });

  it("list the risk cloud's institutions first, with the rest that cannot be chosen, every kind offered after D1", () => {
    const who = listOptions(win(SIX.scatter!, "Cine"), SIX.scatter!);
    expect(who.options.map((o) => [o.group, o.label])).toEqual([
      ["Instituții publice", "Toate instituțiile publice"], ["Instituții publice", "Primării de comună"], ["Instituții publice", "Primării de oraș și municipiu"],
      ["Instituții publice", "Consilii județene"], ["Instituții publice", "Spitale"], ["Instituții publice", "Școli"], ["Firme", "Firme"],
    ]);
    expect(who.rest).toEqual([{ label: OTHER_INSTITUTIONS, after: who.options[5]!.value }]);
    expect(windowTip(win(SIX.scatter!, "Cine"), SIX.scatter!)).toMatchObject({ title: "Tipul instituției" });
    // The rest row sits under the last kind, before the firms, and takes no focus.
    const markup = renderToStaticMarkup(createElement(OptionList, { label: "Cine", options: who.options, value: who.value, rest: who.rest! }));
    expect(text(markup).indexOf(OTHER_INSTITUTIONS)).toBeLessThan(text(markup).lastIndexOf("Firme"));
    expect(markup).toMatch(/<div class="fk-opt fk-opt--rest">/);
  });

  it("speak «Cine conduce?» in the singular, and say what each axis changes", () => {
    const rivals = listOptions(win(SIX.entity_card!, "Cine concurează"), SIX.entity_card!);
    expect(rivals.options.map((o) => o.label)).toEqual(["Firmă", "Orice instituție publică", "Primărie de comună", "Primărie de oraș sau municipiu", "Consiliu județean", "Spital", "Școală"]);
    expect(rivals.rest).toBeUndefined();
    const axis = win(SIX.entity_card!, "Ce cauți");
    expect(listOptions(axis, SIX.entity_card!).options.map((o) => [o.label, o.detail])).toEqual([
      ["Câștigă cel mai mult", "Valoarea înregistrată, în perioada aleasă."],
      ["Are cel mai ridicat indice de risc", "Tot istoricul, doar achiziții directe. Perioada, domeniul și cumpărătorul nu se aplică."],
    ]);
    expect(windowTip(axis, SIX.entity_card!)).toEqual({ title: "Indicele de risc", text: "Un semnal statistic, nu o dovadă." });
    // Value → index parks the period and the domain (component 6); the spec carries none of them.
    const risk = chooseValue(SIX.entity_card!, axis.slot, { filter: "rankBy", value: "risk" });
    expect(risk.parked?.items.map((i) => i.label)).toEqual(["„medicamente”", "2025"]);
    expect(builderView(risk.spec).scopeLine).toBe(true);
  });

  it("let institutions compete in a county, never in a town hall; the firms' buyer still finds one", () => {
    const halls = q({ block: "entity_card", dim: "authority", rankBy: "value", filters: { authorityKind: "comuna", county: "Cluj" } });
    expect(win(halls, "Unde").slot.writes ?? []).toEqual([]);
    expect(win(SIX.entity_card!, "Unde").slot.writes).toEqual(["locality"]);
  });

  it("say a profile's refusal short, with «Scoate condițiile din link»'s chip", () => {
    const view = builderView(q({ block: "scatter", dim: "authority", rankBy: "risk", filters: { yearFrom: 2024, yearTo: 2024 } }));
    expect(view.refused.map((c) => [c.key, c.why])).toEqual([["period", PROFILE_REFUSAL]]);
    expect(view.under).toEqual([expect.objectContaining({ kind: "legacy", words: "în 2024", tip: { title: "Din link", text: PROFILE_REFUSAL } })]);
    // A trend's threshold too (S3 F2-builder: the S2 review's problem 4); elsewhere the engine's words stay.
    const trend = builderView(q({ block: "trend", dim: "supplier", topN: 10, minimumRecords: { role: "supplier", count: 5 }, filters: { yearFrom: 2024, yearTo: 2025 } }));
    expect(trend.refused.map((c) => [c.key, c.why])).toEqual([["minimumRecords", TREND_REFUSALS.minimumRecords]]);
    const table = builderView(q({ block: "table", dim: "county", topN: 10, filters: { county: "Cluj" } }));
    expect(table.refused.map((c) => c.why)).toEqual([undefined]);
  });

  it("offer «⋯ › Selecție avansată» on the relations and the verification, never on a profile", () => {
    for (const name of ["network", "sankey", "fact_check"]) expect(builderView(SIX[name]!).advanced.map((s) => s.id), name).toEqual(["population"]);
    for (const name of ["distribution", "scatter"]) expect(builderView(SIX[name]!).advanced, name).toEqual([]);
    expect(builderView(SIX.entity_card!).advanced.map((s) => s.id)).toEqual(["population", "minimumRecords"]);
  });
});
