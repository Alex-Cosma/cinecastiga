import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BUZAU_CLOUD, BUZAU_SPLIT, NATIONAL_BANDS, SPITALE_SMALL } from "../../lib/ask/fixtures/scatter-screen";
import type { AskSpec } from "../../lib/ask/spec";
import { AnswerEvidence } from "./AnswerEvidence";
import { answerCsv } from "./answer-csv";
import { emptyAnswer } from "./answer-empty";
import ScatterAnswer from "./ScatterAnswer";
import {
  axisTicks, axisWords, bandIndex, cardFacts, dots, employeesWords, flagTag, geometry, jitter, kindWords, listHeadTip, listHeadWords, nearest, rowMeta, scatterCsv, withFacts,
} from "./scatter-answer";

/*
 * scatter-2 as markup and as pure words (final scatter §3.3–§3.6, §4.4, §4.6): the strip's two rows with the
 * numbers, one band per number of criteria with the index unchanged beside it, the list with the signals'
 * years, the small group without a chart, the cells of a national cloud, and the CSV equal to the list.
 * The card, the search, the strip's new query and the records are checked in the browser (par-f6b).
 */

const text = (markup: string) => markup.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>(<\/span>)?/g, " ").replace(/<span class="term-mark"[^>]*>\?<\/span>/g, " ")
  .replace(/<span class="d-sr-only">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const spec = (extra: Partial<AskSpec> = {}): AskSpec => ({ block: "scatter", dim: "authority", measure: "value", filters: { authorityKind: "comuna", county: "Buzău" }, scatter: { rankBy: "risk" }, ...extra });
const render = (data = BUZAU_CLOUD, applied = spec()) => renderToStaticMarkup(createElement(AnswerEvidence.Provider, { value: { open: vi.fn() } },
  createElement(ScatterAnswer, { data, spec: applied, onStrip: () => undefined }) as ReactNode));

describe("the risk cloud's answer", () => {
  it("has the strip's two rows: the order, and the signals with the number of profiles that have each (none with zero)", () => {
    const markup = render();
    const words = text(markup);
    expect(words).toContain("Primele după");
    expect(markup).toMatch(/role="radiogroup"[^>]*aria-label="Primele după"/);
    expect(markup).toMatch(/aria-checked="true"[^>]*>(?:<[^>]+>)*Semnale/);
    expect(words).toContain("Tot grupul 82");
    expect(words).toContain("Posibilă fracționare 46");
    expect(words).toContain("Vârf în decembrie 19");
    expect(words).toContain("Finalizare rapidă 15");
    // "Aproape de prag" and "Concentrare pe un furnizor" have none in this group: no chip.
    // The strip holds two options of the order and the group's own (Tot grupul, the three signals).
    expect(markup.match(/role="radio"/g)).toHaveLength(6);
    expect(markup).not.toMatch(/role="radio"[^>]*>(?:<[^>]+>)*[^<]*(?:Aproape de prag|Concentrare)/);
  });

  it("draws one band per number of criteria, 0…5, with the index unchanged and „k/5” under it, and the top 10% line", () => {
    const markup = render();
    expect(markup.match(/class="sc-idx"/g)).toHaveLength(6);
    expect(markup).toContain(">0,6</text>");
    expect(markup).toContain(">3/5</text>");
    expect(markup).toContain("cele mai mari 10%");
    expect(markup.match(/class="sc-dot[^"]*"/g)).toHaveLength(4);
    // The names of the first rows sit on the chart, without the parenthesis of the registry's name.
    expect(markup).toContain(">Comuna Sageata</text>");
    expect(markup).not.toMatch(/class="sc-name"[^>]*>[^<]*\(/);
  });

  it("lists the first rows with their signals' years, the records link and the list's head", () => {
    const words = text(render());
    expect(words).toContain("Primele 3 din 82");
    expect(words).toContain("Comuna Sageata (Primaria Comunei Sageata)");
    expect(words).toContain("Primărie de comună · Buzău · 2.567 de achiziții directe");
    expect(words).toContain("Posibilă fracționare · 2018–2019");
    expect(words).toContain("Vârf în decembrie · 2022");
    expect(words).toContain("Posibilă fracționare · 2019, 2021–2022".replace("2021–2022", "2021–2022"));
    expect(words).toContain("2.567 de înregistrări");
    expect(words).toContain("Vezi înregistrările celor din listă");
    expect(words).toContain("Toată lista pe /semnale");
    expect(words).toContain("Semnalele sunt piste, nu dovezi. Valori înregistrate, nu plăți.");
  });

  it("with a signal: the group stays the cloud, the head counts the signal's list, the records are the signal's", () => {
    const markup = render(BUZAU_SPLIT, spec({ scatter: { rankBy: "risk", flag: "da_split" } }));
    const words = text(markup);
    expect(words).toContain("Primele 3 din 46");
    expect(words).toContain("cu „posibilă fracționare”");
    expect(markup).toMatch(/aria-checked="true"[^>]*>(?:<[^>]+>)*Posibilă fracționare/);
    expect(words).toContain("Înregistrările semnalului");
    expect(words).toContain("Vezi înregistrările cu semnalul");
    // Every point of the group is still drawn (final §3.4: the signal does not cut the cloud).
    expect(markup.match(/class="sc-dot[^"]*"/g)).toHaveLength(4);
    expect(markup).toContain("sc-dot is-list is-flag");
  });

  it("shows a group of fewer than 10 as a list, with a way out, and no chart", () => {
    const markup = render(SPITALE_SMALL, spec({ filters: { authorityKind: "spital", county: "Buzău" } }));
    expect(markup).not.toContain("sc-chart");
    expect(text(markup)).toContain("5 profiluri în grup: prea puține pentru un nor. Le arătăm ca listă.");
    expect(markup).toMatch(/href="\/intreaba\?spec=[^"]+"[^>]*>Toată țara/);
    expect(text(markup)).toContain("SPITALUL JUDETEAN DE URGENTA BUZAU");
  });

  it("draws a national cloud from cells, the named profiles exact", () => {
    const markup = render(NATIONAL_BANDS, spec({ filters: {} }));
    expect(markup.match(/class="sc-cell"/g)).toHaveLength(4);
    expect(markup.match(/class="sc-dot[^"]*"/g)).toHaveLength(3);
    expect(text(markup)).toContain("Tot grupul 15.729");
  });

  it("is empty when its group is, and the old answer's sample says so too", () => {
    expect(emptyAnswer({ block: "scatter", scatter: { ...BUZAU_CLOUD, group: { n: 0, nList: 0 } } })).toBe(true);
    expect(emptyAnswer({ block: "scatter", scatter: BUZAU_CLOUD })).toBe(false);
    expect(emptyAnswer({ block: "scatter", points: [] })).toBe(true);
  });

  it("exports the list on screen, in its order, with the strip's state beside it", () => {
    const { text: csv, filename } = answerCsv({ block: "scatter", scatter: BUZAU_SPLIT }, spec({ scatter: { rankBy: "value", flag: "da_split" } }), "Ce primării ies din tipar",
      { rank: "valoare", signal: "Posibilă fracționare", signalFile: "posibila-fractionare" });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("loc,nume,tip,judet,valoare_lei,achizitii_directe,indice_de_risc,semnale,detalii_semnale,primele_dupa,semnal");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"Comuna Sageata (Primaria Comunei Sageata)","Primărie de comună","Buzău",21000000,2567,0.6,3,"da_split|da_year_end|da_rapid","Posibilă fracționare · 2018–2019; Vârf în decembrie · 2022; Finalizare rapidă"');
    expect(lines[1]).toMatch(/"valoare","Posibilă fracționare"$/);
    expect(filename).toBe("ce-primarii-ies-din-tipar-dupa-valoare-posibila-fractionare.csv");
  });
});

describe("the chart's geometry and words", () => {
  it("is 400 px tall from 600 px of width and 300 under it, with a band for each number of criteria", () => {
    const wide = geometry(BUZAU_CLOUD, 1000), narrow = geometry(BUZAU_CLOUD, 390);
    expect([wide.box.height, narrow.box.height]).toEqual([400, 300]);
    expect(wide.bandH * 6).toBeCloseTo(wide.plotH, 6);
    expect(wide.yBand(0)).toBeGreaterThan(wide.yBand(5));
    expect(bandIndex(3, 5)).toEqual({ index: "0,6", ratio: "3/5" });
    expect(bandIndex(1, 4)).toEqual({ index: "0,25", ratio: "1/4" });
  });

  it("spreads points inside their band by a stable hash, never out of it", () => {
    expect(jitter("2144803")).toBe(jitter("2144803"));
    const g = geometry(BUZAU_CLOUD, 800);
    for (const id of ["1", "22", "2144803", "999999999"]) {
      expect(Math.abs(jitter(id))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(g.y(3, id) - g.yBand(3))).toBeLessThan(g.bandH / 2);
    }
  });

  it("ticks the log axis with the decades, and a short range with the 2 and the 5 of each", () => {
    expect(axisWords(1000)).toBe("1 mie");
    expect(axisWords(50_000)).toBe("50 mii");
    expect(axisWords(2_000_000)).toBe("2 mil.");
    expect(axisWords(1e9)).toBe("1 mld.");
    expect(axisTicks(6.2, 8.3, false).map((t) => t.text)).toEqual(["2 mil.", "5 mil.", "10 mil.", "20 mil.", "50 mil.", "100 mil."]);
    expect(axisTicks(3, 9, false).map((t) => t.text)).toEqual(["1 mie", "10 mii", "100 mii", "1 mil.", "10 mil.", "100 mil.", "1 mld."]);
    expect(axisTicks(6.2, 8.3, true).map((t) => t.text)).toEqual(["10 mil.", "100 mil."]);
  });

  it("finds the nearest point within reach, and marks the chosen signal's points", () => {
    const g = geometry(BUZAU_SPLIT, 800);
    const all = dots(BUZAU_SPLIT, g, new Set(["2144803"]));
    const first = all[0]!;
    expect(nearest(all, first.x + 3, first.y - 2)?.point.id).toBe("2144803");
    expect(nearest(all, first.x + 200, first.y + 200)).toBeNull();
    expect(all.map((d) => d.flagged)).toEqual([true, true, true, false]);
    expect(all.map((d) => d.listed)).toEqual([true, false, false, false]);
  });

  it("says a row's kind or a firm's size as facts, the signals as orange tags with their years or share", () => {
    expect(kindWords("comuna")).toBe("Primărie de comună");
    expect(kindWords(null)).toBeNull();
    expect(employeesWords(3, 2025)).toBe("3 angajați · bilanț 2025");
    expect(employeesWords(null, null)).toBe("fără bilanț");
    expect(rowMeta({ ...BUZAU_CLOUD.list[0]!, employees: 3, employeesYear: 2025 }, "supplier")).toBe("3 angajați · bilanț 2025 · Buzău · 2.567 de achiziții directe");
    expect(flagTag({ code: "da_split", years: [2018, 2019] })).toEqual({ text: "Posibilă fracționare · 2018–2019", tone: "signal" });
    expect(flagTag({ code: "da_rapid", share: 0.252 }).text).toBe("Finalizare rapidă · 25,2%");
    expect(flagTag({ code: "da_dependence", share: 1, single: true }).text).toBe("Dependență de o autoritate · un singur client");
    expect(flagTag({ code: "da_concentration", share: 0.91 }).text).toBe("Concentrare pe un furnizor · 91%");
    expect(withFacts([{ code: "da_rapid" }, { code: "da_split", years: [2019] }], [{ code: "da_rapid", share: 0.25, rows: 647 }]))
      .toEqual([{ code: "da_rapid", share: 0.25, rows: 647 }, { code: "da_split", years: [2019] }]);
    expect(cardFacts(21_000_000, 0.6, 3, 5)).toEqual([{ label: "Achiziții directe:", value: "21 mil. lei" }, { label: "Indice", value: "0,6" }, { label: "", value: "3 din 5 semnale" }]);
  });

  it("words the list's head and its (?): the order, the floor of 20 and how many are in the cloud alone", () => {
    expect(listHeadWords(BUZAU_CLOUD, 10)).toBe("Primele 10 din 82");
    expect(listHeadWords(BUZAU_SPLIT, 10)).toBe("Primele 10 din 46");
    expect(listHeadWords(BUZAU_SPLIT, 3)).toBe("Primele 3 din 46");
    expect(listHeadTip({ ...NATIONAL_BANDS, group: { n: 100, nList: 80 } })).toBe("Cele mai multe semnale; la egalitate, valoarea mai mare întâi. În listă intră cine are cel puțin 20 de achiziții directe. 20 de profiluri sunt doar în nor (10–19 achiziții).");
    expect(listHeadTip(SPITALE_SMALL)).toContain("Grupul e mic");
    expect(scatterCsv(BUZAU_CLOUD, (v) => JSON.stringify(v ?? ""))[0]).toMatch(/^loc,nume,tip,judet,/);
  });
});
