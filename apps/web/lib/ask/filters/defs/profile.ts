import { peersRule, type PeersOptions } from "../../spec";
import type { FilterDef } from "../types";
import { alwaysScope, edited, readAhead } from "./shared";

/*
 * The historical profiles (plan §2.2 profile.ts): the axis of "Cine
 * conduce?", and, read ahead, the scatter's signal and order and the
 * distribution's comparison group.
 */

export const rankBy: FilterDef<"value" | "risk"> = {
  id: "rankBy", keys: ["rankBy"], placement: "sentence", control: "list",
  label: "Axa", windowTitle: "Ce vrei să descoperi?", windowNote: "Un indice ridicat este un punct de plecare pentru verificări.",
  // The answer itself: the transaction ranking or the profiles (a missing rankBy is the index).
  // Old scatter links carry it from "Cine conduce?"; accepted there and ignored (F0a, scatter.rankBy).
  engine: { "entity_card:value": "block", "entity_card:risk": "block" }, scope: alwaysScope("display"),
  read: (spec) => spec.rankBy as "value" | "risk" | undefined,
  write: (spec, value) => edited(spec, (next) => { if (value) next.rankBy = value; else delete next.rankBy; }),
  choices: () => ["value", "risk"],
};

export const scatterFlag = readAhead<string>({
  id: "scatterFlag", keys: ["scatter.flag"], placement: "strip", control: "countPills",
  label: "Semnal", scope: "display",
  sample: { block: "scatter", value: "da_split", base: { dim: "authority" } },
});

export const scatterRankBy = readAhead<"value" | "risk">({
  id: "scatterRankBy", keys: ["scatter.rankBy"], placement: "strip", control: "segmented",
  label: "Primele după", scope: "display",
  sample: { block: "scatter", value: "value", base: { dim: "authority" } },
});

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
