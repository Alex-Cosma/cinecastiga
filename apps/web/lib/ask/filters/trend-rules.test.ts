import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultQuestion, questionErrors, questionKey, transitionQuestion, type QuestionSpec } from "../question-ui";
import { encodeSpec } from "../permalink";
import type { CoveragePeriods } from "../months-window";
import { validateSpec } from "../spec";
import { KEY_VERSION_NOTES } from "../answer-core";
import { builderView } from "../../../app/intreaba/builder/view";
import UnderChips from "../../../app/intreaba/builder/UnderChips";
import { BLOCK_FILTERS } from "./blocks";
import { filterContext } from "./context";
import { legacyConditions, presentConditions } from "./legacy-conditions";
import { choicesOf, choiceState } from "./pickers";
import { engineError, REQUIRED_INPUTS } from "./probe";
import { restoreLink } from "./restore";
import { chooseQuestion, chooseValue, restoreParked } from "./transition";
import { COUNTIES_ALL_BUY, enterTrend, trendMonthsState, trendMonthsWaiting } from "./trend-rules";
import type { FilterId, FilterSpec, Slot } from "./types";

/*
 * The trend in the builder (S3 F2-builder; plan §4.7, trend final §3.2, §3.3,
 * §4.2, §4.3, §4.6): what entering it writes, what leaving it sets aside, what
 * follows a choice on it, "Aceleași luni" under its sentence by the compared
 * year's state, and old links opened as they were.
 */

/** The local copy: no "complet până la" day on either channel (both go to 25 Sept. 2026). */
const LOCAL: CoveragePeriods = { da: { from: "2018-04-02", to: "2026-09-25", completeUntil: null }, contracts: { from: "2000-01-06", to: "2026-09-25", completeUntil: null }, checkpoint: "c1" };
/** Production-like: both channels complete until 31 May 2026 (trend final §3.3). */
const COMPLETE_MAY: CoveragePeriods = { da: { from: "2018-04-02", to: "2026-09-25", completeUntil: "2026-05-31" }, contracts: { from: "2000-01-06", to: "2026-09-25", completeUntil: "2026-06-15" }, checkpoint: "c2" };
const YEAR = 2026;

const q = (spec: Partial<QuestionSpec> & { block: string }): FilterSpec =>
  transitionQuestion({ measure: "value", filters: {}, ...spec } as QuestionSpec).spec as FilterSpec;
const ctxOf = (spec: FilterSpec, coverage?: CoveragePeriods) => filterContext(spec, { year: YEAR, ...(coverage ? { coverage } : {}) });
const phrase = (spec: FilterSpec, id: FilterId): Slot => {
  const found = BLOCK_FILTERS.trend.sentence(spec, ctxOf(spec)).find((s) => s.id === id || s.writes?.includes(id));
  if (!found) throw new Error(`no phrase for ${id}`);
  return found;
};
const trendOf = (spec: Partial<FilterSpec>) => q({ block: "trend", dim: "supplier", topN: 10, ...spec, filters: { yearFrom: 2024, yearTo: 2025, ...spec.filters } });

