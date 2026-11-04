import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EntityCardData } from "../../lib/ask/compile";
import type { LegacyTies, Podium, RiskRanking } from "../../lib/ask/entity-card-shared";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import { answerCsv } from "./answer-csv";
import { AnswerEvidence } from "./AnswerEvidence";
import EntityCardAnswer from "./EntityCardAnswer";

/*
 * „Cine conduce?” (entity_card-3; entity_card-2: final entity_card §3.9–§3.10, §4.1, frames C, E, F) as markup: the
 * podium's place 1 with its three figures, the bar and its legend, places 2 and 3 as rows, the total line and the two
 * buttons; on the risk axis the first profiles by the risk score with their places, score pills and patterns, „Arată
 * toate” and „Pe harta riscului ›”; an answer stored as entity_card-2 (the group at the top of the old index) as it was;
 * a group of one, and an answer stored before entity_card-2. The facts of the places, the focus and the sheets are
 * checked in the browser (par-f6c/screens).
 */

const text = (markup: string) => markup.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>(<\/span>)?/g, " ").replace(/<span class="term-mark"[^>]*>\?<\/span>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").replace(/ ([,.:;])/g, "$1").trim();
const render = (data: { card: EntityCardData; podium?: Podium; ranking?: RiskRanking; ties?: LegacyTies }, spec: QuestionSpec, historical: boolean, conditions: string[] = []) =>
  renderToStaticMarkup(createElement(AnswerEvidence.Provider, { value: { open: vi.fn(), exclude: vi.fn() } },
    createElement(EntityCardAnswer, { data, spec, historical, conditions }) as ReactNode));

const card = (extra: Partial<EntityCardData> = {}): EntityCardData => ({
  entityId: "1", name: "ALLIANCE HEALTHCARE ROMANIA", county: "Bucuresti", role: "supplier", value: 5_577_504_292, count: 13_669, cri: null, nFlags: 0, flags: [], population: null, ...extra,
});
const PODIUM: Podium = {
  version: 2,
  places: [
    { entityId: "1", name: "ALLIANCE HEALTHCARE ROMANIA", county: "Bucuresti", value: 5_577_504_292, count: 13_669 },
    { entityId: "2", name: "DR.MAX", county: "Ilfov", value: 4_365_849_439, count: 16_671 },
    { entityId: "3", name: "FARMEXIM S.A.", county: "Bucuresti", value: 3_494_973_799, count: 25_590 },
  ],
  total: { value: 26_459_251_841, count: 236_891, entities: 1_467 },
};
const valueSpec: QuestionSpec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { cpvTerm: "medicamente", yearFrom: 2025, yearTo: 2025 } };

