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
import { NEVER_SUBJECT, NO_DOMAIN_SAID, TOWN_HALL_UNKNOWN } from '../intent/rules';
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
  /**
   * The scope actually searched: the words left after the place/period, plus those filters. `names: 'exact'`: the words
   * are a subject, so the names panel never offers „closest names” for them („MEV Software” for „mentenanță software”).
   */
  applied: { q: string; place: string; from: string; to: string; order?: 'value'; names?: 'exact' };
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
  answer: { total: { spec: AskSpec; sentence: string }; top: AnswerTop | null; href: string; evidenceHref: string; empty: string; domains: { href: string; label: string } | null; cpv: string[]; cpvExcluded: string[] } | null;
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
  /**
   * A subject narrowed by words not understood („concerte de revelion”): each part alone, offered when the titles holding
   * all of them are none (re-judging, 10 November 2026: 0 titles, while „revelion” alone has 16).
   */
  alsoTry: string[];
}

/**
 * What „Pe scurt” shows under its total (owner probe re-judging, 10 November 2026): the first three firms; the
 * institutions that buy („cine cumpără de la Siepcofar”); the value of each year (an evolution, or one firm at one
 * institution); the largest records („cel mai mare contract de iluminat”, read by /api/ask/rows). A comparison's total
 * is both sides (its spec is the compare block) and has none.
 */
