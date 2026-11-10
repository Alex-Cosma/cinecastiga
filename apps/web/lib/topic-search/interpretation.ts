import type { AskSpec } from '../ask/spec';
import { askHref } from '../discovery-links';
import { buildPlaces, countyDisplay } from '../intent/places';
import { fold as foldText } from '../intent/text';
import { joinCpvTerms } from '../ask/cpv-terms';
import { sentenceFor, specFor, subjectsLabel, type SentenceLabels } from '../intent/to-spec';
import type { AuthorityKind } from '../ask/spec';
import type { IntentResult, Interpretation, PlaceMatch, Span } from '../intent/types';
import type { Place, TopicScope } from './shared';
import { placeId, remainingWords, subjectWords, weakSubject } from './words';
import { STOPWORDS, tokenize } from '../intent/text';
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
  /**
   * The interpreter's own notes on what it read and did not apply („„fără București”: nu putem scoate un loc…”,
   * „Am folosit prima perioadă…”), shown with the reading so nothing it dropped is silent (owner probe, 10 November 2026).
   */
  notes: string[];
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
  /**
   * Subject answer through the Ask engine (/api/ask), only when the reading is unambiguous.
   * `evidenceHref` opens every record the total counts; `empty` is said instead of "0 lei".
   */
  answer: { total: { spec: AskSpec; sentence: string }; top: { spec: AskSpec; sentence: string }; href: string; evidenceHref: string; empty: string; domains: { href: string; label: string } | null; cpv: string[]; cpvExcluded: string[] } | null;
  /**
   * The words are a whole question the rules read cleanly ("cine ia banii
   * oradea"): the page answers it first and the words, searched as written,
   * go below. Null for a subject or a name search.
   */
  question: { sentence: string } | null;
  /** The interpreter's sentence is what the page shows (an answer, or a reading with no subject). */
  trusted: boolean;
  /** "Vezi răspunsul complet în Întreabă". */
  askHref: string | null;
  /** Several firms or institutions fit the name and none was chosen: the page's own section lists them
   * (owner, 3 November 2026: no separate line asking to choose). */
  entityChoice: boolean;
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
    fromWords: { place: null, period: null }, kind: null, note: null, notes: [], explicitPlace: null, subject: null, otherSubjects: [], placeChoices: [], placeAmbiguous: false,
    sentence: null, problem: null, confidence: 'none', hasEntity: false, answer: null, question: null, askHref: null, trusted: false, entityChoice: false,
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
    entityChoice: i.entityAlternatives.length > 0 && !i.authority && !i.supplier,
  };
  // The words that explain the rest: subjects and the kind of buyer.
  const keep: Span[] = i.subjects.map((s) => s.matched);
  // The kind of buyer ("școala") becomes a chip, not a word the titles must contain.
  const kindSpan: Span[] = i.authorityKind ? [i.authorityKind.matched] : [];
  // An inflected curated subject ("medicamentele") is searched in its base form.
  const subjectBase = subjectOk && s0!.source === 'synonym' && !s0!.label.includes(' ') && foldText(s0!.label) !== foldText(s0!.matched.text) ? { ...s0!.matched, text: s0!.label } : undefined;

  const interpretedPlace = i.place && !i.placeAmbiguous && i.place.matched ? i.place : null;
  const interpretedChip = interpretedPlace ? chip(interpretedPlace) : null;
  // „2024 față de 2023” is about 2024: the other year is said in a note, never added to it
  const versus = i.period?.versus;
  const yf = versus ? versus.main : i.period?.yearFrom, yt = versus ? versus.main : i.period?.yearTo;
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
  const subjectAnswer = (applied: PlaceMatch | null, appliedPeriod: typeof wordsPeriod) => {
    const answerPlace: PlaceMatch | null = applied ?? (explicitPlace ? named : null);
    const placeShown = !i.place || Boolean(applied) || Boolean(scope.place);
    const periodShown = !i.period || Boolean(appliedPeriod) || Boolean(scope.from);
    if (!result.spec || !placeShown || !periodShown || (scope.place && !answerPlace)) return null;
    const years = scope.from ? { yearFrom: Number(scope.from), yearTo: Number(scope.to) } : appliedPeriod ? { yearFrom: yf, yearTo: yt } : null;
    const answerReading: Interpretation = {
      ...i, topN: 3, superlative: false,
      period: years ? { ...(years.yearFrom !== undefined ? { yearFrom: years.yearFrom } : {}), ...(years.yearTo !== undefined ? { yearTo: years.yearTo } : {}), ...(versus && !scope.from ? { versus } : {}), matched: i.period?.matched ?? { text: '', from: 0, to: 0 } } : null,
    };
    const explicit = Boolean(scope.place || scope.from);
    // the spec counts every recognised subject ("parcuri + spatii verzi"): so does the sentence
    return shortAnswer(answerReading, { place: answerPlace }, { subject: subjectsLabel(i.subjects) }, (top) => (explicit ? askHref(top) : `/intreaba?q=${encodeURIComponent(scope.q)}`));
  };
  if (subjectOk) out.answer = subjectAnswer(place, period);
  // Question first: the words are a question the rules read cleanly, not title words.
  // A subject applied to the titles ("iluminat buzau") stays a subject search, and
  // filters chosen on the page (place, period, type) are not overridden by the words.
  if (!applies && !scope.place && !scope.from && scope.type === 'all' && isCleanQuestion(result)) {
    out.question = { sentence: result.sentence! };
    // "Cine…" and "cât…" get the total and the first three winners; other questions open in Întreabă.
    if (!out.answer && (i.intent === 'ranking_suppliers' || i.intent === 'total')) {
      const labels = { subject: subjectsLabel(i.subjects), ...(i.askedTownHalls && !i.authorityKind ? { allInstitutions: true } : {}) };
      out.answer = shortAnswer({ ...i, topN: 3, superlative: false, measure: null }, {}, labels, () => `/intreaba?q=${encodeURIComponent(scope.q)}`);
    }
    // The subject the answer counts, so the route can list its CPV classes ("Domenii incluse");
    // several subjects are counted together ("parcuri + spatii verzi").
    const counted = out.answer?.total.spec.filters.cpvTerm;
    if (s0 && (!out.subject || i.subjects.length > 1) && counted && counted === joinCpvTerms(i.subjects.map((s) => s.term)))
      out.subject = { term: counted, label: subjectsLabel(i.subjects) ?? s0.label, cpvName: s0.cpvName, source: s0.source, notes: [] };
    // A question about one subject searches the titles and names for that subject, with the place and period the
    // sentence names (owner, 10 November 2026): the whole sentence as title words ("cine câștigă cel mai mult pe
    // psihiatrie în 2026") finds nothing. A place without a /cauta filter (a București sector) is not applied, and
    // the results line says so. "Caută exact ce ai scris" still searches the words as written.
    if (subjectOk && i.subjects.length === 1 && reading.words) {
      out.applied = { q: reading.words, place: interpretedChip?.id ?? '', from: wordsPeriod?.from ?? '', to: wordsPeriod?.to ?? '' };
      out.fromWords = { place: interpretedChip, period: wordsPeriod };
    }
  }
  // The lists search what the words name, never the sentence as title words (owner probe, 10 November 2026: 40–60% of
  // the questions not read cleanly ended on an empty page). A reading with words left over is still used, and the
  // words not understood are said. Explicit filters chosen on the page are never overridden.
  let loose: LooseReading | null = null;
  if (out.applied.q === scope.q && !applies && !i.placeAmbiguous && !i.subjectChoices) {
    loose = looseReading(i, hasEntity, interpretedPlace?.matched ?? null);
    if (loose) {
      const placeOk = Boolean(!scope.place && interpretedPlace && interpretedChip && loose.placeApplies);
      const periodOk = !scope.from && Boolean(wordsPeriod);
      out.applied = { q: loose.words, place: placeOk ? interpretedChip!.id : scope.place, from: periodOk ? wordsPeriod!.from : scope.from, to: periodOk ? wordsPeriod!.to : scope.to };
      out.fromWords = { place: placeOk ? interpretedChip : null, period: periodOk ? wordsPeriod : null };
      if (loose.kind === 'subjects' && !loose.narrowed.length) {
        // a subject with words around it not understood ("ce firme domină salubrizarea"): its short answer, the words said
        // several subjects counted together keep the subject the question set ("parcuri + spatii verzi")
        if (!out.subject) {
          out.subject = s0 ? { term: s0.term, label: s0.label, cpvName: s0.cpvName, source: s0.source, notes: [] } : null;
          out.otherSubjects = i.subjects.slice(1).map((x) => ({ label: x.label, cpvName: x.cpvName }));
        }
        if (!out.answer) out.answer = subjectAnswer(placeOk ? interpretedPlace : null, periodOk ? wordsPeriod : null);
        if (i.authorityKind) out.kind = { label: KIND_LABEL[i.authorityKind.kind], withoutQ: remainingWords(i.text, [i.authorityKind.matched]) };
      } else if (loose.kind === 'subjects') {
        // words that narrow the subject and have no domain ("uniforme școlare"): no total, which would count every uniform
        out.subject = null;
        if (!out.question) out.answer = null;
      }
    }
  }
  // Chips say what is searched or answered: a subject reading used for neither is not shown.
  if (!out.answer && !applies && !(loose?.kind === 'subjects' && !loose.narrowed.length)) { out.subject = null; out.otherSubjects = []; out.kind = null; }
  // What the reading dropped or narrowed is said wherever the reading is used.
  if (out.answer || applies || out.question || loose)
    out.notes = [...new Set([...result.interpretation.notes.filter((n) => !/^Arătăm cel mult/.test(n)), ...(loose?.notes ?? [])])];
  out.trusted = Boolean(out.answer) || Boolean(out.question) || (!i.subjects.length && !i.leftover.length && Boolean(result.spec));
  out.askHref = out.answer?.href ?? (result.spec || result.alternatives.length ? `/intreaba?q=${encodeURIComponent(scope.q)}` : null);
  return out;
}

