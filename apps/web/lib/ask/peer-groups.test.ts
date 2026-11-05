import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { BUZAU_DIALOG, BUZAU_FACTS, HOSPITAL_DIALOG } from "./fixtures/distribution-screen";
import { legacyCounty, peerRows, peerTickError, populationCoverage, resolvePeerFacts } from "./peer-groups";
import { profileCounty, profileCountyCond, profilePredicates, type PredicateCtx } from "./predicates";
import {
  CRITERIA, CRITERION_LABEL, CRITERION_RULE,
  PEER_MINIMUM, PROFILE_MIN_DAS, bandWords, countyDisplay, coverageWords, defaultPeerTicks, peerCountWords, peerFollowUp, peerGroupValue, peerGroupWords, peerKey,
  peerRowState, peerTicks, peerWindowTip, togglePeerRow, withPeerGroup, writePeerTicks, type PeerDialogData, type PeerFacts,
} from "./peer-groups-shared";
import { flagLabel } from "../flags";
import { RISK_CRITERIA } from "../risk-score";
import { localityScopeError, transitionQuestion, type QuestionSpec } from "./question-ui";
import { validateSpec } from "./spec";

/*
 * "Față de cine?" (F6a, plan §4.11, final distribution §3.1–§3.4, §4.2, §4.4):
 * the ticks, their sizes and the replacement rule, the words of the group, the
 * default of a new question and what follows another entity. The SQL of the
 * sizes and of the answer is peer-groups.integration.test.ts's.
 */

