import type { AskSpec } from '../ask/spec';
import { askHref } from '../discovery-links';
import { buildPlaces, countyDisplay } from '../intent/places';
import { fold as foldText } from '../intent/text';
import { sentenceFor, specFor, subjectsLabel } from '../intent/to-spec';
import type { AuthorityKind } from '../ask/spec';
import type { IntentResult, Interpretation, PlaceMatch, Span } from '../intent/types';
import type { Place, TopicScope } from './shared';
import { placeId, remainingWords, subjectWords, weakSubject } from './words';
export { placeId, remainingWords, subjectWords };

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
  fromWords: { place: ChipPlace | null; period: { from: string; to: string; label: string } | null };
  /** Buyers named in the words ("școlile"): a scope of the short answer only; titles cannot be filtered by it. */
  kind: { label: string; withoutQ: string } | null;
  /** Why a reading of the words was not applied ("the titles cannot be filtered by sector"). */
  note: string | null;
  /** The place chosen on the page (URL), named as the interpreter names places. */
  explicitPlace: ChipPlace | null;
  /** `notes`: curated notes for people on the synonym rows ("Include și semnalizarea…"), filled by the route. */
  subject: { term: string; label: string; cpvName: string | null; source: 'synonym' | 'catalog'; notes: string[] } | null;
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
  answer: { total: { spec: AskSpec; sentence: string }; top: { spec: AskSpec; sentence: string }; href: string; cpv: string[]; cpvExcluded: string[] } | null;
  /** The interpreter's sentence is what the page shows (an answer, or a reading with no subject). */
  trusted: boolean;
  /** "Vezi răspunsul complet în Întreabă". */
  askHref: string | null;
}

function chip(p: PlaceMatch): ChipPlace | null {
  const id = placeId(p);
  return id ? { id, label: p.kind === 'county' ? p.name : p.label, kind: p.kind } : null;
}

const KIND_LABEL: Record<AuthorityKind, string> = {
  comuna: 'primăriile de comună', oras_municipiu: 'primăriile de oraș și municipiu', consiliu_judetean: 'consiliile județene', spital: 'spitalele', scoala: 'școlile',
};
const wholeCounty = (county: string) => (county === 'București' ? 'Tot Bucureștiul' : `Tot județul ${county}`);
/** The year in Bucharest, for open periods ("după 2020"). */
const thisYear = (now: Date) => Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Bucharest', year: 'numeric' }).format(now));

/**
 * Interpretation → the /cauta selection. A place or period named in the words
 * becomes a filter only when the URL has none and the reading is clean: one
 * place (never one of several same-named localities), no firm, institution or
 * person read in the words, no word left unexplained, and the rest of the
 * words is the recognised subject. Then the titles are searched for the
 * subject words alone ("iluminat buzau" → "iluminat" in Județul Buzău).
 * "Pe scurt" is built only from what the chips show.
 */