describe("by value: the podium", () => {
  it("draws place 1 with its figures, the lead over place 2 and the bar of the three places against the total", () => {
    const markup = render({ card: card(), podium: PODIUM }, valueSpec, false);
    const words = text(markup);
    expect(words).toContain("ALLIANCE HEALTHCARE ROMANIA");
    expect(words).toContain("Firmă · sediul în București");
    expect(words).toContain("5,6 mld. lei valoare înregistrată");
    expect(words).toContain("21,1% din total");
    expect(words).toContain("13.669 înregistrări");
    expect(words).toContain("Diferența față de locul 2: 1,2 mld. lei");
    // The bar says each place and what the rest holds, for a screen reader; the legend is its decoration.
    expect(markup).toMatch(/aria-label="Locurile 1–3: 1, 21,1%; 2, 16,5%; 3, 13,2%; celelalte 1.464 de firme · 49,2%"/);
    expect(markup).toContain('class="ec-seg ec-seg-1" style="width:21.0');
    expect(words).toContain("celelalte 1.464 de firme · 49,2%");
    // The facts come after the answer: until then, „…”.
    expect(markup).toContain('class="ec-wait"');
  });

  it("lists places 2 and 3 as rows with their share, records and menu, the total line and the two buttons", () => {
    const markup = render({ card: card(), podium: PODIUM }, valueSpec, false, ["doar 2025"]);
    const words = text(markup);
    expect(words).toContain("2. DR.MAX sediul în județul Ilfov 4,4 mld. lei 16,5% · 16.671 de înregistrări →");
    expect(words).toContain("3. FARMEXIM S.A. sediul în București 3,5 mld. lei 13,2% · 25.590 de înregistrări →");
    expect(markup.match(/class="qb-arow"/g)).toHaveLength(2);
    // „Scoate din calcul” on every place (its menu), the page of the firm.
    expect(markup.match(/aria-haspopup="menu"/g)).toHaveLength(3);
    expect(words).toContain("Din 26,5 mld. lei, câștigați de 1.467 de firme · doar 2025 · valoare înregistrată, nu plăți");
    expect(words).toContain("Vezi cele 13.669 de înregistrări →");
    // „Tot clasamentul ›” keeps every condition of the question, as a ranking of the first ten.
    const href = /href="([^"]*intreaba\?spec=[^"]*)"[^>]*>Tot clasamentul/.exec(markup)?.[1] ?? "";
    const spec = JSON.parse(Buffer.from(decodeURIComponent(href.split("spec=")[1]!), "base64").toString("utf8")) as QuestionSpec;
    expect(spec).toMatchObject({ block: "table", dim: "supplier", measure: "value", topN: 10, filters: valueSpec.filters });
    expect(spec.rankBy).toBeUndefined();
  });

  it("says the share of the category under a band, with the selection's total beside it", () => {
    const band: Podium = { ...PODIUM, total: { value: 13_000_000_000, count: 90_000, entities: 17 }, selection: { value: 26_000_000_000, count: 236_891, entities: 1_467 } };
    const markup = render({ card: card(), podium: band }, { ...valueSpec, filters: { ...valueSpec.filters, maxEmployees: 0 } }, false);
    expect(text(markup)).toContain("din categorie");
    expect(text(markup)).toContain("17 firme fără angajați: 13.000.000.000 lei, 50,0% din 26.000.000.000 lei");
  });

  it("without a total says no share and draws no bar", () => {
    const markup = render({ card: card(), podium: { ...PODIUM, total: null } }, valueSpec, false);
    expect(text(markup)).not.toContain("din total");
    expect(markup).not.toContain("ec-stack");
    expect(text(markup)).not.toContain("Din ");
  });

  it("is the page of institutions too: the total line is „la 17 spitale”", () => {
    const spec: QuestionSpec = { block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { authorityKind: "spital", county: "Cluj" } };
    const podium: Podium = { version: 2, places: [{ entityId: "9", name: "Institutul Oncologic", county: "Cluj", value: 979_473_286, count: 6_109 }], total: { value: 2_296_574_007, count: 36_833, entities: 17 } };
    const words = text(render({ card: card({ entityId: "9", role: "authority" }), podium }, spec, false));
    expect(words).toContain("Instituție · județul Cluj");
    expect(words).toContain("Din 2,3 mld. lei, la 17 spitale");
    // A single place has no place 2: no lead.
    expect(words).not.toContain("Diferența");
  });
});

const riskSpec: QuestionSpec = { block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { authorityKind: "spital", county: "Cluj" } };
const scored = (n: number, score: number, extra: Record<string, unknown> = {}) => ({
  entityId: String(n), name: `Spital ${n}`, county: "Cluj", count: 1000 * n, value: 200_000_000 - n * 10_000_000, score, nFlags: 1, flags: ["da_split"], ...extra,
});
/** The mockup's hospitals: 71 alone, then three at 60, two at 58, then 40… (14 with a score of 19). */
const SCORES = [71, 60, 60, 60, 58, 58, 40, 40, 30, 25, 20, 20, 20, 20];
const RANKING: RiskRanking = {
  version: 3, pool: 19, scored: 14, top: 71, topCount: 1,
  rows: SCORES.map((score, i) => scored(i + 1, score, i === 0 ? { name: "SPITALUL ORASENESC AGNITA", county: "Sibiu", flags: ["da_split", "da_year_end", "da_above_ceiling"], nFlags: 3 } : {})),
};

