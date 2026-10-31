import type { DbSql } from "@seap/db";
import { flagLabel } from "../flags";
import { DA_PLAFOND_RON } from "./predicates";
import type { ScatterFlag, ScatterFlagFact, ScatterRole } from "./scatter-shared";

/*
 * The records behind a profile's signal (final scatter §3.6): the sources of
 * one criterion are exactly the direct acquisitions it flags, never the
 * profile's whole history. All of them are rows of marts.da_transactions:
 *   da_split, da_rapid, da_round  the rows carrying the flag (da_flags);
 *   da_year_end                   the acquisitions finalized in December of the years it flags (flag_instances.period);
 *   da_concentration              the acquisitions with the institution's main supplier, by value;
 *   da_dependence                 the acquisitions with the firm's main institution, by value.
 * A profile's own signal is in marts.entity_flags.flags (the nightly build); a
 * row flagged in da_flags belongs to a profile without the signal when the
 * profile is under the rule's thresholds (5 acquisitions, 25%), so callers
 * select the profiles that have it (`ef.flags ? code`) before they read the rows.
 */

type Fragment = ReturnType<DbSql>;
/** A fragment is a query nobody has awaited: the tagged template types it by its rows. */
const frag = (query: unknown): Fragment => query as Fragment;

const PARTY: Record<ScatterRole, string> = { authority: "authority_id", supplier: "supplier_id" };
const PARTNER: Record<ScatterRole, string> = { authority: "supplier_id", supplier: "authority_id" };

/** The drawer's note on a signal's sources: which acquisitions they are (the rows of flaggedRecordIds). */
export function flagRecordsNote(flag: ScatterFlag): string {
  const which: Record<ScatterFlag, string> = {
    da_split: "achizițiile din grupurile de cel puțin 3 (aceeași instituție, același furnizor, același an, aceeași clasă CPV, același tip), fiecare sub plafon, cu suma peste plafon",
    da_year_end: "achizițiile finalizate în decembrie, în anii în care decembrie a avut cel puțin 35% din valoarea anuală",
    da_rapid: "achizițiile finalizate în mai puțin de o oră de la publicare",
    da_round: "achizițiile cu valoarea între 90% și 100% din plafon",
    da_concentration: "achizițiile de la furnizorul principal al instituției (cea mai mare valoare)",
    da_dependence: "achizițiile de la instituția principală a firmei (cea mai mare valoare)",
  };
  return `Sursele semnalului „${flagLabel(flag)}”: ${which[flag]}, nu tot istoricul profilurilor.`;
}

/**
 * The records behind `flag` for the profiles `entities` (a query of their ids), as a subquery of their keys with
 * the value and the date (ref_id, closing_value, finalization_date): the drawer counts and orders them on these
 * columns and reads whole rows only for the page it shows. Each case reads an index alone (F6b review: a national
 * signal scanned the 19.6M rows twice, past the drawer's 20 s limit):
 *   da_split, da_rapid, da_round     da_tx_flagged_idx, whose predicate the query repeats word for word (0.1–0.6 s);
 *   da_year_end                      the authority's covering index, on December's range of each flagged year (11 s → 1.3 s);
 *   da_concentration, da_dependence  the party's covering index (the main partner over all its records: 3.3 s nationally).
 * A role cannot have the other's signal: the caller checks (SCATTER_RULES).
 */
export function flaggedRecordKeys(sql: DbSql, role: ScatterRole, flag: ScatterFlag, entities: Fragment): Fragment {
  const party = sql(PARTY[role]), partner = sql(PARTNER[role]);
  switch (flag) {
    case "da_split":
    case "da_rapid":
    case "da_round":
      return frag(sql`(select d.sicap_da_id ref_id, d.closing_value, d.finalization_date from marts.da_transactions d
        where d.${party} in (${entities}) and cardinality(d.da_flags) > 0 and ${flag} = any(d.da_flags))`);
    case "da_year_end":
      // The range bounds the index; the month's prefix is the exact test (each flagged year once, so no row twice).
      return frag(sql`(select d.sicap_da_id ref_id, d.closing_value, d.finalization_date
        from (select distinct fi.entity_id, fi.period from marts.flag_instances fi where fi.flag_code = 'da_year_end' and fi.entity_id in (${entities})) fi
        join marts.da_transactions d on d.authority_id = fi.entity_id
          and d.finalization_date >= fi.period || '-12' and d.finalization_date < fi.period || '-13'
          and substr(d.finalization_date, 1, 7) = fi.period || '-12')`);
    case "da_concentration":
    case "da_dependence":
      // The partner + 0 hides its index: the planner would read a main partner's 26,000 records for each profile instead of the profile's own.
      return frag(sql`(select d.sicap_da_id ref_id, d.closing_value, d.finalization_date from marts.da_transactions d
        join (select distinct on (x.a) x.a, x.p from (
                select t.${party} a, t.${partner} p, sum(t.closing_value) v from marts.da_transactions t
                where t.${party} in (${entities}) and t.${partner} is not null group by 1, 2) x
              order by x.a, x.v desc, x.p) main on main.a = d.${party} and main.p = d.${partner} + 0
        where d.${party} in (${entities}))`);
  }
}

