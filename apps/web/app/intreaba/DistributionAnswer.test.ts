import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BUZAU_LIST, RUSETU_CHART, RUSETU_SCORE_CHART, VASLUI_LIST } from "../../lib/ask/fixtures/distribution-screen";
import type { DistributionData, DistributionDataV3 } from "../../lib/ask/compile";
import { answerCore, sameAnswerCore } from "../../lib/ask/answer-core";
import { CRITERION_LABEL, SCORE_BANDS, barMembersQuery, scoreBandOf } from "../../lib/ask/peer-groups-shared";
import { answerCsv } from "./answer-csv";
import { AnswerEvidence } from "./AnswerEvidence";
import DistributionAnswer, { stripLayout } from "./DistributionAnswer";

/*
 * distribution-3 as markup (rf-2026.18, the owner's mockup of 1 November 2026):
 * the score as the headline with its band and (?), higher · equal · lower
 * adding up to the group, the strip of the group on 0–100 and the list with
 * scores up to 50, the chart by tenths of the score above (a bar opens its
 * members, then their records), what the score is made of, the shown CSV and
 * what a watch compares. An answer stored before it (distribution-2, final
 * distribution §3.6–§3.8, §4.5, §7.7) renders as it did. The bar's list, the
 * window that stays open on a tick and the focus are checked in the browser.
 */

