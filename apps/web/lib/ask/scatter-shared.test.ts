import { describe, expect, it } from "vitest";
import { PROFILE_FLAG_CODES, PROFILE_FLAGS_APPLICABLE } from "@seap/db";
import { FLAG_META, flagEntityRule, flagLabel } from "../flags";
import { RISK_CRITERIA } from "../risk-score";
import { chooseValue } from "./filters/transition";
import { questionTitle } from "./filters/title";
import { restoreLink } from "./filters/restore";
import { buildPills } from "./pills";
import { defaultQuestion, transitionQuestion, type QuestionSpec } from "./question-ui";
import { validateEvidenceScope } from "./evidence";
import { facetRequest } from "./facets";
import { facetSpec } from "./facet-parts";
import { SCATTER_FLAGS, SCATTER_FLAGS_BY_ROLE, SCATTER_RULES, runnableError, validateSpec, type AskSpec } from "./spec";
import { answerCore, answerVersion } from "./answer-core";
import { ENTITY_CARD_MIN_DAS, RISK_MIN_DAS } from "./predicates";
import {
  RANK_WORDS_V2, SCATTER_CLOUD_MIN_DAS, SCATTER_FLAG_ORDER, SCATTER_LIST_MIN_DAS, activeScatterFlag, belowListWords, codeBit, flagBit, flagDetail, groupNoun, groupPlural, listPlace,
  scatterCodes, scatterFlagLabel, scatterFlagsOf, scatterRank, scatterSignalWords, withScatterChoice, yearsWords,
} from "./scatter-shared";

/*
 * The risk cloud's contract (plan §4.12, §3, §9 scatter 1–8; scatter-3, rf-2026.18): its two keys, their rules and
 * words, the signals (the risk score's criteria) shared with the build, the labels everyone speaks, what a change of
 * question does to them, and an older link's retired signal.
 */

describe("the signals of a profile", () => {
  it("are the risk score's criteria and the build's codes, in one order for the build, the score and the cloud", () => {
    // rf-2026.20: „Peste capacitate” (da_capacity) counts in a firm's score but is no signal of the cloud: the
    // cloud's records (scatter-records.ts) have no definition for it. The cloud keeps the other criteria, in order.
    const cloudOf = (role: "authority" | "supplier") => RISK_CRITERIA[role].filter((code) => code !== "da_capacity");
    for (const role of ["authority", "supplier"] as const) {
      expect([...SCATTER_FLAGS_BY_ROLE[role]]).toEqual(cloudOf(role));
      expect(scatterFlagsOf(role)).toEqual(cloudOf(role));
      expect([...PROFILE_FLAG_CODES[role]]).toEqual([...RISK_CRITERIA[role]]);
      expect(PROFILE_FLAGS_APPLICABLE[role]).toBe(RISK_CRITERIA[role].length);
    }
    expect(RISK_CRITERIA.supplier).toContain("da_capacity");
    expect([...SCATTER_FLAGS].sort()).toEqual([...new Set([...cloudOf("authority"), ...cloudOf("supplier")])].sort());
    expect([...SCATTER_FLAGS].sort()).toEqual([...SCATTER_FLAG_ORDER].sort());
    // „Finalizare rapidă” no longer counts (owner decision, 1 November 2026).
    expect(SCATTER_FLAGS).not.toContain("da_rapid");
  });

  it("have a short label and a rule at the level of an entity, the same ones the entity page shows", () => {
    expect(SCATTER_FLAGS.map(flagLabel)).toEqual(["Achiziții repetate, peste plafon cumulat", "Chiar sub plafon", "Vârf în decembrie", "Concentrare pe un furnizor", "Dependență de o autoritate", "Peste plafon"]);
    for (const code of SCATTER_FLAGS) {
      expect(FLAG_META[code]!.title.length).toBeGreaterThan(flagLabel(code).length - 1);
      expect(flagEntityRule(code), code).not.toBe("");
    }
    // A retired signal keeps its old label only for the note that drops it and for a stored answer.
    expect(flagLabel("da_rapid")).toBe("da_rapid");
    expect(scatterFlagLabel("da_rapid")).toBe("Finalizare rapidă");
    expect(scatterFlagLabel("da_round")).toBe("Chiar sub plafon");
    // A signal without a short label speaks by its title; one without a rule has none.
    expect(flagLabel("net_shared_admin")).toBe(FLAG_META.net_shared_admin!.title);
    expect(flagEntityRule("net_shared_admin")).toBe("");
    expect(flagLabel("unknown_code")).toBe("unknown_code");
  });

  it("keep a stable order, a bit each per role, and say their years or shares", () => {
    expect(scatterFlagsOf("authority")).toEqual(["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"]);
    expect(scatterFlagsOf("supplier")).toEqual(["da_split", "da_round", "da_dependence", "da_above_ceiling"]);
    expect([flagBit("authority", "da_split"), flagBit("authority", "da_year_end"), flagBit("supplier", "da_above_ceiling")]).toEqual([1, 4, 8]);
    // A stored scatter-2 keeps its own order: its points' bits and its chips (rapid among them).
    expect(scatterCodes({ version: 2, role: "authority" })).toEqual(["da_split", "da_year_end", "da_rapid", "da_round", "da_concentration"]);
    expect(codeBit(scatterCodes({ version: 2, role: "supplier" }), "da_rapid")).toBe(2);
    expect(scatterCodes({ version: 3, role: "supplier" })).toEqual(scatterFlagsOf("supplier"));
    expect(yearsWords([2018, 2019])).toBe("2018–2019");
    expect(yearsWords([2022])).toBe("2022");
    expect(yearsWords([2019, 2021, 2022, 2022, 2024])).toBe("2019, 2021–2022, 2024");
    expect(flagDetail({ code: "da_split", years: [2018, 2019] })).toBe("2018–2019");
    expect(flagDetail({ code: "da_round", share: 0.25 })).toBe("25%");
    expect(flagDetail({ code: "da_above_ceiling", share: 0.252 })).toBe("25,2%");
    expect(flagDetail({ code: "da_dependence", share: 1, single: true })).toBe("un singur client");
    expect(flagDetail({ code: "da_round" })).toBeNull();
    expect(scatterSignalWords("da_year_end")).toBe("semnal: vârf în decembrie");
    expect(scatterSignalWords(null)).toBeNull();
    expect(scatterSignalWords("da_rapid")).toBeNull();
    expect(listPlace(20, 82, "risk")).toBe("locul 20 din 82, după risc");
    expect(listPlace(20, 82, "risk", RANK_WORDS_V2)).toBe("locul 20 din 82, după semnale");
    expect(listPlace(1, 46, "value")).toBe("locul 1 din 46, după valoare");
    expect(belowListWords(14)).toBe("nu intră în listă: 14 achiziții directe, sub 20");
    expect(groupNoun(82, "authority", "comuna")).toBe("82 de primării de comună");
    expect(groupNoun(1, "supplier", undefined)).toBe("1 firmă");
    expect(groupNoun(15_729, "authority", undefined)).toBe("15.729 de instituții publice");
    expect([groupPlural("authority", "spital"), groupPlural("authority", undefined), groupPlural("supplier", "comuna")]).toEqual(["spitalele", "instituțiile publice", "firmele"]);
  });

  it("keeps the cloud's and the list's floors equal to the distribution's and „Cine conduce?”'s (written twice for the screen)", () => {
    expect([SCATTER_CLOUD_MIN_DAS, SCATTER_LIST_MIN_DAS]).toEqual([RISK_MIN_DAS, ENTITY_CARD_MIN_DAS]);
  });
});

