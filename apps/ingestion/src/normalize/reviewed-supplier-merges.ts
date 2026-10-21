import type { DbSql } from "@seap/db";
import { identityOf } from "./da-supplier-vat.js";

/**
 * Reviewed merges of key-less Romanian supplier profiles into the valid-CUI
 * entity they duplicate (data audit F28, owner decision of 21 October 2026).
 *
 * A winner whose source record carries no CUI, or a mistyped one
 * ("RO15034059" for 15034095), gets an entity with no valid CUI next to the
 * firm's own entity, so its contracts, TED lots and totals are split across
 * two profiles. Tier-3 name matching only writes suggestions; these 20 pairs
 * were reviewed one by one on production data of 21 October (same name; ONRC
 * registers the target CUI under that name, or Enel Energie's new name, and
 * no other CUI under it; the source's id, where present, is the target CUI
 * mistyped). Lockheed Martin Overseas
 * 2277839, CONSORZIO STABILE EBG 2276508, Drumuri si Poduri 2277759, CONI
 * 2277326 and INTRASOFT 2278216 were left out as unclear.
 *
 * Ids are production ids. A row applies only while the source still has no
 * valid CUI and the recorded name_normalized, and the target still has the
 * recorded valid CUI; anything else is skipped and reported, never guessed.
 * The target keeps its stored key, so monitoring/connection identities bound
 * to it and the approved contract identities of its contracts do not change.
 * The marts do not follow redirects, so the source's contract wins, TED lot
 * wins, DA supplier rows and SICAP ids move to the target, and the source row
 * stays with a verified redirect recording both identities, as in the F18 and
 * F26 passes. A row is skipped when the source buys as an authority, is
 * itself a redirect target or redirected elsewhere, the target is redirected,
 * or a source contract belongs to an approved contract-identity group (moving
 * it would change that group's snapshot hash and fail the publication gate).
 * Idempotent: an applied row is a redirect from source to target.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export const REVIEWED_SUPPLIER_MERGE_REASON = "reviewed-supplier-merge";

export interface ReviewedSupplierMerge {
  sourceId: string;
  targetId: string;
  /** core.entities.name_normalized of the source when it was reviewed. */
  sourceName: string;
  /** Valid CUI of the target when it was reviewed. */
  targetCui: string;
  evidence: string;
}

export const REVIEWED_SUPPLIER_MERGES: readonly ReviewedSupplierMerge[] = [
  { sourceId: "2277024", targetId: "2123842", sourceName: "telecomunicatii cfr", targetCui: "15034095",
    evidence: "id RO15034059 (digits swapped), Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name" },
  { sourceId: "2276441", targetId: "2123842", sourceName: "telecomunicatii cfr", targetCui: "15034095",
    evidence: "no id, Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name" },
  { sourceId: "2276257", targetId: "2125531", sourceName: "tancrad", targetCui: "8006670",
    evidence: "id 0800667669 (garbled 8006670), Galati; ONRC 8006670 = TANCRAD SRL, only CUI with this name" },
  { sourceId: "2277014", targetId: "2085724", sourceName: "new recycling", targetCui: "22793039",
    evidence: "id 2279039 (one digit missing), Brasov; ONRC 22793039 = NEW-RECYCLING SRL, only CUI with this name" },
  { sourceId: "2276364", targetId: "2121221", sourceName: "constructus", targetCui: "3704221",
    evidence: "no id, Alba; ONRC 3704221 = CONSTRUCTUS SRL, only CUI with this name" },
  { sourceId: "2277867", targetId: "2127928", sourceName: "hidroconstructia", targetCui: "1556820",
    evidence: "no id, Bucharest; ONRC 1556820 = HIDROCONSTRUCTIA SA, only CUI with this name" },
  { sourceId: "2278070", targetId: "1993244", sourceName: "willkommen technik", targetCui: "39755315",
    evidence: "id RO39755319 (last digit), Bucharest; ONRC 39755315 = WILLKOMMEN TECHNIK S.R.L., only CUI with this name" },
  { sourceId: "2277828", targetId: "2127831", sourceName: "iasicon", targetCui: "1957821",
    evidence: "no id, Iasi; ONRC 1957821 = IASICON SA, only CUI with this name" },
  { sourceId: "2278519", targetId: "2081115", sourceName: "teo trans consulting", targetCui: "16572866",
    evidence: "no id; ONRC 16572866 = TEO TRANS CONSULTING SRL, only CUI with this name" },
  { sourceId: "2278500", targetId: "2081115", sourceName: "teo trans consulting", targetCui: "16572866",
    evidence: "no id, Bucharest; ONRC 16572866 = TEO TRANS CONSULTING SRL, only CUI with this name" },
  { sourceId: "2277836", targetId: "2111316", sourceName: "enel energie", targetCui: "22000460",
    evidence: "id 220000460 (extra zero), Bucharest; ONRC 22000460 = PPC ENERGIE S.A., the renamed Enel Energie" },
  { sourceId: "2277821", targetId: "2068958", sourceName: "pegani construct", targetCui: "32537801",
    evidence: "no id, Valcea; ONRC 32537801 = PEGANI CONSTRUCT S.R.L., only CUI with this name" },
  { sourceId: "2276194", targetId: "2127802", sourceName: "exco transport systems", targetCui: "2626508",
    evidence: "no id; ONRC 2626508 = EXCO TRANSPORT SYSTEMS SRL, only CUI with this name" },
  { sourceId: "2280420", targetId: "2127802", sourceName: "exco transport systems", targetCui: "2626508",
    evidence: "no id; ONRC 2626508 = EXCO TRANSPORT SYSTEMS SRL, only CUI with this name" },
  { sourceId: "2278307", targetId: "2062018", sourceName: "integra guard", targetCui: "31003163",
    evidence: "id RO310003163 (extra zero), Bucharest; ONRC 31003163 = INTEGRA GUARD SRL, only CUI with this name" },
  { sourceId: "2277268", targetId: "2162616", sourceName: "livcorvet", targetCui: "11512405",
    evidence: "id 115122405 (extra digit), Gorj; ONRC 11512405 = LIVCORVET SRL, only CUI with this name" },
  { sourceId: "2276912", targetId: "2078658", sourceName: "getica 95 com", targetCui: "7562758",
    evidence: "id 7560758 (one digit), Buzau; ONRC 7562758 = GETICA 95 COM SRL, only CUI with this name" },
  { sourceId: "2277925", targetId: "2027480", sourceName: "ekonational distribution", targetCui: "32510288",
    evidence: "id RO35210288 (digits swapped), Prahova; ONRC 32510288 = EKONATIONAL DISTRIBUTION SRL, only CUI with this name" },
  { sourceId: "2278582", targetId: "2073313", sourceName: "rard construct", targetCui: "31463080",
    evidence: "id RO3163080 (one digit missing), Neamt; ONRC 31463080 = RARD CONSTRUCT SRL, only CUI with this name" },
  { sourceId: "2276444", targetId: "2071229", sourceName: "nova power gas", targetCui: "18680651",
    evidence: "id RO18670651 (one digit); ONRC 18680651 = NOVA POWER & GAS S.A. / AMGAZ FURNIZARE SRL, only CUI with this name" },
];

