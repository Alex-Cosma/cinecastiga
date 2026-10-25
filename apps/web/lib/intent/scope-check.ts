import { namedKind, type AskSpec, type AuthorityKind } from "../ask/spec";
import { saysSameMonths, type SentenceLabels } from "./to-spec";

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

export function sentenceScopeProblems(spec: AskSpec, sentence: string, labels: Pick<SentenceLabels, "periods" | "sameMonthsSaid"> = {}): string[] {
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
  const kind = namedKind(f.authorityKind);
  if (kind && !KIND_WORDS[kind].test(sentence)) out.push(`kind ${kind} not in sentence`);
  if (f.singleBidder) {
    if (!/o singură ofertă/.test(sentence)) out.push("single offer not in sentence");
  } else if (spec.dataset === "da") {
    if (!/achiziții directe/.test(sentence)) out.push("direct acquisitions not in sentence");
  } else if (spec.dataset === "contracts") {
    if (!/contracte din proceduri/.test(sentence)) out.push("procedures not in sentence");
  } else if (/doar achiziții directe|doar contracte din proceduri/.test(sentence)) out.push("stream in sentence, not in spec");
  if (!profile) {
    const { yearFrom: a, yearTo: b } = f;
    const want = a && b ? (a === b ? `în ${a}` : `între ${a} și ${b}`) : a ? `din ${a}` : b ? `până în ${b}` : "toți anii";
    // A trend says both years: "între 2024 și 2025", "din 2025, față de 2024" (new ones), "din 2024 … din 2025" (gone ones).
    const trendYears = a && b && (sentence.includes(`între ${a} și ${b}`) || sentence.includes(`din ${b}, față de ${a}`) || sentence.includes(`din ${a} `) && sentence.includes(`din ${b}`));
    if (spec.block === "trend" ? !trendYears : !sentence.includes(want)) out.push(`period "${want}" not in sentence`);
  } else if (f.yearFrom || f.yearTo || f.cpvTerm) out.push("risk profile carries a transaction filter");
  if (spec.block === "trend") {
    const t = spec.trend ?? {};
    const group = { up: /cea mai mare creștere/, down: /cea mai mare scădere/, new: t.firstOnly ? /prima dată/ : / noi /, gone: /nu mai apar/, all: /schimbare/ }[t.change ?? "all"];
    if (!group.test(sentence)) out.push(`trend group ${t.change ?? "all"} not in sentence`);
    if (t.order === "percent" && !/în procente/.test(sentence)) out.push("percent order not in sentence");
    // `auto` the archive resolves to whole years is whole years: the sentence needs no months.
    if (saysSameMonths(spec, labels) && !/aceleași luni/.test(sentence)) out.push("same months not in sentence");
  }
  if (profile && f.uatSiruta) out.push("risk profile scoped to one town hall");
  return out;
}
