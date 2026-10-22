import type { AskSpec } from '../ask/spec';
import { askHref } from '../discovery-links';
import { buildPlaces, countyDisplay } from '../intent/places';
import { fold as foldText } from '../intent/text';
import { sentenceFor, specFor } from '../intent/to-spec';
import type { IntentResult, Interpretation, PlaceMatch, Span } from '../intent/types';
import { topicParams, type Place, type TopicScope } from './shared';
import { placeId, remainingWords } from './words';
export { placeId, remainingWords };

/**
 * /cauta reads the words through the rules interpreter (lib/intent) before it
 * searches: "iluminat buzau" is the subject "iluminat" in Buzău, so the title
 * search looks for "iluminat" with Buzău as the place filter instead of
 * requiring "buzau" in the title. Server-side only (the interpreter carries the
 * locality catalogue); the page receives the plain TopicInterpretation.
 */

/** A place chosen in the /cauta picker, as the interpreter would have named it. */
export function placeMatchFor(place: Place): PlaceMatch | null {
  if (place.kind === 'county') {
    const county = countyDisplay(place.name) ?? place.name;
    const name = county === 'București' ? 'Municipiul București' : `Județul ${county}`;
    return { kind: 'county', county, name, label: name };
  }
  const siruta = Number(place.id.slice(4));
  const [kind = '', rawCounty = ''] = place.detail.split(' · ');
  const tip = kind === 'Municipiu' ? '1' : kind === 'Oraș' ? '2' : '3';
  // The gazetteer's official spelling (RPL 2021, with diacritics) for this SIRUTA code.
  const entry = buildPlaces([{ siruta, name: place.name, tip, county: rawCounty }]).find((p) => p.siruta === siruta);
  if (!entry) return null;
  return { kind: 'locality', county: entry.county, siruta, ...(entry.tip ? { tip: entry.tip } : {}), name: entry.name, label: entry.label };
}

export interface ChipPlace { id: string; label: string; kind: 'county' | 'locality' }

/** What /cauta shows and applies from one interpretation. Plain data for the page. */
export interface TopicInterpretation {
  /** The words exactly as interpreted (the URL's q). */
  q: string;
  /** The scope actually searched: the words left after the place/period, plus those filters. */
  applied: { q: string; place: string; from: string; to: string };
  /** Parts taken from the words (removable chips); explicit URL filters are not listed here. */
  fromWords: { place: ChipPlace | null; period: { from: string; to: string } | null };
  /** The place chosen on the page (URL), named as the interpreter names places. */
  explicitPlace: ChipPlace | null;
  subject: { label: string; cpvName: string | null; source: 'synonym' | 'catalog' } | null;
  otherSubjects: { label: string; cpvName: string | null }[];
  /** Other readings of the place, ready to apply ("Doar Municipiul Buzău"). */
  placeChoices: (ChipPlace & { choice: string; q: string })[];
  /** The place name fits several localities: nothing was applied, the person chooses. */
  placeAmbiguous: boolean;
  /** The interpreter's own sentence and problem, verbatim. */
  sentence: string | null;
  problem: string | null;
  confidence: Interpretation['confidenceLabel'];
  hasEntity: boolean;
  /** Subject answer through the Ask engine (/api/ask), only when the reading is unambiguous. */
  answer: { total: { spec: AskSpec; sentence: string }; top: { spec: AskSpec; sentence: string }; href: string } | null;
  /** "Vezi răspunsul complet în Întreabă". */
  askHref: string | null;
}

function chip(p: PlaceMatch): ChipPlace | null {
  const id = placeId(p);
  return id ? { id, label: p.kind === 'county' ? p.name : p.label, kind: p.kind } : null;
}

/**
 * Interpretation → the /cauta selection. The place and the period named in the
 * words become filters only when the URL has none, the interpreter chose one
 * reading (an ambiguous place is offered, never picked), and other words
 * remain to search for (a lone "Buzău" stays a name search).
 */