/**
 * A question to answer first: the person asked ("cine", "cât") or named
 * several subjects to count together, the rules
 * built one spec with high confidence and every word is explained. A reading
 * with a choice to make (same-named places, firms or persons) has no spec and
 * is never answered by a guess.
 */
export function isCleanQuestion(result: IntentResult): boolean {
  const i = result.interpretation;
  // several subjects ("parcuri și spații verzi") are counted together, never searched as title words
  return Boolean(result.spec && result.sentence) && (i.intentSource === 'cue' || i.subjects.length > 1) && i.confidenceLabel === 'high' && !i.leftover.length
    && !i.placeAmbiguous && !i.subjectChoices && !(i.entityAlternatives.length && !i.authority && !i.supplier) && !(i.personAlternatives.length && !i.person);
}

/** "Niciun contract încadrat la „Pod” la primăria Oradea (Bihor), în toți anii." */
export function emptyAnswerText(totalSentence: string, subject: string | null): string {
  const where = /făcute de (.+)\?$/.exec(totalSentence)?.[1];
  if (subject) return where ? `Niciun contract încadrat la „${subject}” la ${where}.` : `Niciun contract încadrat la „${subject}” în această selecție.`;
  return where ? `Nicio achiziție înregistrată la ${where}.` : 'Nicio achiziție înregistrată în această selecție.';
}