export function applyInterpretation(scope: TopicScope, result: IntentResult | null, explicitPlace: Place | null = null, now = new Date()): TopicInterpretation {
  const base: TopicInterpretation = {
    q: scope.q, applied: { q: scope.q, place: scope.place, from: scope.from, to: scope.to },
    fromWords: { place: null, period: null }, kind: null, note: null, explicitPlace: null, subject: null, otherSubjects: [], placeChoices: [], placeAmbiguous: false,
    sentence: null, problem: null, confidence: 'none', hasEntity: false, answer: null, askHref: null, trusted: false,
  };
  const named = explicitPlace ? placeMatchFor(explicitPlace) : null;
  if (explicitPlace && named) base.explicitPlace = { id: explicitPlace.id, label: named.kind === 'county' ? named.name : named.label, kind: named.kind };
  if (!result || !scope.q) return base;
  const i = result.interpretation;
  if (foldText(i.text).trim() !== foldText(scope.q).trim()) return base;
  const hasEntity = Boolean(i.authority || i.supplier || i.compareWith || i.entityAlternatives.length || i.person || i.personAlternatives.length);
  const s0 = i.subjects[0];
  // A fragment of a catalogue word ("construct") or a reading with unexplained
  // words ("apa nova") is more likely a name: no subject reading at all.
  const subjectOk = Boolean(s0 && !weakSubject(s0) && !hasEntity && !i.leftover.length);
  const out: TopicInterpretation = {
    ...base,
    subject: subjectOk ? { term: s0!.term, label: s0!.label, cpvName: s0!.cpvName, source: s0!.source, notes: [] } : null,
    otherSubjects: subjectOk ? i.subjects.slice(1).map((s) => ({ label: s.label, cpvName: s.cpvName })) : [],
    placeAmbiguous: i.placeAmbiguous,
    sentence: result.sentence, problem: result.problem, confidence: i.confidenceLabel, hasEntity,
  };
  // The words that explain the rest: subjects and the kind of buyer.
  const keep: Span[] = i.subjects.map((s) => s.matched);
  // The kind of buyer ("școala") becomes a chip, not a word the titles must contain.
  const kindSpan: Span[] = i.authorityKind ? [i.authorityKind.matched] : [];
  // An inflected curated subject ("medicamentele") is searched in its base form.
  const subjectBase = subjectOk && s0!.source === 'synonym' && !s0!.label.includes(' ') && foldText(s0!.label) !== foldText(s0!.matched.text) ? { ...s0!.matched, text: s0!.label } : undefined;

  const interpretedPlace = i.place && !i.placeAmbiguous && i.place.matched ? i.place : null;
  const interpretedChip = interpretedPlace ? chip(interpretedPlace) : null;
  const yf = i.period?.yearFrom, yt = i.period?.yearTo;
  const wordsPeriod = !scope.from && i.period && (yf !== undefined || yt !== undefined)
    ? { from: String(yf ?? 2000), to: String(yt ?? thisYear(now)), label: yf !== undefined && yt !== undefined ? (yf === yt ? String(yf) : `${yf}–${yt}`) : yf !== undefined ? `din ${yf}` : `până în ${yt}` }
    : null;
  const remove: Span[] = [];
  if (!scope.place && interpretedPlace && interpretedChip) remove.push(interpretedPlace.matched!);
  if (wordsPeriod) remove.push(i.period!.matched);
  if (subjectOk) remove.push(...kindSpan);
  const reading = subjectWords(i.text, { remove, keep, base: subjectBase });
  const applies = subjectOk && remove.length > 0 && reading.clean && reading.words.length >= 2;
  const place = applies && remove.includes(interpretedPlace?.matched as Span) ? interpretedPlace : null;
  const period = applies ? wordsPeriod : null;
  if (applies) {
    out.applied = { q: reading.words, place: place ? interpretedChip!.id : scope.place, from: period?.from ?? scope.from, to: period?.to ?? scope.to };
    out.fromWords = { place: place ? interpretedChip : null, period };
  }
  if (subjectOk && i.authorityKind) out.kind = { label: KIND_LABEL[i.authorityKind.kind], withoutQ: remainingWords(i.text, [i.authorityKind.matched]) };

  // Other readings of the place: the person picks; the subject words stay the search.
  const placeSpan = interpretedPlace?.matched ?? (i.placeAmbiguous ? [i.place, ...i.placeAlternatives].find((p) => p?.matched)?.matched : undefined);
  const choiceReading = placeSpan ? subjectWords(i.text, { remove: [placeSpan, ...(i.period ? [i.period.matched] : []), ...kindSpan], keep, base: subjectBase }) : null;
  if (subjectOk && choiceReading?.clean && choiceReading.words.length >= 2) {
    const choices = (i.placeAmbiguous ? [i.place, ...i.placeAlternatives] : interpretedPlace ? i.placeAlternatives : []).filter((p): p is PlaceMatch => Boolean(p));
    const offer = (c: ChipPlace | null, choice: string) => {
      if (c && c.id !== out.applied.place && !out.placeChoices.some((x) => x.id === c.id)) out.placeChoices.push({ ...c, choice, q: choiceReading.words });
    };
    for (const p of choices)
      offer(chip(p), i.placeAmbiguous ? p.label
        : p.kind === 'locality' && interpretedPlace?.kind === 'county' ? `Doar ${p.name}`
        : p.kind === 'county' && interpretedPlace?.kind === 'locality' ? wholeCounty(p.county) : p.label);
    if (place?.kind === 'locality') {
      const name = place.county === 'București' ? 'Municipiul București' : `Județul ${place.county}`;
      offer(chip({ kind: 'county', county: place.county, name, label: name }), wholeCounty(place.county));
    }
  }
  if (!applies && interpretedPlace && !interpretedChip && subjectOk)
    out.note = `Titlurile nu se pot restrânge la ${interpretedPlace.name}; răspunsul pentru acest loc este în Întreabă.`;

  // "Pe scurt": the same place and period as the chips, or none at all.
  const answerPlace: PlaceMatch | null = place ?? (explicitPlace ? named : null);
  const placeShown = !i.place || Boolean(place) || Boolean(scope.place);
  const periodShown = !i.period || Boolean(period) || Boolean(scope.from);
  if (subjectOk && result.spec && placeShown && periodShown && !(scope.place && !answerPlace)) {
    const years = scope.from ? { yearFrom: Number(scope.from), yearTo: Number(scope.to) } : period ? { yearFrom: yf, yearTo: yt } : null;
    const answerReading: Interpretation = {
      ...i, topN: 3, superlative: false,
      period: years ? { ...(years.yearFrom !== undefined ? { yearFrom: years.yearFrom } : {}), ...(years.yearTo !== undefined ? { yearTo: years.yearTo } : {}), matched: i.period?.matched ?? { text: '', from: 0, to: 0 } } : null,
    };
    const choice = { place: answerPlace };
    const total = specFor(answerReading, 'total', choice).spec;
    const top = specFor(answerReading, 'ranking_suppliers', choice).spec;
    // the spec counts every recognised subject ("parcuri + spatii verzi"): so does the sentence
    const labels = { subject: subjectsLabel(i.subjects) };
    if (total && top) {
      const explicit = Boolean(scope.place || scope.from);
      out.answer = {
        total: { spec: total, sentence: sentenceFor(total, labels) },
        top: { spec: top, sentence: sentenceFor(top, labels) },
        href: explicit ? askHref(top) : `/intreaba?q=${encodeURIComponent(scope.q)}`,
        cpv: [],
        cpvExcluded: [],
      };
    }
  }
  // Chips say what is searched or answered: a subject reading used for neither is not shown.
  if (!out.answer && !applies) { out.subject = null; out.otherSubjects = []; out.kind = null; }
  out.trusted = Boolean(out.answer) || (!i.subjects.length && !i.leftover.length && Boolean(result.spec));
  out.askHref = out.answer?.href ?? (result.spec || result.alternatives.length ? `/intreaba?q=${encodeURIComponent(scope.q)}` : null);
  return out;
}