describe("on the risk axis: the first profiles by the risk score (entity_card-3)", () => {
  it("names the first with its score and band, lists five with their place, score pill and patterns, and the value at the right", () => {
    const markup = render({ card: card({ role: "authority", score: 71, nFlags: 3 }), ranking: RANKING }, riskSpec, true);
    const words = text(markup);
    expect(words).toContain("Primul: SPITALUL ORASENESC AGNITA, 71 din 100 · puternic.");
    // The score is no probability: its (?) beside the headline.
    expect(markup).toContain("Riscul, din 100");
    expect(words).not.toContain("la egalitate");
    // One with the best score: the order is the score's, not the value's.
    expect(words).not.toContain("În ordinea valorii");
    expect(markup.match(/class="qb-arow ec-rrow"/g)).toHaveLength(5);
    // Three patterns fit in their place, no „+1” (owner, 2 November 2026); the name opens the profile's page.
    expect(words).toContain("1. SPITALUL ORASENESC AGNITA Sibiu · 1.000 de achiziții directe adunate, trec de plafon mulți bani contractați în decembrie directe, deși trec de plafon 71 din 100 puternic 190 mil. lei");
    expect(markup).toMatch(/class="qb-arow-name">1\. <a href="\/entitati\/1">SPITALUL ORASENESC AGNITA<\/a>/);
    expect(words).toContain("2. Spital 2 Cluj · 2.000 de achiziții directe adunate, trec de plafon 60 din 100 moderat 180 mil. lei");
    // Tied rows share their place: 2, 2, 2, then 5.
    expect(words).toContain("2. Spital 4 Cluj");
    expect(words).toContain("5. Spital 5 Cluj");
    expect(markup).toContain('class="cri-pill risk-high">71 din 100');
    expect(markup).toContain('class="cri-pill risk-mid">60 din 100');
    expect(markup).toContain('class="qb-tag qb-tag--signal"');
    // No dots of the old index.
    expect(markup).not.toContain("ec-level");
    expect(words).toContain("Arată toate cele 14");
    expect(words).not.toContain("fără semnale");
    expect(words).toContain("Pe harta riscului ›");
    expect(words).toContain("Semnal statistic, nu dovadă de neregulă · Cum se calculează");
    // Each row shows its records beside the value; its name is its page (owner, 2 November 2026): no "⋯" left, none out of a calculation.
    expect(markup.match(/class="qb-rec ec-rrec"/g)).toHaveLength(5);
    expect(markup).not.toContain('aria-haspopup="menu"');
    expect(words).not.toContain("Scoate din calcul");
    // The headline names the list, and anchors its (?) on its own line (owner, 2 November 2026: it opened far below).
    const head = /<p class="ec-ties-text qb-tipwrap" id="([^"]+)"/.exec(markup)?.[1];
    expect(head).toBeTruthy();
    expect(markup).toContain(`aria-describedby="${head}"`);
  });

  it("says the profiles tied on the best score, with the (?) of a tie, and the order of value when every shown row is tied", () => {
    const tied: RiskRanking = { version: 3, pool: 40, scored: 12, top: 60, topCount: 12, rows: Array.from({ length: 12 }, (_, i) => scored(i + 1, 60)) };
    const markup = render({ card: card({ role: "authority", score: 60 }), ranking: tied }, riskSpec, true);
    const words = text(markup);
    expect(words).toContain("12 la egalitate pe primul loc, 60 din 100 · moderat.");
    expect(markup).toContain("La egalitate");
    expect(words).toContain("În ordinea valorii, nu a riscului");
    expect(words).toContain("1. Spital 5 Cluj");
    expect(words).not.toContain("2. Spital");
    expect(words).toContain("Arată toate cele 12");
  });

  it("says when nobody in the group has a score: no rows, the sources said", () => {
    const none: RiskRanking = { version: 3, pool: 17, scored: 0, top: 0, topCount: 17, rows: Array.from({ length: 17 }, (_, i) => scored(i + 1, 0, { flags: [], nFlags: 0 })) };
    const words = text(render({ card: card({ role: "authority", score: 0 }), ranking: none }, riskSpec, true));
    expect(words).toContain("Nu are semnale în profil");
    expect(words).toContain("Niciuna din 17 spitale nu are semnale în profil.");
    expect(words).toContain("Sursele: primele 17 profiluri după valoare, fără semnale.");
    expect(words).not.toContain("Spital 1");
    expect(words).not.toContain("Arată toate");
    expect(words).toContain("Pe harta riscului ›");
  });

  it("says the profiles without a score once the whole list is shown", () => {
    const short: RiskRanking = { ...RANKING, rows: RANKING.rows.slice(0, 3), scored: 3 };
    const words = text(render({ card: card({ role: "authority" }), ranking: short }, riskSpec, true));
    expect(words).toContain("+ 16 fără semnale");
    expect(words).not.toContain("Arată toate");
  });

  it("opens the cloud on the same group of profiles: its county and kind stay", () => {
    const markup = render({ card: card({ role: "authority" }), ranking: RANKING }, riskSpec, true);
    const href = /href="([^"]*intreaba\?spec=[^"]*)"[^>]*>Pe harta riscului/.exec(markup)?.[1] ?? "";
    const spec = JSON.parse(Buffer.from(decodeURIComponent(href.split("spec=")[1]!), "base64").toString("utf8")) as QuestionSpec;
    expect(spec).toMatchObject({ block: "scatter", dim: "authority", filters: { authorityKind: "spital", county: "Cluj" } });
  });
});