describe("entering the trend (plan §2.6, trend final §3.2, §4.2)", () => {
  const enter = (from: FilterSpec, coverage: CoveragePeriods | null = LOCAL) => chooseQuestion(from, "trend", null, { coverage });

  it("writes a new trend: the growths, the same months, the default years", () => {
    const to = enter(defaultQuestion() as FilterSpec);
    expect([to.spec.trend, to.spec.filters.yearFrom, to.spec.filters.yearTo, to.notes]).toEqual([{ change: "up", months: "auto" }, 2024, 2025, []]);
    expect(questionErrors(to.spec)).toEqual([]);
    // The S2 gap: the catalogue's trend asked "Alege doi ani"; without the archive's periods it still does.
    expect(questionErrors(enter(defaultQuestion() as FilterSpec, null).spec)).toEqual(["Alege doi ani diferiți pentru a vedea schimbarea."]);
    expect(validateSpec(to.spec)).not.toHaveProperty("error");
  });

  it("reads another question's period: one year against the one before, a range by its ends, a year's months on both", () => {
    const one = enter(q({ block: "stat", filters: { yearFrom: 2025, yearTo: 2025 } }));
    expect([one.spec.filters.yearFrom, one.spec.filters.yearTo, one.notes]).toEqual([2024, 2025, ["Am comparat 2025 cu anul dinainte."]]);
    const range = enter(q({ block: "table", dim: "supplier", filters: { yearFrom: 2021, yearTo: 2023 } }));
    expect([range.spec.filters.yearFrom, range.spec.filters.yearTo, range.notes]).toEqual([2021, 2023, ["Am comparat capetele perioadei: 2021 și 2023."]]);
    // Two consecutive years are already the pair: nothing to say.
    expect(enter(q({ block: "table", dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } })).notes).toEqual([]);
    const months = enter(q({ block: "stat", filters: { yearFrom: 2025, yearTo: 2025, monthFrom: 1, monthTo: 5 } }));
    expect([months.spec.trend, months.spec.filters, months.notes]).toEqual([
      { change: "up", months: [1, 5] }, { yearFrom: 2024, yearTo: 2025 }, ["Am comparat ian.–mai 2025 cu aceleași luni din 2024."],
    ]);
    expect(validateSpec(months.spec)).not.toHaveProperty("error");
    // Months across years leave: a trend counts whole years or its own months.
    const across = enter(q({ block: "stat", filters: { yearFrom: 2023, yearTo: 2025, monthFrom: 3, monthTo: 6 } }));
    expect([across.spec.filters, across.spec.trend?.months]).toEqual([{ yearFrom: 2023, yearTo: 2025 }, "auto"]);
  });

  it("starts in 2019: 2018 is incomplete (trend final §3.2, removed from the trend only)", () => {
    const from2018 = enter(q({ block: "table", dim: "supplier", filters: { yearFrom: 2018, yearTo: 2021 } }));
    expect([from2018.spec.filters.yearFrom, from2018.spec.filters.yearTo, from2018.notes]).toEqual([2019, 2021, ["Am comparat 2019 cu 2021: 2018 e incomplet în date."]]);
    const year2018 = enter(q({ block: "stat", filters: { yearFrom: 2018, yearTo: 2018 } }));
    expect([year2018.spec.filters.yearFrom, year2018.spec.filters.yearTo, year2018.notes]).toEqual([2019, 2020, ["Am comparat 2019 cu 2020: 2018 e incomplet în date."]]);
    // An old trend link with 2018 keeps it (restore never rewrites).
    const link = restoreLink({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2018, yearTo: 2019 } });
    expect(link.kind === "draft" && [link.spec.filters.yearFrom, link.run]).toEqual([2018, true]);
  });

  it("is done once, on entering: the same block chosen again keeps the draft", () => {
    const trend = trendOf({ trend: { change: "down" } });
    expect(chooseQuestion(trend, "trend", null, { coverage: LOCAL }).spec.trend).toEqual({ change: "down" });
    expect(enterTrend(q({ block: "stat" }), trendOf({}), null).spec.trend).toEqual({ change: "up", months: "auto" });
  });
});

describe("leaving the trend sets its options aside (plan §2.4, kit §5.43)", () => {
  const options = trendOf({ trend: { change: "new", firstOnly: true, months: "whole" } });

  it("parks what the reader chose, never in the link; the defaults leave without a chip", () => {
    const table = chooseQuestion(options, "table", null, { coverage: LOCAL });
    expect(table.spec).not.toHaveProperty("trend");
    expect(table.parked).toMatchObject({ label: "Doar la schimbare", lens: "trend" });
    expect(table.parked?.items.map((item) => [item.id, item.label])).toEqual([["trendChange", "Noi față de 2024"], ["trendFirstOnly", "Prima dată în 2025"], ["trendMonths", "Ani întregi"]]);
    expect([table.notes, table.dropped]).toEqual([[], []]);
    expect(encodeSpec(table.spec as never)).toBe(encodeSpec(chooseQuestion(trendOf({ trend: { change: "up", months: "auto" } }), "table").spec as never));
    expect(chooseQuestion(trendOf({ trend: { change: "up", months: "auto" } }), "table").parked).toBeNull();
  });

  it("waits through other questions, and one parked chip brings the trend back with all of them", () => {
    const table = chooseQuestion(options, "table", null, { coverage: LOCAL });
    const map = chooseQuestion(table.spec, "map", table.parked, { coverage: LOCAL });
    expect([map.parked?.lens, map.dropped]).toEqual(["trend", []]);
    const edited = chooseValue(map.spec, BLOCK_FILTERS.map.sentence(map.spec, ctxOf(map.spec)).find((s) => s.id === "dataset" || s.id === "cpvTerm")!, { filter: "cpvTerm", value: "asfaltare" }, map.parked);
    expect(edited.parked?.lens).toBe("trend");
    const back = restoreParked(map.spec, map.parked!, { coverage: LOCAL });
    expect([back.spec.block, back.spec.trend, back.parked]).toEqual(["trend", { change: "new", months: "whole", firstOnly: true }, null]);
    expect(validateSpec(back.spec)).not.toHaveProperty("error");
    // Through the catalogue too.
    expect(chooseQuestion(table.spec, "trend", table.parked, { coverage: LOCAL }).spec.trend).toEqual({ change: "new", months: "whole", firstOnly: true });
  });
});

