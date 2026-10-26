import type { DbSql } from "@seap/db";
import { formatRon } from "../format";
import { countWords } from "./answer-text";
import { nearestPopulationMembers, readPopulationMappingRows, sectorTownHallPopulations, uniquePopulationMappings } from "../peer-population";
import { authorityKindExpression, authorityKindIds, authorityPeerKind, readAuthorityKinds } from "./authority-kind";
import { cpvNamesFor, txAggFragment } from "./compile";
import { countyOfFolded } from "./facet-parts";
import {
  FACET_TTL_MS, facetStamp, inFacetTransaction, prepare, runner, timedOut,
  type FacetFailure, type Prepared, type Runner,
} from "./facets";
import { ground, type Grounding } from "./ground";
import { andAll, fullValueUnion, groupPredicates, rowPredicates } from "./predicates";
import { KIND_WORDS, questionKey, type QuestionSpec } from "./question-ui";
import { AUTHORITY_KINDS, type AskSpec } from "./spec";
import {
  isGeneralGroup, PAIR_DOMAINS, peerFirmDetail,
  type ComparePeer, type ComparePeersResult, type PairDomain, type PairResult, type PairShares, type PairYear,
} from "./compare-shared";

/*
 * F4, the comparison on the server (plan §4.6, final compare §3.2–§3.6, §5;
 * the pre-step P of „Doar clienții comuni” is compare-prestep.ts):
 * - the pair's facts for the builder's windows (part=pair) and the
 *   suggestions of "Cu cine comparăm?" (part=compare-peers), behind POST
 *   /api/ask/facets with its pool, slots, limit and memory (facets.ts).
 */

type Fragment = ReturnType<DbSql>;
type Role = "authority" | "supplier";

// --- the pair's facts (part=pair)

/** The keys each fact leaves out of the draft (kit R5): its own window's. P is beside the answer, never in a window. */
const PAIR_SECTIONS = {
  years: ["yearFrom", "yearTo", "monthFrom", "monthTo"],
  domains: ["cpvTerm", "purchaseKind"],
  kinds: ["authorityKind"],
  counties: ["county", "uatSiruta", "uatName"],
} as const;
type Section = keyof typeof PAIR_SECTIONS;

const without = (spec: AskSpec, keys: readonly string[]): AskSpec => {
  const filters = { ...spec.filters } as Record<string, unknown>;
  for (const key of [...keys, "sharedPartners"]) delete filters[key];
  return { ...spec, filters: filters as AskSpec["filters"] };
};

interface PairGrouped { gy: number; gc: number; gk: number; go: number; party: string; y: string | null; c5: string | null; kind: string | null; county: string | null; v: string; n: string }

/** One pass over the pair's records for the sections that share a draft: grouping sets over a grouping by party and client. */
async function pairPass(sql: DbSql, p: Prepared, sections: readonly Section[], run: Runner): Promise<PairGrouped[]> {
  const source = txAggFragment(sql, p.dataset, false, fullValueUnion(p.ctx)) as unknown as Fragment;
  const base = andAll(sql, rowPredicates(p.ctx));
  const where = andAll(sql, [base, ...groupPredicates(p.ctx, source, base)]);
  const party: Fragment = p.ctx.comparison?.role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
  const kind: Fragment = sections.includes("kinds") ? authorityKindExpression(sql, await readAuthorityKinds(sql), sql`g.other`) : sql`null::text`;
  const sets: Fragment[] = sections.map((section) => section === "years" ? sql`(x.party, x.y)`
    : section === "domains" ? sql`(x.party, x.c5)` : section === "kinds" ? sql`(x.party, x.kind)` : sql`(x.party, x.county)`);
  // grouping() and the select list take only a column some set groups by: a section not read here is 1 and null.
  const grouped = (section: Section, column: Fragment): Fragment => sections.includes(section) ? sql`grouping(${column})` : sql`1`;
  const key = (section: Section, column: Fragment): Fragment => sections.includes(section) ? column : sql`null::text`;
  return await run<PairGrouped>(sql`
    select ${grouped("years", sql`x.y`)} gy, ${grouped("domains", sql`x.c5`)} gc, ${grouped("kinds", sql`x.kind`)} gk, ${grouped("counties", sql`x.county`)} go,
           x.party, ${key("years", sql`x.y`)} y, ${key("domains", sql`x.c5`)} c5, ${key("kinds", sql`x.kind`)} kind, ${key("counties", sql`x.county`)} county,
           coalesce(sum(x.v), 0)::text v, sum(x.n)::text n
    from (
      select g.party, g.y, g.c5, ${kind} kind, g.county, g.v, g.n from (
        select ${party}::text party, d.authority_id other, substr(d.cpv_code, 1, 5) c5, substr(d.finalization_date, 1, 4) y, d.county,
               sum(d.closing_value) v, count(*) n
        from ${source} d where ${where} group by 1, 2, 3, 4, 5) g) x
    group by grouping sets (${sets.reduce((a, b) => sql`${a}, ${b}`)})
  `);
}

