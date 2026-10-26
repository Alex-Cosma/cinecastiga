import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BUZAU_LIST, RUSETU_CHART } from "../../lib/ask/fixtures/distribution-screen";
import type { DistributionData } from "../../lib/ask/compile";
import { barMembersQuery } from "../../lib/ask/peer-groups-shared";
import { answerCsv } from "./answer-csv";
import { AnswerEvidence } from "./AnswerEvidence";
import DistributionAnswer from "./DistributionAnswer";

/*
 * distribution-2 as markup (final distribution §3.6–§3.8, §4.5, §7.7): a bar of
 * the chart opens the group's members with that many criteria (the list's
 * rows, ten at a time, then their records), the entity's column when an old
 * link leaves it out of the group, the tips anchored on their rows, the links'
 * arrows (kit R8) and the shown CSV. The bar's list, the window that stays
 * open on a tick and the focus are checked in the browser (par-f6a/fix).
 */

const text = (markup: string) => markup.replace(/<span[^>]*role="tooltip"[^>]*>.*?<\/span>(<\/span>)?/g, " ").replace(/<span class="term-mark"[^>]*>\?<\/span>/g, " ")
  .replace(/<span class="d-sr-only">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const render = (distribution: DistributionData) => renderToStaticMarkup(createElement(AnswerEvidence.Provider, { value: { open: vi.fn() } },
  createElement(DistributionAnswer, { distribution, spec: { block: "distribution", measure: "value", filters: { authorityId: Number(distribution.focal.entityId) } }, onChangeGroup: () => undefined }) as ReactNode));

describe("the distribution's answer", () => {
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

  it("anchors the group's and the criteria's (?) on their rows; a link to another page is ↗", () => {
    const markup = render(BUZAU_LIST);
    expect(markup).toContain('class="dist-group qb-tipwrap"');
    expect(markup).toMatch(/<h3 class="qb-tipwrap">Criteriu cu criteriu/);
    expect(text(markup)).toContain("Vezi cazurile ↗");
    expect(text(markup)).not.toContain("Vezi cazurile →");
    expect(markup).toMatch(/<button type="button" class="qb-link dist-all">Arată toate cele 29<\/button>/);
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
    expect(lines[7]).toBe('"criteriu",,,"Posibilă fracționare (da_split)",,,,,,27,3921,da');
    expect(lines[11]).toBe('"criteriu",,,"Concentrare pe un furnizor (da_concentration)",,,,,,0,383,nu');
    expect(lines[12]).toBe('"entitatea",3,0.6,,"MUNICIPIUL BUZAU","Buzău",103481,"da_split|da_year_end|da_round",782,,,da');
    expect(lines.filter((line) => line.startsWith('"grup"'))).toHaveLength(29);
  });
});
