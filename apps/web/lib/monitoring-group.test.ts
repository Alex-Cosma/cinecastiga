import { describe, expect, it } from "vitest";
import { groupCheckNotes, groupPinnedNote, membersOfQuestion, MEMBERS_MISMATCH, monitoringHasLocalSelection, movedWindowNote, watchedGroupLabel, watchedTrendGroup } from "./monitoring-input";
import { answerCore, sameAnswerCore } from "./ask/answer-core";
import { NEWER_VERSION_QUESTION, type AskSpec } from "./ask/spec";
import type { MonitoringMembers } from "./monitoring-shared";

// F2 (plan §2.8, §4.7): a watch on a trend's group fixes its members at activation;
// the live group is only a note, and a moved `auto` window is said.
const trend = (trend: AskSpec["trend"], dim: AskSpec["dim"] = "supplier"): AskSpec =>
  ({ block: "trend", measure: "value", dim, filters: { yearFrom: 2024, yearTo: 2025 }, ...(trend ? { trend } : {}) });
const members = (n: number, role: MonitoringMembers["role"] = "supplier"): MonitoringMembers =>
  ({ kind: "trend-group", role, group: "new", ids: Array.from({ length: n }, (_, i) => String(i + 1)), frozenAt: "2026-10-24T10:00:00Z" });

describe("the group a trend watch fixes", () => {
  it("is the group the trend lists, by its role; every change and other questions fix none", () => {
    expect(watchedTrendGroup(trend({ change: "up" }))).toEqual({ change: "up", role: "supplier" });
    expect(watchedTrendGroup(trend({ change: "new", firstOnly: true }, "authority"))).toEqual({ change: "new", role: "authority" });
    expect(watchedTrendGroup(trend({ change: "down" }, "county"))).toEqual({ change: "down", role: "county" });
    expect(watchedTrendGroup(trend({ change: "up", order: "percent", minBase: 1_000_000 }))).toEqual({ change: "up", role: "supplier" });
    expect(watchedTrendGroup(trend(undefined))).toBeNull();
    expect(watchedTrendGroup(trend({ change: "all", months: "auto" }))).toBeNull();
    expect(watchedTrendGroup({ block: "stat", measure: "value", filters: {} })).toBeNull();
  });
  it("must be that question's group and a kind this release applies", () => {
    expect(membersOfQuestion(trend({ change: "new" }), members(2))).toBeNull();
    expect(membersOfQuestion(trend({ change: "up" }), members(2))).toMatchObject({ message: MEMBERS_MISMATCH, status: 422 });
    expect(membersOfQuestion(trend({ change: "new" }, "authority"), members(2))).toMatchObject({ message: MEMBERS_MISMATCH });
    expect(membersOfQuestion(trend({ change: "new" }), { ...members(2), kind: "network-group" })).toMatchObject({ message: NEWER_VERSION_QUESTION });
  });
  it("is not a drawer's selection: the answer is computed on the members, so a changed result still alerts", () => {
    expect(monitoringHasLocalSelection({ members: members(3) })).toBe(false);
    expect(monitoringHasLocalSelection({ members: members(3), search: "x" })).toBe(true);
  });
  it("is named with its year when it keeps the first-time ones", () => {
    // Kit §4: „Noi” always with its year outside the short buttons.
    expect(watchedGroupLabel(trend({ change: "new", firstOnly: true }))).toBe("„Noi față de 2024 · prima dată în 2025”");
    expect(watchedGroupLabel(trend({ change: "gone" }))).toBe("„Nu mai apar în 2025”");
    expect(groupPinnedNote(trend({ change: "new" }), members(412), "24.10.2026"))
      .toBe("Grupa „Noi față de 2024”: 412 firme fixate la activare (24.10.2026). Răspunsul și sursele urmăresc aceste firme; cele care intră sau ies din grupă apar doar ca notă.");
  });
});

