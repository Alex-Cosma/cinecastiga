import { peersRule, SCATTER_RULES, type PeersOptions, type RankBy } from "../../spec";
import { scatterFlagsOf, type ScatterFlag } from "../../scatter-shared";
import type { FilterDef } from "../types";
import { alwaysScope, edited, readAhead } from "./shared";

/*
 * The historical profiles (plan §2.2 profile.ts): the axis of "Cine
 * conduce?", the risk cloud's signal and order (F6b) and the distribution's
 * comparison group.
 */

export const rankBy: FilterDef<"value" | "risk"> = {
  id: "rankBy", keys: ["rankBy"], placement: "sentence", control: "list",
  label: "Axa", windowTitle: "Ce vrei să descoperi?", windowNote: "Un risc ridicat este un punct de plecare pentru verificări.",
  // The answer itself: the transaction ranking or the profiles (a missing rankBy is the risk score).
  // Old scatter links carry it from "Cine conduce?"; accepted there and ignored (F0a, scatter.rankBy).
  engine: { "entity_card:value": "block", "entity_card:risk": "block" }, scope: alwaysScope("display"),
  read: (spec) => spec.rankBy as "value" | "risk" | undefined,
  write: (spec, value) => edited(spec, (next) => { if (value) next.rankBy = value; else delete next.rankBy; }),
  choices: () => ["value", "risk"],
};

/**
 * The risk cloud's signal (F6b, plan §4.12, final scatter §3.4): "Tot grupul · 82 · Posibilă fracționare · 46 · …",
 * one choice at once, beside the chart. It colours the points that have the signal and narrows the list, never the
 * cloud (decision scatter-3), so a signal that half of the group has does not seem to stand out. The role keeps its
 * own signals; the sentence's subject change takes the other role's away (settle, with a note).
 */
export const scatterFlag: FilterDef<ScatterFlag> = {
  id: "scatterFlag", keys: ["scatter.flag"], placement: "strip", control: "countPills",
  label: "Semnal", windowTitle: "Ce semnal?",
  engine: { scatter: "profile" }, scope: alwaysScope("display"), since: "F6b",
  read: (spec) => spec.scatter?.flag,
  write: (spec, value) => edited(spec, (next) => {
    const options = { ...next.scatter };
    if (value) options.flag = value; else delete options.flag;
    if (Object.keys(options).length) next.scatter = options; else delete next.scatter;
  }),
  // The signals the role can meet; the empty choice is "Tot grupul".
  choices: (_spec, ctx) => [undefined, ...scatterFlagsOf(ctx.role)],
  validate: SCATTER_RULES.flag,
};

/**
 * "Primele după" (F6b, final scatter §3.3): the order of the list and the names on the chart, Semnale (the index, then
 * value: the order of "Cine conduce?" on the index) or Valoare. The group does not change. A new question writes it
 * (F0a-scatter-rankBy: its own key, not the top-level `rankBy` an old link carries from "Cine conduce?", which the cloud ignores).
 */
export const scatterRankBy: FilterDef<RankBy> = {
  id: "scatterRankBy", keys: ["scatter.rankBy"], placement: "strip", control: "segmented",
  label: "Primele după", windowTitle: "Primele după",
  engine: { scatter: "display" }, scope: alwaysScope("display"), since: "F6b",
  read: (spec) => spec.scatter?.rankBy,
  write: (spec, value) => edited(spec, (next) => {
    const options = { ...next.scatter };
    if (value) options.rankBy = value; else delete options.rankBy;
    if (Object.keys(options).length) next.scatter = options; else delete next.scatter;
  }),
  choices: () => ["risk", "value"],
};

/**
 * The distribution's comparison group (F6a, plan §4.11, final distribution §3):
 * "Față de cine?", ticks combined with AND. `similar` (population of a town
 * hall, or the same type) only for institutions, `activity` (½–2× of the
 * entity's direct acquisitions) for both; `domain` is phase 2. The window also
 * ticks "același județ", which writes the existing `filters.county`
 * (lib/ask/peer-groups-shared.ts writePeerTicks). It selects who the others
 * are: the group's size and the position change with it.
 */
export const peers: FilterDef<Pick<PeersOptions, "similar" | "activity">> = {
  id: "peers", keys: ["peers.similar", "peers.activity"], placement: "sentence", control: "peers",
  label: "Față de cine", windowTitle: "Față de cine?",
  engine: { distribution: "profile" }, scope: alwaysScope("selection"), since: "F6a",
  read: (spec) => spec.peers?.similar || spec.peers?.activity
    ? { ...(spec.peers.similar ? { similar: true as const } : {}), ...(spec.peers.activity ? { activity: true as const } : {}) } : undefined,
  // Its own ticks; the main domain (phase 2) is peersDomain's.
  write: (spec, value) => edited(spec, (next) => {
    const kept: PeersOptions = { ...(next.peers?.domain ? { domain: true as const } : {}) };
    if (value?.similar) kept.similar = true;
    if (value?.activity) kept.activity = true;
    if (Object.keys(kept).length) next.peers = kept;
    else delete next.peers;
  }),
  // The window's ticks (the county is filters.county's own): "același tip" only for institutions.
  choices: (_spec, ctx) => ctx.block !== "distribution" ? []
    : ctx.role === "authority" ? [{ similar: true }, { activity: true }, { similar: true, activity: true }] : [{ activity: true }],
  validate: peersRule,
};

/** The main domain of a firm (phase 2, DECISIONS A3-main-cpv-div): read ahead, refused as newer until its row comes. */
export const peersDomain = readAhead<true>({
  id: "peersDomain", keys: ["peers.domain"], placement: "sentence", control: "peers",
  label: "Același domeniu principal", scope: "selection",
  sample: { block: "distribution", value: true, base: { dim: "supplier", filters: { supplierId: 1 } } },
});

export const PROFILE_DEFS: readonly FilterDef[] = [rankBy, scatterFlag, scatterRankBy, peers as FilterDef, peersDomain as FilterDef];