describe("the cloud's keys in a spec", () => {
  const cloud = (extra: Partial<AskSpec> = {}, dim: "authority" | "supplier" = "authority"): AskSpec => ({ block: "scatter", dim, measure: "value", filters: {}, ...extra });

  it("takes a signal of the role and an order, and refuses the other role's signal with its reason", () => {
    expect(validateSpec(cloud({ scatter: { flag: "da_split", rankBy: "value" } }))).toHaveProperty("scatter", { flag: "da_split", rankBy: "value" });
    expect(validateSpec(cloud({ scatter: { flag: "da_dependence" } }))).toEqual({ error: SCATTER_RULES.flag(cloud({ scatter: { flag: "da_dependence" } }))! });
    expect(SCATTER_RULES.flag(cloud({ scatter: { flag: "da_dependence" } }))).toBe("Dependență de o autoritate se aplică doar firmelor. Alege alt semnal sau scoate-l.");
    expect(SCATTER_RULES.flag(cloud({ scatter: { flag: "da_concentration" } }, "supplier"))).toBe("Concentrare pe un furnizor se aplică doar instituțiilor. Alege alt semnal sau scoate-l.");
    // The refusal names the signal chosen: December's peak on firms is refused as itself (review: it read as concentration).
    expect(validateSpec(cloud({ scatter: { flag: "da_year_end" } }, "supplier"))).toEqual({ error: "Vârf în decembrie se aplică doar instituțiilor. Alege alt semnal sau scoate-l." });
    expect(runnableError(cloud({ scatter: { flag: "da_concentration" } }, "supplier"))).not.toBeNull();
    expect(runnableError(cloud({ scatter: { flag: "da_year_end" } }))).toBeNull();
    expect(runnableError(cloud({ scatter: { flag: "da_dependence" } }, "supplier"))).toBeNull();
    // The cloud's keys on another question cannot change its answer: parseSpec drops them with the block.
    expect(validateSpec({ block: "table", dim: "supplier", measure: "value", filters: {}, scatter: { flag: "da_split" } })).not.toHaveProperty("scatter");
    expect(validateSpec(cloud({ scatter: { flag: "da_nu" as never } }))).toEqual({ error: "Valoare invalidă pentru scatter.flag." });
    // "Peste plafon" is both roles'.
    expect(runnableError(cloud({ scatter: { flag: "da_above_ceiling" } }, "supplier"))).toBeNull();
    expect(runnableError(cloud({ scatter: { flag: "da_above_ceiling" } }))).toBeNull();
  });

  it("runs an older link's or watch's retired signal as the whole group, never as a refusal (rf-2026.18)", () => {
    for (const dim of ["authority", "supplier"] as const) {
      const old = validateSpec(cloud({ scatter: { rankBy: "risk", flag: "da_rapid" as never } }, dim));
      expect(old).toHaveProperty("scatter", { rankBy: "risk", flag: "da_rapid" });
      expect(SCATTER_RULES.flag(old as AskSpec)).toBeNull();
      // The answer, its sources and the search apply none (ScatterAnswer drops it with „Am scos semnalul «Finalizare rapidă»”).
      expect(activeScatterFlag(old as AskSpec)).toBeNull();
    }
    expect(activeScatterFlag({ scatter: { flag: "da_round" } })).toBe("da_round");
    // The strip never writes it back.
    expect(withScatterChoice(cloud({ scatter: { rankBy: "risk" } }), "flag:da_rapid").scatter).toEqual({ rankBy: "risk" });
    expect(restoreLink({ block: "scatter", dim: "authority", measure: "value", filters: {}, scatter: { flag: "da_rapid" as never } })).toMatchObject({ run: true });
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
    expect(buildPills(spec, {}, { scatterGroup: 82 })).toEqual(expect.arrayContaining(["82 de primării de comună", "semnal: achiziții repetate, peste plafon cumulat", "primele după valoare"]));
    expect(buildPills(spec, {})[0]).toBe("risc și valoare");
    expect(questionTitle(spec)).toBe("Ce primării de comună din județul Buzău ies din tipar după risc și valoarea achizițiilor directe?");
    expect(buildPills(validateSpec(cloud({}, "supplier")) as AskSpec, {}, { scatterGroup: 72_655 })[0]).toBe("72.655 de firme");
  });

  it("is the version scatter-3, once, for the watches on it", () => {
    expect(answerVersion(cloud())).toEqual({ question: "scatter-3", conditions: {} });
  });

  it("is compared by a watch as the named list's places and scores (scatter-3); a stored scatter-2 keeps its core", () => {
    const row = (entityId: string, score: number, value: number) => ({ entityId, name: `P${entityId}`, county: "Buzău", value, nDas: 30, score, scoreRaw: score - 0.2, nFlags: 1, flags: [{ code: "da_split", years: [2019] }] });
    const v3 = { block: "scatter", scatter: { version: 3, role: "authority", rankBy: "risk", flag: null, group: { n: 82, nList: 60 }, criteria: { da_split: 46 }, p90: 1,
      cloud: { points: [] }, list: [row("7", 73, 100), row("9", 20, 50)] } };
    expect(answerCore("scatter", v3)).toEqual({ block: "scatter", scatter: { version: 3, role: "authority", rankBy: "risk", flag: null, group: { n: 82, nList: 60 }, criteria: { da_split: 46 },
      list: [{ entityId: "7", place: 1, score: 73 }, { entityId: "9", place: 2, score: 20 }] } });
    // A value, a county or a year that moves is no change; a place or a score is.
    const moved = { ...v3, scatter: { ...v3.scatter, list: [row("9", 21, 50), { ...row("7", 73, 999), county: "Cluj" }] } };
    expect((answerCore("scatter", moved) as typeof v3).scatter.list).toEqual([{ entityId: "9", place: 1, score: 21 }, { entityId: "7", place: 2, score: 73 }]);
    const v2 = { block: "scatter", scatter: { version: 2, role: "authority", levels: 5, rankBy: "risk", flag: "da_rapid", group: { n: 82, nList: 60 }, criteria: { da_rapid: 15 }, p90: 1,
      cloud: { points: [] }, list: [{ entityId: "7", name: "P7", county: null, value: 100, nDas: 30, cri: 0.4, nFlags: 2, flags: [{ code: "da_split", years: [2019] }, { code: "da_rapid", share: 0.25 }] }] } };
    expect(answerCore("scatter", v2)).toMatchObject({ scatter: { version: 2, flag: "da_rapid", list: [{ entityId: "7", value: 100, nDas: 30, nFlags: 2, flags: ["da_split", "da_rapid"] }] } });
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
    expect(validateEvidenceScope({ flag: "da_above_ceiling" })).toEqual({ flag: "da_above_ceiling" });
    // A retired signal has no sources of its own.
    expect(validateEvidenceScope({ flag: "da_rapid" })).toEqual({ error: "Semnal invalid în selecție." });
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
