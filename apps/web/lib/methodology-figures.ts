import { createDb, type DbSql } from "@seap/db";
import { unstable_cache } from "next/cache";
import { readAuthorityKinds } from "./ask/authority-kind";
import { PEER_MINIMUM, PROFILE_MIN_DAS } from "./ask/peer-groups-shared";
import { readPeerPopulations } from "./ask/peer-groups";
import { OUAI_NAME } from "./risk-peers";
import { riskBand, type RiskBand } from "./risk-score";

/**
 * The national figures of /metodologie, read from the current scores (marts.entity_flags) with the site's own
 * groups, so the page says what the entity pages and Întreabă say after every run: the bands of all profiles with
 * at least 10 direct acquisitions, the comparison group of the made-up Comuna Exemplu (9.000 inhabitants, score 55,
 * among the town halls of half to double its population, as lib/risk-peers.ts) and the scores by kind of institution.
 */

/** Comuna Exemplu, the page's made-up commune. */
export const EXAMPLE_TOWN = { population: 9000, score: 55 } as const;

export interface BandCounts {
  total: number;
  none: number;
  slab: number;
  moderat: number;
  puternic: number;
}

export interface ExamplePeers {
  min: number;
  max: number;
  /** The other town halls in the group (profiles with at least 10 direct acquisitions). */
  n: number;
  zero: number;
  lower: number;
  same: number;
  higher: number;
}

export type KindKey = "comuna" | "oras_municipiu" | "consiliu_judetean" | "sector" | "scoala" | "spital" | "ouai" | "alte";

export interface KindRow extends BandCounts {
  key: KindKey;
  /** Profiles with 10 points or more, by tens: 10–19, 20–29, …, 90–100. */
  histogram: number[];
}

export interface MethodologyFigures {
  /** When the scores were calculated (the last coordinated refresh), ISO; null before one. */
  riskAt: string | null;
  dataAt: string | null;
  bands: { authority: BandCounts; supplier: BandCounts };
  peers: ExamplePeers | null;
  kinds: KindRow[];
}

export const KIND_ORDER: readonly KindKey[] = ["comuna", "oras_municipiu", "consiliu_judetean", "sector", "scoala", "spital", "ouai", "alte"];

const emptyBands = (): BandCounts => ({ total: 0, none: 0, slab: 0, moderat: 0, puternic: 0 });
const add = (b: BandCounts, band: RiskBand) => {
  b.total += 1;
  b[band] += 1;
};
const half = (n: number) => Math.ceil(n / 2);

export async function readMethodologyFigures(q: DbSql): Promise<MethodologyFigures> {
  const [fresh] = await q`select completed_at, validation->'risk'->>'calculatedAt' risk_at
    from app.monitoring_refreshes where status = 'ready' and kind = 'coordinated' order by version desc limit 1` as unknown as
    { completed_at: Date | string | null; risk_at: string | null }[];
  const rows = await q`
    select ef.entity_id::text id, ef.role, coalesce(ef.score, 0)::int score,
      case when ef.role = 'authority' then lower(unaccent(coalesce(e.name_display, ''))) ~ ${OUAI_NAME} else false end ouai
    from marts.entity_flags ef left join core.entities e on e.id = ef.entity_id and ef.role = 'authority'
    where ef.n_das >= ${PROFILE_MIN_DAS} and ef.role in ('authority', 'supplier')
  ` as unknown as { id: string; role: "authority" | "supplier"; score: number; ouai: boolean }[];

  const bands = { authority: emptyBands(), supplier: emptyBands() };
  const authorities = new Map<string, { score: number; ouai: boolean }>();
  for (const r of rows) {
    add(bands[r.role], riskBand(r.score));
    if (r.role === "authority") authorities.set(r.id, { score: r.score, ouai: r.ouai });
  }

  const [pops, kinds] = await Promise.all([readPeerPopulations(q), readAuthorityKinds(q)]);

  const min = half(EXAMPLE_TOWN.population), max = EXAMPLE_TOWN.population * 2;
  const peers: ExamplePeers = { min, max, n: 0, zero: 0, lower: 0, same: 0, higher: 0 };
  for (const [id, population] of pops.local) {
    if (population < min || population > max) continue;
    const a = authorities.get(id);
    if (!a) continue;
    peers.n += 1;
    if (a.score === 0) peers.zero += 1;
    else if (a.score < EXAMPLE_TOWN.score) peers.lower += 1;
    else if (a.score === EXAMPLE_TOWN.score) peers.same += 1;
    else peers.higher += 1;
  }

  const byKind = new Map<KindKey, KindRow>(KIND_ORDER.map((key) => [key, { key, ...emptyBands(), histogram: Array(9).fill(0) }]));
  for (const [id, a] of authorities) {
    // The comparison's groups: OUAIs by name, Bucharest's sector town halls, then the kind of Întreabă's filters.
    const key: KindKey = a.ouai ? "ouai" : pops.sectors.has(id) ? "sector" : (kinds.byId.get(id) ?? "alte");
    const row = byKind.get(key)!;
    add(row, riskBand(a.score));
    if (a.score >= 10) {
      const bin = Math.min(8, Math.floor(a.score / 10) - 1);
      row.histogram[bin] = (row.histogram[bin] ?? 0) + 1;
    }
  }

  const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
  return {
    riskAt: fresh?.risk_at ?? iso(fresh?.completed_at),
    dataAt: iso(fresh?.completed_at),
    bands,
    peers: peers.n >= PEER_MINIMUM ? peers : null,
    kinds: KIND_ORDER.map((key) => byKind.get(key)!),
  };
}

const g = globalThis as unknown as { __seapMethodologySql?: DbSql };

/** Ten minutes per process: the scores change once a night. A failed read is not cached. */
const cachedFigures = unstable_cache(
  async (): Promise<MethodologyFigures> => readMethodologyFigures((g.__seapMethodologySql ??= createDb().sql)),
  ["methodology-figures-1"],
  { revalidate: 600 },
);

/** The page shows its text without the national figures when they cannot be read. */
export async function getMethodologyFigures(): Promise<MethodologyFigures | null> {
  try {
    return await cachedFigures();
  } catch {
    return null;
  }
}