const text = (markup: string) => markup.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>(<\/span>)?/g, " ").replace(/<span class="term-mark"[^>]*>\?<\/span>/g, " ")
  .replace(/<span class="d-sr-only">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const render = (distribution: DistributionData) => renderToStaticMarkup(createElement(AnswerEvidence.Provider, { value: { open: vi.fn() } },
  createElement(DistributionAnswer, { distribution, spec: { block: "distribution", measure: "value", filters: { authorityId: Number(distribution.focal.entityId) } }, onChangeGroup: () => undefined }) as ReactNode));

describe("the distribution's answer (distribution-3, the risk score)", () => {
  it("leads with the score, its band and its (?), then higher · equal · lower, which add up to the group", () => {
    const markup = render(VASLUI_LIST), shown = text(markup);
    expect(VASLUI_LIST.focal.score).toBe(54);
    expect(markup).toMatch(/<span class="cri-pill dist-pill risk-mid">54 din 100<\/span>/);
    expect(markup).toMatch(/<p class="dist-band qb-tipwrap">risc · moderat /);
    // The (?) scor-risc: what the bands are, and that it is not a probability of corruption.
    expect(markup).toContain('aria-label="Riscul, din 100: ce înseamnă"');
    expect(markup).toContain("Nu este o probabilitate de corupție.");
    expect(shown).toContain("Din celelalte 38 de primării 18 cu scor mai mare 1 la egalitate 19 cu scor mai mic");
    const { higher, equal, lower } = VASLUI_LIST.position!;
    expect(higher + equal + lower).toBe(VASLUI_LIST.group.others);
    expect(shown).not.toMatch(/criterii|indice de risc|Finalizare rapidă|da_rapid/i);
  });

  it("draws the group on 0–100 up to 50 members, the entity named and every member placed or counted", () => {
    const markup = render(VASLUI_LIST);
    expect(markup).toContain('role="img" aria-label="Scorurile celor 38 de primării pe axa 0–100; MUNICIPIUL VASLUI: 54 din 100."');
    expect([...markup.matchAll(/class="dist-strip-tick[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(["0", "20", "40", "68", "100"]);
    expect(markup).toContain('<i class="dist-dot is-focal" style="--x:54;--l:0"');
    const { dots, over } = stripLayout({ id: "f", name: "F", score: 54 }, VASLUI_LIST.members!);
    expect(dots.length - 1 + over.reduce((sum, o) => sum + o.n, 0)).toBe(38);
    expect([...markup.matchAll(/class="dist-dot (?:risk|is-focal)[^"]*" style/g)]).toHaveLength(dots.length);
    // No two dots of a level closer than 2 points; the entity on the axis.
    for (const level of new Set(dots.map((d) => d.level))) {
      const xs = dots.filter((d) => d.level === level).map((d) => d.score).sort((a, b) => a - b);
      xs.forEach((x, i) => { if (i) expect(x - xs[i - 1]!).toBeGreaterThanOrEqual(2); });
    }
    // Many at one place are counted above it, never stacked off the strip.
    const crowd = stripLayout({ id: "f", name: "F", score: 50 }, Array.from({ length: 30 }, (_, i) => ({ entityId: String(i), name: "X", score: 0 })));
    expect([crowd.dots.length, crowd.over, crowd.rows]).toEqual([7, [{ score: 0, n: 24 }], 7]);
  });

  it("lists the members with their scores, the entity first, by score", () => {
    const markup = render(VASLUI_LIST), shown = text(markup);
    expect(shown).toContain("Cine intră în comparație? 38 + MUNICIPIUL VASLUI");
    expect(shown).toMatch(/MUNICIPIUL VASLUI Vaslui · 63\.035 loc\. 1\.953 de achiziții directe 54 din 100 MUNICIPIUL BUZAU Iași · 60\.000 loc\. 2\.000 de achiziții directe 71 din 100/);
    expect(markup).toContain('<span class="risk-high" style="width:71%"></span>');
    expect(markup).toMatch(/<button type="button" class="qb-link dist-all">Arată toate cele 38<\/button>/);
    expect(markup).not.toContain("dist-dots");
  });

  it("says what the score is made of: each pattern's points and fact, how many of the group have it", () => {
    const shown = text(render(VASLUI_LIST));
    expect(shown).toContain(`Din ce se formează riscul ${CRITERION_LABEL.da_split} 18 grupuri · 11% din valoare +44 30 din 38 Vezi cazurile ↗`);
    expect(shown).toContain(`${CRITERION_LABEL.da_round} 37 de achiziții la 96–100% din plafon · așteptat ~14 +10 12 din 38`);
    expect(shown).toContain(`${CRITERION_LABEL.da_above_ceiling} fără tipar 3 din 38`);
    // The patterns it has first, by their points; the national mark beside a chosen group.
    expect(shown.indexOf(CRITERION_LABEL.da_round!)).toBeLessThan(shown.indexOf(CRITERION_LABEL.da_year_end!));
    expect(shown).toContain("bara: cât din grup are tiparul · media țării");
  });

  it("above 50 draws the others by tenths of the score; a bar opens its members, the entity's band marked", () => {
    const markup = render(RUSETU_SCORE_CHART);
    expect(RUSETU_SCORE_CHART.focal.score).toBe(44);
    expect(markup.match(/<button[^>]*class="dist-hcol[^"]*"[^>]*aria-expanded="false"[^>]*aria-controls="dist-bar-members"/g)).toHaveLength(9);
    expect(markup).toMatch(/aria-label="Scor 40–49: 280 de primării, aici e COMUNA RUSETU\. Lista lor"/);
    expect(markup).toMatch(/aria-label="Scor 0: 433 de primării\. Lista lor"/);
    expect(markup).toContain("<em>aici</em>280");
    expect(text(markup)).toContain("clic pe o bară: cine are acel scor");
    expect(markup).not.toContain("dist-strip");
    const out: DistributionDataV3 = { ...RUSETU_SCORE_CHART, focal: { ...RUSETU_SCORE_CHART.focal, inGroup: false } };
    const outside = render(out);
    expect(outside).toContain("<em>ar fi aici</em>280");
    expect(outside).toContain("dist-hcol is-would");
  });

  it("asks for a bar's members by its band of the score; an answer stored before asks by its criteria", () => {
    expect(barMembersQuery(RUSETU_SCORE_CHART, { from: 40, to: 49 }, 0)).toBe("role=authority&id=2145000&from=40&to=49&similar=1");
    expect(barMembersQuery(RUSETU_SCORE_CHART, { from: 90, to: 100 }, 10)).toBe("role=authority&id=2145000&from=90&to=100&offset=10&similar=1");
    expect(barMembersQuery(RUSETU_CHART, 2, 0)).toBe("role=authority&id=2145000&k=2&similar=1");
    // The bands: 0 alone, then tenths from 1–9 to 90–100 (rf-2026.20 scores under 20 too).
    expect(SCORE_BANDS.map((b) => `${b.from}-${b.to}`)).toEqual(["0-0", "1-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"]);
    expect([scoreBandOf(0), scoreBandOf(5), scoreBandOf(68), scoreBandOf(100), scoreBandOf(12)]).toEqual([{ from: 0, to: 0 }, { from: 1, to: 9 }, { from: 60, to: 69 }, { from: 90, to: 100 }, { from: 10, to: 19 }]);
  });

  it("keeps the empty states: under 10 direct acquisitions, a group under 5 with its removals", () => {
    const below: DistributionDataV3 = { ...VASLUI_LIST, status: "below", focal: { ...VASLUI_LIST.focal, nDas: 7 } };
    expect(text(render(below))).toContain("MUNICIPIUL VASLUI are 7 achiziții directe acceptate. Comparația începe de la 10.");
    const small: DistributionDataV3 = { ...VASLUI_LIST, status: "small", group: { ...VASLUI_LIST.group, others: 3 } };
    const shown = text(render(small));
    expect(shown).toContain("Grupul are doar 3 primării. Comparația cere cel puțin 5.");
    expect(shown).toContain("Scoate „populație apropiată”");
  });

  it("exports the entity's score and band, each pattern's points, the bands and the members with their scores", () => {
    const lines = answerCsv({ block: "distribution", distribution: VASLUI_LIST }, { block: "distribution", measure: "value", filters: {} }, "Unde").text.split("\r\n");
    expect(lines[0]).toBe("﻿sectiune,nume,judet,populatie,scor,risc,tipare,achizitii_directe,criteriu,puncte,fapt,scor_de,scor_pana,din_grup,din_tara,entitatea");
    expect(lines[1]).toBe('"entitatea","MUNICIPIUL VASLUI","Vaslui",63035,54,"moderat","da_split|da_round",1953,,,,,,,,da');
    expect(lines[2]).toBe(`"criteriu",,,,,,,,"${CRITERION_LABEL.da_split} (da_split)",44,"18 grupuri · 11% din valoare",,,30,3610,da`);
    expect(lines[3]).toBe(`"criteriu",,,,,,,,"${CRITERION_LABEL.da_round} (da_round)",10,"37 de achiziții la 96–100% din plafon · așteptat ~14",,,12,1210,da`);
    expect(lines[6]).toBe(`"criteriu",,,,,,,,"${CRITERION_LABEL.da_above_ceiling} (da_above_ceiling)",0,"",,,3,640,nu`);
    expect(lines[7]).toBe('"scor",,,,,,,,,,,0,0,2,,');
    expect(lines.find((line) => line.startsWith('"scor",,,,,,,,,,,50,'))).toBe('"scor",,,,,,,,,,,50,59,10,,da');
    expect(lines.filter((line) => line.startsWith('"grup"'))).toHaveLength(38);
    expect(lines.find((line) => line.startsWith('"grup"'))).toBe('"grup","MUNICIPIUL BUZAU","Iași",60000,71,"puternic","da_split|da_round",2000,,,,,,,,');
    expect(lines.join("\n")).not.toMatch(/da_rapid|Finalizare/);
  });

  it("is compared by a watch on its score, its group and higher · equal · lower, not the members' own scores", () => {
    const data = { block: "distribution", distribution: VASLUI_LIST };
    const core = answerCore("distribution", data) as { distribution: Record<string, unknown> };
    expect(Object.keys(core.distribution).sort()).toEqual(["focal", "group", "position", "role", "status", "version"]);
    expect(core.distribution.focal).toEqual({ entityId: "2146445", score: 54, inGroup: true });
    // A member's score moving on its side, the list's order, the bands, the country, the words: not a change.
    const members = VASLUI_LIST.members!.map((m, i) => i === 0 ? { ...m, score: 75 } : m);
    const moved: DistributionDataV3 = { ...VASLUI_LIST, members: [...members].reverse(), group: { ...VASLUI_LIST.group, memberIds: [...VASLUI_LIST.group.memberIds!].reverse(), words: "altfel" },
      hist: VASLUI_LIST.hist!.map((h) => ({ ...h, n: h.n + 1 })), countryTotal: 15_800 };
    expect(sameAnswerCore("distribution", data, { block: "distribution", distribution: moved })).toBe(true);
    // The entity's score, the counts, the group's members: a change.
    const score: DistributionDataV3 = { ...VASLUI_LIST, focal: { ...VASLUI_LIST.focal, score: 55 } };
    const position: DistributionDataV3 = { ...VASLUI_LIST, position: { higher: 17, equal: 2, lower: 19 } };
    const member: DistributionDataV3 = { ...VASLUI_LIST, group: { ...VASLUI_LIST.group, memberIds: [...VASLUI_LIST.group.memberIds!.slice(1), "9"] } };
    for (const after of [score, position, member]) expect(sameAnswerCore("distribution", data, { block: "distribution", distribution: after })).toBe(false);
  });
});

describe("an answer stored before (distribution-2, the criteria)", () => {
  it("opens a bar's members (not only their records) above 50, and marks the entity's column", () => {
    const markup = render(RUSETU_CHART);
    expect(markup.match(/<button[^>]*class="dist-col[^"]*"[^>]*aria-expanded="false"[^>]*aria-controls="dist-bar-members"/g)).toHaveLength(4);
    expect(markup).toMatch(/aria-label="2 criterii: 442 de primării, aici e COMUNA RUSETU\. Lista lor"/);
    expect(text(markup)).toContain("clic pe o bară: cine are acel număr");
  });

  it("says „ar fi aici”, unfilled, when an old link's county leaves the entity out of its group", () => {
    const out: DistributionData = { ...RUSETU_CHART, focal: { ...RUSETU_CHART.focal, inGroup: false } };
    const markup = render(out);
    expect(markup).toContain("<em>ar fi aici</em>442");
    expect(markup).not.toContain("<em>aici</em>");
    expect(markup).toContain("dist-col is-would");
    expect(markup).not.toContain("dist-col is-here");
    expect(markup).toContain("aici ar fi COMUNA RUSETU");
  });

  it("anchors the group's and the criteria's (?) on their rows; a link to another page is ↗; a retired criterion shows its code", () => {
    const markup = render(BUZAU_LIST);
    expect(markup).toContain('class="dist-group qb-tipwrap"');
    expect(markup).toMatch(/<h3 class="qb-tipwrap">Criteriu cu criteriu/);
    expect(text(markup)).toContain("Vezi cazurile ↗");
    expect(text(markup)).not.toContain("Vezi cazurile →");
    expect(markup).toMatch(/<button type="button" class="qb-link dist-all">Arată toate cele 29<\/button>/);
    expect(text(markup)).toContain("3 din 5 criterii");
    expect(text(markup)).toContain("da_rapid");
  });

  it("asks for a bar's members with the answer's group: its ticks, the entity's county, an old link's kind", () => {
    expect(barMembersQuery(RUSETU_CHART, 2, 0)).toBe("role=authority&id=2145000&k=2&similar=1");
    const county: DistributionData = { ...RUSETU_CHART, group: { ...RUSETU_CHART.group, ticks: ["similar", "county", "activity"] } };
    expect(barMembersQuery(county, 1, 10)).toBe("role=authority&id=2145000&k=1&offset=10&similar=1&activity=1&county=Buz%C4%83u");
    const legacy: DistributionData = { ...RUSETU_CHART, group: { ...RUSETU_CHART.group, ticks: [], legacy: { county: "Cluj", authorityKind: "comuna" } } };
    expect(barMembersQuery(legacy, 0, 0)).toBe("role=authority&id=2145000&k=0&county=Cluj&kind=comuna");
  });

  it("exports the chart, each criterion against the group and the country, the entity and the members on screen (final §7.7)", () => {
    const lines = answerCsv({ block: "distribution", distribution: BUZAU_LIST }, { block: "distribution", measure: "value", filters: {} }, "Unde").text.split("\r\n");
    expect(lines[0]).toBe("﻿sectiune,criterii,indice_de_risc,criteriu,nume,judet,populatie,semnale,achizitii_directe,din_grup,din_tara,entitatea");
    expect(lines[1]).toBe('"criterii",0,0,,,,,,,1,,');
    expect(lines[4]).toBe('"criterii",3,0.6,,,,,,,0,,da');
    expect(lines[7]).toBe(`"criteriu",,,"${CRITERION_LABEL.da_split} (da_split)",,,,,,27,3921,da`);
    expect(lines[11]).toBe(`"criteriu",,,"${CRITERION_LABEL.da_concentration} (da_concentration)",,,,,,0,383,nu`);
    expect(lines[12]).toBe('"entitatea",3,0.6,,"MUNICIPIUL BUZAU","Buzău",103481,"da_split|da_year_end|da_round",782,,,da');
    expect(lines.filter((line) => line.startsWith('"grup"'))).toHaveLength(29);
  });

  it("is compared by a watch as distribution-2 compared it", () => {
    const core = answerCore("distribution", { block: "distribution", distribution: BUZAU_LIST }) as { distribution: Record<string, unknown> };
    expect(Object.keys(core.distribution).sort()).toEqual(["focal", "group", "hist", "members", "perCriterion", "position", "role", "status", "version"]);
  });
});