const tie = (n: number, extra: Record<string, unknown> = {}) => ({ entityId: String(n), name: `Spital ${n}`, county: "Cluj", count: 1000 * n, value: 200_000_000 - n * 10_000_000, nFlags: 1, flags: ["da_split"], ...extra });
const TIES: LegacyTies = { version: 2, level: 0.2, maxFlags: 1, criteria: 5, count: 14, pool: 19, nextLevel: 0, nextCount: 5, rows: Array.from({ length: 14 }, (_, i) => tie(i + 1)) };

describe("an answer stored as entity_card-2: the group at the top of the old index, as it was", () => {
  it("says the index does not tell them apart, lists five in the order of value with the official words, and what waits", () => {
    const markup = render({ card: card({ role: "authority", cri: 0.2, nFlags: 1 }), ties: TIES }, riskSpec, true);
    const words = text(markup);
    expect(words).toContain("Indicele nu le deosebește");
    expect(words).toContain("14 din 19 spitale au același indice, 0,20 1 semnal din 5.");
    expect(words).toContain("În ordinea valorii, nu a riscului");
    expect(markup.match(/class="qb-arow"/g)).toHaveLength(5);
    expect(words).toContain("Spital 1 Cluj · 1.000 de achiziții directe adunate, trec de plafon 190 mil. lei");
    expect(markup).toContain('class="qb-tag qb-tag--signal"');
    expect(words).toContain("+ încă 9 cu același indice · 5 fără semnale");
    expect(words).toContain("Arată toate cele 14");
    expect(words).toContain("Pe harta riscului ›");
    expect(words).toContain("Semnal statistic, nu dovadă de neregulă · Cum se calculează");
    // Each row shows its records beside the value; its name is its page (owner, 2 November 2026): no "⋯" left, none out of a calculation.
    expect(markup.match(/class="qb-rec"/g)).toHaveLength(5);
    expect(markup).not.toContain('aria-haspopup="menu"');
    expect(words).not.toContain("Scoate din calcul");
    // The level as squares, with its words for a screen reader.
    expect(markup).toContain('aria-label="1 semnal din 5"');
  });

  it("opens the cloud on the same group of profiles: its county and kind stay, the index's axis stays", () => {
    const markup = render({ card: card({ role: "authority" }), ties: TIES }, riskSpec, true);
    const href = /href="([^"]*intreaba\?spec=[^"]*)"[^>]*>Pe harta riscului/.exec(markup)?.[1] ?? "";
    const spec = JSON.parse(Buffer.from(decodeURIComponent(href.split("spec=")[1]!), "base64").toString("utf8")) as QuestionSpec;
    expect(spec).toMatchObject({ block: "scatter", dim: "authority", filters: { authorityKind: "spital", county: "Cluj" } });
  });

  it("names a single leader, the next level, and a group in which nobody has a signal", () => {
    const single: LegacyTies = { version: 2, level: 1, maxFlags: 4, criteria: 4, count: 1, pool: 2_483, nextLevel: 0.75, nextCount: 13, rows: [tie(1, { name: "NOVAGROCHIM", flags: ["da_split", "da_dependence", "da_rapid", "da_round"], nFlags: 4 })] };
    const firms: QuestionSpec = { block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { seatCounty: "Cluj" } };
    const words = text(render({ card: card(), ties: single }, firms, true));
    expect(words).toContain("Singur pe primul loc");
    expect(words).toContain("1,00 4 semnale din 4. Următorul nivel, 0,75: 13 din 2.483 de firme.");
    expect(words).toContain("adunate, trec de plafon un singur client public mare +2");
    expect(words).not.toContain("Arată toate");
    const none: LegacyTies = { ...TIES, level: 0, maxFlags: 0, count: 17, pool: 17, nextLevel: null, nextCount: 0, rows: [] };
    const zero = text(render({ card: card({ role: "authority" }), ties: none }, riskSpec, true));
    expect(zero).toContain("Nu are semnale în profil");
    expect(zero).toContain("Niciuna din 17 spitale nu are semnale în profil");
    expect(zero).not.toContain("În ordinea valorii");
  });

  it("marks a buyer that shows a company or an association in its name", () => {
    const rows = [tie(1, { name: "Eco Rural Consulting SRL-D" }), tie(2, { name: "ASOCIATIA CLUB SPORTIV PROGRESUL PECICA" }), tie(3, { name: "EURO APAVOL" })];
    const ties: LegacyTies = { ...TIES, count: 3, pool: 14_972, level: 0.8, maxFlags: 4, rows };
    const words = text(render({ card: card({ role: "authority" }), ties }, { ...riskSpec, filters: {} }, true));
    expect(words).toContain("Eco Rural Consulting SRL-D Cluj · 1.000 de achiziții directe adunate, trec de plafon societate");
    expect(words).toContain("ASOCIATIA CLUB SPORTIV PROGRESUL PECICA Cluj · 2.000 de achiziții directe adunate, trec de plafon asociație");
    expect(words).toMatch(/EURO APAVOL Cluj · 3\.000 de achiziții directe adunate, trec de plafon 1\d\d mil\. lei/);
  });
});

