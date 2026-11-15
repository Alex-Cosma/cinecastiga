import { describe, expect, it } from "vitest";
import { FILTERS } from "./filters/registry";
import type { FilterCtx } from "./filters/types";
import { historicFact, historicLeftOutWords, historicPlaceWords, lastMonthWords } from "./historic";
import type { QuestionSpec } from "./question-ui";
import { leavesHistoric } from "./scatter-shared";
import type { AskSpec } from "./spec";

/*
 * The historic profiles (rf-2026.22 S8): the rankings by risk leave them out unless asked for, "Cine conduce?" and,
 * since 15 November 2026, the risk cloud's list in the order of risk (owner: one pattern in both places).
 */

const cloud = (scatter: AskSpec["scatter"], filters: AskSpec["filters"] = {}): AskSpec => ({ block: "scatter", dim: "authority", measure: "value", filters, ...(scatter ? { scatter } : {}) });

describe("the historic profiles", () => {
  it("are said in the words of „Cine conduce?”: how many are left out, the tag with the last month, why a found one has no place", () => {
    expect(historicLeftOutWords(770)).toBe("770 de profiluri istorice, fără înregistrări în ultimele 24 de luni, nu sunt în listă.");
    expect(historicLeftOutWords(1)).toBe("1 profil istoric, fără înregistrări în ultimele 24 de luni, nu e în listă.");
    // last_activity as the mart writes it, or its day.
    expect(lastMonthWords("2023-09-12 00:00:00+03")).toBe("09.2023");
    expect(lastMonthWords("2019-02-01")).toBe("02.2019");
    expect(historicFact("2019-02-01")).toEqual({
      text: "istoric · ultima 02.2019",
      tip: { title: "Profil istoric", text: "Nicio achiziție sau contract în ultimele 24 de luni; ultima înregistrare: 01.02.2019. Clasamentele după risc nu îl arată implicit; scorul lui rămâne cel calculat." },
    });
    // Without its profile row (none expected): historic, the day unknown.
    expect(historicFact("").text).toBe("istoric");
    expect(historicPlaceWords("2019-02-01 09:55:53+02")).toBe("nu intră în listă: istoric, ultima în 02.2019");
    expect(historicPlaceWords("")).toBe("nu intră în listă: istoric");
  });

  it("leave the cloud's list in the order of risk unless asked for; by value they stay", () => {
    expect(leavesHistoric(cloud(undefined))).toBe(true);
    expect(leavesHistoric(cloud({ rankBy: "risk", flag: "da_split" }))).toBe(true);
    expect(leavesHistoric(cloud({ rankBy: "risk" }, { includeHistoric: true }))).toBe(false);
    expect(leavesHistoric(cloud({ rankBy: "value" }))).toBe(false);
  });

  it("are offered back on the cloud in the order of risk and on „Cine conduce?” by risk, nowhere else", () => {
    const ctx = {} as FilterCtx;
    const choices = (spec: AskSpec) => FILTERS.includeHistoric.choices(spec as unknown as QuestionSpec, ctx);
    expect(choices(cloud({ rankBy: "risk" }))).toEqual([undefined, true]);
    expect(choices(cloud(undefined))).toEqual([undefined, true]);
    expect(choices(cloud({ rankBy: "value" }))).toEqual([undefined]);
    expect(choices({ block: "entity_card", dim: "authority", measure: "value", rankBy: "risk", filters: {} })).toEqual([undefined, true]);
    expect(choices({ block: "entity_card", dim: "authority", measure: "value", rankBy: "value", filters: {} })).toEqual([undefined]);
    expect(choices({ block: "table", dim: "authority", measure: "value", filters: {} })).toEqual([undefined]);
    expect(FILTERS.includeHistoric.engine).toEqual({ "entity_card:risk": "profile", scatter: "profile" });
  });
});