export interface AnswerTop { spec: AskSpec; sentence: string; kind: 'suppliers' | 'authorities' | 'years' | 'records' }

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
    alsoTry: [],
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
  // Întreabă with the words as typed: the link of every answer that is not a chosen selection.
  const typedHref = () => `/intreaba?q=${encodeURIComponent(scope.q)}`;
  // „cel mai mare contract de iluminat”, „cele mai scumpe achiziții”: the largest records (owner probe, 10 November 2026)
  const largest = !scope.order && /\b(?:cel|cea|cele|cei)\s+mai\s+(?:mare|mari|scump\w*|valoros\w*)\s+(?:contract\w*|achizit\w*|licitati\w*|investiti\w*)\b/.test(foldText(i.text));
  const then = thenFor(i, largest);
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
    return shortAnswer(answerReading, { place: answerPlace }, { subject: subjectsLabel(i.subjects) }, (top) => (explicit ? askHref(top) : typedHref()), then);
  };
  // „terenul de sport din comuna mea”, „pomi de crăciun primărie”: the place is not named, so no total for the whole country
  // stands in for it (re-judging, 10 November 2026); the subject is still searched, and the note asks which place
  const placeUnknown = i.notes.some((n) => n === TOWN_HALL_UNKNOWN || OWN_PLACE_SAID.test(n));
  if (subjectOk && !placeUnknown) out.answer = subjectAnswer(place, period);
  // Question first: the words are a question the rules read cleanly, not title words.
  // A subject applied to the titles ("iluminat buzau") stays a subject search, and
  // filters chosen on the page (place, period, type) are not overridden by the words.
  if (!applies && !scope.place && !scope.from && scope.type === 'all' && isCleanQuestion(result)) {
    out.question = { sentence: result.sentence! };
    // "Cine…", "cât…" and an evolution get the total and what follows it (the first three winners or buyers, the years);
    // two named institutions or firms are compared side by side; other questions open in Întreabă.
    const labels = { subject: subjectsLabel(i.subjects), ...(i.askedTownHalls && !i.authorityKind ? { allInstitutions: true } : {}) };
    if (!out.answer && i.intent && ANSWERED.includes(i.intent))
      out.answer = shortAnswer({ ...i, topN: 3, superlative: false, measure: null }, {}, labels, typedHref, then);
    if (!out.answer && i.intent === 'compare' && i.compareWith) out.answer = compareAnswer(i, {}, labels, typedHref);
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
  // A named institution with a subject and nothing else („CJ Cluj drumuri”, „medicamente Spitalul Județean Cluj 2024”)
  // is the question it reads as: its sentence, its total and first three firms (owner probe, 10 November 2026).
  if (!out.question && !applies && !scope.place && !scope.from && scope.type === 'all' && i.authority && !i.supplier && i.subjects.length
    && !i.subjects.some(weakSubject) && !i.leftover.length && !i.entityAlternatives.length && !i.placeAmbiguous && result.spec && result.sentence && i.confidenceLabel === 'high') {
    out.question = { sentence: result.sentence };
    out.answer = shortAnswer({ ...i, topN: 3, superlative: false, measure: null }, {}, { subject: subjectsLabel(i.subjects) }, typedHref, then);
    const counted = out.answer?.total.spec.filters.cpvTerm;
    if (counted && s0) out.subject = { term: counted, label: subjectsLabel(i.subjects) ?? s0.label, cpvName: s0.cpvName, source: s0.source, notes: [] };
  }
  let exactNote: string | null = null;
  const plain = !scope.place && !scope.from && scope.type === 'all';
  const settled = !i.leftover.length && !i.placeAmbiguous && !i.subjectChoices && !(i.personAlternatives.length && !i.person) && !placeUnknown;
  // „compară primăria Cluj-Napoca cu primăria Timișoara”: the town halls are the one pair the words can mean
  if (!out.question && !applies && plain && settled && i.intent === 'compare' && !i.compareWith && i.compareChoices.length === 1) {
    out.answer = compareAnswer(i, { pair: i.compareChoices[0]! }, { subject: subjectsLabel(i.subjects) }, typedHref);
    if (out.answer) out.question = { sentence: out.answer.total.sentence };
  }
  // „cât a câștigat Strabag în 2023”: several firms carry the name and one of them is exactly the name typed. „Pe scurt”
  // counts that one and says so; the others are listed with the names below (owner probe re-judging, 10 November 2026).
  const exact = !out.question && !applies && plain && settled && i.intentSource === 'cue' && i.intent && ANSWERED.includes(i.intent) ? exactAlternative(i) : null;
  if (exact) {
    const reading: Interpretation = { ...i, [exact.role]: exact, entityAlternatives: [], choicesPartial: null };
    out.answer = shortAnswer({ ...reading, topN: 3, superlative: false, measure: null }, {}, { subject: subjectsLabel(i.subjects) }, typedHref, thenFor(reading, largest));
    if (out.answer) {
      out.question = { sentence: out.answer.total.sentence };
      const others = (i.choicesPartial?.total ?? i.entityAlternatives.length) - 1;
      // the name as typed, without „firma”; the names list holds them only when no institution is named beside them
      const typed = exact.matched.text.split(/\s+/).filter((w, k, all) => k === all.length - 1 || !FIRM_WORD.has(foldText(w))).join(' ');
      const listed = !i.authority && !i.supplier;
      exactNote = `Am socotit doar „${exact.name}”, singura cu exact acest nume; ${others === 1 ? 'încă una are' : `încă ${others} au`} „${typed}” în nume${listed ? (i.period || i.place ? '; cele cu achiziții în selecție sunt în lista de nume' : ' (lista de nume de mai jos)') : `: caută „${typed}” ca să le vezi`}.`;
    }
  }
  // „cea mai mare achiziție directă”: the largest records of the selection the words name
  if (!out.answer && !applies && plain && settled && largest && result.spec && !hasEntity && i.confidenceLabel !== 'low') {
    out.answer = shortAnswer({ ...i, topN: 3, superlative: false, measure: null }, {}, { subject: subjectsLabel(i.subjects) }, typedHref, 'records');
    // only the largest records answer this question (the whole country has none: see shortAnswer)
    if (out.answer?.top?.kind !== 'records') out.answer = null;
    // the question asked is the largest records, not the total („Care sunt cele mai mari achiziții directe…?”)
    if (out.answer && !out.question) out.question = { sentence: out.answer.total.sentence.replace(/^Cât valorează (achizițiile|contractele)\b/, (_, w: string) => `Care sunt cele mai mari ${w === 'contractele' ? 'contracte' : 'achiziții'}`) };
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
      // a place the lists cannot take (a București sector): said
      if (!placeOk && !scope.place && interpretedPlace && !interpretedChip && loose.placeApplies && !out.note)
        out.note = `Titlurile nu se pot restrânge la ${interpretedPlace.name}; arătăm titlurile din toată țara.`;
      if (loose.kind === 'subjects' && !loose.narrowed.length) {
        // a subject with words around it not understood ("ce firme domină salubrizarea"): its short answer, the words said
        // several subjects counted together keep the subject the question set ("parcuri + spatii verzi")
        if (!out.subject) {
          out.subject = s0 ? { term: s0.term, label: s0.label, cpvName: s0.cpvName, source: s0.source, notes: [] } : null;
          out.otherSubjects = i.subjects.slice(1).map((x) => ({ label: x.label, cpvName: x.cpvName }));
        }
        if (!out.answer && !placeUnknown) out.answer = subjectAnswer(placeOk ? interpretedPlace : null, periodOk ? wordsPeriod : null);
        if (i.authorityKind) out.kind = { label: KIND_LABEL[i.authorityKind.kind], withoutQ: remainingWords(i.text, [i.authorityKind.matched]) };
      } else if (loose.kind === 'subjects') {
        // words that narrow the subject and have no domain ("uniforme școlare"): no total, which would count every uniform
        out.subject = null;
        if (!out.question) out.answer = null;
        out.alsoTry = [...new Set([loose.narrowed.join(' '), ...i.subjects.map((x) => x.matched.text)])].filter((w) => w && foldText(w) !== foldText(loose!.words));
      }
    }
  }
  // A question or a scope read but not trusted: the words as typed are searched, and the page says so (owner probe
  // re-judging, 10 November 2026: a silent dead end).
  if (!loose && !applies && !out.question && !out.answer && out.applied.q === scope.q && !out.note && result.sentence
    && (i.intentSource === 'cue' || i.period || i.place) && !i.placeAmbiguous && !i.entityAlternatives.length)
    out.note = 'Nu am putut citi sigur toate cuvintele; căutăm exact ce ai scris.';
  // Chips say what is searched or answered: a subject reading used for neither is not shown.
  if (!out.answer && !applies && !(loose?.kind === 'subjects' && !loose.narrowed.length)) { out.subject = null; out.otherSubjects = []; out.kind = null; }
  // the titles too are the largest first, said in a note (the shape was dropped and the first three firms answered instead)
  if (largest) out.applied = { ...out.applied, order: 'value' };
  // A subject's words are searched as a subject: no „closest names” for them in the names panel („MEV Software” for
  // „mentenanță software”). Words not understood beside a subject may be a firm's name („apa nova”): its closest names stay.
  // „aplicație mobilă” (no domain) neither: its words are no firm's name to guess („MOBILA S.A.”)
  if (out.subject || applies || (loose?.kind === 'subjects' && loose.narrowed.every((w) => ACTION.has(foldText(w)))) || i.notes.some((n) => NO_DOMAIN_SAID.test(n)))
    out.applied = { ...out.applied, names: 'exact' };
  // What the reading dropped or narrowed is said wherever the reading is used.
  if (out.answer || applies || out.question || loose)
    out.notes = [...new Set([...result.interpretation.notes.filter((n) => !/^Arătăm cel mult/.test(n) && !(exactNote && /se potrivesc cu/.test(n))), ...(loose?.notes ?? [])])];
  // A place the words do not name („la noi”, „primăria” alone) is asked about wherever the words lead (owner probe).
  out.notes = [...new Set([...out.notes, ...result.interpretation.notes.filter((n) => n === TOWN_HALL_UNKNOWN || /nu știm ce localitate|nu putem deosebi|CPV nu are o clasă pentru|nu avem un domeniu pentru această expresie|Toate consiliile județene; pentru unul/.test(n))])];
  if (exactNote) out.notes.push(exactNote);
  // said only where the lists search what was read (a question's own words are searched as typed, usually nothing)
  if (largest && out.applied.q && out.applied.q !== scope.q) out.notes.push('Achizițiile de mai jos sunt ordonate după valoare, cea mai mare întâi.');
  out.trusted = Boolean(out.answer) || Boolean(out.question) || (!i.subjects.length && !i.leftover.length && Boolean(result.spec));
  out.askHref = out.answer?.href ?? (result.spec || result.alternatives.length ? typedHref() : null);
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
  // „în județul meu”: the place is not named, so the question is not answered for the whole country
  return Boolean(result.spec && result.sentence) && (i.intentSource === 'cue' || i.subjects.length > 1) && i.confidenceLabel === 'high' && !i.leftover.length
    && !i.placeAmbiguous && !i.subjectChoices && !(i.entityAlternatives.length && !i.authority && !i.supplier) && !(i.personAlternatives.length && !i.person)
    && !i.notes.some((n) => OWN_PLACE_SAID.test(n));
}