describe("the other forms", () => {
  it("keeps a county council alone in its county: no crown, its two other answers", () => {
    const spec: QuestionSpec = { block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { authorityKind: "consiliu_judetean", county: "Cluj" } };
    const words = text(render({ card: card({ name: "JUDETUL CLUJ (CONSILIUL JUDETEAN)", role: "authority" }), podium: { ...PODIUM, places: [PODIUM.places[0]!] } }, spec, false));
    expect(words).toContain("În județul Cluj e un singur consiliu județean.");
    expect(words).toContain("Unde se situează față de celelalte ›");
    expect(words).not.toContain("Diferența");
  });

  it("draws an answer stored before entity_card-2 as the card it was", () => {
    const old = text(render({ card: card({ cri: 0.5, nFlags: 2, flags: ["da_split"] }) }, { ...valueSpec, rankBy: "risk" }, true));
    expect(old).toContain("valoare înregistrată în profil");
    expect(old).toContain("indice risc");
    expect(old).toContain("0,50");
    // The signal's short name today (lib/flags.ts, rf-2026.18); a retired code shows as stored.
    expect(old).toContain("Adunate, trec de plafon");
    expect(text(render({ card: card({ cri: 0.4, nFlags: 2, flags: ["da_split", "da_rapid"] }) }, { ...valueSpec, rankBy: "risk" }, true))).toContain("da_rapid");
  });
});