/**
 * Before the first nightly build with da_tx_flagged_idx (rollups.ts flaggedIndexReady), the row signals' keys are
 * read through the cohort's records on its party's index: a cohort of up to FLAG_LIVE_RECORDS acquisitions answers
 * so (rapid on the firms of the whole country, 1.68M: 2.1 s warm, 8.3 s cold); a larger one (a possible split on
 * the institutions of the country, 10.8M: 3.6 s warm, 14.3 s cold, past the 20 s limit under load) says it waits
 * for that build instead of failing at the limit (S6, F6b verify). Its own profiles' sources stay open.
 */
export const ROW_FLAGS: ReadonlySet<ScatterFlag> = new Set<ScatterFlag>(["da_split", "da_rapid", "da_round"]);
export const FLAG_LIVE_RECORDS = 2_500_000;
export const FLAG_INDEX_PENDING =
  "Sursele acestui semnal pe tot grupul sunt gata după următoarea prelucrare a datelor. Până atunci, deschide sursele unui profil din listă sau restrânge grupul (un județ, un tip).";
/** Whether a signal's sources wait for da_tx_flagged_idx: a row signal, a cohort of more than FLAG_LIVE_RECORDS acquisitions, no index. */
export const flagSourcesWait = (flag: ScatterFlag, cohortRecords: number, indexReady: boolean): boolean =>
  ROW_FLAGS.has(flag) && !indexReady && cohortRecords > FLAG_LIVE_RECORDS;

/** The ids (sicap_da_id) of the records behind `flag` (flaggedRecordKeys), as a subquery. */
export function flaggedRecordIds(sql: DbSql, role: ScatterRole, flag: ScatterFlag, entities: Fragment): Fragment {
  return frag(sql`(select k.ref_id from ${flaggedRecordKeys(sql, role, flag, entities)} k)`);
}

/** What a signal's years and shares are for the profiles `ids` (the cheap facts: flag_instances), without reading their records. */
export async function instanceFacts(sql: DbSql, role: ScatterRole, ids: readonly string[]): Promise<Map<string, ScatterFlagFact[]>> {
  const facts = new Map<string, ScatterFlagFact[]>();
  if (!ids.length) return facts;
  const list = sql.array([...ids]);
  const own = role === "authority" ? sql`fi.entity_id` : sql`fi.partner_id`;
  const rows = (await sql`
    select fi.flag_code, (case when fi.flag_code = 'da_split' then ${own} else fi.entity_id end)::text id, fi.period, fi.evidence
    from marts.flag_instances fi
    where (fi.flag_code = 'da_split' and ${own} = any(${list}::bigint[]) and fi.subject_type = 'pair')
       or (fi.flag_code = 'da_year_end' and fi.entity_id = any(${list}::bigint[]))
       or (fi.flag_code = 'da_concentration' and fi.entity_id = any(${list}::bigint[]))
       or (fi.flag_code = 'da_dependence' and fi.entity_id = any(${list}::bigint[]))
  `) as unknown as { flag_code: ScatterFlag; id: string; period: string | null; evidence: Record<string, unknown> | null }[];
  const slot = (id: string, code: ScatterFlag): ScatterFlagFact => {
    const list = facts.get(id) ?? [];
    if (!facts.has(id)) facts.set(id, list);
    let fact = list.find((f) => f.code === code);
    if (!fact) { fact = { code }; list.push(fact); }
    return fact;
  };
  for (const row of rows) {
    const fact = slot(row.id, row.flag_code);
    if (row.flag_code === "da_split" || row.flag_code === "da_year_end") {
      const year = Number(row.period);
      if (Number.isInteger(year)) fact.years = [...new Set([...fact.years ?? [], year])].sort((a, b) => a - b);
    } else {
      const evidence = row.evidence ?? {};
      const share = Number(row.flag_code === "da_concentration" ? evidence.top_supplier_pct : evidence.top_authority_pct);
      if (Number.isFinite(share)) fact.share = share;
      const partners = Number(row.flag_code === "da_concentration" ? evidence.suppliers : evidence.authorities);
      if (partners === 1) fact.single = true;
    }
  }
  return facts;
}

/**
 * The records of every signal of the profiles `ids` (the card's rows, "9 înregistrări →") and the shares of
 * rapid and round (flagged records over the direct acquisitions), in one pass over each profile's records.
 */