const buzau: QuestionSpec = { block: "distribution", dim: "authority", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU" } };
const hospital: QuestionSpec = { ...buzau, filters: { authorityId: 2150000, authorityName: "SPITALUL ORASENESC CORABIA" } };

describe("the ticks of a group", () => {
  it("read the county as «același județ» only when it is the entity's own (another one is an old link's)", () => {
    expect(peerTicks({ ...buzau, peers: { similar: true } }, BUZAU_FACTS)).toEqual(["similar"]);
    expect(peerTicks({ ...buzau, filters: { ...buzau.filters, county: "Buzau" } }, BUZAU_FACTS)).toEqual(["county"]);
    expect(peerTicks({ ...buzau, filters: { ...buzau.filters, county: "Cluj" } }, BUZAU_FACTS)).toEqual([]);
    expect(legacyCounty({ county: "Cluj" }, BUZAU_FACTS)).toBe("Cluj");
    expect(legacyCounty({ county: "BUZĂU" }, BUZAU_FACTS)).toBeNull();
    expect(peerKey(["county", "similar"])).toBe("similar+county");
    expect(countyDisplay("Bucuresti")).toBe("București");
    expect(countyDisplay("Municipiul București")).toBe("București");
    expect(countyDisplay("NA")).toBeNull();
  });

  it("show «→ N» after ticking, and replace the ticks a row does not fit with (final §3.1)", () => {
    // Buzău: the population band has 29, the county 336, together none.
    expect(peerRowState(BUZAU_DIALOG, [], "similar")).toEqual({ kind: "add", size: 29, replaces: [] });
    expect(peerRowState(BUZAU_DIALOG, ["similar"], "similar")).toEqual({ kind: "ticked" });
    expect(peerRowState(BUZAU_DIALOG, ["similar"], "county")).toEqual({ kind: "add", size: 336, replaces: ["similar"] });
    // The hospital: Olt replaces "Spitale" (4 together), activity keeps it (124 together).
    expect(peerRowState(HOSPITAL_DIALOG, ["similar"], "county")).toEqual({ kind: "add", size: 364, replaces: ["similar"] });
    expect(peerRowState(HOSPITAL_DIALOG, ["similar"], "activity")).toEqual({ kind: "add", size: 124, replaces: [] });
    // With two ticks, the most ticks that still fit stay: Olt keeps the activity (40), not the hospitals (4).
    expect(peerRowState(HOSPITAL_DIALOG, ["similar", "activity"], "county")).toEqual({ kind: "add", size: 40, replaces: ["similar"] });
    // A row with fewer than 5 alone is disabled, its reason visible.
    const firm: PeerDialogData = { ...BUZAU_DIALOG, rows: [{ id: "activity", label: "230.899–923.596 de achiziții directe", rule: "activitate apropiată", tip: "" }], sizes: { "": 72_654, activity: 1 } };
    expect(peerRowState(firm, [], "activity")).toMatchObject({ kind: "disabled", short: "doar 1" });
    expect(peerRowState({ ...firm, sizes: { "": 9, activity: 0 } }, [], "activity")).toMatchObject({ kind: "disabled", short: "niciun alt membru" });
  });

  it("write the group at once, with the note of a replacement (no «Aplică»)", () => {
    const similar = togglePeerRow(buzau, BUZAU_DIALOG, "similar");
    expect([similar.spec.peers, similar.note]).toEqual([{ similar: true }, null]);
    const county = togglePeerRow(similar.spec, BUZAU_DIALOG, "county");
    expect(county.spec.peers).toBeUndefined();
    expect(county.spec.filters.county).toBe("Buzău");
    expect(county.note).toBe("Am scos „Primării cu 52–207 mii de locuitori”: împreună cu „Județul Buzău” nu rămânea niciun alt membru.");
    // Unticking the county removes the entity's; an old link's other county stays until its ×.
    expect(togglePeerRow(county.spec, BUZAU_DIALOG, "county").spec.filters).not.toHaveProperty("county");
    const other = { ...buzau, filters: { ...buzau.filters, county: "Cluj" } };
    expect(writePeerTicks(other, [], BUZAU_FACTS).filters.county).toBe("Cluj");
    for (const spec of [similar.spec, county.spec]) expect(validateSpec(spec), JSON.stringify(spec)).not.toHaveProperty("error");
  });

  it("tick «populație apropiată» by default on a new question only when the group is sure and has 5 others (final §4.2)", () => {
    expect(defaultPeerTicks(BUZAU_DIALOG)).toEqual(["similar"]);
    expect(defaultPeerTicks({ ...BUZAU_DIALOG, sizes: { ...BUZAU_DIALOG.sizes, similar: PEER_MINIMUM - 1 } })).toEqual([]);
    expect(defaultPeerTicks({ ...BUZAU_DIALOG, facts: { ...BUZAU_FACTS, similar: null } })).toEqual([]);
    expect(defaultPeerTicks({ ...BUZAU_DIALOG, facts: { ...BUZAU_FACTS, role: "supplier" } })).toEqual([]);
    // An old link's own group is never replaced by the default.
    expect(defaultPeerTicks({ ...BUZAU_DIALOG, legacy: { county: "Cluj" } })).toEqual([]);
    const fresh = peerFollowUp(buzau, BUZAU_DIALOG, { fresh: true });
    expect(fresh).toEqual({ spec: { ...buzau, peers: { similar: true } }, notes: [] });
    // Nothing follows another entity's facts, or a question that already says its group.
    expect(peerFollowUp(hospital, BUZAU_DIALOG, { fresh: true })).toBeNull();
    expect(peerFollowUp({ ...buzau, peers: { activity: true } }, BUZAU_DIALOG, { fresh: true })).toBeNull();
  });

  it("follow another entity: its county replaces the old one's, a type it lacks leaves with a note (final §4.4)", () => {
    const facts = (over: Partial<PeerFacts>): PeerDialogData => ({ ...HOSPITAL_DIALOG, facts: { ...HOSPITAL_DIALOG.facts, ...over } });
    const before = { ...hospital, filters: { ...hospital.filters, county: "Buzău" }, peers: { similar: true as const } };
    expect(peerFollowUp(before, HOSPITAL_DIALOG, { previousCounty: "Buzău" })?.spec.filters.county).toBe("Olt");
    expect(peerFollowUp(before, facts({ county: null }), { previousCounty: "Buzău" })).toMatchObject({
      spec: { filters: { authorityId: 2150000 } }, notes: ["Am scos „Județul Buzău”: județul lui SPITALUL ORASENESC CORABIA nu e cunoscut."],
    });
    const untyped = peerFollowUp(before, facts({ similar: null }), { previousCounty: "Cluj" });
    expect(untyped?.spec.peers).toBeUndefined();
    expect(untyped?.notes).toEqual(["Am scos „același tip”: tipul lui SPITALUL ORASENESC CORABIA nu se poate stabili."]);
    // A county that was not the old entity's (an old link's) stays.
    expect(peerFollowUp({ ...before, filters: { ...before.filters, county: "Cluj" } }, HOSPITAL_DIALOG, { previousCounty: "Buzău" })).toBeNull();
  });

  it("drop «același tip» when the entity becomes a firm, keep the activity and the county (final §4.4)", () => {
    const firm = { ...buzau, filters: { supplierId: 2124387, supplierName: "DEDEMAN" }, peers: { similar: true as const, activity: true as const } };
    const next = transitionQuestion(firm);
    expect(next.spec.peers).toEqual({ activity: true });
    expect(next.changes).toContain("Am scos „același tip”: se aplică doar instituțiilor.");
  });
});

describe("the words of a group (final §1.1, kit §4)", () => {
  it("say the bounds, with «de» where the last number takes it (G10)", () => {
    expect(bandWords(51_741, 206_962, "locuitori")).toBe("52–207 mii de locuitori");
    expect(bandWords(1_587, 6_346, "locuitori")).toBe("1.587–6.346 de locuitori");
    expect(bandWords(12_101, 48_404, "achiziții directe", false)).toBe("12.101–48.404 achiziții directe");
    expect(peerGroupWords({ filters: {} }, "authority")).toBe("toate instituțiile publice");
    expect(peerGroupWords({ filters: {} }, "supplier")).toBe("toate firmele");
    expect(peerGroupWords({ filters: { county: "Buzău" }, peers: { similar: true } }, "authority", BUZAU_FACTS)).toBe("primăriile cu 52–207 mii de locuitori din județul Buzău");
    expect(peerGroupWords({ filters: { county: "București" } }, "supplier")).toBe("firmele cu sediul în București");
    expect(peerGroupWords({ filters: { authorityKind: "comuna" } }, "authority")).toBe("primăriile de comună");
    expect(peerCountWords(29, { filters: {}, peers: { similar: true } }, "authority", BUZAU_FACTS)).toBe("29 de primării");
    expect(peerCountWords(15_728, { filters: {} }, "authority")).toBe("15.728 de instituții");
    expect(peerCountWords(1, { filters: {} }, "supplier")).toBe("1 firmă");
  });

  it("say the band's coverage and the rules in the window's (?)", () => {
    expect(coverageWords({ inBand: 32, identified: 30, missing: ["Alba Iulia", "Popești-Leordeni"] }))
      .toBe("30 din cele 32 de primării din interval sunt identificate sigur; lipsesc Alba Iulia, Popești-Leordeni.");
    expect(coverageWords({ inBand: 2_188, identified: 2_035, missing: ["Noșlac", "Sântimbru", "Covăsinț"] })).toContain("lipsesc Noșlac, Sântimbru, Covăsinț și încă 150.");
    const coverage = populationCoverage(51_741, 206_962, new Set());
    expect(coverage.missing[0]).toBe("Alba Iulia");
    expect(coverage.identified).toBe(0);
    expect(peerWindowTip(BUZAU_DIALOG).text).toMatch(/^Populație apropiată: .*Același județ: .*comparația cere cel puțin 5 alți membri\.$/);
  });

  it("travel as one value of the answer's strip (Schimbă grupul)", () => {
    const spec = { ...buzau, filters: { ...buzau.filters, county: "Cluj", authorityKind: "spital" }, peers: { similar: true as const } };
    const value = JSON.stringify(peerGroupValue(spec));
    expect(withPeerGroup(buzau, value)).toEqual(spec);
    expect(withPeerGroup(spec, JSON.stringify(peerGroupValue(buzau)))).toEqual(buzau);
  });
});

describe("the rows of the window (final §3.1 table)", () => {
  const facts = (over: Partial<PeerFacts>): PeerFacts => ({ ...BUZAU_FACTS, ...over });
  it("offer the population and the county on a town hall, activity only from a link", () => {
    expect(peerRows(BUZAU_FACTS, undefined).map((r) => [r.id, r.label, r.rule])).toEqual([
      ["similar", "Primării cu 52–207 mii de locuitori", "populație apropiată"], ["county", "Județul Buzău", "același județ"],
    ]);
    expect(peerRows(BUZAU_FACTS, { activity: true }).map((r) => r.id)).toEqual(["similar", "county", "activity"]);
  });
  it("offer the kind, the county and the activity on a hospital; an unknown kind or county disabled with its reason", () => {
    const corabia = facts({ similar: { rule: "kind", kind: "spital" }, county: "Olt", activity: { min: 12_101, max: 48_404 } });
    expect(peerRows(corabia, undefined).map((r) => r.label)).toEqual(["Spitale", "Județul Olt", "12.101–48.404 achiziții directe"]);
    const unknown = peerRows(facts({ similar: null, similarReason: "Tipul lui X nu se poate stabili sigur.", county: null }), undefined);
    expect(unknown.map((r) => [r.id, r.disabled?.short])).toEqual([["similar", "necunoscut"], ["county", "necunoscut"], ["activity", undefined]]);
    expect(peerRows(facts({ role: "supplier", similar: null }), undefined).map((r) => [r.id, r.label])).toEqual([["county", "Buzău, sediul firmei"], ["activity", "391–1.564 de achiziții directe"]]);
  });
  it("say a foreign firm has no county to compare with, not that its county is unknown (F6a merge, seat-2)", async () => {
    // A firm's group reads no database (no population, no kind): its seat label „Străinătate” is not a county.
    const none = (() => { throw new Error("no query for a firm"); }) as unknown as DbSql;
    const focal = { entityId: "9", name: "SIEMENS AG", county: "Străinătate", nDas: 400, nFlags: 1, cri: 0.2, flags: [] };
    const { facts } = await resolvePeerFacts(none, "supplier", focal);
    expect([facts.county, facts.abroad]).toEqual([null, true]);
    const [county] = peerRows(facts, undefined);
    expect([county!.id, county!.label, county!.disabled]).toEqual(["county", "Același județ",
      { short: "în străinătate", tip: "SIEMENS AG are sediul în străinătate: nu are un județ cu care să fie comparată." }]);
    // A Romanian firm with no known seat stays „necunoscut”; one in Buzău names its seat.
    const unknown = await resolvePeerFacts(none, "supplier", { ...focal, name: "X SRL", county: null });
    expect([unknown.facts.abroad, peerRows(unknown.facts, undefined)[0]!.disabled?.short]).toEqual([undefined, "necunoscut"]);
    const buzau = await resolvePeerFacts(none, "supplier", { ...focal, county: "Buzau" });
    expect([buzau.facts.county, peerRows(buzau.facts, undefined)[0]!.label]).toEqual(["Buzău", "Buzău, sediul firmei"]);
  });

  it("refuse a tick the entity cannot form, with its reason (never ignored)", () => {
    expect(peerTickError({ facts: facts({ similar: null, similarReason: "Tipul lui X nu se poate stabili sigur." }), similarIds: null }, { similar: true }))
      .toBe("Tipul lui X nu se poate stabili sigur. Scoate „același tip” sau alege altă instituție.");
    expect(peerTickError({ facts: BUZAU_FACTS, similarIds: [] }, { similar: true })).toBeNull();
  });

  it("never carry an old link's locality into a group: /api/ask, its sources, CSV and watches refuse it, with the link's chip", () => {
    // The group's words, the window and "→ N" do not know a locality, so the routes refuse it before runSpec (localityScopeError).
    const spec = { block: "distribution", measure: "value", filters: { authorityId: 2144364, authorityName: "MUNICIPIUL BUZAU", uatSiruta: 44818, uatName: "Buzău" }, peers: { similar: true } } as QuestionSpec;
    expect(localityScopeError(spec)).toMatch(/^Profilurile de risc se compară între ele, deci aici poți alege doar județul\. Elimină localitatea „Buzău”/);
  });
});

describe("the criteria of a group (rf-2026.18)", () => {
  it("are the risk score's, in its order: no „Finalizare rapidă”, the new „Peste plafonul achiziției directe”", () => {
    expect(CRITERIA).toEqual(RISK_CRITERIA);
    expect(CRITERIA.authority).toEqual(["da_split", "da_round", "da_year_end", "da_concentration", "da_above_ceiling"]);
    expect(CRITERIA.supplier).toEqual(["da_split", "da_round", "da_dependence", "da_above_ceiling", "da_capacity"]);
    expect(CRITERION_LABEL.da_capacity).toBe("Peste cifra de afaceri");
    expect(CRITERION_LABEL.da_above_ceiling).toBe(flagLabel("da_above_ceiling"));
    expect(CRITERION_RULE.da_above_ceiling).toBeTruthy();
    // A code retired since (an answer stored before) has no label here: its renderer shows the code.
    expect(CRITERION_LABEL.da_rapid).toBeUndefined();
  });
});

describe("the county of «același județ»", () => {
  // A fake `sql` that renders a fragment as text and parameters (predicates.test.ts).
  const fake = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }), { array: (v: unknown[]) => ({ array: v }) }) as unknown as DbSql;
  const render = (fragment: unknown): string => {
    const f = fragment as { strings?: string[]; values?: unknown[] };
    return Array.isArray(f?.strings) ? f.strings.reduce((out, s, i) => out + s + (i < f.values!.length ? render(f.values![i]) : ""), "") : JSON.stringify(fragment);
  };
  it("is the county the answer filters: profilePredicates' column, which the window's rows and sizes read (a seat switch changes both)", () => {
    const ctx = { sql: fake, county: "Buzău", uatSiruta: null, kind: null } as unknown as PredicateCtx;
    const [, , county] = profilePredicates(ctx, "supplier", PROFILE_MIN_DAS);
    expect(render(county)).toBe(render(profileCountyCond(fake, "Buzău")));
    expect(render(profileCountyCond(fake, "Buzău"))).toBe(`lower(unaccent(${render(profileCounty(fake))})) = "buzau"`);
    // F4 (owner-seat-switch): once the seat column is filled, a firm's county is its seat, for the answer and the window alike.
    const seated = { ...ctx, seatColumn: true } as PredicateCtx;
    const [, , seat] = profilePredicates(seated, "supplier", PROFILE_MIN_DAS);
    expect(render(seat)).toBe(render(profileCountyCond(fake, "Buzău", "supplier", true)));
    expect(render(seat)).toContain("marts.entity_profile ep where ep.role = 'supplier' and ep.seat_county = \"Buzău\"");
    expect(render(profileCounty(fake, "supplier", true))).toContain("seat_county");
    // An institution's county stays its own.
    const [, , own] = profilePredicates(seated, "authority", PROFILE_MIN_DAS);
    expect(render(own)).toBe(render(profileCountyCond(fake, "Buzău")));
  });
});