describe("what follows a choice on the trend (trend final §4.3)", () => {
  it("brings counties back to the growths without a firm or a domain, with the note", () => {
    const fresh = trendOf({ trend: { change: "new", months: "auto" } });
    const counties = chooseValue(fresh, phrase(fresh, "dim"), { filter: "dim", value: { dim: "county" } });
    expect([counties.spec.dim, counties.spec.trend, counties.notes]).toEqual(["county", { change: "up", months: "auto" }, [COUNTIES_ALL_BUY]]);
    // With a domain, the new counties are a question: kept.
    const domain = trendOf({ trend: { change: "gone" }, filters: { cpvTerm: "asfaltare" } });
    expect(chooseValue(domain, phrase(domain, "dim"), { filter: "dim", value: { dim: "county" } }).spec.trend).toEqual({ change: "gone" });
  });

  it("keeps the order and base on the growths only, the first year on the new ones, each leaving with a note", () => {
    const percent = trendOf({ trend: { change: "up", order: "percent", minBase: 1_000_000 } });
    const down = chooseValue(percent, phrase(percent, "trendChange"), { filter: "trendChange", value: "down" });
    expect(down.spec.trend).toEqual({ change: "down" });
    expect(down.notes).toEqual(["Am scos „după creșterea în procente”: nu se potrivește cu alegerea nouă.", "Am scos „dintre firmele cu cel puțin 1 mil. lei în 2024”: nu se potrivește cu alegerea nouă."]);
  });

  it("puts «Aceleași luni» back by itself when a year past the complete months is chosen", () => {
    const whole = trendOf({ trend: { change: "up", months: "whole" } });
    const slot = phrase(whole, "period");
    const running = chooseValue(whole, slot, { filter: "period", value: { yearFrom: 2025, yearTo: 2026 } }, null, { coverage: COMPLETE_MAY });
    expect(running.spec.trend).toEqual({ change: "up", months: "auto" });
    // Complete years stay whole; without the periods nothing is assumed.
    expect(chooseValue(whole, slot, { filter: "period", value: { yearFrom: 2023, yearTo: 2024 } }, null, { coverage: COMPLETE_MAY }).spec.trend?.months).toBe("whole");
    expect(chooseValue(whole, slot, { filter: "period", value: { yearFrom: 2025, yearTo: 2026 } }).spec.trend?.months).toBe("whole");
  });
});