describe("the shown CSV", () => {
  const spec = { block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: {} } as never;
  it("holds the podium's places with their share, then what the three leave", () => {
    const lines = answerCsv({ block: "entity_card", card: card(), podium: PODIUM }, spec, "Cine").text.split("\r\n");
    expect(lines[0]).toBe("﻿loc,nume,judet,valoare_lei,procent_din_total,inregistrari");
    expect(lines[1]).toBe('1,"ALLIANCE HEALTHCARE ROMANIA","București",5577504292,0.2108,13669');
    expect(lines[3]).toBe('3,"FARMEXIM S.A.","București",3494973799,0.1321,25590');
    // 26.459.251.841 − 13.438.327.530 left over the other 1.464 firms, and their records.
    expect(lines[4]).toBe(',"celelalte 1464",,13020924311,0.4921,180961');
  });

  it("under a band of CÂȘTIGĂTORII names the share the category's and gives the selection's total a row", () => {
    const band = { places: [{ entityId: "2", name: "BETA", county: "Ilfov", value: 3000, count: 1 }, { entityId: "3", name: "GAMA", county: "Cluj", value: 1000, count: 1 }],
      version: 2 as const, total: { value: 5000, count: 3, entities: 3 }, selection: { value: 11804, count: 9, entities: 6 } };
    const lines = answerCsv({ block: "entity_card", card: card(), podium: band }, spec, "Cine").text.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("﻿loc,nume,judet,valoare_lei,procent_din_categorie,inregistrari");
    expect(lines[1]).toBe('1,"BETA","Ilfov",3000,0.6000,1');
    expect(lines.slice(3)).toEqual([',"celelalte 1 din categorie",,1000,0.2000,1', ',"toată selecția: 6",,11804,,9']);
  });

  it("holds the listed profiles of the risk axis: their place, the score over 100, its band and their patterns (entity_card-3)", () => {
    const rows = [scored(1, 71, { flags: ["da_split", "da_year_end"], nFlags: 2 }), scored(2, 60), scored(3, 60), scored(4, 25, { county: "Bucuresti" })];
    const ranking: RiskRanking = { version: 3, pool: 9, scored: 4, top: 71, topCount: 1, rows };
    const lines = answerCsv({ block: "entity_card", card: card({ role: "authority" }), ranking }, { ...riskSpec, filters: {} } as never, "Cine").text.split("\r\n").filter(Boolean);
    expect(lines[0]).toBe("﻿loc,nume,judet,valoare_lei,achizitii,risc_din_100,banda,tipare");
    expect(lines.slice(1)).toEqual([
      '1,"Spital 1","Cluj",190000000,1000,71,"puternic","da_split|da_year_end"',
      '2,"Spital 2","Cluj",180000000,2000,60,"moderat","da_split"',
      '2,"Spital 3","Cluj",170000000,3000,60,"moderat","da_split"',
      '4,"Spital 4","București",160000000,4000,25,"slab","da_split"',
    ]);
    // A firm's place is its seat, as on the ranking's CSV.
    const firms = answerCsv({ block: "entity_card", card: card(), ranking: { ...ranking, rows: [scored(1, 40, { name: "ALFA SRL" })] } },
      { block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: {} } as never, "Cine").text.split("\r\n");
    expect(lines[0]).toContain("judet");
    expect(firms[0]).toBe("﻿loc,nume,sediu,valoare_lei,achizitii,risc_din_100,banda,tipare");
    expect(firms[1]).toBe('1,"ALFA SRL","Cluj",190000000,1000,40,"moderat","da_split"');
  });

  it("holds every profile at the top level of an answer stored as entity_card-2, as it was exported", () => {
    const lines = answerCsv({ block: "entity_card", card: card({ role: "authority" }), ties: { ...TIES, count: 2, rows: [tie(1), tie(2, { flags: ["da_split", "da_rapid"], nFlags: 2 })] } },
      { ...riskSpec, filters: {} } as never, "Cine").text.split("\r\n");
    expect(lines[0]).toBe("﻿nume,judet,valoare_lei,achizitii,cri,semnale,flags");
    expect(lines[1]).toBe('"Spital 1","Cluj",190000000,1000,0.2,1,"da_split"');
    expect(lines[2]).toBe('"Spital 2","Cluj",180000000,2000,0.2,2,"da_split|da_rapid"');
  });
});
