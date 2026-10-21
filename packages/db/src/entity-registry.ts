import type { DbSql } from './client.js';
type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * Audit F03, option C (display-only stopgap, 21 October 2026).
 *
 * `cuiIsValid` accepts any 2–10 digit token that passes the mod-11 checksum,
 * so some foreign registration numbers are stored as Romanian CUIs (e.g.
 * FRESIA S.P.A. under the CUI of an unrelated Romanian SNC). Joining such an
 * entity to ONRC (reference.onrc_firm, reference.company_reps) or MF
 * (reference.company_financials) by `cui_canonical` attaches another firm's
 * representatives and balance sheet to it.
 *
 * Every ONRC/MF join goes through `cuiCorroborated` / `corroboratedCui`. A CUI
 * is corroborated when it is valid and either the entity is Romanian (no
 * foreign marker: not is_foreign, country RO or unknown) or ONRC registers that
 * CUI under a name sharing at least one distinctive token with the entity
 * name. The name check needs a scan of ONRC, so the marts build stores its
 * result in marts.cui_corroborations (`refreshCuiCorroborations`); a
 * foreign-marked entity missing from it is not corroborated (fail-closed).
 * Identity (cui_canonical, cui_valid, is_foreign, contract-identity hashes)
 * does not change; the reviewed identity repair (option A) is still pending.
 */

/** Legal forms and generic organisation words: a shared one proves nothing.
 * Tokens shorter than three characters and pure numbers are ignored too. */
export const REGISTRY_NAME_STOPWORDS: readonly string[] = [
  'srl', 'srls', 'snc', 'scs', 'sca', 'pfa', 'spa', 'sas', 'sarl', 'sprl', 'gmbh', 'llc', 'ltd', 'inc',
  'plc', 'kft', 'sro', 'bvba', 'ooo', 'limited', 'company', 'corporation', 'corp', 'incorporated',
  'group', 'groupe', 'grup', 'gruppo', 'holding', 'international', 'societatea', 'societate', 'societe',
  'sociedad', 'societa', 'compania', 'companie', 'nationala', 'national', 'romania', 'sucursala',
  'filiala', 'branch', 'persoana', 'fizica', 'autorizata', 'intreprindere', 'individuala', 'familiala',
  'the', 'and', 'und', 'des', 'del', 'della',
];

/** text[] of distinctive name tokens: unaccented, lower-case, split on
 * anything that is not a letter or digit (so "S.R.L." never yields a token). */
function nameTokens(q: Query, expression: ReturnType<DbSql>) {
  return q`array(select t from regexp_split_to_table(lower(unaccent(coalesce(${expression},''))),'[^a-z0-9]+') t
    where length(t)>=3 and t !~ '^[0-9]+$' and t <> all(${REGISTRY_NAME_STOPWORDS as string[]}::text[]))`;
}

/** The entity carries no foreign marker: country RO or unknown, not is_foreign. */
function romanianEntity(q: Query, alias: string) {
  return q`(not coalesce(${q(alias)}.is_foreign,false) and coalesce(nullif(upper(trim(${q(alias)}.country_code)),''),'RO')='RO')`;
}

/** Boolean: entity `alias` (a core.entities row) may be joined to ONRC/MF by
 * its CUI. Cheap: a primary-key lookup, only for foreign-marked entities. */
export function cuiCorroborated(q: Query, alias = 'e') {
  return q`(${q(alias)}.cui_valid and ${q(alias)}.cui_canonical is not null and (${romanianEntity(q, alias)}
    or exists (select 1 from marts.cui_corroborations registry_check
      where registry_check.entity_id=${q(alias)}.id and registry_check.cui=${q(alias)}.cui_canonical)))`;
}

/** The CUI to use for an ONRC/MF join on entity `alias`, or NULL. */
export function corroboratedCui(q: Query, alias = 'e') {
  return q`(case when ${cuiCorroborated(q, alias)} then ${q(alias)}.cui_canonical end)`;
}

/** Recompute marts.cui_corroborations from core.entities and ONRC. Run by the
 * marts build before any ONRC/MF join. Without an ONRC import the table stays
 * empty, so no foreign-marked entity is corroborated. Returns the row count. */
export async function refreshCuiCorroborations(q: Query): Promise<number> {
  await q`delete from marts.cui_corroborations`;
  const [onrc] = await q`select to_regclass('reference.onrc_firm') is not null present`;
  if (!onrc?.['present']) return 0;
  const rows = await q`
    insert into marts.cui_corroborations (entity_id, cui, onrc_name)
    select e.id, e.cui_canonical, min(o.name)
    from core.entities e
    join reference.onrc_firm o on o.cui=e.cui_canonical
    where e.cui_valid and not ${romanianEntity(q, 'e')}
      and ${nameTokens(q, q`o.name`)} && ${nameTokens(q, q`e.name_display`)}
    group by e.id, e.cui_canonical
    returning 1`;
  return rows.length;
}
