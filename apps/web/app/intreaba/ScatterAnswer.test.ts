import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BUZAU_CLOUD, BUZAU_SPLIT, NATIONAL_BANDS, SPITALE_SMALL } from "../../lib/ask/fixtures/scatter-screen";
import type { AskSpec } from "../../lib/ask/spec";
import { AnswerEvidence } from "./AnswerEvidence";
import { decodeSpec } from "../../lib/ask/permalink";
import { answerCsv } from "./answer-csv";
import { emptyAnswer, emptyMessage } from "./answer-empty";
import ScatterAnswer from "./ScatterAnswer";
import {
  axisTicks, axisWords, bandIndex, cardFacts, chartLabels, dots, employeesWords, exactDot, flagTag, geometry, jitter, kindWords, listHeadTip, listHeadWords, nearest, p90Label,
  pointPlace, rowMeta, scatterCsv, signalsPageLink, stripStatusWords, withFacts, type Dot, type ScatterV2,
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
/** A CSV line split into its fields (quoted fields may hold commas and doubled quotes). */
const fields = (line: string): string[] => {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  return [...out, cur];
};

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

  it("shows a group of fewer than 10 as a list, with a way out to the same kind in the whole country, and no chart", () => {
    const markup = render({ ...SPITALE_SMALL, wider: 329 }, spec({ filters: { authorityKind: "spital", county: "Buzău" } }));
    expect(markup).not.toContain("sc-chart");
    expect(text(markup)).toContain("5 profiluri în grup: prea puține pentru un nor. Le arătăm ca listă.");
    expect(text(markup)).toContain("SPITALUL JUDETEAN DE URGENTA BUZAU");
    // Only the place leaves: the hospitals stay hospitals (review: the kind was dropped without a word).
    const link = markup.match(/href="\/intreaba\?spec=([^"]+)"[^>]*>Toate spitalele din țară · 329/);
    expect(link).not.toBeNull();
    const widened = decodeSpec(decodeURIComponent(link![1]!.replace(/&amp;/g, "&"))) as AskSpec;
    expect(widened.filters).toEqual({ authorityKind: "spital" });
    // Without the national number (an answer stored before it), the link says the place alone; nationally, none.
    expect(text(render(SPITALE_SMALL, spec({ filters: { authorityKind: "spital", county: "Buzău" } })))).toContain("Toată țara");
    expect(render(SPITALE_SMALL, spec({ filters: { authorityKind: "spital" } }))).not.toContain("qb-relax-link");
  });

  it("offers no order for a group of one listed profile, and says the strip's answer to a screen reader", () => {
    const one = { ...SPITALE_SMALL, group: { n: 1, nList: 1, small: true as const } };
    expect(text(render(one, spec({ filters: { authorityKind: "consiliu_judetean", county: "Buzău" } })))).not.toContain("Primele după");
    expect(render(BUZAU_SPLIT, spec({ scatter: { rankBy: "risk", flag: "da_split" } }))).toContain('role="status">46 cu Posibilă fracționare, după semnale<');
    expect(stripStatusWords(BUZAU_CLOUD as ScatterV2)).toBe("82 în listă, după semnale");
  });

  it("draws a national cloud from cells, the named profiles exact", () => {
    const markup = render(NATIONAL_BANDS, spec({ filters: {} }));
    expect(markup.match(/class="sc-cell"/g)).toHaveLength(4);
    expect(markup.match(/class="sc-dot[^"]*"/g)).toHaveLength(3);
    expect(text(markup)).toContain("Tot grupul 15.729");
  });

  it("is empty when its group is, and the old answer's sample says so too", () => {
    expect(emptyAnswer({ block: "scatter", scatter: { ...BUZAU_CLOUD, group: { n: 0, nList: 0 } } })).toBe(true);
    expect(emptyMessage({ block: "scatter", scatter: { ...BUZAU_CLOUD, group: { n: 0, nList: 0 } } })).toBe("Niciun profil în acest grup.");
    expect(emptyAnswer({ block: "scatter", scatter: BUZAU_CLOUD })).toBe(false);
    expect(emptyAnswer({ block: "scatter", points: [] })).toBe(true);
  });

  it("exports the list on screen, in its order, with the strip's state beside it", () => {
    const { text: csv, filename } = answerCsv({ block: "scatter", scatter: BUZAU_SPLIT }, spec({ scatter: { rankBy: "value", flag: "da_split" } }), "Ce primării ies din tipar",
      { rank: "valoare", signal: "Posibilă fracționare", signalFile: "posibila-fractionare" });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("loc,nume,tip,judet,valoare_lei,achizitii_directe,indice_de_risc,nr_semnale,semnale,detalii_semnale,primele_dupa,semnal");
    expect(lines).toHaveLength(4);
    // Every line has a header for each value (review: the count of signals had none, so every column after it slid).
    const head = fields(lines[0]!);
    for (const line of lines.slice(1)) expect(fields(line)).toHaveLength(head.length);
    const first = Object.fromEntries(head.map((name, i) => [name, fields(lines[1]!)[i]]));
    expect(first).toMatchObject({ nume: "Comuna Sageata (Primaria Comunei Sageata)", tip: "Primărie de comună", judet: "Buzău", valoare_lei: "21000000", achizitii_directe: "2567",
      indice_de_risc: "0.6", nr_semnale: "3", semnale: "da_split|da_year_end|da_rapid", detalii_semnale: "Posibilă fracționare · 2018–2019; Vârf în decembrie · 2022; Finalizare rapidă",
      primele_dupa: "valoare", semnal: "Posibilă fracționare" });
    expect(filename).toBe("ce-primarii-ies-din-tipar-dupa-valoare-posibila-fractionare.csv");
  });

  it("exports a firm's list with as many headers as values, and the rates' shares the screen asked after the answer", () => {
    const firms = { ...BUZAU_CLOUD, role: "supplier" as const, levels: 4, list: BUZAU_CLOUD.list.map(({ kind: _kind, ...r }) => ({ ...r, employees: 3, employeesYear: 2025 })) } as ScatterV2;
    const rows = scatterCsv(firms, (v) => JSON.stringify(v ?? ""), new Map([["2144803", [{ code: "da_rapid", share: 0.252, rows: 647 }]]]));
    expect(rows[0]).toBe("loc,nume,angajati,an_bilant,sediu,valoare_lei,achizitii_directe,indice_de_risc,nr_semnale,semnale,detalii_semnale");
    for (const line of rows.slice(1)) expect(fields(line)).toHaveLength(fields(rows[0]!).length);
    expect(fields(rows[1]!).at(-1)).toBe("Posibilă fracționare · 2018–2019; Vârf în decembrie · 2022; Finalizare rapidă · 25,2%");
  });

  it("links the whole list on /semnale as the cloud orders it: the index without a signal, the signal's own with one, the county kept", () => {
    expect(signalsPageLink(BUZAU_CLOUD as ScatterV2, spec())).toEqual({ href: "/semnale?view=cri&rol=authority&jud=Buz%C4%83u", label: "Toată lista pe /semnale" });
    expect(signalsPageLink(BUZAU_SPLIT as ScatterV2, spec())).toEqual({ href: "/semnale?tip=da_split&rol=authority&jud=Buz%C4%83u", label: "Aparițiile semnalului pe /semnale" });
    expect(signalsPageLink({ ...BUZAU_CLOUD, flag: "da_concentration" } as ScatterV2, spec({ filters: {} })).href).toBe("/semnale?tip=da_concentration&rol=authority");
    const firms = { ...BUZAU_CLOUD, role: "supplier" } as ScatterV2;
    expect(signalsPageLink(firms, spec({ dim: "supplier", filters: { seatCounty: "Cluj" } })).href).toBe("/semnale?view=cri&rol=supplier&jud=Cluj");
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
    // A phone keeps at least three ticks: the 2 and the 5 where the decades are fewer (review: one lonely "10 mil." at 320 px).
    expect(axisTicks(6.2, 8.3, true).map((t) => t.text)).toEqual(["2 mil.", "10 mil.", "50 mil."]);
    expect(axisTicks(6.5, 7.6, true).map((t) => t.text)).toEqual(["5 mil.", "10 mil.", "20 mil."]);
    expect(axisTicks(3, 9, true).map((t) => t.text)).toEqual(["1 mie", "100 mii", "10 mil.", "1 mld."]);
  });

  it("places a point past the list's first rows from the cloud drawn point by point, in the server's order", () => {
    // Comuna Mica has 12 acquisitions: in the cloud, not in the list of 20.
    expect(["2144803", "2144792", "2146202", "1"].map((id) => pointPlace(BUZAU_CLOUD as ScatterV2, id))).toEqual([1, 2, 3, null]);
    // By value: Merei's 28,3 mil. first; with a signal, only the points that have it count.
    expect(pointPlace({ ...BUZAU_CLOUD, rankBy: "value" } as ScatterV2, "2146202")).toBe(1);
    expect(pointPlace({ ...BUZAU_CLOUD, flag: "da_year_end" } as ScatterV2, "2146202")).toBeNull();
    expect(pointPlace({ ...BUZAU_CLOUD, flag: "da_year_end" } as ScatterV2, "2144792")).toBe(2);
    // A national cloud of cells has no place to give: the search's part=locate does.
    expect(pointPlace(NATIONAL_BANDS as ScatterV2, "2144803")).toBeNull();
  });

  it("draws a found profile exact on a cloud of cells, marked when it has the chosen signal", () => {
    const data = { ...NATIONAL_BANDS, flag: "da_split" } as ScatterV2, g = geometry(data, 800);
    const dot = exactDot(data, g, { id: "42", name: "DEDEMAN", value: 5e6, nFlags: 2, nDas: 400, codes: ["da_split", "da_rapid"] });
    expect(dot.x).toBeCloseTo(g.x(5e6), 6);
    expect(dot.y).toBeCloseTo(g.y(2, "42"), 6);
    expect([dot.flagged, dot.listed]).toEqual([true, false]);
    expect(render(data, spec({ filters: {}, scatter: { rankBy: "risk", flag: "da_split" } })).match(/class="sc-dot[^"]*"/g)).toHaveLength(3);
  });

  it("writes the top 10% over the plot, and keeps the names off its line and its words (F6b review, 390 px)", () => {
    const g = geometry(BUZAU_CLOUD, 390), top = g.yBand(BUZAU_CLOUD.levels) - g.bandH / 2;
    const p90 = 10 ** ((g.x0 + g.x1) / 2), line = g.x(p90), words = p90Label(g, p90);
    // Above the top band (4/4 or 5/5), never on its points; before the line when it would leave the chart.
    expect(words.box.y1).toBeLessThanOrEqual(top);
    expect(words.box.x1).toBeLessThanOrEqual(g.box.width);
    expect(p90Label(g, 10 ** (g.x1 - 0.01)).anchor).toBe("end");
    const dot = (id: string, x: number, y: number): Dot => ({ point: { id } as Dot["point"], x, y, flagged: false, listed: true });
    // Just left of the line, a name on the right would cross it: it goes to the left. At the height of the words, at the
    // line's right, a name on the right would sit on them, and on the left cross the line: left to the list.
    const all = [dot("a", line - 20, g.yBand(2)), dot("b", line + 12, words.y - 4)];
    const placed = chartLabels([{ id: "a", text: "EPIC CONSTRUCT S.R.L" }, { id: "b", text: "Comuna Lungă" }], all, g, p90);
    expect(placed.map((l) => [l.id, l.anchor])).toEqual([["a", "end"]]);
    for (const l of placed) {
      const w = l.text.length * 6.3, x0 = l.anchor === "end" ? l.x - w : l.x;
      expect(line <= x0 || line >= x0 + w).toBe(true);
    }
    // Without a line (a group too small for it), the same name goes to the right.
    expect(chartLabels([{ id: "a", text: "EPIC CONSTRUCT S.R.L" }], all, g, 0).map((l) => l.anchor)).toEqual(["start"]);
  });

  it("never draws a name over another point: the other side, or the list (S6, F6b verify: Sageata over Largu at 390 px)", () => {
    const g = geometry(BUZAU_CLOUD, 390);
    const dot = (id: string, x: number, y: number): Dot => ({ point: { id } as Dot["point"], x, y, flagged: false, listed: true });
    const y = g.yBand(2), x = g.pad.l + 40;
    // A neighbour where the name would go on the right: the name goes left if it fits, else it is left to the list.
    const right = [dot("a", x, y), dot("n", x + 30, y + 2)];
    expect(chartLabels([{ id: "a", text: "Comuna Sageata" }], right, g, 0)).toEqual([]);
    const middle = g.pad.l + g.plotW / 2, both = [dot("a", middle, y), dot("n", middle + 30, y)];
    expect(chartLabels([{ id: "a", text: "Comuna Sageata" }], both, g, 0).map((l) => l.anchor)).toEqual(["end"]);
    // On the fixture of the Buzău communes, at 390 and 1280 px: no drawn name's box comes within a dot's radius of another point.
    for (const width of [390, 1280]) {
      const geo = geometry(BUZAU_CLOUD, width);
      const all = dots(BUZAU_CLOUD, geo, new Set(BUZAU_CLOUD.list.map((r) => r.entityId)));
      const names = BUZAU_CLOUD.list.slice(0, geo.box.compact ? 3 : 6).map((r) => ({ id: r.entityId, text: r.name }));
      for (const l of chartLabels(names, all, geo, BUZAU_CLOUD.p90)) {
        const w = l.text.length * 6.3, x0 = l.anchor === "end" ? l.x - w : l.x, y0 = l.y - 11, y1 = l.y + 3;
        const others = all.filter((d) => d.point.id !== l.id && d.x + 4.5 > x0 && d.x - 4.5 < x0 + w && d.y + 4.5 > y0 && d.y - 4.5 < y1);
        expect(others.map((d) => d.point.id), `${width} ${l.text}`).toEqual([]);
      }
    }
  });

  it("keeps the chosen or found point's name at every width, shortened to its room, the list's names off it (S6 review)", () => {
    for (const width of [320, 390, 1280]) {
      const geo = geometry(BUZAU_CLOUD, width);
      const all = dots(BUZAU_CLOUD, geo, new Set(BUZAU_CLOUD.list.map((r) => r.entityId)));
      const names = BUZAU_CLOUD.list.slice(0, geo.box.compact ? 3 : 6).map((r) => ({ id: r.entityId, text: r.name }));
      for (const row of BUZAU_CLOUD.list) {
        const labels = chartLabels(names, all, geo, BUZAU_CLOUD.p90, [{ id: row.entityId, text: row.name }]);
        const chosen = labels.find((l) => l.id === row.entityId);
        expect(chosen, `${width} ${row.name}`).toBeDefined();
        const w = chosen!.text.length * 6.3, x0 = chosen!.anchor === "end" ? chosen!.x - w : chosen!.x;
        // Inside the chart, its own name or the start of it.
        expect(x0 >= 0 && x0 + w <= geo.box.width + 1, `${width} ${row.name}`).toBe(true);
        expect(row.name.startsWith(chosen!.text.replace(/…$/, "")), `${width} ${chosen!.text}`).toBe(true);
        // No other name on it.
        for (const l of labels.filter((x) => x.id !== row.entityId)) {
          const lw = l.text.length * 6.3, lx0 = l.anchor === "end" ? l.x - lw : l.x;
          expect(lx0 < x0 + w && x0 < lx0 + lw && Math.abs(l.y - chosen!.y) < 14, `${width} ${l.text} on ${chosen!.text}`).toBe(false);
        }
      }
    }
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
