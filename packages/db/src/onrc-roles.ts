import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * ONRC roles (reference.company_reps.calitate) that do not make the person the
 * firm's own legal representative, so they never link two firms in
 * net_shared_admin ("Reprezentant comun, aceeași autoritate"). Audit F31:
 * - a supervisory-board seat (dualist SA, Legea 31/1990) supervises the
 *   directorate and does not represent the company (rf-2026.10);
 * - insolvency and liquidation roles (rf-2026.16, owner decision B):
 *   lichidator, lichidator judiciar and their provisional forms, administrator
 *   judiciar (also provizoriu), administrator special and administrator
 *   concordatar. They act in a procedure about the firm, not as its ordinary
 *   management.
 *
 * Kept: administrator, administrator si reprezentant, reprezentant (al
 * persoanei juridice / administrator persoana juridica / legal), membru în
 * directorat, director general unic, administrator si conducator, mandatar,
 * administrator repus în funcție and administrator provizoriu (in ONRC the
 * interim board member of a state or municipal company, OUG 109/2011, not an
 * insolvency role). A row without a calitate is kept. Matching is
 * case-insensitive, by PostgreSQL regex.
 */
export const NON_REPRESENTATIVE_ROLE_PATTERN =
  'consiliul de supraveghere|lichidator|administrator (judiciar|special|concordatar)';

/** Boolean: the company_reps row `alias` holds a role that can link two firms. */
export function repRoleLinksFirms(q: Query, alias = 'r') {
  return q`(coalesce(${q(alias)}.calitate, '') !~* ${NON_REPRESENTATIVE_ROLE_PATTERN})`;
}

/** The same rule outside SQL (tests, display). */
export function roleLinksFirms(calitate: string | null | undefined): boolean {
  return !new RegExp(NON_REPRESENTATIVE_ROLE_PATTERN, 'i').test(calitate ?? '');
}
