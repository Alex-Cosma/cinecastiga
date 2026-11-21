import { REVIEWED_AUTHORITY_NAMES, REVIEWED_TOWN_HALL_NAMES, type DbSql, type ReviewedAuthorityName, type ReviewedTownHallName } from "@seap/db";
import { normalizeName } from "./name.js";

/**
 * Reviewed display-name contradictions between SICAP participant registrations
 * that share one fiscal identity (data audit F04, 21 October 2026).
 *
 * The 2020 dump loaded supplier registrations before authority registrations,
 * and an authority registration with the same valid CUI merged onto the entity
 * the supplier registration had already created, keeping its name. In these
 * cases SICAP holds a supplier registration that carries a public buyer's CUI
 * under a private firm's name. ONRC registers that firm under a different CUI,
 * and the registration never appears as a supplier or winner. The buyer's
 * purchases were then shown under the private firm's name.
 *
 * Each rule must match the exact fiscal identity, both SICAP registrations and
 * the current wrong name, so it is idempotent and touches nothing else. The
 * name used is the one the authority registration and its procurement records
 * carry. The SICAP mappings stay as they are: identity changes need their own
 * review. This is not a general name policy: low-similarity names on other
 * dual-registration entities are mostly renames of the same institution.
 */
export { REVIEWED_AUTHORITY_NAMES };
export type { ReviewedAuthorityName };

type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

/** Apply the reviewed names in the caller's transaction; returns the ids renamed now. */
export async function applyReviewedEntityNames(
  q: TransactionSql,
  rules: readonly ReviewedAuthorityName[] = REVIEWED_AUTHORITY_NAMES,
): Promise<bigint[]> {
  const renamed: bigint[] = [];
  for (const r of rules) {
    const { normalized, legalForm } = normalizeName(r.name);
    const rows = await q`
      update core.entities e
      set name_display = ${r.name}, name_normalized = ${normalized}, legal_form = ${legalForm}
      where e.cui_valid and e.cui_canonical = ${r.cui}
        and e.name_display = ${r.wrongName}
        and exists (select 1 from core.entity_sicap_ids s where s.entity_id = e.id
                    and s.namespace = 'authority' and s.sicap_id = ${r.authoritySicapId})
        and exists (select 1 from core.entity_sicap_ids s where s.entity_id = e.id
                    and s.namespace = 'supplier' and s.sicap_id = ${r.supplierSicapId})
      returning e.id
    `;
    for (const row of rows) renamed.push(BigInt(row.id as string | number | bigint));
  }
  return renamed;
}

/**
 * Town halls whose SICAP registration carries another institution's name or a garbled one (owner, 6 November 2026,
 * the UATs the map could not place: "Repar identitățile"). Each rule is pinned by the valid CUI, the county and the
 * current wrong name, and the identity must be registered as an authority, so it is idempotent and touches nothing
 * else. The web's population mapping also lists these CUIs (APPROVED_TOWN_HALLS), so the map holds them before a run.
 */
export { REVIEWED_TOWN_HALL_NAMES };
export type { ReviewedTownHallName };

/** Apply the reviewed town hall names in the caller's transaction; returns the ids renamed now. */
export async function applyReviewedTownHallNames(
  q: TransactionSql,
  rules: readonly ReviewedTownHallName[] = REVIEWED_TOWN_HALL_NAMES,
): Promise<bigint[]> {
  const renamed: bigint[] = [];
  for (const r of rules) {
    const { normalized, legalForm } = normalizeName(r.name);
    const rows = await q`
      update core.entities e
      set name_display = ${r.name}, name_normalized = ${normalized}, legal_form = ${legalForm}
      where e.cui_valid and e.cui_canonical = ${r.cui} and e.county = ${r.county}
        and e.name_display = ${r.wrongName}
        and exists (select 1 from core.entity_sicap_ids s where s.entity_id = e.id and s.namespace = 'authority')
      returning e.id
    `;
    for (const row of rows) renamed.push(BigInt(row.id as string | number | bigint));
  }
  return renamed;
}
