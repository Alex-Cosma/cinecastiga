import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trendFixture, trendSpec } from "../../lib/ask/fixtures/trend-screen";
import type { AskSpec } from "../../lib/ask/spec";
import { AnswerEvidence } from "./AnswerEvidence";
import TrendBlock, { type TrendBlockProps } from "./TrendAnswer";

/*
 * TB-screen, the trend's answer as markup (plan §4.7 P6, P8; trend final §4.1,
 * §4.4): the five buttons from the composition, the applied list's rows from
 * the lists the answer holds (owner-R-facts-all-lists: no request on a switch),
 * an empty group, an answer stored before trend-2. The clicks, the URL and the
 * 409 reload are checked in the browser (par-tb/tb-flow.mjs).
 */

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tags = (markup: string, re: RegExp) => markup.match(re) ?? [];
const open = vi.fn();
const render = (props: Partial<TrendBlockProps> & { spec: AskSpec }, evidence = true): string => {
  const block = createElement(TrendBlock, { data: trendFixture(), ...props });
  return renderToStaticMarkup(evidence ? createElement(AnswerEvidence.Provider, { value: { open } }, block as ReactNode) : block);
};
afterEach(() => vi.unstubAllGlobals());

describe("the trend's answer", () => {
  it("draws the applied list from the data on screen, with no request, whatever group is chosen", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const up = text(render({ spec: trendSpec({ change: "up", months: "auto" }) }));
    const fresh = text(render({ spec: trendSpec({ change: "new", months: "auto" }) }));
    const first = text(render({ spec: trendSpec({ change: "new", firstOnly: true, months: "auto" }) }));
    expect(up).toContain("ALFA CONSTRUCT SRL");
    expect(up).not.toContain("BETA SERV SRL");
    expect(fresh).toContain("BETA SERV SRL");
    expect(fresh).toContain("GAMMA GMBH");
    expect(first).toContain("BETA SERV SRL");
    expect(first).not.toContain("GAMMA GMBH");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("has five group buttons as a radiogroup, the chosen one checked, a group of 0 disabled", () => {
    const data = trendFixture({ composition: { ...trendFixture().composition, gone: { count: 0, valueA: 0, valueB: 0 } } });
    const markup = render({ data, spec: trendSpec({ change: "new" }) });
    const radios = tags(markup, /<button[^>]*class="fk-group[^"]*"[^>]*>/g);
    expect(radios).toHaveLength(5);
    expect(markup).toContain('role="radiogroup" aria-label="Felul schimbării"');
    expect(radios.filter((r) => r.includes('aria-checked="true"'))).toHaveLength(1);
    expect(text(markup)).toContain("Noi 2 · +1.200 lei");
    expect(radios.filter((r) => r.includes('aria-disabled="true"'))).toHaveLength(1);
    expect(text(markup)).toContain("Nicio firmă care să nu mai apară.");
    // Its reason is visible too: a line under the buttons, the reason in its (?).
    expect(markup).toMatch(/<p class="fk-trend-off fk-tipwrap">Grup gol: Nu mai apar/);
    // On the new ones: „Toate · Prima dată în 2025”, beside „Noi” with its year.
    expect(text(markup)).toMatch(/Firme noi față de 2024: .*Toate 2 Prima dată în 2025 1/);
  });

  it("shows on a row its labels, partner and change, „Înregistrări →”, and no county beside a firm", () => {
    const markup = render({ spec: trendSpec({ change: "up" }) });
    const shown = text(markup);
    expect(shown).toContain("1 contract: 86%");
    expect(shown).toContain("40% de la PRIMARIA EXEMPLU");
    expect(shown).toContain("+1.400");
    expect(markup).toContain('aria-label="Înregistrări: ALFA CONSTRUCT SRL"');
    expect(markup).toContain('href="/entitati/1"');
    expect(shown).not.toContain("București");
    expect(shown).toContain("Creșteri: 1 firmă · 2024 100 lei → 2025 1.500 lei");
  });

  it("puts an institution's county beside it, and a swatch with its group on every row of „Toate”", () => {
    const markup = render({ data: trendFixture({ noun: "instituții" }), spec: trendSpec({ change: "all" }, { dim: "authority" }) });
    expect(text(markup)).toContain("ALFA CONSTRUCT SRL București");
    expect(tags(markup, /class="fk-sw fk-sw--(up|new|down|gone|all) fk-trow-sw"/g)).toHaveLength(5);
    expect(text(markup)).toContain("scădere: DELTA SA");
  });

  it("offers „Vezi toate schimbările” on an empty group, and no total line under it", () => {
    const data = trendFixture({ groups: { ...trendFixture().groups, gone: [] }, composition: { ...trendFixture().composition, gone: { count: 0, valueA: 0, valueB: 0 } } });
    const shown = text(render({ data, spec: trendSpec({ change: "gone" }) }));
    expect(shown).toContain("Nicio firmă care să nu mai apară. Toate firmele din 2024 au înregistrări și în 2025, în această selecție.");
    expect(shown).toContain("Vezi toate schimbările");
    expect(shown).not.toContain("Nu mai apar în 2025: 0");
  });

  it("still draws an answer stored before trend-2: its one list, no buttons", () => {
    const old = trendFixture({ groups: undefined, composition: undefined, list: undefined, change: undefined, rowFacts: undefined, noun: undefined, months: undefined });
    const markup = render({ data: old, spec: trendSpec() });
    expect(markup).not.toContain("fk-group");
    expect(text(markup)).toContain("ALFA CONSTRUCT SRL");
    expect(text(markup)).toContain("+1.400");
  });

  it("has no records buttons outside an answer with sources", () => {
    expect(render({ spec: trendSpec({ change: "up" }) }, false)).not.toContain("fk-rec");
  });

  it("marks the partly covered years", () => {
    const shown = text(render({ spec: trendSpec({ change: "up" }), partial: [{ year: 2025, note: "date până la 25.09.2025", provisional: true }] }));
    expect(shown).toContain("2025 (date până la 25.09.2025)");
    expect(shown).toContain("2024 100 lei → 2025* 1.500 lei");
    expect(shown).not.toContain("2024*");
  });

  it("marks the partly covered year on the one-year lists too, so the note always points at something (`whole` keeps it)", () => {
    const partial = [{ year: 2025, note: "date până la 25.09.2025" }];
    const gone = text(render({ spec: trendSpec({ change: "gone", months: "whole" }), partial }));
    expect(gone).toContain("Nu mai apar în 2025*: 1 firmă · 50 lei în 2024 · ");
    expect(gone).not.toContain("în 2024 lei");
    const fresh = text(render({ spec: trendSpec({ change: "new", months: "whole" }), partial }));
    expect(fresh).toContain("900 lei în 2025*");
    expect(fresh).toContain("1.200 lei în 2025*");
  });

  it("lets the two-year total break between its years, each year whole with its sum", () => {
    const markup = render({ spec: trendSpec({ change: "up" }) });
    expect(markup).toContain('<span class="fk-nowrap"><i class="fk-trend-y">2024</i> <span class="fk-num">100 lei</span></span> <span class="fk-nowrap"><i class="fk-trend-y">→ 2025</i>');
  });

  it("ranks the growths in percent with the percent as the main figure and its caveat under the list (trend final §3.9)", () => {
    const data = trendFixture({ composition: { ...trendFixture().composition, eligible: { count: 1, valueA: 100, valueB: 1500 } } });
    const markup = render({ data, spec: trendSpec({ change: "up", order: "percent", minBase: 100 }) });
    expect(markup).toMatch(/<span class="fk-num fk-trow-delta up"><span aria-hidden="true">×15<\/span>/);
    expect(markup).toContain('<span class="fk-trow-pct">+1.400 lei</span>');
    expect(text(markup)).toContain("Creșterea în procente");
    expect(markup).toContain("e un indiciu de verificat în surse, nu o concluzie.");
    // The buttons keep the partition: every growth.
    expect(text(markup)).toContain("Creșteri 1 · +1.400 lei");
  });
});