const OWN_PLACE_SAID = /nu știm ce localitate/;

/** "Niciun contract încadrat la „Pod” la primăria Oradea (Bihor), în toți anii." */
export function emptyAnswerText(totalSentence: string, subject: string | null): string {
  const where = /făcute de (.+)\?$/.exec(totalSentence)?.[1];
  if (subject) return where ? `Niciun contract încadrat la „${subject}” la ${where}.` : `Niciun contract încadrat la „${subject}” în această selecție.`;
  return where ? `Nicio achiziție înregistrată la ${where}.` : 'Nicio achiziție înregistrată în această selecție.';
}

/** The questions „Pe scurt” answers itself: the others open in Întreabă. */
const ANSWERED: Interpretation['intent'][] = ['ranking_suppliers', 'ranking_authorities', 'total', 'trend'];

/** What follows the total: the years of an evolution or of one firm at one institution, the largest records, else the ranking. */
function thenFor(i: Interpretation, largest: boolean): Then {
  if (largest) return 'records';
  return i.intent === 'trend' || (i.authority && i.supplier) ? 'years' : 'ranking';
}
type Then = 'ranking' | 'years' | 'records';

/** Total and what follows it (AnswerTop) of one reading, as Ask specs. */
function shortAnswer(reading: Interpretation, choice: { place?: PlaceMatch | null }, labels: SentenceLabels, href: (top: AskSpec) => string, then: Then = 'ranking'): TopicInterpretation['answer'] {
  const total = specFor(reading, 'total', choice).spec;
  if (!total) return null;
  let top: AnswerTop | null = null;
  // an evolution over the years the total counts: never all the years beside the total of one
  const oneYear = total.filters.yearFrom !== undefined && total.filters.yearFrom === total.filters.yearTo;
  if (then === 'years' && !oneYear) {
    const years = specFor(reading, 'trend', choice).spec;
    if (years?.block === 'timeseries') top = { spec: years, sentence: sentenceFor(years, labels), kind: 'years' };
  }
  // the largest records of a selection narrowed by a subject, a place, a buyer or a firm: the records of the whole
  // country (even its direct acquisitions alone) are an 8–15-second read, not a short answer
  const f = total.filters;
  const narrowed = Boolean(f.cpvTerm || f.county || f.uatSiruta || f.authorityId || f.authorityName || f.supplierId || f.supplierName || f.authorityKind);
  if (then === 'records' && narrowed) top = { spec: total, sentence: sentenceFor(total, labels), kind: 'records' };
  if (!top) {
    // „cine cumpără de la X”: the institutions; a ranking of firms beside one named firm is its buyers too (to-spec)
    const ranking = specFor(reading, reading.intent === 'ranking_authorities' ? 'ranking_authorities' : 'ranking_suppliers', choice).spec;
    if (ranking?.block === 'table') top = { spec: ranking, sentence: sentenceFor(ranking, labels), kind: ranking.dim === 'authority' ? 'authorities' : 'suppliers' };
  }
  const totalSentence = sentenceFor(total, labels);
  return {
    total: { spec: total, sentence: totalSentence },
    top,
    href: href(top?.kind === 'records' || !top ? total : top.spec),
    // Ask runs the spec and opens the records behind the total.
    evidenceHref: `${askHref(total)}&drill=1`,
    empty: emptyAnswerText(totalSentence, labels.subject ?? null),
    domains: domainsOf(reading, choice, total, totalSentence),
    cpv: [],
    cpvExcluded: [],
  };
}