export async function recordFacts(sql: DbSql, role: ScatterRole, ids: readonly string[], nDas: ReadonlyMap<string, number>, flags: ReadonlyMap<string, readonly string[]>): Promise<Map<string, ScatterFlagFact[]>> {
  const out = new Map<string, ScatterFlagFact[]>();
  if (!ids.length) return out;
  const party = sql(PARTY[role]), list = sql.array([...ids]);
  const counts = (await sql`
    select d.${party}::text id, count(*) filter (where 'da_split' = any(d.da_flags))::int split,
           count(*) filter (where 'da_rapid' = any(d.da_flags))::int rapid, count(*) filter (where 'da_round' = any(d.da_flags))::int round
    from marts.da_transactions d where d.${party} = any(${list}::bigint[]) group by 1
  `) as unknown as { id: string; split: number; rapid: number; round: number }[];
  const byId = new Map(counts.map((c) => [c.id, c]));
  const entities = frag(sql`select unnest(${list}::bigint[])`);
  const more: Partial<Record<ScatterFlag, Map<string, number>>> = {};
  const wanted = new Set(ids.flatMap((id) => flags.get(id) ?? []));
  const heavy: ScatterFlag[] = role === "authority" ? ["da_year_end", "da_concentration"] : ["da_dependence"];
  for (const flag of heavy) if (wanted.has(flag)) {
    const rows = (await sql`
      select d.${party}::text id, count(*)::int n from marts.da_transactions d
      where d.${party} in (${entities}) and d.sicap_da_id in ${flaggedRecordIds(sql, role, flag, entities)} group by 1`) as unknown as { id: string; n: number }[];
    more[flag] = new Map(rows.map((r) => [r.id, r.n]));
  }
  for (const id of ids) {
    const have = (flags.get(id) ?? []) as ScatterFlag[], c = byId.get(id), n = nDas.get(id) ?? 0;
    const facts: ScatterFlagFact[] = [];
    for (const code of have) {
      const fact: ScatterFlagFact = { code };
      if (code === "da_split") fact.rows = c?.split ?? 0;
      else if (code === "da_rapid" || code === "da_round") {
        fact.rows = (code === "da_rapid" ? c?.rapid : c?.round) ?? 0;
        if (n > 0) fact.share = fact.rows / n;
      } else fact.rows = more[code]?.get(id) ?? 0;
      facts.push(fact);
    }
    out.set(id, facts);
  }
  return out;
}

/**
 * What the build itself says the records of a signal are, from the flags the build wrote (core.flags and the
 * acquisitions): the count and the value the drawer's rows must add up to, for the profiles `entities`. None where
 * the build keeps no per-record list (December's value is its evidence; the main partner's share is a ratio).
 * Read only for a few profiles (RECONCILE_MAX): it joins the acquisitions.
 */
export const RECONCILE_MAX = 200;
export async function builtFlagTotals(sql: DbSql, role: ScatterRole, flag: ScatterFlag, entities: Fragment): Promise<{ records: number | null; value: string } | null> {
  // A firm is the acquisition's supplier unless it is the authority itself (audit F12, as marts.da_transactions). Said
  // on the bare column, so its index answers: `nullif(supplier, authority) in (…)` read all 19.6M acquisitions (one
  // firm's rapid: 5.9–13.6 s; S6, F6b verify). Same rows: one firm 20 ms; DEDEMAN's 160,404 rapid ones 1.4 s warm.
  const party = role === "authority" ? sql`da.authority_entity_id in (${entities})`
    : sql`da.supplier_entity_id in (${entities}) and da.supplier_entity_id is distinct from da.authority_entity_id`;
  if (flag === "da_rapid" || flag === "da_round") {
    const [row] = (await sql`
      select count(*)::text n, coalesce(sum(da.closing_value), 0)::text v
      from core.flags f join core.direct_acquisitions da on da.id = f.subject_id
      where f.subject_type = 'da' and f.flag_code = ${flag} and f.triggered and da.state = 'Oferta acceptata'
        and da.closing_value > 0 and da.closing_value <= ${DA_PLAFOND_RON} and ${party}`) as unknown as { n: string; v: string }[];
    return row ? { records: Number(row.n), value: row.v } : null;
  }
  if (flag === "da_split") {
    // The pair's instances list their acquisitions (evidence.source_ids): the flagged rows are those, once each.
    const owner = role === "authority" ? sql`f.subject_id` : sql`f.partner_id`;
    const [row] = (await sql`
      select count(*)::text n, coalesce(sum(da.closing_value), 0)::text v
      from (select distinct s::bigint sid from core.flags f, jsonb_array_elements_text(f.evidence->'source_ids') s
            where f.flag_code = 'da_split' and f.subject_type = 'pair' and f.triggered and ${owner} in (${entities})) z
      join core.direct_acquisitions da on da.sicap_da_id = z.sid
      where da.state = 'Oferta acceptata' and da.closing_value > 0 and da.closing_value <= ${DA_PLAFOND_RON}`) as unknown as { n: string; v: string }[];
    return row ? { records: Number(row.n), value: row.v } : null;
  }
  if (flag === "da_year_end") {
    const [row] = (await sql`
      select coalesce(sum((f.evidence->>'december')::numeric), 0)::text v
      from core.flags f where f.flag_code = 'da_year_end' and f.triggered and f.subject_id in (${entities})`) as unknown as { v: string }[];
    return row ? { records: null, value: row.v } : null;
  }
  return null;
}
