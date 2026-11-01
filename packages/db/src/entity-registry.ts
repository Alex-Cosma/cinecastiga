import type { DbSql } from './client.js';
import { REVIEWED_REGISTRY_COLLISION_KEYS } from './registry-collisions.js';
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
 *
 * Option (b) (owner decision of 22 October 2026): an entity in the reviewed
 * manifest of ONRC name collisions (REVIEWED_REGISTRY_COLLISIONS,
 * registry-collisions.ts) is never corroborated while it holds the recorded
 * CUI, foreign marker or not.
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

/** Legal forms, spelled out or not, and the words of their long forms ("societate cu răspundere
 * limitată", "societate în nume colectiv"): a name carries or drops them freely. */
const LEGAL_FORMS = [
  'srl', 'srls', 'snc', 'scs', 'sca', 'pfa', 'sc', 'sa', 'ii', 'if', 'ra', 'pf', 'd', 'scm', 'ssif', 'societatea', 'societate',
  'cu', 'raspundere', 'limitata', 'in', 'nume', 'colectiv', 'comandita', 'simpla', 'actiuni', 'comerciala',
  'cooperativa', 'mestesugareasca', 'persoana', 'fizica', 'autorizata', 'intreprindere', 'individuala', 'familiala',
];
const LEGAL_FORM_WORDS = new Set([...REGISTRY_NAME_STOPWORDS, ...LEGAL_FORMS]);
const ONLY_LEGAL_FORMS = new Set(LEGAL_FORMS);

/** A firm name's words, folded, with a run of single letters joined ("R.B.R." → "rbr") and the
 * legal forms and numbers dropped: "SC R.B.R. CONSULTING S.R.L." gives ["rbr", "consulting"]. */
export function registryNameWords(name: string | null | undefined, drop: ReadonlySet<string> = LEGAL_FORM_WORDS): string[] {
  const words: string[] = [];
  let letters = '';
  for (const token of (name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (!token) continue;
    if (/^[a-z]$/.test(token)) { letters += token; continue; }
    if (letters) { words.push(letters); letters = ''; }
    words.push(token);
  }
  if (letters) words.push(letters);
  return words.filter((w) => !/^\d+$/.test(w) && !drop.has(w));
}

/** Edit distance, stopping once it exceeds `max`. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...row) > max) return false;
    previous = row;
  }
  return previous[b.length]! <= max;
}

/** Two spellings of one firm name, as SICAP and ONRC write them: the same letters once spaces, legal
 * forms, numbers and word order are set aside ("SIMTUR" / "SIM TUR", "ING. BOCA FLORIN PFA" / "ING.
 * FLORIN BOCA"), one inside the other ("ALFA DINAMIC S.R.L. PLOIESTI" / "ALFA DINAMIC SRL"), the
 * words of one among the other's ("IOVESCU DANIEL IOAN "IOVESCU DANIEL IOAN" PFA") or a typo apart
 * ("MARCALAU PREST" / "MARCLAU PREST"), with or without the generic words ("MIG INTERANTIONAL" / "MIG
 * INTERNATIONAL"). A name with nothing distinctive left is never "another". */
export function sameRegistryName(a: string | null | undefined, b: string | null | undefined): boolean {
  return sameSpelling(registryNameWords(a), registryNameWords(b))
    || sameSpelling(registryNameWords(a, ONLY_LEGAL_FORMS), registryNameWords(b, ONLY_LEGAL_FORMS));
}

function sameSpelling(wordsA: string[], wordsB: string[]): boolean {
  const lettersA = wordsA.join('').replace(/\d/g, '');
  const lettersB = wordsB.join('').replace(/\d/g, '');
  if (!lettersA || !lettersB || lettersA === lettersB) return true;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const [fewer, more] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if ([...fewer].every((w) => more.has(w)) && (fewer.size >= 2 || fewer.size === more.size)) return true;
  const [shorter, longer] = lettersA.length <= lettersB.length ? [lettersA, lettersB] : [lettersB, lettersA];
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  return withinEdits(lettersA, lettersB, shorter.length >= 8 ? 2 : 1);
}

/** ONRC's names for an entity's CUI that are not the entity's own name (a renaming, or a move to
 * another county under a new registration number), each once, in ONRC's spelling. ONRC's open data
 * carries no dates, so none of them is "the current name". */
export function otherRegistryNames(entityName: string | null | undefined, registryNames: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of registryNames) {
    if (sameRegistryName(entityName, name) || out.some((kept) => sameRegistryName(kept, name))) continue;
    out.push(name.trim());
  }
  return out;
}

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
      where registry_check.entity_id=${q(alias)}.id and registry_check.cui=${q(alias)}.cui_canonical))
    and ${notReviewedCollision(q, alias)})`;
}

/** Boolean: entity `alias` is not a reviewed ONRC name collision holding the
 * recorded CUI (audit F03, option b). */
function notReviewedCollision(q: Query, alias: string) {
  return q`(${q(alias)}.id::text||':'||${q(alias)}.cui_canonical) <> all(${REVIEWED_REGISTRY_COLLISION_KEYS as string[]}::text[])`;
}

/** Boolean: ONRC registers the CUI of entity `alias` under a name sharing a
 * distinctive token with the entity name — the name check of
 * refreshCuiCorroborations, read directly. Needs reference.onrc_firm. */
export function registryNameCorroborates(q: Query, alias = 'e') {
  return q`exists (select 1 from reference.onrc_firm registry_firm
    where registry_firm.cui=${q(alias)}.cui_canonical
      and ${nameTokens(q, q`registry_firm.name`)} && ${nameTokens(q, q`${q(alias)}.name_display`)})`;
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