/** „compară X cu Y”: both sides in one answer (the compare block counts each one's records). */
function compareAnswer(reading: Interpretation, choice: { pair?: NonNullable<Interpretation['compareChoices']>[number] }, labels: SentenceLabels, href: (top: AskSpec) => string): TopicInterpretation['answer'] {
  const spec = specFor(reading, 'compare', choice).spec;
  if (!spec) return null;
  const sentence = sentenceFor(spec, labels);
  return { total: { spec, sentence }, top: null, href: href(spec), evidenceHref: askHref(spec), empty: 'Nicio achiziție înregistrată pentru cele două.', domains: null, cpv: [], cpvExcluded: [] };
}

/** A registry name without its legal form and punctuation („SC Strabag SRL” → „strabag”). */
const bareName = (name: string) => foldText(name).split(/[^a-z0-9]+/).filter((w) => w && !LEGAL_FORMS.has(w) && !NAME_CONNECTORS.has(w)).join(' ');
/** Connectors a registry name may leave out („Universitatea din București” is „UNIVERSITATEA BUCURESTI”). */
const NAME_CONNECTORS = new Set(['de', 'din', 'si', 'a', 'al', 'ale', 'la', 'in', 'pentru', 'cu', 'lui']);
const LEGAL_FORMS = new Set(['sc', 'srl', 'sa', 's', 'r', 'l', 'srlv', 'pfa', 'ii', 'if', 'snc', 'scs', 'ra', 'ltd', 'gmbh', 'firma', 'firmei', 'societatea', 'compania']);

