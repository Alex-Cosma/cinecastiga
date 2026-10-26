import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABA_NONE, BUZAU_URBAN, CLUJ_2026, ORADEA_FRAMEWORK, SARAIU_EXCLUDED, TIMISOARA_UNDATED, factSpec,
} from "../../lib/ask/fixtures/fact-check-screen";
import type { FactCheckData } from "../../lib/ask/fact-check-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { answerCsv } from "./answer-csv";
import { AnswerEvidence } from "./AnswerEvidence";
import FactCheckAnswer, { wholeRelationSpec } from "./FactCheckAnswer";

/*
 * fact_check-2 as markup (plan §4.10, final fact_check §4–§5): the three
 * verdicts with their lines, the identity, the weight, the profile and its
 * sources, "De reținut", the list, the edge answers, and the shown CSV. The
 * clicks that open the drawer, the person's firms and the phone layout are
 * checked in the browser (par-f6a/factcheck/flow.mjs).
 */

/** The visible words: the (?) tips' definitions and marks left out. */
const text = (markup: string) => markup.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>(<\/span>)?/g, " ").replace(/<span class="term-mark"[^>]*>\?<\/span>/g, " ")
  .replace(/<span class="d-sr-only">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const open = vi.fn();
const render = (fact: FactCheckData, spec?: AskSpec, onWider?: (next: AskSpec) => void): string => {
  const block = createElement(FactCheckAnswer, { fact, spec: spec ?? factSpec(fact), onWider: onWider ?? (() => undefined) });
  return renderToStaticMarkup(createElement(AnswerEvidence.Provider, { value: { open } }, block as ReactNode));
};
afterEach(() => vi.clearAllMocks());

describe("the verification's answer", () => {
  it("says „Da” with the records, the value, the months and the last day, then the two entities by CUI and county", () => {
    const shown = text(render(BUZAU_URBAN));
    expect(shown).toMatch(/^Da .*58 de înregistrări · 51,1 mil\. lei valoare înregistrată iul\. 2018 – iun\. 2026 · ultima: 11\.06\.2026 Vezi cele 58 de înregistrări/);
    expect(shown).toContain("MUNICIPIUL BUZAU · CUI 4233874 · Buzău");
    expect(shown).toContain("URBAN SCOPE · CUI 35752863 · București");
    expect(shown).toContain("Pentru URBAN SCOPE: al 2-lea client din 70 (14%)");
    expect(shown).toContain("Pentru MUNICIPIUL BUZAU: al 7-lea furnizor din 282 (3%)");
  });

  it("draws the profile: years as bars with the incomplete year marked, the channels, three domains and the rest, the competition", () => {
    const markup = render(BUZAU_URBAN);
    const shown = text(markup);
    expect(markup.match(/class="fc-yb[^"]*"/g)).toHaveLength(9);
    expect(markup.match(/class="fc-yb is-partial"/g)).toHaveLength(1);
    expect(shown).toContain("* 2026 e incomplet.");
    expect(shown).toMatch(/Cum 38 de achiziții directe 6,9 mil\. → 20 de contracte din proceduri 44,2 mil\. →/);
    expect(shown).toMatch(/Ce Echipamente industriale 1 · 16,7 mil\. → Arhitectură & inginerie 32 · 14,7 mil\. → Construcții 2 · 7,8 mil\. → \+2 domenii 23 · 11,9 mil\./);
    expect(shown).toContain("7 contracte cu o singură ofertă");
    expect(shown).toContain("(TED) · 13 nu știm");
    expect(shown).toContain("6 contracte în asociere → socotim partea firmei, 32,8 mil. lei din 79,5 mil. lei.");
    // The list: the largest first, the most recent last, with its badge; "ofertă", never "ofertant".
    expect(shown).toMatch(/Cele mai mari 2 și cea mai recentă/);
    expect(shown).toContain("asociere · 2 firme · contract 33,4 mil.");
    expect(shown).toContain("cea mai recentă");
    expect(shown).not.toMatch(/ofertant/);
  });

  it("opens each figure's records: a year, a channel (the drawer's filter), a domain, the rest, the single offers, the association", async () => {
    const markup = render(BUZAU_URBAN);
    expect(markup).toContain('aria-label="Vezi 11 înregistrări din 2024 · 8,8 mil. lei"');
    // The handlers are drawn by React on the client; here the scopes they send are the shared ones (evidence.ts).
    const { validateEvidenceScope } = await import("../../lib/ask/evidence");
    for (const scope of [{ years: [2024] }, { cpvPrefixes: ["42"] }, { excludeCpvPrefixes: ["42", "71", "45"] }, { singleBid: true }, { consortium: true }])
      expect(validateEvidenceScope(scope)).toEqual(scope);
  });

  it("restricted to a year: says how much of the relation it is, with „Arată toată relația” dropping period, domain, channel and old conditions", () => {
    const fact = { ...BUZAU_URBAN, count: 11, restricted: true, relation: { count: 58, value: 51_111_528.67, yearFirst: 2018, yearLast: 2026, frameworks: 0, excluded: 0 } };
    const spec = factSpec(fact, { dataset: "da", filters: { ...factSpec(fact).filters, yearFrom: 2024, yearTo: 2024, cpvTerm: "71", county: "Buzău" }, minimumRecords: { role: "supplier", count: 3 } });
    expect(text(render(fact, spec))).toContain("11 din 58 ale relației Arată toată relația");
    expect(wholeRelationSpec(spec)).toEqual({ block: "fact_check", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU", supplierId: 2064733, supplierName: "URBAN SCOPE" } });
  });

  it("„Nu” for the choices: the year, the incomplete data, and the whole relation with its ceilings in a band", () => {
    const spec = factSpec(CLUJ_2026, { filters: { ...factSpec(CLUJ_2026).filters, yearFrom: 2026, yearTo: 2026 } });
    const shown = text(render(CLUJ_2026, spec));
    expect(shown).toMatch(/^Nu Nicio înregistrare în 2026\. 2026 e incomplet: date până la 25\.09\.2026\./);
    expect(shown).toContain("În toată relația: da · 5 înregistrări · 70,2 mil. lei · 2022–2025 · și 3 acorduri-cadru Arată toată relația");
    expect(shown).not.toContain("Vezi cele");
  });

  it("„Nu” with an old link's condition says so, with the same band", () => {
    const fact = { ...CLUJ_2026, reason: "legacy" as const, restricted: false, legacy: true };
    expect(text(render(fact))).toMatch(/^Nu Nicio înregistrare cu condiția din link\. În toată relația: da/);
  });

  it("„Nu” in the whole archive: what the data cover, the entities chosen, a twin with the same name, each side's partners", () => {
    const markup = render(ABA_NONE);
    const shown = text(markup);
    expect(shown).toMatch(/^Nu Nicio înregistrare între ei în datele noastre\. Date SEAP până la 25\.09\.2026/);
    expect(shown).toContain("Ai ales: ADMINISTRATIA BAZINALA DE APA SOMES TISA · CUI 42066043 · Cluj PROEURO CONSTRUCT SRL · CUI 17117170 · Sălaj");
    expect(shown).toContain("Același nume, alt CUI: CUI 18269681 · Cluj are 6 înregistrări cu PROEURO CONSTRUCT SRL, 2018–2019. Verifică");
    expect(shown).toContain("Instituția a cumpărat de la 796 de firme");
    expect(shown).toContain("Firma a vândut către 3 instituții");
    expect(markup).toContain("/intreaba?spec=");
    expect(shown).not.toContain("În toată relația");
  });

  it("„Acord-cadru” when the pair has only a ceiling: its date and ceiling, no order in the data, the agreement's page", () => {
    const markup = render(ORADEA_FRAMEWORK);
    expect(text(markup)).toMatch(/^Acord-cadru .*Un acord-cadru, 01\.08\.2024 · plafon 28,2 mil\. lei Nicio comandă în date\. Plafonul nu se adună\. Vezi acordul-cadru/);
    expect(markup).toContain('href="/contracte/105426416"');
  });

  it("„Da · nu intră în sume” for a direct acquisition above the filter, with its value, estimate and source", () => {
    const markup = render(SARAIU_EXCLUDED);
    const shown = text(markup);
    expect(shown).toMatch(/^Da .*O achiziție directă, 22\.06\.2023 · Studiu de fezabilitate Nu intră în sume\./);
    expect(shown).toContain("Valoare înregistrată 135.000.000 lei (estimată: 135.000 lei ), peste filtrul de 2 mil. lei");
    expect(markup).toContain('href="https://e-licitatie.ro/pub/direct-acquisition/view/114778035"');
    expect(shown).not.toContain("Vezi cele");
  });

  it("„Da” for a contract without a plausible date: in the sums, without a year", () => {
    expect(text(render(TIMISOARA_UNDATED))).toMatch(/^Da .*Un contract · 41,8 mil\. lei fără dată plauzibilă/);
  });

  it("draws an answer stored before fact_check-2 in its own words", () => {
    const v1 = { verdict: true, authority: { entityId: "1", name: "A" }, supplier: { entityId: "2", name: "B" }, count: 3, value: 900, yearFirst: 2024, yearLast: 2025, samples: [] };
    expect(text(render(v1 as FactCheckData))).toContain("Răspuns dintr-o versiune mai veche a site-ului.");
  });
});

describe("the verification's shown CSV", () => {
  it("lists the records on screen, then the ceilings and the rows outside the sums, each saying whether it is summed", () => {
    const yes = answerCsv({ block: "fact_check", fact: BUZAU_URBAN }, factSpec(BUZAU_URBAN), "A cumpărat").text.split("\r\n");
    expect(yes[0]).toBe("﻿categorie,cod,data,ce,sursa,procedura,castigatori,valoare_contract_integral,oferte,in_sume,valoare_lei");
    expect(yes).toHaveLength(BUZAU_URBAN.samples.length + 2);
    expect(yes[3]).toMatch(/^"cea mai recentă","DA40578469","2026-06-11",.*,achizitie_directa,.*,da,223000$/);
    const outside = answerCsv({ block: "fact_check", fact: SARAIU_EXCLUDED }, factSpec(SARAIU_EXCLUDED), "A cumpărat").text.split("\r\n");
    expect(outside[1]).toBe('"exclus: peste filtrul de 2 mil. lei","DA33516874","2023-06-22","Studiu de fezabilitate",achizitie_directa,"",,,,nu,135000000');
    const framework = answerCsv({ block: "fact_check", fact: ORADEA_FRAMEWORK }, factSpec(ORADEA_FRAMEWORK), "A cumpărat").text.split("\r\n");
    expect(framework[1]).toMatch(/^"acord-cadru",.*,nu,28160000$/);
  });
});