describe("«Aceleași luni» under the sentence (trend final §3.3, kit P4)", () => {
  const view = (spec: FilterSpec, coverage?: CoveragePeriods) => builderView(spec, {}, ctxOf(spec, coverage));
  const running = (months: unknown) => trendOf({ filters: { yearFrom: 2025, yearTo: 2026 }, trend: (months === undefined ? { change: "up" } : { change: "up", months }) as NonNullable<FilterSpec["trend"]> });

  it("is the amber chip with the months the answer will count; × compares whole years", () => {
    expect(trendMonthsState(running("auto"), ctxOf(running("auto"), COMPLETE_MAY))).toEqual({ kind: "auto", year: 2026, window: { from: 1, to: 5, mode: "auto" }, through: "2026-05-31" });
    const v = view(running("auto"), COMPLETE_MAY);
    expect(v.under).toEqual([expect.objectContaining({ kind: "auto", id: "u:trendMonths", label: "Aceleași luni: ian.–mai" })]);
    expect(v.removals["u:trendMonths"]).toMatchObject({ kind: "choice", choice: { filter: "trendMonths", value: "whole" } });
    expect(v.windows["u:trendMonths"]?.title).toBe("Ce luni compari?");
    expect(v.waiting).toBeNull();
    const markup = renderToStaticMarkup(createElement(UnderChips, { items: v.under, onRemove: () => {} }));
    expect(markup).toContain("Datele din 2026 sunt complete până la 31 mai.");
    expect(markup).toContain('aria-label="Scoate «Aceleași luni»"');
  });

  it("says the months are not confirmed where a channel has no «complet până la», and the run waits for a choice", () => {
    const v = view(running("auto"), LOCAL);
    expect(v.under).toEqual([expect.objectContaining({ kind: "notice", label: "2026: luni neconfirmate", action: "Compară pe aceleași luni…" })]);
    expect(v.removals["u:trendMonths"]).toBeUndefined();
    expect(v.waiting).toBe("Lunile complete din 2026 nu sunt confirmate în date. Alege lunile comparate sau ani încheiați.");
    // Its window: the automatic months disabled with the reason, whole years and the months to choose.
    const slot = v.windows["u:trendMonths"]!.slot;
    const auto = choicesOf(slot, running("auto"), ctxOf(running("auto"), LOCAL)).find((c) => c.value === "auto")!;
    expect(choiceState(slot, auto, running("auto"), ctxOf(running("auto"), LOCAL))).toEqual({ state: "disabled", reason: v.waiting });
    expect(trendMonthsState(running("auto"), ctxOf(running("auto"), LOCAL))).toMatchObject({ kind: "unconfirmed", prefill: [1, 8], channels: ["da", "contracts"] });
    // Chosen months run; so do whole years.
    expect(trendMonthsWaiting(running([1, 8]), ctxOf(running([1, 8]), LOCAL))).toBeNull();
    expect(view(running([1, 8]), LOCAL).under).toEqual([expect.objectContaining({ kind: "only", label: "Aceleași luni: ian.–aug." })]);
    expect(view(running([1, 8]), LOCAL).removals["u:trendMonths"]).toMatchObject({ choice: { value: "auto" } });
  });

  it("is a switch once removed (or on an old link) on an incomplete year, and nothing on complete years", () => {
    expect(view(running("whole"), COMPLETE_MAY).under).toEqual([{ kind: "toggle", id: "u:trendMonths", label: "Aceleași luni", glyph: "half" }]);
    expect(view(running("whole"), COMPLETE_MAY).removals["u:trendMonths"]).toMatchObject({ choice: { value: "auto" } });
    // Where the automatic months cannot be said, the switch opens the window.
    expect(view(running(undefined), LOCAL).under).toEqual([{ kind: "toggle", id: "u:trendMonths", label: "Aceleași luni", glyph: "half", opens: true }]);
    const markup = renderToStaticMarkup(createElement(UnderChips, { items: view(running("whole"), COMPLETE_MAY).under }));
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("qb-half");
    for (const months of ["auto", "whole", undefined]) expect(view(trendOf(months ? { trend: { change: "up", months } as NonNullable<FilterSpec["trend"]> } : {}), LOCAL).under).toEqual([]);
    // Without the periods (before /api/data-coverage answers), only a running calendar year shows the rule.
    expect(view(running("auto")).under).toEqual([expect.objectContaining({ kind: "auto", label: "Aceleași luni" })]);
    expect(view(trendOf({ trend: { change: "up", months: "auto" } })).under).toEqual([]);
  });
});