/** Total and the first three winners of one reading, as Ask specs. */
function shortAnswer(reading: Interpretation, choice: { place?: PlaceMatch | null }, labels: SentenceLabels, href: (top: AskSpec) => string): TopicInterpretation['answer'] {
  const total = specFor(reading, 'total', choice).spec;
  const top = specFor(reading, 'ranking_suppliers', choice).spec;
  if (!total || !top) return null;
  const totalSentence = sentenceFor(total, labels);
  return {
    total: { spec: total, sentence: totalSentence },
    top: { spec: top, sentence: sentenceFor(top, labels) },
    href: href(top),
    // Ask runs the spec and opens the records behind the total.
    evidenceHref: `${askHref(total)}&drill=1`,
    empty: emptyAnswerText(totalSentence, labels.subject ?? null),
    domains: domainsOf(reading, choice, total, totalSentence),
    cpv: [],
    cpvExcluded: [],
  };
}

/**
 * The same buyers without the subject, by domain: where their acquisitions
 * are classified when the subject's classes hold nothing ("parcuri" at a town
 * hall that files them under green spaces). Only for a named buyer scope.
 */
function domainsOf(reading: Interpretation, choice: { place?: PlaceMatch | null }, total: AskSpec, totalSentence: string): { href: string; label: string } | null {
  const f = total.filters;
  if (!f.cpvTerm || !(f.uatSiruta || f.county || f.authorityName || f.authorityId)) return null;
  const spec = specFor({ ...reading, subjects: [], subjectChoices: null }, 'breakdown', choice).spec;
  if (!spec || spec.filters.cpvTerm) return null;
  const where = /făcute de (.+)\?$/.exec(totalSentence)?.[1];
  return { href: askHref(spec), label: where ? `Vezi la ce domenii sunt încadrate achizițiile făcute de ${where}` : 'Vezi la ce domenii sunt încadrate achizițiile din această selecție' };
}