export function applyInterpretation(scope: TopicScope, result: IntentResult | null, explicitPlace: Place | null = null): TopicInterpretation {
  const base: TopicInterpretation = {
    q: scope.q, applied: { q: scope.q, place: scope.place, from: scope.from, to: scope.to },
    fromWords: { place: null, period: null }, explicitPlace: null, subject: null, otherSubjects: [], placeChoices: [], placeAmbiguous: false,
    sentence: null, problem: null, confidence: 'none', hasEntity: false, answer: null, askHref: null,
  };
  const named = explicitPlace ? placeMatchFor(explicitPlace) : null;
  if (explicitPlace && named) base.explicitPlace = { id: explicitPlace.id, label: named.kind === 'county' ? named.name : named.label, kind: named.kind };
  if (!result || !scope.q) return base;
  const i = result.interpretation;
  if (foldText(i.text).trim() !== foldText(scope.q).trim()) return base;
  const out: TopicInterpretation = {
    ...base,
    subject: i.subjects[0] ? { label: i.subjects[0].label, cpvName: i.subjects[0].cpvName, source: i.subjects[0].source } : null,
    otherSubjects: i.subjects.slice(1).map((s) => ({ label: s.label, cpvName: s.cpvName })),
    placeAmbiguous: i.placeAmbiguous,
    sentence: result.sentence, problem: result.problem, confidence: i.confidenceLabel,
    hasEntity: Boolean(i.authority || i.supplier || i.entityAlternatives.length || i.person || i.personAlternatives.length),
  };
  const spans: Span[] = [];
  let place: PlaceMatch | null = null;
  const interpretedPlace = i.place && !i.placeAmbiguous && i.place.matched ? i.place : null;
  const interpretedChip = interpretedPlace ? chip(interpretedPlace) : null;
  if (!scope.place && interpretedPlace && interpretedChip) { place = interpretedPlace; spans.push(interpretedPlace.matched!); }
  let period: { from: string; to: string } | null = null;
  if (!scope.from && i.period?.yearFrom !== undefined && i.period.yearTo !== undefined) {
    period = { from: String(i.period.yearFrom), to: String(i.period.yearTo) };
    spans.push(i.period.matched);
  }
  const remaining = spans.length ? remainingWords(i.text, spans) : scope.q;
  if (spans.length && remaining.length >= 2) {
    out.applied = { q: remaining, place: place ? interpretedChip!.id : scope.place, from: period?.from ?? scope.from, to: period?.to ?? scope.to };
    out.fromWords = { place: place ? interpretedChip : null, period };
  } else { place = null; period = null; }
  // Other readings of the place: the person picks; the remaining words stay the search.
  const placeSpan = interpretedPlace?.matched ?? (i.placeAmbiguous ? [i.place, ...i.placeAlternatives].find((p) => p?.matched)?.matched : undefined);
  const words = placeSpan ? remainingWords(i.text, [placeSpan]) : out.applied.q;
  const searchWords = words.length >= 2 ? words : scope.q;
  const choices = (i.placeAmbiguous ? [i.place, ...i.placeAlternatives] : interpretedPlace ? i.placeAlternatives : [])
    .filter((p): p is PlaceMatch => Boolean(p));
  const offer = (c: ChipPlace | null, choice: string) => {
    if (c && c.id !== out.applied.place && !out.placeChoices.some((x) => x.id === c.id)) out.placeChoices.push({ ...c, choice, q: searchWords });
  };
  for (const p of choices)
    offer(chip(p), p.kind === 'locality' && interpretedPlace?.kind === 'county' && !i.placeAmbiguous ? `Doar ${p.name}` : p.label);
  // A locality can always widen to its county.
  const local = out.applied.place.startsWith('uat:') ? (place ?? (explicitPlace ? placeMatchFor(explicitPlace) : null)) : null;
  if (local?.county) {
    const name = local.county === 'București' ? 'Municipiul București' : `Județul ${local.county}`;
    offer(chip({ kind: 'county', county: local.county, name, label: name }), local.county === 'București' ? 'Tot Bucureștiul' : `Tot județul ${local.county}`);
  }
  // The answer: only an unambiguous reading with a subject (spec present).
  const subject = i.subjects[0];
  if (subject && result.spec) {
    const answerPlace = place ?? (explicitPlace ? placeMatchFor(explicitPlace) : null) ?? (scope.place ? null : i.place);
    const years = period ?? (scope.from ? { from: scope.from, to: scope.to } : null);
    const reading: Interpretation = {
      ...i, topN: 3, superlative: false,
      period: years ? { yearFrom: Number(years.from), yearTo: Number(years.to), matched: i.period?.matched ?? { text: '', from: 0, to: 0 } } : i.period,
    };
    const choice = { place: answerPlace };
    const total = specFor(reading, 'total', choice).spec;
    const top = specFor(reading, 'ranking_suppliers', choice).spec;
    const labels = { subject: subject.label };
    if (total && top) {
      const explicit = Boolean(scope.place || scope.from);
      out.answer = {
        total: { spec: total, sentence: sentenceFor(total, labels) },
        top: { spec: top, sentence: sentenceFor(top, labels) },
        href: explicit ? askHref(top) : `/intreaba?q=${encodeURIComponent(scope.q)}`,
      };
    }
  }
  out.askHref = out.answer?.href ?? (result.spec || result.alternatives.length ? `/intreaba?q=${encodeURIComponent(scope.q)}` : null);
  return out;
}

/** The scope the page searches: the URL scope with the interpretation applied. */
export function appliedScope(scope: TopicScope, t: TopicInterpretation | null): TopicScope {
  return t ? { ...scope, ...t.applied } : scope;
}

/** URL of the same search with only the given parts kept from the interpretation. */
export function searchHref(scope: TopicScope, patch: Partial<TopicScope>): string {
  return `/cauta?${topicParams({ ...scope, tab: 'all', page: 1, role: '', ...patch })}`;
}
