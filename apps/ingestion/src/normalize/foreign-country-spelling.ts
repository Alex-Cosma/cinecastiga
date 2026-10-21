import type { DbSql } from "@seap/db";
import { identityOf } from "./da-supplier-vat.js";
import { countryIso2 } from "./foreign.js";

/**
 * Foreign firms split by the spelling of their country code (data audit F26,
 * owner decision of 21 October 2026, step 1).
 *
 * The tier-2b key of a firm without a valid Romanian CUI is (country, foreign
 * id), matched on the stored code exactly. Legacy TED writes "UK", eForms
 * writes ISO-3 ("HKG", "AUS", "KAZ", "MKD", "BIH", "PER") and e-licitatie
 * ISO-2, so one firm got one entity per spelling: on the local snapshot of
 * 1 October, 12 pairs such as SHIELD FIRE 2270278 (UK) / 2275019 (GB) and
 * Mott MacDonald 2270867 (UK) / 2275123 (GB), the SEAP contracts on the first
 * and the TED lots on the second.
 *
 * Entities merge only when they have no valid CUI, the same normalized
 * foreign id, codes naming the same non-Romanian country (countryIso2) and
 * the same normalized name. A Romanian or missing code, a different country
 * or a different name (a consortium and its member) never merges here: those
 * groups need a reviewed list. The canonical entity is the one holding SEAP
 * contract wins, then redirects, then SICAP ids, then the lowest id; it keeps
 * its stored code and key, so its monitoring/connection identity and the
 * approved contract identities of its contracts do not change. The marts do
 * not follow redirects, so the other members' contract wins, TED lot wins,
 * DA supplier rows and SICAP ids move to it, and each keeps its row with a
 * verified redirect recording both identities, as in the F18 pass.
 *
 * A group is left as it is, and reported, when another member buys as an
 * authority, is itself the target of redirects, or wins a contract that
 * belongs to an approved contract-identity group (moving it would change
 * that group's snapshot hash and fail the publication gate). Idempotent.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export const FOREIGN_COUNTRY_SPELLING_REASON = "foreign-country-spelling";

export interface CountrySpellingSkip {
  ids: string[];
  reason: "different_names" | "member_is_buyer" | "member_is_redirect_target" | "approved_contract_identity";
}
export interface CountrySpellingResult {
  redirected: bigint[];
  skipped: CountrySpellingSkip[];
}

interface KeyedEntity { id: string; country_code: string; foreign_id_norm: string; name_normalized: string }

export async function applyForeignCountrySpellings(q: TransactionSql): Promise<CountrySpellingResult> {
  const rows = (await q`
    select e.id::text id, e.country_code, e.foreign_id_norm, e.name_normalized
    from core.entities e
    where not e.cui_valid and e.foreign_id_norm is not null and e.country_code is not null
      and not exists (select 1 from core.entity_redirects r where r.old_id = e.id)
    order by e.id`) as unknown as KeyedEntity[];

  const groups = new Map<string, { country: string; foreignId: string; rows: KeyedEntity[] }>();
  for (const row of rows) {
    const country = countryIso2(row.country_code);
    if (!country || country === "RO") continue;
    const key = `${country}\u0000${row.foreign_id_norm}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { country, foreignId: row.foreign_id_norm, rows: [row] });
  }

  const result: CountrySpellingResult = { redirected: [], skipped: [] };
  for (const g of groups.values()) {
    if (g.rows.length < 2) continue;
    const ids = g.rows.map((r) => r.id);
    if (new Set(g.rows.map((r) => r.name_normalized)).size !== 1) {
      result.skipped.push({ ids, reason: "different_names" });
      continue;
    }
    const facts = await q`
      select e.id::text id,
        exists (select 1 from core.contract_winners w where w.entity_id = e.id) wins,
        exists (select 1 from core.entity_redirects r where r.canonical_id = e.id) target,
        exists (select 1 from core.entity_sicap_ids s where s.entity_id = e.id) sicap,
        (exists (select 1 from core.notices n where n.authority_entity_id = e.id)
          or exists (select 1 from core.awards a where a.authority_entity_id = e.id)
          or exists (select 1 from core.direct_acquisitions d where d.authority_entity_id = e.id)
          or exists (select 1 from core.ted_notices t where t.buyer_entity_id = e.id)) buyer
      from core.entities e where e.id = any(${ids}::bigint[])`;
    const rank = (r: (typeof facts)[number]) => [r.wins, r.target, r.sicap].map((x) => (x ? 0 : 1)).join("");
    const [canonicalRow, ...others] = [...facts].sort((a, b) =>
      rank(a).localeCompare(rank(b)) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const canonical = String(canonicalRow!.id);
    const olds = others.map((r) => String(r.id));
    if (others.some((r) => r.buyer)) {
      result.skipped.push({ ids, reason: "member_is_buyer" });
      continue;
    }
    if (others.some((r) => r.target)) {
      result.skipped.push({ ids, reason: "member_is_redirect_target" });
      continue;
    }
    const [approved] = await q`
      select count(*)::int n from core.contract_winners w
      join marts.contract_identity_members m using (contract_id)
      where w.entity_id = any(${olds}::bigint[])`;
    if (approved!.n > 0) {
      result.skipped.push({ ids, reason: "approved_contract_identity" });
      continue;
    }

    const previous = new Map((await identityOf(q, olds)).map((r) => [String(r.id), r.identity]));
    const spellings = new Map(g.rows.map((r) => [r.id, r.country_code]));
    // Composite keys: add the canonical edge where absent, then drop the old one.
    await q`insert into core.contract_winners (contract_id, entity_id)
            select contract_id, ${canonical} from core.contract_winners where entity_id = any(${olds}::bigint[])
            on conflict do nothing`;
    await q`delete from core.contract_winners where entity_id = any(${olds}::bigint[])`;
    await q`insert into core.ted_lot_winners (lot_result_id, entity_id)
            select lot_result_id, ${canonical} from core.ted_lot_winners where entity_id = any(${olds}::bigint[])
            on conflict do nothing`;
    await q`delete from core.ted_lot_winners where entity_id = any(${olds}::bigint[])`;
    await q`update core.direct_acquisitions set supplier_entity_id = ${canonical}
            where supplier_entity_id = any(${olds}::bigint[])`;
    await q`update core.entity_sicap_ids set entity_id = ${canonical} where entity_id = any(${olds}::bigint[])`;
    await q`
      update core.entities k set
        first_seen = least(k.first_seen, f.first_seen),
        last_seen = greatest(k.last_seen, f.last_seen),
        cui_raw_variants = (select array(select distinct unnest(coalesce(k.cui_raw_variants, '{}'::text[]) || f.variants)))
      from (select min(first_seen) first_seen, max(last_seen) last_seen,
                   coalesce(array_agg(v) filter (where v is not null), '{}'::text[]) variants
            from core.entities left join lateral unnest(cui_raw_variants) v on true
            where id = any(${olds}::bigint[])) f
      where k.id = ${canonical}`;
    const [after] = await identityOf(q, [canonical]);
    for (const id of olds) {
      await q`
        insert into core.entity_redirects (old_id, canonical_id, reason, evidence)
        values (${id}, ${canonical}, ${FOREIGN_COUNTRY_SPELLING_REASON}, ${JSON.stringify({
          rule: "same foreign id and country, country code spelled differently (audit F26)",
          country: g.country,
          foreignId: g.foreignId,
          countryCodes: { previous: spellings.get(id), canonical: spellings.get(canonical) },
          previousIdentity: previous.get(id),
          canonicalIdentity: after!.identity,
        })}::jsonb)`;
      result.redirected.push(BigInt(id));
    }
  }
  return result;
}
