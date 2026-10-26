import { periodPhrase } from "../ask/filters/words";
import { namedKind, type AskSpec, type AuthorityKind } from "../ask/spec";
import { PROCEDURE_WORDS } from "../ask/purchase";
import { saysSameMonths, type SentenceLabels } from "./to-spec";

/**
 * Does a sentence say the scope its spec runs? Used by the tests and the
 * regression script over every spec and alternative the interpreter emits:
 * place (county vs locality-as-town-hall vs national), institution kind,
 * data stream and period, in the builder's words (the interpreter's sentence
 * is the question's title since F2: "Ce firme câștigă [achizițiile directe]…,
 * în [2021–2023]?"). Returns the mismatches (empty = consistent).
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
    if (/instituți(?:ile|i) (?:publice )?din/.test(sentence)) out.push("locality said as all institutions");
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
    // The noun of the stream in each form: "achizițiile directe", "achiziții directe", "achizițiilor directe".
    if (!/achiziți\w* directe/.test(sentence)) out.push("direct acquisitions not in sentence");
  } else if (spec.dataset === "contracts") {
    // F3: a procedure names its contracts ("contractele din licitații deschise", "prin [licitații deschise]").
    const procedure = f.procedure ? PROCEDURE_WORDS[f.procedure] : null;
    if (procedure) {
      if (![procedure.the, procedure.bare, procedure.of, procedure.every, procedure.via].some((form) => sentence.includes(form))) out.push("procedure not in sentence");
    } else if (!/contract\w* din proceduri/.test(sentence)) out.push("procedures not in sentence");
  } else if (/doar achiziții directe|doar contracte din proceduri/.test(sentence)) out.push("stream in sentence, not in spec");
  if (!profile) {
    const { yearFrom: a, yearTo: b } = f;
    // The period's words (kit §4): "în [2025]", "în [2021–2023]", "[din 2020 încoace]"; an evolution is "an de an".
    const want = spec.block === "timeseries" && !a && !b ? "an de an" : periodPhrase(f).value;
    // A trend says both years: "între 2024 și 2025", "în 2025, față de 2024" (new ones), "din 2024 … în 2025" (gone ones).
    // Across other years (2023 → 2025) the new ones say "fără înregistrări în 2023 apar … în 2025".
    const trendYears = a && b && (sentence.includes(`între ${a} și ${b}`) || sentence.includes(`în ${b}, față de ${a}`) || sentence.includes(`din ${a} `) && sentence.includes(`în ${b}`)
      || sentence.includes(`fără înregistrări în ${a} `) && sentence.includes(`în ${b}`));
    if (spec.block === "trend" ? !trendYears : !sentence.includes(want)) out.push(`period "${want}" not in sentence`);
  } else if (f.yearFrom || f.yearTo || f.cpvTerm) out.push("risk profile carries a transaction filter");
  if (spec.block === "trend") {
    const t = spec.trend ?? {};
    const group = { up: /cea mai mare creștere/, down: /cea mai mare scădere/, new: t.firstOnly ? /(?: noi | fără înregistrări în ).*prima dată/ : / noi | fără înregistrări în /,
      gone: /nu mai (?:apar|cumpără)|nu au înregistrări|nu cumpără/, all: /schimbare/ }[t.change ?? "all"];
    if (!group.test(sentence)) out.push(`trend group ${t.change ?? "all"} not in sentence`);
    if (t.order === "percent" && !/în procente/.test(sentence)) out.push("percent order not in sentence");
    // `auto` the archive resolves to whole years is whole years: the sentence needs no months.
    if (saysSameMonths(spec, labels) && !/aceleași luni/.test(sentence)) out.push("same months not in sentence");
  }
  if (profile && f.uatSiruta) out.push("risk profile scoped to one town hall");
  return out;
}