export type ReviewedSupplierMergeSkipReason =
  | "source_missing"
  | "target_missing"
  | "source_has_valid_cui"
  | "source_name_changed"
  | "target_cui_changed"
  | "source_redirected_elsewhere"
  | "source_is_redirect_target"
  | "target_is_redirected"
  | "source_is_buyer"
  | "approved_contract_identity";

export interface ReviewedSupplierMergeSkip {
  sourceId: string;
  targetId: string;
  reason: ReviewedSupplierMergeSkipReason;
}

export interface ReviewedSupplierMergeResult {
  redirected: bigint[];
  skipped: ReviewedSupplierMergeSkip[];
}

/** Apply the reviewed merges in the caller's transaction. */
export async function applyReviewedSupplierMerges(
  q: TransactionSql,
  rows: readonly ReviewedSupplierMerge[] = REVIEWED_SUPPLIER_MERGES,
): Promise<ReviewedSupplierMergeResult> {
  const result: ReviewedSupplierMergeResult = { redirected: [], skipped: [] };
  for (const row of rows) {
    const skip = (reason: ReviewedSupplierMergeSkipReason) =>
      result.skipped.push({ sourceId: row.sourceId, targetId: row.targetId, reason });
    const [facts] = await q`
      select
        (select case when t.cui_valid then t.cui_canonical end from core.entities t where t.id = ${row.targetId}) target_cui,
        exists (select 1 from core.entities t where t.id = ${row.targetId}) target_exists,
        (select r.canonical_id::text from core.entity_redirects r where r.old_id = ${row.sourceId}) source_redirect,
        exists (select 1 from core.entity_redirects r where r.canonical_id = ${row.sourceId}) source_target,
        exists (select 1 from core.entity_redirects r where r.old_id = ${row.targetId}) target_redirected,
        (exists (select 1 from core.notices n where n.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.awards a where a.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.direct_acquisitions d where d.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.ted_notices t where t.buyer_entity_id = ${row.sourceId})) source_buyer,
        exists (select 1 from core.contract_winners w join marts.contract_identity_members m using (contract_id)
                where w.entity_id = ${row.sourceId}) approved`;
    const f = facts!;
    if (f.source_redirect === row.targetId) continue; // applied
    const [source] = await q`select cui_valid, name_normalized from core.entities where id = ${row.sourceId}`;
    if (!source) { skip("source_missing"); continue; }
    if (!f.target_exists) { skip("target_missing"); continue; }
    if (source.cui_valid) { skip("source_has_valid_cui"); continue; }
    if (source.name_normalized !== row.sourceName) { skip("source_name_changed"); continue; }
    if (f.target_cui !== row.targetCui) { skip("target_cui_changed"); continue; }
    if (f.source_redirect != null) { skip("source_redirected_elsewhere"); continue; }
    if (f.source_target) { skip("source_is_redirect_target"); continue; }
    if (f.target_redirected) { skip("target_is_redirected"); continue; }
    if (f.source_buyer) { skip("source_is_buyer"); continue; }
    if (f.approved) { skip("approved_contract_identity"); continue; }

    const olds = [row.sourceId];
    const canonical = row.targetId;
    const [previous] = await identityOf(q, olds);
    // Composite keys: add the target edge where absent, then drop the source one.
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
    await q`
      insert into core.entity_redirects (old_id, canonical_id, reason, evidence)
      values (${row.sourceId}, ${canonical}, ${REVIEWED_SUPPLIER_MERGE_REASON}, ${JSON.stringify({
        rule: "reviewed key-less Romanian supplier profile of a valid-CUI firm (audit F28)",
        sourceName: row.sourceName,
        targetCui: row.targetCui,
        note: row.evidence,
        previousIdentity: previous!.identity,
        canonicalIdentity: after!.identity,
      })}::jsonb)`;
    result.redirected.push(BigInt(row.sourceId));
  }
  return result;
}
