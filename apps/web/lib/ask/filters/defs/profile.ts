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

export const peers = readAhead<{ similar?: true; activity?: true; domain?: true }>({
  id: "peers", keys: ["peers.similar", "peers.activity", "peers.domain"], placement: "sentence", control: "peers",
  label: "Față de cine", windowTitle: "Față de cine?", scope: "selection",
  sample: { block: "distribution", value: { similar: true }, base: { dim: "authority", filters: { authorityId: 1 } } },
});

export const PROFILE_DEFS: readonly FilterDef[] = [rankBy, scatterFlag, scatterRankBy, peers];
