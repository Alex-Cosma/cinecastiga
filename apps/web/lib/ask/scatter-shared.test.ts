import { describe, expect, it } from "vitest";
import { PROFILE_FLAG_CODES, PROFILE_FLAGS_APPLICABLE } from "@seap/db";
import { FLAG_META, flagEntityRule, flagLabel } from "../flags";
import { CRI_CRITERIA } from "../risk-presentation";
import { chooseValue } from "./filters/transition";
import { questionTitle } from "./filters/title";
import { restoreLink } from "./filters/restore";
import { buildPills } from "./pills";
import { CRITERIA, CRITERION_LABEL, CRITERION_RULE } from "./peer-groups-shared";
import { defaultQuestion, transitionQuestion, type QuestionSpec } from "./question-ui";
import { validateEvidenceScope } from "./evidence";
import { facetRequest } from "./facets";
import { facetSpec } from "./facet-parts";
import { SCATTER_FLAGS, SCATTER_FLAGS_BY_ROLE, SCATTER_RULES, runnableError, validateSpec, type AskSpec } from "./spec";
import { answerVersion } from "./answer-core";
import {
  SCATTER_FLAG_ORDER, belowListWords, flagBit, flagDetail, groupNoun, listPlace, scatterFlagsOf, scatterLevels, scatterRank, scatterSignalWords, withScatterChoice, yearsWords,
} from "./scatter-shared";

/*
 * The risk cloud's contract (plan §4.12, §3, §9 scatter 1–8): its two keys, their rules and words, the signals'
 * codes shared with the build, the labels everyone speaks, what a change of question does to them.
 */

describe("the signals of a profile", () => {
  it("are the build's codes, in one list for the build, the index, the distribution and the cloud", () => {
    for (const role of ["authority", "supplier"] as const) {
      expect([...PROFILE_FLAG_CODES[role]].sort()).toEqual([...CRITERIA[role]].sort());
      expect([...PROFILE_FLAG_CODES[role]].sort()).toEqual([...CRI_CRITERIA[role]].sort());
      expect([...PROFILE_FLAG_CODES[role]].sort()).toEqual([...SCATTER_FLAGS_BY_ROLE[role]].sort());
      expect(PROFILE_FLAGS_APPLICABLE[role]).toBe(PROFILE_FLAG_CODES[role].length);
      expect(scatterLevels(role)).toBe(PROFILE_FLAGS_APPLICABLE[role]);
    }
    expect([...SCATTER_FLAGS].sort()).toEqual([...SCATTER_FLAG_ORDER].sort());
  });

  it("have a short label and a rule at the level of an entity, the same ones the distribution shows", () => {
    expect(SCATTER_FLAGS.map(flagLabel)).toEqual(["Posibilă fracționare", "Vârf în decembrie", "Finalizare rapidă", "Aproape de prag", "Concentrare pe un furnizor", "Dependență de o autoritate"]);
    for (const code of SCATTER_FLAGS) {
      expect(FLAG_META[code]!.title.length).toBeGreaterThan(flagLabel(code).length - 1);
      expect(flagEntityRule(code), code).not.toBe("");
      expect(CRITERION_LABEL[code]).toBe(flagLabel(code));
      expect(CRITERION_RULE[code]).toBe(flagEntityRule(code));
    }
    // A signal without a short label speaks by its title; one without a rule has none.
    expect(flagLabel("net_shared_admin")).toBe(FLAG_META.net_shared_admin!.title);
    expect(flagEntityRule("net_shared_admin")).toBe("");
    expect(flagLabel("unknown_code")).toBe("unknown_code");
  });

  it("keep a stable order, a bit each per role, and say their years or shares", () => {
    expect(scatterFlagsOf("authority")).toEqual(["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration"]);
    expect(scatterFlagsOf("supplier")).toEqual(["da_split", "da_rapid", "da_round", "da_dependence"]);
    expect([flagBit("authority", "da_split"), flagBit("authority", "da_rapid"), flagBit("supplier", "da_rapid")]).toEqual([1, 4, 2]);
    expect(yearsWords([2018, 2019])).toBe("2018–2019");
    expect(yearsWords([2022])).toBe("2022");
    expect(yearsWords([2019, 2021, 2022, 2022, 2024])).toBe("2019, 2021–2022, 2024");
    expect(flagDetail({ code: "da_split", years: [2018, 2019] })).toBe("2018–2019");
    expect(flagDetail({ code: "da_rapid", share: 0.25 })).toBe("25%");
    expect(flagDetail({ code: "da_rapid", share: 0.252 })).toBe("25,2%");
    expect(flagDetail({ code: "da_dependence", share: 1, single: true })).toBe("un singur client");
    expect(flagDetail({ code: "da_round" })).toBeNull();
    expect(scatterSignalWords("da_year_end")).toBe("semnal: vârf în decembrie");
    expect(scatterSignalWords(null)).toBeNull();
    expect(listPlace(20, 82, "risk")).toBe("locul 20 din 82, după semnale");
    expect(listPlace(1, 46, "value")).toBe("locul 1 din 46, după valoare");
    expect(belowListWords(14)).toBe("nu intră în listă: 14 achiziții directe, sub 20");
    expect(groupNoun(82, "authority", "comuna")).toBe("82 de primării de comună");
    expect(groupNoun(1, "supplier", undefined)).toBe("1 firmă");
    expect(groupNoun(15_729, "authority", undefined)).toBe("15.729 de instituții publice");
  });
});

