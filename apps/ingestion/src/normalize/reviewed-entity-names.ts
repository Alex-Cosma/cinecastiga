import type { DbSql } from "@seap/db";
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
export interface ReviewedAuthorityName {
  cui: string;
  authoritySicapId: number;
  supplierSicapId: number;
  /** Name of the supplier registration, as currently displayed. */
  wrongName: string;
  /** Name of the authority registration. */
  name: string;
}

export const REVIEWED_AUTHORITY_NAMES: readonly ReviewedAuthorityName[] = [
  // ONRC 14491102 = DISTRIBUȚIE ENERGIE OLTENIA S.A.; TONIDRAG INSTAL S.R.L. is
  // ONRC 35637856 (entity of its own). Every live notice/award string for the
  // buyer reads "14491102 - DISTRIBUTIE ENERGIE OLTENIA S.A.".
  { cui: "14491102", authoritySicapId: 1417, supplierSicapId: 179348,
    wrongName: "SC TONIDRAG INSTAL SRL-D", name: "DISTRIBUTIE ENERGIE OLTENIA S.A." },
  // CUI 3552050 is the commune of Găgești, Vaslui (SICAP authority 25355). The
  // closest ONRC firm, ANDREII TEHNOMETAL S.R.L., is CUI 42429807.
  { cui: "3552050", authoritySicapId: 25355, supplierSicapId: 100116354,
    wrongName: "ANDREI TEHNOMETAL", name: "COMUNA GAGESTI (CONSILIUL LOCAL)" },
];

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
