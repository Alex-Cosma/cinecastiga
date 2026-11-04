/**
 * Reviewed pairs of identities of one institution under two valid CUIs (owner, 4 November 2026). They stay separate
 * entities: a different CUI is a different legal person and their records are never merged. The page of the older or
 * secondary identity says where the institution's activity is now; search lists it under the main one, muted.
 *
 * Candidates came from same-name, same-county authority pairs with two CUIs (production, read-only, 4 November
 * 2026): a successor takes over within six months of overlap, a secondary account runs alongside at ≤5% of the
 * value. Every pair below was approved one by one; generic names (a canteen, a school, an irrigation association)
 * were left out because two different institutions can share them. A new pair enters only after the same review.
 */
export type SuccessorKind = "succesor" | "secundar";
export interface ReviewedSuccessor {
  /** The older (successor) or secondary identity: the page that shows the band. */
  from: string;
  /** The identity the institution's activity continues under / its main account. */
  to: string;
  kind: SuccessorKind;
  /** successor: the first year under the new CUI. */
  since?: number;
  evidence: string;
}

export const REVIEWED_SUCCESSORS: readonly ReviewedSuccessor[] = [
  { from: "2165580", to: "2146445", kind: "secundar", evidence: "Municipiul Cluj-Napoca: CUI 14920794 since 2024-09, ~0.1% of the value (parking equipment), beside CUI 4305857 since 2018." },
  { from: "2128693", to: "1965790", kind: "succesor", since: 2019, evidence: "ICDE pentru Ecologie Acvatică, Galați: CUI 1640830 2018-04..2020-08, CUI 14785680 from 2019-10." },
  { from: "2145695", to: "2161550", kind: "succesor", since: 2026, evidence: "Penitenciarul Găești: CUI 24125133 2018-04..2026-09, CUI 4344422 from 2026-07." },
  { from: "2130346", to: "2146562", kind: "succesor", since: 2019, evidence: "DSV Caraș-Severin: CUI 35150329 2018-04..2019-11, CUI 3227068 from 2019-10." },
  { from: "2135430", to: "2129165", kind: "succesor", since: 2019, evidence: "Direcția pentru Agricultură Județeană Ialomița: CUI 4232089 2018-04..2019-02, CUI 37586740 from 2019-02." },
  { from: "2135201", to: "2129179", kind: "succesor", since: 2019, evidence: "Serviciul Public Geotopocad Expert, Galați: CUI 22055716 2018-05..2019-02, CUI 38471455 from 2019-02." },
  { from: "2144513", to: "2128880", kind: "succesor", since: 2020, evidence: "ICDE pentru Creșterea Bovinelor, Constanța: CUI 2410171 2018-04..2020-02, CUI 23635789 from 2020-01." },
  { from: "2134160", to: "2161588", kind: "succesor", since: 2021, evidence: "Ministerul Energiei: CUI 33933936 2018-04..2020-03, CUI 43507695 from 2021-05." },
  { from: "2144687", to: "2161577", kind: "succesor", since: 2024, evidence: "Penitenciarul Aiud: CUI 24920627 2018-04..2025-01, CUI 4331341 from 2024-10." },
  { from: "2135938", to: "2145241", kind: "succesor", since: 2020, evidence: "Direcția Județeană pentru Sport și Tineret Maramureș: CUI 25804574 2018-04..2019-12, CUI 4296422 from 2020-03." },
];

const byFrom = new Map(REVIEWED_SUCCESSORS.map((s) => [s.from, s]));

/** The reviewed pair whose older or secondary side is this entity, if any. */
export function successorOf(id: string | number): ReviewedSuccessor | undefined {
  return byFrom.get(String(id));
}

/**
 * Search order: an older or secondary identity moves right under its main one when both are among the hits, and
 * carries its kind for a muted label. Every other hit keeps its place.
 */
export function orderLinkedHits<T extends { id: number | string }>(hits: readonly T[]): (T & { linked?: SuccessorKind })[] {
  const ids = new Set(hits.map((h) => String(h.id)));
  const moved = new Map<string, T[]>();
  const out: (T & { linked?: SuccessorKind })[] = [];
  for (const hit of hits) {
    const pair = successorOf(hit.id);
    if (pair && ids.has(pair.to)) moved.set(pair.to, [...(moved.get(pair.to) ?? []), hit]);
  }
  for (const hit of hits) {
    const pair = successorOf(hit.id);
    if (pair && ids.has(pair.to)) continue;
    out.push(pair ? { ...hit, linked: pair.kind } : hit);
    for (const child of moved.get(String(hit.id)) ?? []) out.push({ ...child, linked: successorOf(child.id)!.kind });
  }
  return out;
}

/** The muted label of a linked hit in search. */
export const LINKED_LABEL: Record<SuccessorKind, string> = { succesor: "CUI vechi", secundar: "cont secundar" };