describe("old trend links open as they were (plan §2.6, trend final §4.6)", () => {
  it("open clean without the key: «Toate» on whole years, nothing rewritten", () => {
    const raw = { block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 } };
    const link = restoreLink(raw);
    if (link.kind !== "draft") throw new Error(link.error);
    // F4: a trend of firms now shows each firm's seat; a restored link says it once (seat-2, „Ce se schimbă”).
    expect([link.run, link.conditions, link.notes, questionKey(link.spec)]).toEqual([true, [], [KEY_VERSION_NOTES["seat-2"]], questionKey(link.link)]);
    expect(link.spec).not.toHaveProperty("trend");
  });

  it("show every trend option as the question's own, and refuse a threshold on its chip with a short reason", () => {
    const months = restoreLink({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2025, yearTo: 2026 }, trend: { change: "new", months: "auto", firstOnly: true } });
    expect(months.kind === "draft" && [months.run, months.conditions]).toEqual([true, []]);
    const threshold = restoreLink({ block: "trend", dim: "supplier", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025 }, minimumRecords: { role: "supplier", count: 2 } });
    expect(threshold.kind === "draft" && threshold.conditions.map((c) => [c.label, c.status, c.why])).toEqual([["Din link: firme cu cel puțin 2 înregistrări în selecție", "refused", "Un prag de înregistrări nu se aplică diferenței dintre doi ani."]]);
    // Applied conditions the trend does not offer stay "Din link" chips (population, single bidder, a person).
    const person = restoreLink({ block: "trend", dim: "authority", measure: "value", topN: 10, filters: { yearFrom: 2024, yearTo: 2025, adminPersonKey: "ion|1970-01-01|x", adminName: "ION" } });
    expect(person.kind === "draft" && person.conditions.map((c) => [c.key, c.status])).toEqual([["admin", "applied"]]);
  });
});

describe("the pairs of the trend's offers with the archive's periods (R1)", () => {
  // registry.test.ts walks every pair without the periods; here the trend's own rules that read them.
  it("never lets the builder run what the engine refuses, nor hides or silently drops a condition", () => {
    const problems: string[] = [];
    let pairs = 0;
    for (const coverage of [LOCAL, COMPLETE_MAY]) {
      const start = chooseQuestion(defaultQuestion(), "trend", null, { coverage }).spec;
      const bases = [start, { ...start, dim: "authority" } as FilterSpec, { ...start, dim: "county" } as FilterSpec, chooseValue(start, phrase(start, "period"), { filter: "period", value: { yearFrom: 2025, yearTo: 2026 } }, null, { coverage }).spec];
      for (const base of bases) for (const first of offered(base, coverage)) {
        const one = chooseValue(base, first.slot, first.choice, null, { coverage }).spec;
        for (const second of offered(one, coverage)) {
          const to = chooseValue(one, second.slot, second.choice, null, { coverage });
          pairs++;
          const errors = questionErrors(to.spec), waiting = trendMonthsWaiting(to.spec, ctxOf(to.spec, coverage));
          if (!errors.length && !waiting && engineError(to.spec)) problems.push(`engine refuses ${JSON.stringify(to.spec)}`);
          if (errors.some((e) => !REQUIRED_INPUTS.includes(e))) problems.push(`refused (${errors.join(" / ")}) ${JSON.stringify(to.spec)}`);
          for (const id of presentConditions(to.spec).keys()) if (legacyConditions(to.spec).some((c) => c.key === id && c.origin === "link")) problems.push(`chip ${id} ${JSON.stringify(to.spec)}`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
    expect(pairs).toBeGreaterThan(1_000);
    // ~2 s alone; the whole suite on a shared machine took it to 6.4 s, past the default 5 s (S4 review).
  }, 30_000);
});

/** The rows a trend's places offer on a draft (with the periods), the ones a reader can choose. */
function offered(spec: FilterSpec, coverage: CoveragePeriods) {
  const ctx = ctxOf(spec, coverage);
  const entry = BLOCK_FILTERS.trend;
  const slots = [...entry.sentence(spec, ctx), ...entry.under(spec, ctx), ...entry.presentation(spec, ctx), ...entry.strip.map((id) => ({ id })), ...entry.rows(spec, ctx).flatMap((r) => r.chips)];
  return slots.filter((slot) => slot.id.startsWith("trend") || slot.id === "period" || slot.id === "dim").flatMap((slot) => choicesOf(slot, spec, ctx)
    .filter((choice) => choiceState(slot, choice, spec, ctx).state === "offered").map((choice) => ({ slot, choice })));
}
