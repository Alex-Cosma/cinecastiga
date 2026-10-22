import type { AskSpec, AuthorityKind } from "../ask/spec";

/**
 * Does a sentence say the scope its spec runs? Used by the tests and the
 * regression script over every spec and alternative the interpreter emits:
 * place (county vs locality-as-town-hall vs national), institution kind,
 * data stream and period. Returns the mismatches (empty = consistent).
 */
const KIND_WORDS: Record<AuthorityKind, RegExp> = {
  spital: /spital/,
  scoala: /școl|școal/,
  comuna: /de comună/,
  oras_municipiu: /de oraș/,
  consiliu_judetean: /consili/,
};

export function sentenceScopeProblems(spec: AskSpec, sentence: string): string[] {
  const out: string[] = [];
  const f = spec.filters;
  const profile = spec.block === "scatter" || spec.block === "distribution" || (spec.block === "entity_card" && spec.rankBy === "risk");
  const named = Boolean(f.authorityName || f.authorityId || f.compareWith);
  const townHall = /primăria |primăriei /;
  if (f.uatSiruta) {
    if (!townHall.test(sentence)) out.push("locality not said as its town hall");
    if (/instituțiile din|instituții din/.test(sentence)) out.push("locality said as all institutions");
  } else if (f.county) {
    const county = f.county === "București" ? "București" : `județul ${f.county}`;
    if (!sentence.includes(county)) out.push(`county "${f.county}" not in sentence`);
  } else if (!named) {
    if (/județul|primăria |primăriei /.test(sentence)) out.push("national spec, place in sentence");
  }
  if (f.authorityKind && !KIND_WORDS[f.authorityKind].test(sentence)) out.push(`kind ${f.authorityKind} not in sentence`);
  if (f.singleBidder) {
    if (!/un singur ofertant/.test(sentence)) out.push("single bidder not in sentence");
  } else if (spec.dataset === "da") {
    if (!/achiziții directe/.test(sentence)) out.push("direct acquisitions not in sentence");
  } else if (spec.dataset === "contracts") {
    if (!/contracte din proceduri/.test(sentence)) out.push("procedures not in sentence");
  } else if (/doar achiziții directe|doar contracte din proceduri/.test(sentence)) out.push("stream in sentence, not in spec");
  if (!profile) {
    const { yearFrom: a, yearTo: b } = f;
    const want = a && b ? (a === b ? `în ${a}` : `între ${a} și ${b}`) : a ? `din ${a}` : b ? `până în ${b}` : "toți anii";
    if (spec.block === "trend" ? !(a && b && sentence.includes(`între ${a} și ${b}`)) : !sentence.includes(want)) out.push(`period "${want}" not in sentence`);
  } else if (f.yearFrom || f.yearTo || f.cpvTerm) out.push("risk profile carries a transaction filter");
  if (profile && f.uatSiruta) out.push("risk profile scoped to one town hall");
  return out;
}
