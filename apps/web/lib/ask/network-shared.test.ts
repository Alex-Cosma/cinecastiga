import { describe, expect, it } from "vitest";
import { answerCore } from "./answer-core";
import { FILTERS } from "./filters/defs";
import { enterNetwork, networkFollows } from "./filters/defs/network";
import { chooseQuestion, chooseValue } from "./filters/transition";
import { describeConditions } from "./filters/describe";
import { questionTitle } from "./filters/title";
import type { FilterSpec } from "./filters/types";
import { networkGroupOf, networkLastYear, networkListSpec, networkSince, networkSinceChoices, networkSourcesNote, type NetworkData } from "./network-shared";
import type { CoveragePeriods } from "./months-window";
import { defaultQuestion, type QuestionSpec } from "./question-ui";
import { NETWORK_RULES, runnableError, validateSpec, type AskSpec } from "./spec";

/*
 * F4, the network's options (plan §4.8, §3; final network §3): the groups of
 * the whole relation against a reference year, the year itself, what a group
 * does to the period, the words of each place and what a watch compares.
 */

const BUZAU = { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU" };
const q = (spec: Partial<QuestionSpec>): QuestionSpec => ({ block: "network", dim: "authority", measure: "value", filters: { ...BUZAU }, ...spec });
const PERIODS: CoveragePeriods = {
  da: { from: "2018-04-02", to: "2026-09-25", completeUntil: null },
  contracts: { from: "2018-01-03", to: "2026-09-25", completeUntil: "2026-05-31" },
};

describe("the network's groups (final network §3.1–§3.2)", () => {
  it("partition a relation by its first and last year against the reference year", () => {
    expect([networkGroupOf(2025, 2026, 2025), networkGroupOf(2019, 2025, 2025), networkGroupOf(2019, 2024, 2025)]).toEqual(["new", "continuing", "gone"]);
    expect(networkGroupOf(2024, 2024, 2024)).toBe("new");
  });

  it("count from the last year every channel has complete, never from a running year nor before 2021", () => {
    expect(networkLastYear(PERIODS, 2026)).toBe(2025);
    expect(networkLastYear(null, 2026)).toBe(2025);
    expect(networkLastYear(null, 2019)).toBe(2021);
    expect(networkSinceChoices(2025)).toEqual([2025, 2024, 2023, 2022, 2021]);
    // „Toți” with a period: its first year, brought into 2021…last; a group's key wins.
    expect(networkSince({ filters: { yearFrom: 2018, yearTo: 2026 } }, 2025)).toBe(2021);
    expect(networkSince({ filters: { yearFrom: 2023, yearTo: 2024 } }, 2025)).toBe(2023);
    expect(networkSince({ filters: {}, network: { since: 2022 } }, 2025)).toBe(2022);
    expect(networkSince({ filters: {} }, 2025)).toBe(2025);
  });

  it("refuse a period beside a group (the builder keeps its first year as the reference)", () => {
    expect(NETWORK_RULES.partners({ ...q({ network: { partners: "new", since: 2024 } }), filters: { ...BUZAU, yearFrom: 2024, yearTo: 2025 } } as AskSpec))
      .toBe("Grupele privesc toată relația, fără perioadă. Alege „Toți” sau scoate perioada.");
    expect(runnableError(validateSpec(q({ network: { partners: "gone", since: 2024 } })) as AskSpec)).toBeNull();
    // The in-answer switch: the period goes, the year the buttons counted from is written; back on „Toți” it stays.
    const period = { filters: { ...BUZAU, yearFrom: 2023, yearTo: 2024 } };
    expect(networkListSpec(period, "new", 2023)).toEqual({ filters: BUZAU, network: { partners: "new", since: 2023 } });
    expect(networkListSpec({ filters: BUZAU, network: { partners: "new", since: 2023 } }, "all", 2023)).toEqual({ filters: BUZAU, network: { since: 2023 } });
  });
});

describe("the network in the builder (final network §4 „Schimbări automate”, plan §5 F4)", () => {
  it("writes 15 partners on a new network, 14 staying an old link's", () => {
    expect(chooseQuestion(defaultQuestion(), "network").spec.network).toEqual({ show: 15 });
    expect(enterNetwork(q({ network: { show: 25 } }) as FilterSpec).network).toEqual({ show: 25 });
  });

  it("turns a period into the group's year once, with its note, and writes the year a group counts from", () => {
    const slot = { id: "networkPartners" as const };
    const period = q({ filters: { ...BUZAU, yearFrom: 2023, yearTo: 2024 } });
    const to = chooseValue(period, slot, { filter: "networkPartners", value: "new" }, null, { coverage: PERIODS });
    expect([to.spec.filters.yearFrom, to.spec.network, to.notes, to.renamed]).toEqual([undefined, { partners: "new", since: 2023 }, ["Am păstrat doar anul de început: 2023."], { period: "networkSince" }]);
    // No period: the last complete year, written (a watch then keeps it), without a note.
    const plain = chooseValue(q({}), slot, { filter: "networkPartners", value: "gone" }, null, { coverage: PERIODS });
    expect([plain.spec.network, plain.notes]).toEqual([{ partners: "gone", since: 2025 }, []]);
    // A running year never counts: back to the last complete one, said.
    const late = networkFollows(q({}) as FilterSpec, FILTERS.networkPartners.write(q({ filters: { ...BUZAU, yearFrom: 2026 } }) as FilterSpec, "new"), { coverage: PERIODS, year: 2026 });
    expect([late.spec.network, late.notes]).toEqual([{ partners: "new", since: 2025 }, ["Grupele se socotesc față de 2025: 2026 nu s-a încheiat în date."]]);
  });

  it("says each option in the words of its places", () => {
    const group = q({ network: { partners: "continuing", since: 2024, order: "years", show: 15, signals: true } });
    const words = describeConditions(group).byId;
    expect([words.networkPartners?.chip, words.networkPartners?.words, words.networkSignals?.chip, words.networkOrder?.words])
      .toEqual(["Continuă din 2024", "partenerii care continuă din 2024", "Cu semnale", "după anii cu înregistrări"]);
    expect(describeConditions(group).totalWords).toEqual(["doar furnizorii cu semnale"]);
    expect(questionTitle(group)).toBe("Cu cine a continuat să lucreze MUNICIPIUL BUZAU din 2024, după anii cu înregistrări, doar furnizorii cu semnale?");
    expect(questionTitle(q({ filters: { ...BUZAU, firmSeat: "other" } }))).toBe("Cu cine lucrează MUNICIPIUL BUZAU, în toți anii, doar furnizorii cu sediul în alt județ?");
    expect(networkSourcesNote("gone", 2025, false)).toBe("Grupa „Nu mai apar” față de 2025: nicio înregistrare din 2025 încoace, în toate achizițiile dintre cei doi. Sursele sunt înregistrările lor din selecție, din toți anii.");
  });
});

describe("what a watch on a network compares (answer-core.ts, network-2)", () => {
  const list = (partners: number, rows: [string, number][]) => ({ partners, value: rows.reduce((t, [, v]) => t + v, 0), count: rows.length, oneOff: 0, joint: 0, rows: rows.map(([entityId, value]) => ({ entityId, value, count: 1, joint: 0 })) });
  const data = (overrides: Partial<NetworkData> = {}): NetworkData => ({
    block: "network", focal: { entityId: "1", name: "X", role: "authority" }, since: 2025, complete: 2025, list: "new",
    lists: { all: list(3, [["10", 5], ["11", 3], ["12", 1]]), new: list(1, [["11", 3]]), continuing: list(1, [["10", 5]]), gone: list(1, [["12", 1]]) },
    partners: { 10: { entityId: "10", name: "A", county: null, employees: null, first: 2020, last: 2025, years: [2020, 2025], signals: [], firmShare: null },
      11: { entityId: "11", name: "B", county: null, employees: null, first: 2025, last: 2025, years: [2025], signals: [], firmShare: null },
      12: { entityId: "12", name: "C", county: null, employees: null, first: 2020, last: 2020, years: [2020], signals: [], firmShare: null } },
    lastNew: 2025, ...overrides,
  });

  it("is the asked group's list and totals, against its year; not the other groups, the facts or the shares", () => {
    expect(answerCore("network", data())).toEqual({
      focal: { entityId: "1", name: "X", role: "authority" }, list: "new", since: 2025,
      totals: { partners: 1, value: 3, count: 1 }, nodes: [{ entityId: "11", name: "B", value: 3, count: 1 }],
    });
    // A change in „Nu mai apar” or in a fact does not change a watch on „Noi”.
    const other = data({ lists: { ...data().lists, gone: list(2, [["12", 1], ["13", 4]]) }, streams: { da: { value: 1, count: 1 }, contracts: { value: 0, count: 0 } } });
    expect(answerCore("network", other)).toEqual(answerCore("network", data()));
    // „Toți” compares its list without the year (the year only moves the buttons).
    expect(answerCore("network", data({ list: "all", since: 2024 }))).toEqual(answerCore("network", data({ list: "all" })));
  });
});