/** The one alternative whose name is exactly the words typed (all of one role), or none. */
function exactAlternative(i: Interpretation): Interpretation['entityAlternatives'][number] | null {
  const alts = i.entityAlternatives;
  if (alts.length < 2 || alts.some((e) => e.role !== alts[0]!.role) || (alts[0]!.role === 'supplier' ? i.supplier : i.authority)) return null;
  const exact = alts.filter((e) => bareName(e.name) === bareName(e.matched.text));
  return exact.length === 1 ? exact[0]! : null;
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

/** Work done on a subject: beside it, it narrows it („mentenanță software”, „reparații acoperiș”). */
const ACTION = new Set(['mentenanta', 'intretinere', 'reparatii', 'reparatie', 'repararea', 'modernizare', 'modernizarea', 'reabilitare', 'reabilitarea', 'renovare', 'service']);

/** Words that mark a name as a firm's („firma Spedition UMB”), never part of the name searched. */
const FIRM_WORD = new Set(['firma', 'firmei', 'societatea', 'societatii', 'compania', 'companiei', 'furnizorul', 'furnizorului', 'sc']);

/** Words that mark a place as one ("în Cluj", "județul Iași"); an unmarked one may be a subject or a name ("poduri"). */
const PLACE_MARK = new Set(['in', 'din', 'la', 'judetul', 'judetului', 'jud', 'municipiul', 'municipiului', 'orasul', 'orasului', 'comuna', 'comunei', 'sectorul', 'sectorului', 'localitatea', 'primaria', 'primariei', 'primarie']);

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
    // A word that narrows: not understood and not a function, time or place word („blocuri”, „iarna” are not a narrower
    // domain of „anvelopare”, „deszăpezire”; owner probe re-judging, 10 November 2026).
    const narrows = (k: number) => left.has(tokens[k]!.f) && !NEVER_SUBJECT.has(tokens[k]!.f) && !taken.has(k);
    const parts = i.subjects.map((s) => {
      const inflected = s.source === 'synonym' && !s.label.includes(' ') && foldText(s.label) !== foldText(s.matched.text);
      const words = [inflected ? s.label : s.matched.text];
      // the work done on the subject narrows it too („mentenanță software” is not all software)
      const before = s.matched.from - 1;
      if (before >= 0 && ACTION.has(tokens[before]!.f)) { words.unshift(tokens[before]!.raw); narrowed.push(tokens[before]!.raw); taken.add(before); }
      // the words right after the subject that were not understood narrow it ("iluminat de crăciun", "măști chirurgicale",
      // "hrană pentru pacienți")
      let k = s.matched.to;
      while (k < tokens.length) {
        const t = tokens[k]!;
        if ((t.f === 'de' || t.f === 'pentru') && k + 1 < tokens.length && narrows(k + 1)) { words.push(t.raw, tokens[k + 1]!.raw); narrowed.push(tokens[k + 1]!.raw); taken.add(k + 1); k += 2; continue; }
        if (narrows(k)) { words.push(t.raw); narrowed.push(t.raw); taken.add(k); k++; continue; }
        break;
      }
      return words.join(' ');
    });
    const ignored = [...new Set(tokens.filter((t, k) => left.has(t.f) && !taken.has(k)).map((t) => t.raw))];
    const unknown = ignored.filter((w) => !NEVER_SUBJECT.has(foldText(w)));
    const notes: string[] = [];
    if (narrowed.length) notes.push(`${quote(narrowed)} nu ${narrowed.length === 1 ? 'are' : 'au'} un domeniu: fără total, căutăm titlurile cu ${quote(parts)}.`);
    if (ignored.length) notes.push(`Nu am înțeles ${quote(ignored)}.`);
    // A place said as one is applied; an unmarked one only when every other word is understood and it does not follow
    // „și” like a second subject („drumuri și X” where X is only a village; „apa nova bucuresti” is a firm's name). A village
    // that is also a curated subject beside another place is read as the subject (rules.ts: „drumuri și poduri buzău”).
    const placeApplies = Boolean(place) && (marked || (!unknown.length && !narrowed.length && tokens[place!.from - 1]?.f !== 'si'));
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
  if (entity?.matched && (i.intentSource === 'cue' || i.period || place || i.subjects.length)) {
    const ignored = [...new Set(tokens.filter((t) => left.has(t.f)).map((t) => t.raw))];
    // a place right next to the name is part of it („Apa Nova București”, „Spitalul Județean Buzău”): searched with it
    const adjacent = Boolean(place) && !marked && (place!.from === entity.matched.to || place!.to === entity.matched.from);
    let from = adjacent ? Math.min(place!.from, entity.matched.from) : entity.matched.from;
    const to = adjacent ? Math.max(place!.to, entity.matched.to) : entity.matched.to;
    // „firma Spedition UMB”: the word that marks a firm is not part of its name
    while (from < to - 1 && FIRM_WORD.has(tokens[from]!.f) && !foldText(entity.name).startsWith(tokens[from]!.f)) from++;
    return { kind: 'entity', words: spanOf(from, to), narrowed: [], notes: ignored.length ? [`Nu am înțeles ${quote(ignored)}.`] : [], placeApplies: Boolean(place) && !adjacent && !(place!.from < entity.matched.to && entity.matched.from < place!.to) };
  }
  // only a question or a reading with a place or period has words to drop: a name typed alone stays as typed
  // („Euro Construct Trading 98” keeps „Euro”)
  // „cine ia banii de la primăria Craiova”: the town hall read as a place is the institution the lists look for
  if (!i.subjects.length && !hasEntity && i.place?.kind === 'locality' && /\bprimari/.test(foldText(i.text)) && (i.intentSource === 'cue' || i.period))
    return { kind: 'entity', words: `primăria ${i.place.name.replace(/^(?:Municipiul|Orașul|Comuna) /, '')}`, narrowed: [], notes: [], placeApplies: false };
  if (hasEntity || !i.leftover.length || (i.intentSource !== 'cue' && !i.period && !i.place)) return null;
  // nothing read but a place or a period: the words not understood are what the person is looking for
  const words = tokens.filter((t) => left.has(t.f)).map((t) => t.raw);
  const typed = spanOf(0, tokens.length);
  // an unmarked place beside unknown words may be part of a name („piata romana bucuresti”): searched as typed
  if (!words.length || words.join(' ') === typed || (place && !marked)) return null;
  return { kind: 'words', words: [...new Set(words)].join(' '), narrowed: [], notes: [], placeApplies: Boolean(place) && marked };
}