const pairKept = new Map<string, { value: PairResult | ComparePeersResult; at: number }>();
const PAIR_ENTRIES = 200;
/** Tests: forget the pairs' facts and suggestions kept. */
export function forgetCompareFacets(): void { pairKept.clear(); }
function keepPair(key: string, value: PairResult | ComparePeersResult): void {
  pairKept.delete(key);
  pairKept.set(key, { value, at: Date.now() });
  for (const oldest of pairKept.keys()) { if (pairKept.size <= PAIR_ENTRIES) break; pairKept.delete(oldest); }
}

/**
 * The facts of the pair a comparison's draft names (final compare §5 "Indicii
 * înainte de rulare"): each section on the draft without its window's key,
 * the sections that share a draft in one pass, every pass anchored on the two
 * entities' id indexes. Kept 10 minutes on the draft, the data checkpoint and
 * the marts build, as the windows' counts.
 */
export async function pairFacts(sql: DbSql, draft: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<PairResult | FacetFailure> {
  if (draft.block !== "compare") return { error: "Indiciile perechii sunt ale unei comparații." };
  const firms = !(draft.filters.authorityId || draft.filters.authorityName);
  const stamp = await facetStamp(sql);
  const key = stamp.build ? JSON.stringify([stamp.build, stamp.checkpoint, "pair", questionKey(without(draft, []) as unknown as QuestionSpec)]) : null;
  const hit = key ? pairKept.get(key) : undefined;
  if (key && hit && Date.now() - hit.at <= FACET_TTL_MS) return { ...(hit.value as PairResult), tookMs: 0 };
  const started = Date.now();
  // The sections that share a draft are read together (the default draft: all four in one pass).
  const asked: Section[] = firms ? ["years", "domains", "kinds", "counties"] : ["years", "domains"];
  const drafts = new Map<string, { spec: AskSpec; sections: Section[] }>();
  for (const section of asked) {
    const spec = without(draft, PAIR_SECTIONS[section]);
    const at = questionKey(spec as unknown as QuestionSpec);
    drafts.set(at, { spec, sections: [...(drafts.get(at)?.sections ?? []), section] });
  }
  try {
    const grounded = await Promise.all([...drafts.values()].map(async (d) => ({ ...d, grounding: await ground(sql, d.spec.filters, d.spec.population) as Grounding })));
    const result = await inFacetTransaction(sql, async (tx): Promise<PairResult | FacetFailure> => {
      const run = runner(opts.signal);
      const rows: { section: Section; row: PairGrouped }[] = [];
      let a = "", b = "";
      for (const d of grounded) {
        const p = await prepare(tx, d.spec, d.grounding);
        if ("error" in p) return p;
        a = p.ctx.comparison?.focalId ?? ""; b = p.ctx.comparison?.compareId ?? "";
        // Each grouping set leaves one column of its own ungrouped (grouping() = 0): it names the section.
        for (const row of await pairPass(tx, p, d.sections, run)) {
          const section: Section | null = !Number(row.gy) ? "years" : !Number(row.gc) ? "domains" : !Number(row.gk) ? "kinds" : !Number(row.go) ? "counties" : null;
          if (section) rows.push({ section, row });
        }
      }
      const side = (party: string): "a" | "b" | null => party === a ? "a" : party === b ? "b" : null;
      // Years: every year either has, the old ones too (the chart's first column, "+17 mai vechi").
      const years = new Map<number, PairYear>();
      for (const { row } of rows.filter((r) => r.section === "years")) {
        const at = side(row.party), year = Number(row.y);
        if (!at || !row.y || !Number.isInteger(year)) continue;
        const entry = years.get(year) ?? { year, a: { value: 0, n: 0 }, b: { value: 0, n: 0 } };
        entry[at] = { value: Number(row.v), n: Number(row.n) };
        years.set(year, entry);
      }
      // Domains: the groups both have, not the general ones, by the smaller value; the general codes' share.
      const byGroup = new Map<string, { a: number; b: number }>();
      const general = { a: 0, b: 0, totalA: 0, totalB: 0 };
      for (const { row } of rows.filter((r) => r.section === "domains")) {
        const at = side(row.party);
        if (!at) continue;
        const v = Number(row.v);
        if (at === "a") general.totalA += v; else general.totalB += v;
        if (!row.c5) continue;
        if (isGeneralGroup(row.c5)) { general[at] += v; continue; }
        const entry = byGroup.get(row.c5) ?? { a: 0, b: 0 };
        entry[at] += v;
        byGroup.set(row.c5, entry);
      }
      const common = [...byGroup].filter(([, v]) => v.a > 0 && v.b > 0)
        .sort((x, y) => Math.min(y[1].a, y[1].b) - Math.min(x[1].a, x[1].b) || x[0].localeCompare(y[0])).slice(0, PAIR_DOMAINS);
      const names = await cpvNamesFor(tx, common.map(([code]) => code));
      const domains: PairDomain[] = common.map(([code, v]) => ({ code, name: names.get(code) ?? null, a: v.a, b: v.b }));
      const shares = (section: "kinds" | "counties", option: (key: string | null) => string | null, order?: readonly string[]): PairShares | null => {
        if (!asked.includes(section)) return null;
        const by = new Map<string, { a: number; b: number }>();
        const rest = { a: 0, b: 0 }, total = { a: 0, b: 0 };
        for (const { row } of rows.filter((r) => r.section === section)) {
          const at = side(row.party);
          if (!at) continue;
          const v = Number(row.v), value = option(section === "kinds" ? row.kind : row.county);
          total[at] += v;
          if (value === null) { rest[at] += v; continue; }
          const entry = by.get(value) ?? { a: 0, b: 0 };
          entry[at] += v;
          by.set(value, entry);
        }
        const values = order ? [...order] : [...by.keys()].sort((x, y) => (by.get(y)!.a + by.get(y)!.b) - (by.get(x)!.a + by.get(x)!.b) || x.localeCompare(y));
        return { options: values.map((value) => ({ value, a: by.get(value)?.a ?? 0, b: by.get(value)?.b ?? 0 })), rest, total };
      };
      return {
        part: "pair", role: firms ? "supplier" : "authority",
        years: [...years.values()].sort((x, y) => x.year - y.year), domains, general,
        kinds: shares("kinds", (k) => k && (AUTHORITY_KINDS as readonly string[]).includes(k) ? k : null, AUTHORITY_KINDS),
        counties: shares("counties", (c) => countyOfFolded(c)),
        checkpoint: stamp.checkpoint, tookMs: Date.now() - started,
      };
    });
    if (key && "part" in result) keepPair(key, result);
    return result;
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

// --- "Cu cine comparăm?" (part=compare-peers)

/** The suggestions listed at most (final §3.6). */
export const COMPARE_PEERS = 5;
/** Clients of the focal firm the firms' suggestions count over (final §3.6: "socotiți pe primii 50 de clienți"). */
const PEER_CLIENTS = 50;
const POPULATION_TIP = "Populația RPL 2021. Doar primăriile: orașele cumpără și prin direcții, regii și companii proprii, care nu intră aici.";

/**
 * The suggestions of the second entity, of the chosen role only (final §3.6),
 * on the whole archive (they filter nothing): town halls and county councils
 * by the nearest RPL 2021 population (the strict mappings: an identity without
 * a county, a duplicate, has none); another institution by its kind and the
 * nearest total value; a firm by the most clients shared in its main CPV
 * division, counted over its first 50 clients there. Per branch, on the id
 * indexes: PORR 50–95 ms, SELGROS 80–105 ms (26 Oct 2026).
 */
export async function comparePeers(sql: DbSql, spec: AskSpec, opts: { signal?: AbortSignal } = {}): Promise<ComparePeersResult | FacetFailure> {
  const role: Role = spec.filters.authorityId || spec.filters.authorityName ? "authority" : "supplier";
  const named = role === "authority" ? spec.filters.authorityId ?? spec.filters.authorityName : spec.filters.supplierId ?? spec.filters.supplierName;
  if (!named) return { error: "Alege întâi prima entitate." };
  const grounding = await ground(sql, role === "authority"
    ? { authorityId: spec.filters.authorityId, authorityName: spec.filters.authorityName } as AskSpec["filters"]
    : { supplierId: spec.filters.supplierId, supplierName: spec.filters.supplierName } as AskSpec["filters"]);
  const focal = role === "authority" ? grounding.authority?.entityId : grounding.supplier?.entityId;
  if (!focal) return { error: "Nu am găsit prima entitate." };
  const stamp = await facetStamp(sql);
  const key = stamp.build ? JSON.stringify([stamp.build, stamp.checkpoint, "compare-peers", role, focal]) : null;
  const hit = key ? pairKept.get(key) : undefined;
  if (key && hit && Date.now() - hit.at <= FACET_TTL_MS) return { ...(hit.value as ComparePeersResult), tookMs: 0 };
  const started = Date.now();
  try {
    const result = await inFacetTransaction(sql, async (tx): Promise<ComparePeersResult> => {
      const run = runner(opts.signal);
      const found = role === "supplier" ? await firmPeers(tx, focal, run) : await institutionPeers(tx, focal, run);
      return { part: "compare-peers", ...found, checkpoint: stamp.checkpoint, tookMs: Date.now() - started };
    });
    if (key) keepPair(key, result);
    return result;
  } catch (e) {
    if (timedOut(e)) return { timeout: true };
    throw e;
  }
}

type Found = Pick<ComparePeersResult, "label" | "tip" | "peers">;
const NONE: Found = { label: null, tip: null, peers: [] };

async function names(sql: DbSql, role: Role, ids: readonly string[], run: Runner): Promise<Map<string, { name: string; county: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await run<{ id: string; name: string | null; county: string | null }>(sql`
    select ep.entity_id::text id, ep.name_display name, ep.county from marts.entity_profile ep
    where ep.role = ${role} and ep.entity_id = any(${sql.array([...ids])}::bigint[])`);
  return new Map(rows.map((r) => [r.id, { name: r.name ?? "?", county: r.county }]));
}

async function institutionPeers(sql: DbSql, focal: string, run: Runner): Promise<Found> {
  const rows = await readPopulationMappingRows(sql);
  const index = new Map([...uniquePopulationMappings(rows), ...sectorTownHallPopulations(rows)]);
  const own = index.get(focal);
  if (own) {
    const nearest = nearestPopulationMembers(index, focal).slice(0, COMPARE_PEERS);
    const named = await names(sql, "authority", nearest.map(([id]) => id), run);
    return {
      label: own.level === "county" ? "Consilii județene cu populație apropiată" : "Primării cu populație apropiată",
      tip: own.level === "county" ? "Populația județului, RPL 2021." : POPULATION_TIP,
      peers: nearest.filter(([id]) => named.has(id)).map(([id, population]): ComparePeer => ({
        id: Number(id), name: named.get(id)!.name, county: named.get(id)!.county, detail: countWords(population.value, "locuitor", "locuitori"),
      })),
    };
  }
  const kind = await authorityPeerKind(sql, focal);
  const ids = kind ? await authorityKindIds(sql, kind) : null;
  if (!kind || !ids?.length) return NONE;
  // The same kind, the nearest total value; an identity without a county (a duplicate) stays out.
  const found = await run<{ id: string; name: string | null; county: string | null; v: string }>(sql`
    select ep.entity_id::text id, ep.name_display name, ep.county, ep.total_ron_split::text v
    from marts.entity_profile ep
    where ep.role = 'authority' and ep.entity_id = any(${sql.array([...ids])}::bigint[]) and ep.entity_id <> ${focal}
      and ep.county is not null and ep.total_ron_split > 0
    order by abs(ep.total_ron_split - (select f.total_ron_split from marts.entity_profile f where f.role = 'authority' and f.entity_id = ${focal})), ep.entity_id
    limit ${COMPARE_PEERS}`);
  const words = KIND_WORDS[kind]?.bare ?? "instituții";
  return {
    label: `${words.charAt(0).toUpperCase()}${words.slice(1)} cu valoare apropiată`, tip: "Același tip de instituție, valoarea totală cea mai apropiată, în toată arhiva.",
    peers: found.map((r) => ({ id: Number(r.id), name: r.name ?? "?", county: r.county, detail: `${formatRon(Number(r.v))} în total` })),
  };
}

async function firmPeers(sql: DbSql, focal: string, run: Runner): Promise<Found> {
  // Each branch on its own id index (the union of both read whole would scan every client's records: 11–28 s).
  const da = (cols: Fragment, where: Fragment) => sql`select ${cols} from marts.da_transactions d where ${where} and d.closing_value > 0 and d.closing_value <= 2000000`;
  const ct = (cols: Fragment, where: Fragment) => sql`select ${cols} from marts.contract_transactions d where ${where} and d.closing_value > 0`;
  const both = (cols: Fragment, where: Fragment) => sql`(${da(cols, where)} union all ${ct(cols, where)})`;
  const [main] = await run<{ div: string }>(sql`
    select substr(x.cpv_code, 1, 2) div from ${both(sql`d.cpv_code, d.closing_value`, sql`d.supplier_id = ${focal}`)} x
    where x.cpv_code is not null group by 1 order by sum(x.closing_value) desc, 1 limit 1`);
  if (!main) return NONE;
  const like = `${main.div}%`;
  const clients = await run<{ id: string }>(sql`
    select x.authority_id::text id from ${both(sql`d.authority_id, d.closing_value`, sql`d.supplier_id = ${focal} and d.cpv_code like ${like}`)} x
    where x.authority_id is not null group by 1 order by sum(x.closing_value) desc, 1 limit ${PEER_CLIENTS}`);
  if (!clients.length) return NONE;
  const found = await run<{ id: string; n: number }>(sql`
    select x.supplier_id::text id, count(distinct x.authority_id)::int n from ${both(sql`d.authority_id, d.supplier_id, d.closing_value`,
      sql`d.authority_id = any(${sql.array(clients.map((c) => c.id))}::bigint[]) and d.cpv_code like ${like}`)} x
    where x.supplier_id is not null and x.supplier_id <> ${focal}
    group by 1 order by 2 desc, sum(x.closing_value) desc, 1 limit ${COMPARE_PEERS}`);
  const named = await names(sql, "supplier", found.map((r) => r.id), run);
  return {
    label: "Aceiași clienți, același domeniu",
    tip: `Firmele cu cei mai mulți clienți comuni în CPV ${main.div}, domeniul principal al firmei, socotiți pe primii ${PEER_CLIENTS} de clienți ai ei. Nu înseamnă că au concurat.`,
    peers: found.map((r) => ({ id: Number(r.id), name: named.get(r.id)?.name ?? "?", county: named.get(r.id)?.county ?? null, detail: peerFirmDetail(r.n, main.div) })),
  };
}