interface LooseReading {
  kind: 'subjects' | 'entity' | 'words';
  /** What the lists search: subjects (alternatives with „sau”), the name as typed, or the words not understood. */
  words: string;
  /** Words right after a subject that narrow it and have no domain of their own ("școlare" in "uniforme școlare"). */
  narrowed: string[];
  notes: string[];
  /** Whether the place read in the words is applied to the lists, or stays in the name searched. */
  placeApplies: boolean;
}

/** Words that mark a place as one ("în Cluj", "județul Iași"); an unmarked one may be a subject or a name ("poduri"). */
const PLACE_MARK = new Set(['in', 'din', 'la', 'judetul', 'judetului', 'jud', 'municipiul', 'municipiului', 'orasul', 'orasului', 'comuna', 'comunei', 'sectorul', 'sectorului', 'localitatea']);

const quote = (words: string[]) => words.map((w) => `„${w}”`).join(', ');

/**
 * What the lists search when the words were not read cleanly (owner probe, 10 November 2026): the subjects, each with
 * the words right after it that narrow it („uniforme școlare”, „iluminat de crăciun”); else one named firm or
 * institution as typed („Siepcofar 2025” → „Siepcofar”); else the words not understood. Null when nothing is left
 * to search but what was typed.
 */
export function looseReading(i: Interpretation, hasEntity: boolean, place: Span | null): LooseReading | null {
  const tokens = tokenize(i.text);
  const left = new Set(i.leftover.map((w) => foldText(w)));
  const taken = new Set<number>();
  const spanOf = (from: number, to: number) => tokens.slice(from, to).map((t) => t.raw).join(' ');
  // the marker can lead the place's own span („in buzau”) or come right before it
  const marked = place ? PLACE_MARK.has(tokens[place.from]?.f ?? '') || PLACE_MARK.has(tokens[place.from - 1]?.f ?? '') : false;
  if (i.subjects.length && !hasEntity && !i.subjects.some(weakSubject)) {
    // nothing but the subjects and small words: the words as typed are the person's own search („iluminat public”)
    const inSubject = (k: number) => i.subjects.some((s) => k >= s.matched.from && k < s.matched.to);
    if (!place && !i.period && i.intentSource !== 'cue' && tokens.every((t, k) => inSubject(k) || STOPWORDS.has(t.f))) return null;
    const narrowed: string[] = [];
    const parts = i.subjects.map((s) => {
      const inflected = s.source === 'synonym' && !s.label.includes(' ') && foldText(s.label) !== foldText(s.matched.text);
      const words = [inflected ? s.label : s.matched.text];
      // the words right after the subject that were not understood narrow it ("iluminat de crăciun", "măști chirurgicale")
      let k = s.matched.to;
      while (k < tokens.length) {
        const t = tokens[k]!;
        const next = tokens[k + 1];
        if (t.f === 'de' && next && left.has(next.f) && !taken.has(k + 1)) { words.push(t.raw, next.raw); narrowed.push(next.raw); taken.add(k + 1); k += 2; continue; }
        if (left.has(t.f) && !taken.has(k)) { words.push(t.raw); narrowed.push(t.raw); taken.add(k); k++; continue; }
        break;
      }
      return words.join(' ');
    });
    const ignored = [...new Set(tokens.filter((t, k) => left.has(t.f) && !taken.has(k)).map((t) => t.raw))];
    const notes: string[] = [];
    if (narrowed.length) notes.push(`${quote(narrowed)} nu ${narrowed.length === 1 ? 'are' : 'au'} un domeniu: fără total, căutăm titlurile cu ${quote(parts)}.`);
    if (ignored.length) notes.push(`Nu am înțeles ${quote(ignored)}.`);
    // A place said as one is applied; an unmarked one only when every other word is understood and it does not follow
    // „și” like a second subject („drumuri și poduri buzău”: „Poduri” is a village, „buzău” left over; „apa nova
    // bucuresti” is a firm's name).
    const placeApplies = Boolean(place) && (marked || (!ignored.length && !narrowed.length && tokens[place!.from - 1]?.f !== 'si'));
    // a place read but not trusted makes the whole reading doubtful: the words are searched as typed
    if (place && !placeApplies) return null;
    return { kind: 'subjects', words: parts.join(' sau '), narrowed, notes, placeApplies };
  }
  // one named firm or institution; or the words that several of them share („oncologie”: seven institutes), which list
  // them to choose from and find the titles too
  const alternatives = i.entityAlternatives.filter((e) => e.matched);
  const shared = alternatives.length && alternatives.every((e) => e.matched.from === alternatives[0]!.matched.from && e.matched.to === alternatives[0]!.matched.to) ? alternatives[0] : null;
  const entity = i.supplier ?? i.authority ?? (i.compareWith || i.person || i.personAlternatives.length ? null : shared);
  // a name typed alone stays as typed („E.ON Energie Romania”); a question, a year or a place around it is dropped
  if (entity?.matched && (i.intentSource === 'cue' || i.period || place)) {
    const ignored = [...new Set(tokens.filter((t) => left.has(t.f)).map((t) => t.raw))];
    // a place right next to the name is part of it („Apa Nova București”, „Spitalul Județean Buzău”): searched with it
    const adjacent = Boolean(place) && !marked && (place!.from === entity.matched.to || place!.to === entity.matched.from);
    const from = adjacent ? Math.min(place!.from, entity.matched.from) : entity.matched.from, to = adjacent ? Math.max(place!.to, entity.matched.to) : entity.matched.to;
    return { kind: 'entity', words: spanOf(from, to), narrowed: [], notes: ignored.length ? [`Nu am înțeles ${quote(ignored)}.`] : [], placeApplies: Boolean(place) && !adjacent && !(place!.from < entity.matched.to && entity.matched.from < place!.to) };
  }
  // only a question or a reading with a place or period has words to drop: a name typed alone stays as typed
  // („Euro Construct Trading 98” keeps „Euro”)
  if (hasEntity || !i.leftover.length || (i.intentSource !== 'cue' && !i.period && !i.place)) return null;
  // nothing read but a place or a period: the words not understood are what the person is looking for
  const words = tokens.filter((t) => left.has(t.f)).map((t) => t.raw);
  const typed = spanOf(0, tokens.length);
  // an unmarked place beside unknown words may be part of a name („piata romana bucuresti”): searched as typed
  if (!words.length || words.join(' ') === typed || (place && !marked)) return null;
  return { kind: 'words', words: [...new Set(words)].join(' '), narrowed: [], notes: [], placeApplies: Boolean(place) && marked };
}