describe("the cloud's keys in a spec", () => {
  const cloud = (extra: Partial<AskSpec> = {}, dim: "authority" | "supplier" = "authority"): AskSpec => ({ block: "scatter", dim, measure: "value", filters: {}, ...extra });

  it("takes a signal of the role and an order, and refuses the other role's signal with its reason", () => {
    expect(validateSpec(cloud({ scatter: { flag: "da_split", rankBy: "value" } }))).toHaveProperty("scatter", { flag: "da_split", rankBy: "value" });
    expect(validateSpec(cloud({ scatter: { flag: "da_dependence" } }))).toEqual({ error: SCATTER_RULES.flag(cloud({ scatter: { flag: "da_dependence" } }))! });
    expect(SCATTER_RULES.flag(cloud({ scatter: { flag: "da_dependence" } }))).toMatch(/Dependența de o autoritate se aplică firmelor/);
    expect(SCATTER_RULES.flag(cloud({ scatter: { flag: "da_concentration" } }, "supplier"))).toMatch(/Concentrarea pe un furnizor se aplică instituțiilor/);
    expect(runnableError(cloud({ scatter: { flag: "da_concentration" } }, "supplier"))).not.toBeNull();
    expect(runnableError(cloud({ scatter: { flag: "da_year_end" } }))).toBeNull();
    expect(runnableError(cloud({ scatter: { flag: "da_dependence" } }, "supplier"))).toBeNull();
    // The cloud's keys on another question cannot change its answer: parseSpec drops them with the block.
    expect(validateSpec({ block: "table", dim: "supplier", measure: "value", filters: {}, scatter: { flag: "da_split" } })).not.toHaveProperty("scatter");
    expect(validateSpec(cloud({ scatter: { flag: "da_nu" as never } }))).toEqual({ error: "Valoare invalidă pentru scatter.flag." });
  });

  it("is a new question's own order, written explicitly, and leaves with the question", () => {
    const fresh = transitionQuestion(defaultQuestion(), "scatter").spec;
    expect(fresh.scatter).toEqual({ rankBy: "risk" });
    expect(transitionQuestion({ ...fresh, scatter: { rankBy: "value", flag: "da_split" } }).spec.scatter).toEqual({ rankBy: "value", flag: "da_split" });
    expect(transitionQuestion({ ...fresh, scatter: { rankBy: "value", flag: "da_split" } }, "table").spec).not.toHaveProperty("scatter");
    expect(scatterRank({})).toBe("risk");
    expect(scatterRank({ scatter: { rankBy: "value" } })).toBe("value");
  });

  it("writes the strip's choice and nothing else, an emptied key leaving", () => {
    const base = cloud({ scatter: { rankBy: "risk" }, filters: { county: "Buzău" } });
    expect(withScatterChoice(base, "flag:da_split").scatter).toEqual({ rankBy: "risk", flag: "da_split" });
    expect(withScatterChoice(withScatterChoice(base, "flag:da_split"), "flag:").scatter).toEqual({ rankBy: "risk" });
    expect(withScatterChoice(base, "rankBy:value").scatter).toEqual({ rankBy: "value" });
    expect(withScatterChoice(cloud({ scatter: { flag: "da_split" } }), "flag:")).not.toHaveProperty("scatter");
    expect(withScatterChoice(base, "flag:da_split").filters).toEqual({ county: "Buzău" });
    expect(base.scatter).toEqual({ rankBy: "risk" });
  });

  it("takes the other role's signal away, with a note, when the subject changes", () => {
    const draft: QuestionSpec = { block: "scatter", dim: "authority", measure: "value", filters: {}, scatter: { rankBy: "risk", flag: "da_concentration" } };
    const slot = { id: "dim" as const, picker: "subject" as const };
    const turned = chooseValue(draft, slot, { filter: "dim", value: { dim: "supplier" } } as never);
    expect(turned.spec.scatter).toEqual({ rankBy: "risk" });
    expect(turned.notes.join(" ")).toMatch(/Am scos „semnal: concentrare pe un furnizor”/);
    // The signals both roles have stay.
    const kept = chooseValue({ ...draft, scatter: { rankBy: "risk", flag: "da_split" } }, slot, { filter: "dim", value: { dim: "supplier" } } as never);
    expect(kept.spec.scatter).toEqual({ rankBy: "risk", flag: "da_split" });
  });

  it("says its signal and order in the pills and the receipt, not in the title or the total line", () => {
    const spec = validateSpec(cloud({ scatter: { rankBy: "value", flag: "da_split" }, filters: { authorityKind: "comuna", county: "Buzău" } })) as AskSpec;
    expect(buildPills(spec, {}, { scatterGroup: 82 })).toEqual(expect.arrayContaining(["82 de primării de comună", "semnal: posibilă fracționare", "primele după valoare"]));
    expect(buildPills(spec, {})[0]).toBe("risc și valoare");
    expect(questionTitle(spec)).toBe("Ce primării de comună din județul Buzău ies din tipar după risc și valoarea achizițiilor directe?");
    expect(buildPills(validateSpec(cloud({}, "supplier")) as AskSpec, {}, { scatterGroup: 72_655 })[0]).toBe("72.655 de firme");
  });

  it("is the version scatter-2, once, for the watches on it", () => {
    expect(answerVersion(cloud())).toEqual({ question: "scatter-2", conditions: {} });
  });

  it("opens a link of today with its signal as a draft that runs (it is applied now)", () => {
    const link = restoreLink({ block: "scatter", dim: "authority", measure: "value", filters: {}, scatter: { flag: "da_split" } });
    expect(link).toMatchObject({ kind: "draft", run: true, spec: { scatter: { flag: "da_split" } } });
  });
});