describe("the notes of a group's check", () => {
  const notes = (o: Partial<Parameters<typeof groupCheckNotes>[1]>, m = members(412)) =>
    groupCheckNotes(m, { day: "24.10.2026", missing: [], redirected: [], movement: null, ...o });
  it("say the movement of the live group, never as an alert", () => {
    expect(notes({ movement: { members: 412, stayed: 411, live: 414 } }))
      .toEqual(["3 firme au intrat în grupă, 1 a ieșit. Urmărim în continuare cele 412 firme fixate la 24.10.2026; mișcarea grupei nu produce alerte."]);
    expect(notes({ movement: { members: 412, stayed: 410, live: 410 } }))
      .toEqual(["2 firme au ieșit din grupă. Urmărim în continuare cele 412 firme fixate la 24.10.2026; mișcarea grupei nu produce alerte."]);
    expect(notes({ movement: { members: 1, stayed: 1, live: 21 } }, members(1, "county")))
      .toEqual(["20 de județe au intrat în grupă. Urmărim în continuare 1 județ fixat la 24.10.2026; mișcarea grupei nu produce alerte."]);
    expect(notes({ movement: { members: 412, stayed: 412, live: 412 } })).toEqual([]);
  });
  it("say a member no longer identified, and one followed to its canonical id", () => {
    expect(notes({ missing: ["7"], redirected: [{ from: "8", to: "80" }, { from: "9", to: "90" }] }, members(412, "authority"))).toEqual([
      "1 instituție din grupă nu mai poate fi identificată în date; iese din calcul (ID 7).",
      "2 instituții din grupă au fost unite cu altă înregistrare a aceleiași entități; le urmărim sub identificatorul nou (8 → 80, 9 → 90).",
    ]);
  });
});

describe("a trend's window moved with the data", () => {
  it("is said from the months of both checks", () => {
    expect(movedWindowNote({ months: { from: 1, to: 5, mode: "auto" } }, { months: { from: 1, to: 6, mode: "auto" } })).toBe("Fereastra comparată: ian.–mai → ian.–iun.");
    expect(movedWindowNote({ months: { from: 1, to: 11, mode: "auto" } }, { months: { from: 1, to: 12, mode: "auto" } })).toBe("Fereastra comparată: ian.–nov. → ani întregi.");
    expect(movedWindowNote({ months: { from: 1, to: 5, mode: "auto" } }, { months: { from: 1, to: 5, mode: "auto" } })).toBeNull();
    // A run stored before trend-2 has no months: nothing to compare.
    expect(movedWindowNote({ rowsTrend: [] }, { months: { from: 1, to: 6, mode: "auto" } })).toBeNull();
    expect(movedWindowNote(null, { months: { from: 1, to: 6, mode: "auto" } })).toBeNull();
  });
});

describe("an answer computed on fixed members", () => {
  const data = (valueB: number) => ({
    block: "trend", yearA: 2024, yearB: 2025, list: "new", change: "new", months: { from: 1, to: 12, mode: "whole" },
    rowsTrend: [{ entityId: "1", name: "A", county: "Cluj", valueA: 0, valueB }],
    groups: { new: [{ entityId: "1", name: "A", county: "Cluj", valueA: 0, valueB }] },
    composition: { new: { count: 1, valueA: 0, valueB } }, noun: "firme", rowFacts: { 1: { year: 2025 } },
    members: { list: "new", frozen: 1, frozenAt: "2026-10-24T10:00:00Z" },
  });
  it("keeps the fixed group in its core and changes only with the members' own figures", () => {
    expect(answerCore("trend", data(10))).toMatchObject({ members: { list: "new", frozen: 1 }, composition: { new: { count: 1, valueB: 10 } } });
    expect(sameAnswerCore("trend", data(10), { ...data(10), rowFacts: {} })).toBe(true);
    expect(sameAnswerCore("trend", data(10), data(11))).toBe(false);
  });
});
