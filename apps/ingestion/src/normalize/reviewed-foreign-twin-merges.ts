import type { DbSql } from "@seap/db";
import { identityOf } from "./da-supplier-vat.js";

/**
 * Reviewed merges of foreign firms stored once under country "RO" into their
 * twin under the firm's own country (data audit F26 C(i) of 21 October 2026,
 * reviewed list approved by the owner).
 *
 * A SEAP winner record of a foreign firm can carry Romania as its country, so
 * the firm's tier-2b key became ("RO", foreign id) next to the (country,
 * foreign id) entity TED created for the same firm: Candu Energy had 940 mil.
 * lei of contracts on 2270125 (RO) and 306 mil. on 2270102 (CA). The audit
 * found 14 foreign-marked entities with country RO and no valid CUI; for 6 of
 * them the same foreign id already exists under one foreign country, with the
 * same name (Candu's TED name adds "(CEI)"), and the owner approved merging
 * exactly these 6. Synevo Romania 2270902 and the 7 entities without a stored
 * foreign twin stay as they are ("țară de verificat").
 *
 * Ids are production ids. A row applies only while the source still has no
 * valid CUI, country RO, the recorded foreign id and name_normalized, and the
 * target still has no valid CUI, the recorded country, the same foreign id
 * and the recorded name_normalized; anything else is skipped and reported,
 * never guessed. The target keeps its stored code and key, so the
 * monitoring/connection identities bound to it do not change; those bound to
 * the source follow the verified redirect. The marts do not follow redirects,
 * so the source's contract wins, TED lot wins, DA supplier rows and SICAP ids
 * move to the target, and the source row stays with a verified redirect
 * recording both identities, as in the F18, F26 and F28 passes. A row is
 * skipped when the source buys as an authority, is itself a redirect target
 * or redirected elsewhere, the target is redirected, or a source contract
 * belongs to an approved contract-identity group or is under a temporary
 * identity exclusion (moving it would change that contract's snapshot hash
 * and stop the publication). Idempotent: an applied row is a redirect from
 * source to target.
 */
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export const REVIEWED_FOREIGN_TWIN_MERGE_REASON = "reviewed-foreign-twin-merge";

export interface ReviewedForeignTwinMerge {
  sourceId: string;
  targetId: string;
  /** core.entities.foreign_id_norm shared by source and target when reviewed. */
  foreignId: string;
  /** core.entities.name_normalized of the source (country RO) when reviewed. */
  sourceName: string;
  /** core.entities.name_normalized of the target when reviewed. */
  targetName: string;
  /** core.entities.country_code of the target when reviewed. */
  targetCountry: string;
  evidence: string;
}

export const REVIEWED_FOREIGN_TWIN_MERGES: readonly ReviewedForeignTwinMerge[] = [
  { sourceId: "2270125", targetId: "2270102", foreignId: "7895097", sourceName: "candu energy inc",
    targetName: "candu energy inc cei", targetCountry: "CA",
    evidence: "Candu Energy Inc., foreign id 7895097 under RO (SEAP contracts) and CA (TED, CANDU ENERGY INC.(CEI))" },
  { sourceId: "2270082", targetId: "2275287", foreignId: "1007607001228", sourceName: "turboenergy power",
    targetName: "turboenergy power", targetCountry: "MD",
    evidence: "Turboenergy Power, foreign id 1007607001228 under RO (SEAP contracts) and MD (TED lots)" },
  { sourceId: "2270605", targetId: "2275147", foreignId: "5750040554", sourceName: "koltek musavirlik",
    targetName: "koltek musavirlik", targetCountry: "TR",
    evidence: "KOLTEK MUSAVIRLIK, foreign id 5750040554 under RO (SEAP contracts) and TR (TED lots)" },
  { sourceId: "2270952", targetId: "2275637", foreignId: "03272750542", sourceName: "tr costruzioni",
    targetName: "tr costruzioni", targetCountry: "IT",
    evidence: "T.R. COSTRUZIONI S.R.L., foreign id 03272750542 under RO (SEAP contracts) and IT (TED lots)" },
  { sourceId: "2272875", targetId: "2279326", foreignId: "32543471883", sourceName: "schlumberger logelco inc",
    targetName: "schlumberger logelco inc", targetCountry: "PA",
    evidence: "Schlumberger Logelco INC, foreign id 32543471883 under RO (SEAP contracts) and PA (TED lots)" },
  { sourceId: "2273166", targetId: "2279280", foreignId: "01401230469", sourceName: "tirrena scavi spa",
    targetName: "tirrena scavi spa", targetCountry: "IT",
    evidence: "Tirrena Scavi Spa, foreign id 01401230469 under RO (SEAP contracts) and IT (TED lots)" },
];