describe("the sources of a signal and the parts the cloud asks for", () => {
  it("takes a signal in a drawer's scope, only a known one", () => {
    expect(validateEvidenceScope({ entityIds: ["12"], role: "authority", flag: "da_split" })).toEqual({ entityIds: ["12"], role: "authority", flag: "da_split" });
    expect(validateEvidenceScope({ flag: "da_unknown" })).toEqual({ error: "Semnal invalid în selecție." });
    expect(validateEvidenceScope({ flag: 3 })).toEqual({ error: "Semnal invalid în selecție." });
  });

  it("asks for the facts of at most 50 profiles by id, and counts the cloud's windows without its signal", () => {
    expect(facetRequest({ part: "profile", ids: ["12", "34"] })).toEqual({ part: "profile", q: null, ids: ["12", "34"] });
    expect(facetRequest({ part: "profile", ids: [] })).toHaveProperty("error");
    expect(facetRequest({ part: "profile" })).toHaveProperty("error");
    expect(facetRequest({ part: "profile", ids: ["1; drop"] })).toHaveProperty("error");
    expect(facetRequest({ part: "profile", ids: Array.from({ length: 51 }, (_, i) => String(i + 1)) })).toHaveProperty("error");
    const draft = { block: "scatter", dim: "supplier", measure: "value", filters: { seatCounty: "Cluj" }, scatter: { flag: "da_split", rankBy: "value" } };
    expect(facetSpec(draft, "seat")).toEqual({ block: "scatter", dim: "supplier", measure: "value", filters: {} });
    expect(facetSpec(draft, "locate")).toBe(draft);
    expect(facetSpec(draft, "profile")).toBe(draft);
  });
});