export type ReviewedForeignTwinMergeSkipReason =
  | "source_missing"
  | "target_missing"
  | "source_has_valid_cui"
  | "source_key_changed"
  | "source_name_changed"
  | "target_has_valid_cui"
  | "target_key_changed"
  | "target_name_changed"
  | "source_redirected_elsewhere"
  | "source_is_redirect_target"
  | "target_is_redirected"
  | "source_is_buyer"
  | "approved_contract_identity"
  | "temporary_identity_exclusion";

export interface ReviewedForeignTwinMergeSkip {
  sourceId: string;
  targetId: string;
  reason: ReviewedForeignTwinMergeSkipReason;
}

export interface ReviewedForeignTwinMergeResult {
  redirected: bigint[];
  skipped: ReviewedForeignTwinMergeSkip[];
}

/** Apply the reviewed merges in the caller's transaction. */
export async function applyReviewedForeignTwinMerges(
  q: TransactionSql,
  rows: readonly ReviewedForeignTwinMerge[] = REVIEWED_FOREIGN_TWIN_MERGES,
): Promise<ReviewedForeignTwinMergeResult> {
  const result: ReviewedForeignTwinMergeResult = { redirected: [], skipped: [] };
  for (const row of rows) {
    const skip = (reason: ReviewedForeignTwinMergeSkipReason) =>
      result.skipped.push({ sourceId: row.sourceId, targetId: row.targetId, reason });
    const [facts] = await q`
      select
        (select r.canonical_id::text from core.entity_redirects r where r.old_id = ${row.sourceId}) source_redirect,
        exists (select 1 from core.entity_redirects r where r.canonical_id = ${row.sourceId}) source_target,
        exists (select 1 from core.entity_redirects r where r.old_id = ${row.targetId}) target_redirected,
        (exists (select 1 from core.notices n where n.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.awards a where a.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.direct_acquisitions d where d.authority_entity_id = ${row.sourceId})
          or exists (select 1 from core.ted_notices t where t.buyer_entity_id = ${row.sourceId})) source_buyer,
        exists (select 1 from core.contract_winners w join marts.contract_identity_members m using (contract_id)
                where w.entity_id = ${row.sourceId}) approved,
        exists (select 1 from core.contract_winners w join marts.contract_identity_exclusions x using (contract_id)
                where w.entity_id = ${row.sourceId}) excluded`;
    const f = facts!;
    if (f.source_redirect === row.targetId) continue; // applied
    const entity = async (id: string) =>
      (await q`select cui_valid, country_code, foreign_id_norm, name_normalized from core.entities where id = ${id}`)[0];
    const source = await entity(row.sourceId);
    const target = await entity(row.targetId);
    if (!source) { skip("source_missing"); continue; }
    if (!target) { skip("target_missing"); continue; }
    if (source.cui_valid) { skip("source_has_valid_cui"); continue; }
    if (source.country_code !== "RO" || source.foreign_id_norm !== row.foreignId) { skip("source_key_changed"); continue; }
    if (source.name_normalized !== row.sourceName) { skip("source_name_changed"); continue; }
    if (target.cui_valid) { skip("target_has_valid_cui"); continue; }
    if (target.country_code !== row.targetCountry || target.foreign_id_norm !== row.foreignId) { skip("target_key_changed"); continue; }
    if (target.name_normalized !== row.targetName) { skip("target_name_changed"); continue; }
    if (f.source_redirect != null) { skip("source_redirected_elsewhere"); continue; }
    if (f.source_target) { skip("source_is_redirect_target"); continue; }
    if (f.target_redirected) { skip("target_is_redirected"); continue; }
    if (f.source_buyer) { skip("source_is_buyer"); continue; }
    if (f.approved) { skip("approved_contract_identity"); continue; }
    if (f.excluded) { skip("temporary_identity_exclusion"); continue; }

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
      values (${row.sourceId}, ${canonical}, ${REVIEWED_FOREIGN_TWIN_MERGE_REASON}, ${JSON.stringify({
        rule: "reviewed foreign firm stored under country RO, merged into its twin under its own country (audit F26 C(i))",
        foreignId: row.foreignId,
        countryCodes: { previous: "RO", canonical: row.targetCountry },
        sourceName: row.sourceName,
        targetName: row.targetName,
        note: row.evidence,
        previousIdentity: previous!.identity,
        canonicalIdentity: after!.identity,
      })}::jsonb)`;
    result.redirected.push(BigInt(row.sourceId));
  }
  return result;
}
