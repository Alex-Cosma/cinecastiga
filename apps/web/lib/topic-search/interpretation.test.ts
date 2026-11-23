import { describe, expect, it } from 'vitest';
import { memoryVocabulary } from '../intent/memory-vocabulary';
import { RulesInterpreter } from '../intent/rules';
import { FIXTURE } from '../intent/rules.fixture';
import { resultFor } from '../intent/to-spec';
import { applyInterpretation, emptyAnswerText, institutionsPopulation, isCleanQuestion, placeId, placeMatchFor, remainingWords, withLocalityInstitutions } from './interpretation';
import type { Place } from './shared';
import { parseTopicScope } from './shared';

const NOW = new Date('2026-10-22T12:00:00Z');
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
async function read(query: string, extra = '') {
  const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(query)}${extra}`));
  const result = resultFor(await interpreter.interpret(scope.q, { now: NOW }));
  return { scope, result };
}

describe('interpretation → /cauta selection', () => {
  it('searches the subject words with the place from the words as the filter', async () => {
    const { scope, result } = await read('iluminat buzau');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'iluminat', place: 'county:buzau', from: '', to: '', names: 'exact' });
    expect(t.fromWords.place).toEqual({ id: 'county:buzau', label: 'Județul Buzău', kind: 'county' });
    expect(t.subject).toMatchObject({ label: 'iluminat', source: 'synonym' });
    // the city is offered, never applied silently
    expect(t.placeChoices).toEqual([expect.objectContaining({ id: 'uat:44818', choice: 'Doar Municipiul Buzău', q: 'iluminat' })]);
    expect(t.sentence).toBe(result.sentence);
  });

  it('answers «primăria cu cele mai mari contracte» with the town halls ranked, the titles largest first (owner, 23 November 2026)', async () => {
    const { scope, result } = await read('primaria cu cele mai mari contracte pe iluminat în 2026');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'iluminat', place: '', from: '2026', to: '2026', order: 'value', names: 'exact' });
    expect(t.notes).toEqual([]);
    expect(t.kind?.label).toBe('primăriile');
    expect(t.question?.sentence).toBe('Ce primării din toată țara cumpără cel mai mult pentru „iluminat”, prin toate achizițiile, în 2026?');
    expect(t.answer?.top).toMatchObject({ kind: 'authorities', spec: { block: 'table', dim: 'authority', topN: 3, filters: { authorityKind: 'primarie', yearFrom: 2026, yearTo: 2026 } } });
    // „cele mai mari contracte de iluminat” alone is still the largest records
    const largest = applyInterpretation(...Object.values(await read('cele mai mari contracte de iluminat din 2026')) as [typeof scope, typeof result]);
    expect(largest.answer?.top?.kind).toBe('records');
  });

  it('narrows the search and «Pe scurt» by the months the words say (owner, 23 November 2026)', async () => {
    const one = await read('iluminat in decembrie 2024');
    const t = applyInterpretation(one.scope, one.result);
    expect(t.applied).toEqual({ q: 'iluminat', place: '', from: '2024-12', to: '2024-12', names: 'exact' });
    expect(t.fromWords.period).toEqual({ from: '2024-12', to: '2024-12', label: 'dec. 2024' });
    expect(t.notes.join(' ')).not.toMatch(/tot anul/);
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', yearFrom: 2024, yearTo: 2024, monthFrom: 12, monthTo: 12 });
    expect(t.answer?.total.sentence).toContain('în dec. 2024');
    // several months, and months counted back from today (22 October 2026: the current month and the two before it)
    const range = await read('iluminat ianuarie-martie 2024');
    expect(applyInterpretation(range.scope, range.result).applied).toMatchObject({ from: '2024-01', to: '2024-03' });
    const last = await read('iluminat in ultimele 3 luni');
    expect(applyInterpretation(last.scope, last.result, null, NOW).fromWords.period).toEqual({ from: '2026-08', to: '2026-10', label: 'aug.–oct. 2026' });
    // a question keeps them too
    const asked = await read('cat s-a cheltuit pe iluminat in decembrie 2024');
    const q = applyInterpretation(asked.scope, asked.result);
    expect(q.question?.sentence).toContain('în dec. 2024');
    expect(q.applied).toMatchObject({ q: 'iluminat', from: '2024-12', to: '2024-12' });
    expect(q.answer?.total.spec.filters).toMatchObject({ monthFrom: 12, monthTo: 12 });
    // a change from year to year compares whole years: its note says so, and the search keeps the year with it
    const change = await read('ce firme au crescut la iluminat in decembrie 2025 fata de 2024');
    const c = applyInterpretation(change.scope, change.result);
    expect(c.notes).toContain('„decembrie 2025”: am folosit tot anul 2025.');
    expect(c.applied).toMatchObject({ from: '2025', to: '2025' });
    expect(c.answer?.total.spec.filters.monthFrom).toBeUndefined();
  });

  it('answers within a month window of the address, and a year chosen on the page replaces the words\' months', async () => {
    const shared = await read('iluminat', '&from=2024-12&to=2024-12');
    const t = applyInterpretation(shared.scope, shared.result);
    expect(t.applied).toMatchObject({ q: 'iluminat', from: '2024-12', to: '2024-12' });
    expect(t.answer?.total.spec.filters).toMatchObject({ yearFrom: 2024, yearTo: 2024, monthFrom: 12, monthTo: 12 });
    const chosen = await read('iluminat in decembrie 2024', '&from=2023&to=2023');
    const c = applyInterpretation(chosen.scope, chosen.result);
    expect(c.applied).toMatchObject({ from: '2023', to: '2023' });
    expect(c.answer?.total.spec.filters.monthFrom).toBeUndefined();
    expect(c.answer?.total.spec.filters).toMatchObject({ yearFrom: 2023, yearTo: 2023 });
  });

  it('answers the largest records with a number inside, of a town hall and with a participle (search probe, 23 November 2026)', async () => {
    const five = await read('cele mai mari 5 contracte pe iluminat in 2024');
    const t = applyInterpretation(five.scope, five.result);
    expect(t.question?.sentence).toBe('Care sunt cele mai mari achiziții pentru „iluminat” făcute de instituțiile publice din toată țara, în 2024?');
    expect(t.answer?.top).toMatchObject({ kind: 'records', spec: { block: 'stat', filters: { cpvTerm: 'iluminat', yearFrom: 2024, yearTo: 2024 } } });
    expect(t.applied).toEqual({ q: 'iluminat', place: '', from: '2024', to: '2024', order: 'value', names: 'exact' });
    // Întreabă opens the sources list of this selection, the largest first
    expect(t.answer?.evidenceHref).toMatch(/&drill=1&ordine=valoare$/);
    expect(five.result.sources).toBe('largest');
    for (const q of ['cel mai mare contract semnat de primaria din Ramnicu Sarat', 'care e cel mai mare contract dat vreodata de primaria din Ramnicu Sarat', 'top 10 cele mai mari contracte ale primariei Ramnicu Sarat']) {
      const hall = await read(q);
      const h = applyInterpretation(hall.scope, hall.result);
      expect([q, h.question?.sentence, h.answer?.top?.kind, h.notes]).toEqual([q, 'Care sunt cele mai mari achiziții făcute de primăria Râmnicu Sărat (Buzău), în toți anii?', 'records', []]);
    }
  });

  it('gives the largest records of the whole country the question line alone, never a ranking of firms or a total', async () => {
    const { scope, result } = await read('cel mai scump contract atribuit direct anul trecut');
    const t = applyInterpretation(scope, result);
    expect(t.question?.sentence).toBe('Care sunt cele mai mari achiziții directe făcute de instituțiile publice din toată țara, în 2025?');
    expect(t.answer).toBeNull();
    expect(t.notes).toEqual([]);
    expect(t.applied.order).toBe('value');
  });

  it('reads a question with the trade\'s filler words as a question, and carries the trade\'s notes (search probe, 23 November 2026)', async () => {
    const buyers = await read('top 20 autoritati contractante judetul Buzau dupa valoare 2024');
    const t = applyInterpretation(buyers.scope, buyers.result);
    expect(t.question?.sentence).toBe('Ce instituții publice din județul Buzău cumpără cel mai mult, prin toate achizițiile, în 2024?');
    expect(t.notes).toEqual([]);
    // „semnate” is no title word to search beside the subject
    const signed = await read('contracte de catering semnate in 2025');
    expect(applyInterpretation(signed.scope, signed.result).applied).toMatchObject({ q: 'catering', from: '2025', to: '2025' });
    const framework = await read('contracte subsecvente din acord cadru vaccinuri');
    expect(applyInterpretation(framework.scope, framework.result).notes).toEqual(['Nu putem alege doar acordurile-cadru sau doar contractele subsecvente. Plafonul unui acord-cadru nu intră în sume; contractele subsecvente, când sunt în date, intră.']);
    const single = await read('licitatii cu un singur ofertant la consiliul judetean buzau');
    expect(applyInterpretation(single.scope, single.result).notes.join(' ')).toContain('Numărul de oferte îl știm doar');
  });

  it('reads an English question through its rewriting, for the words typed (search probe, 23 November 2026)', async () => {
    const { scope, result } = await read('top buyers of medicines 2025');
    expect(result.interpretation.typed).toBe('top buyers of medicines 2025');
    const t = applyInterpretation(scope, result);
    expect(t.question?.sentence).toBe('Ce instituții publice din toată țara cumpără cel mai mult pentru „medicamente”, prin toate achizițiile, în 2025?');
    expect(t.applied).toMatchObject({ q: 'medicamente', from: '2025', to: '2025' });
    expect(t.notes).toContain('Am citit întrebarea din engleză; răspunsul e în română.');
    expect(t.answer?.top).toMatchObject({ kind: 'authorities' });
  });
  it('reads a question longer than the title search takes, and answers it (search probe, 23 November 2026)', async () => {
    const long = 'as vrea sa aflu, pentru o lucrare la facultate, care sunt firmele care castiga cele mai multe contracte de iluminat de la institutiile publice din judetul Buzau in anul 2024, va rog frumos sa imi aratati daca se poate, multumesc anticipat';
    expect(long.length).toBeGreaterThan(150);
    const { scope, result } = await read(long);
    const t = applyInterpretation(scope, result);
    expect(t.applied).toMatchObject({ place: 'county:buzau', from: '2024', to: '2024' });
    expect(t.answer).not.toBeNull();
    expect(result.interpretation.leftover).toEqual(['facultate']);
  });

  it('searches the Romanian word of a subject read from English, in a question and in plain words', async () => {
    for (const q of ['who wins road works in bacau', 'road works bacau']) {
      const { scope, result } = await read(q);
      expect([q, applyInterpretation(scope, result).applied.q]).toEqual([q, 'drumuri']);
    }
  });

  it('builds the short answer from the same reading, through Ask specs', async () => {
    const { scope, result } = await read('iluminat buzau');
    const t = applyInterpretation(scope, result);
    expect(t.answer?.total.spec).toMatchObject({ block: 'stat', measure: 'value', filters: { cpvTerm: 'iluminat', county: 'Buzău' } });
    expect(t.answer?.top?.spec).toMatchObject({ block: 'table', dim: 'supplier', topN: 3, filters: { cpvTerm: 'iluminat', county: 'Buzău' } });
    expect(t.answer?.total.sentence).toBe('Cât valorează achizițiile pentru „iluminat” făcute de instituțiile publice din județul Buzău, în toți anii?');
    expect(t.answer?.href).toBe('/intreaba?q=iluminat%20buzau');
  });

  it('drops the connector before a removed place and applies a named year', async () => {
    const { scope, result } = await read('iluminat in municipiul buzau 2023');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'iluminat', place: 'uat:44818', from: '2023', to: '2023', names: 'exact' });
    expect(t.fromWords.period).toEqual({ from: '2023', to: '2023', label: '2023' });
    expect(t.answer?.total.spec.filters).toMatchObject({ uatSiruta: 44818, yearFrom: 2023, yearTo: 2023 });
    // a locality can always widen to its county
    expect(t.placeChoices).toContainEqual(expect.objectContaining({ id: 'county:buzau', choice: 'Tot județul Buzău' }));
  });

  it('keeps an institution named with its town as a name search', async () => {
    const { scope, result } = await read('primaria buzau');
    const t = applyInterpretation(scope, result);
    expect(t.applied).toEqual({ q: 'primaria buzau', place: '', from: '', to: '' });
    expect(t.fromWords.place).toBeNull();
    expect(t.answer).toBeNull();
    expect(t.placeAlone).toBeUndefined();
  });

  it('reads a place named alone as the place: its filter and its own short answer (UX audit Z1-01)', async () => {
    const { scope, result } = await read('buzau');
    const t = applyInterpretation(scope, result);
    // the names and titles that carry the place's name stay the lists, within the place
    expect(t.applied).toEqual({ q: 'buzau', place: 'county:buzau', from: '', to: '' });
    expect(t.fromWords.place).toEqual({ id: 'county:buzau', label: 'Județul Buzău', kind: 'county' });
    expect(t.placeAlone).toBe(true);
    expect(t.note).toBeNull();
    expect(t.answer?.total.spec).toMatchObject({ block: 'stat', filters: { county: 'Buzău' } });
    expect(t.answer?.top).toMatchObject({ kind: 'suppliers', spec: { dim: 'supplier', topN: 3, filters: { county: 'Buzău' } } });
    // Întreabă opens on the same ranking, not on the words read again
    expect(t.answer?.href).toMatch(/^\/intreaba\?spec=/);
  });

  it('reads a place and a year named alone, and never a place picked on the page', async () => {
    const { scope, result } = await read('in judetul buzau 2023');
    const t = applyInterpretation(scope, result);
    expect(t.placeAlone).toBe(true);
    expect(t.applied).toEqual({ q: 'buzau', place: 'county:buzau', from: '2023', to: '2023' });
    expect(t.answer?.total.spec.filters).toMatchObject({ county: 'Buzău', yearFrom: 2023, yearTo: 2023 });
    const chosen = await read('buzau', '&place=county:cluj');
    expect(applyInterpretation(chosen.scope, chosen.result).placeAlone).toBeUndefined();
    // the same place kept as a filter, with a period picked on the page: still the place's answer, for those years
    const kept = await read('buzau', '&place=county:buzau&from=2022&to=2022');
    const k = applyInterpretation(kept.scope, kept.result, { id: 'county:buzau', name: 'Buzău', detail: 'Județ', kind: 'county' });
    expect(k.placeAlone).toBe(true);
    expect(k.applied).toEqual({ q: 'buzau', place: 'county:buzau', from: '2022', to: '2022' });
    expect(k.answer?.total.spec.filters).toMatchObject({ county: 'Buzău', yearFrom: 2022, yearTo: 2022 });
  });

  it('never picks between localities of the same name', async () => {
    const { scope, result } = await read('iluminat salcioara');
    const t = applyInterpretation(scope, result);
    expect(t.placeAmbiguous).toBe(true);
    expect(t.applied.place).toBe('');
    expect(t.answer).toBeNull();
    expect(t.placeChoices.map((c) => c.id).sort()).toEqual(['uat:68789', 'uat:94330']);
    expect(t.placeChoices.every((c) => c.q === 'iluminat')).toBe(true);
  });

  it('reads a same-named locality as the one chosen on the page', async () => {
    // owner, 17 November 2026: the place's menu links a locality by its name and its id („Florești” + Florești (Cluj))
    const alone = await read('salcioara');
    expect(applyInterpretation(alone.scope, alone.result)).toMatchObject({ placeAmbiguous: true, answer: null });
    const { scope, result } = await read('salcioara', '&place=uat:68789');
    const t = applyInterpretation(scope, result);
    expect(t.placeAmbiguous).toBe(false);
    expect(t.placeAlone).toBe(true);
    expect(t.applied).toMatchObject({ q: 'salcioara', place: 'uat:68789' });
    expect(t.answer?.total.sentence).toMatch(/Sălcioara|Salcioara/i);
    // with a subject, the chosen one is the filter and the others are no longer asked about
    const lit = await read('iluminat salcioara', '&place=uat:94330');
    const l = applyInterpretation(lit.scope, lit.result);
    expect(l.placeAmbiguous).toBe(false);
    expect(l.placeChoices.map((c) => c.id)).not.toContain('uat:68789');
    // a place chosen that is none of them settles nothing
    const other = await read('salcioara', '&place=county:cluj');
    expect(applyInterpretation(other.scope, other.result).placeAmbiguous).toBe(true);
  });

  it('respects a place chosen on the page and names it officially', async () => {
    const place = { id: 'uat:44818', name: 'MUNICIPIUL BUZAU', detail: 'Municipiu · buzau', kind: 'locality' as const };
    const { scope, result } = await read('asfalt', '&place=uat:44818');
    const t = applyInterpretation(scope, result, place);
    expect(t.applied).toEqual({ q: 'asfalt', place: 'uat:44818', from: '', to: '', names: 'exact' });
    expect(t.fromWords.place).toBeNull();
    expect(t.explicitPlace).toEqual({ id: 'uat:44818', label: 'Municipiul Buzău (Buzău)', kind: 'locality' });
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'asfalt', uatSiruta: 44818 });
    // explicit filters are not in the words: the full answer is the spec itself
    expect(t.answer?.href).toMatch(/^\/intreaba\?spec=/);
  });

  it('applies no place when other words are left unexplained or name a firm or institution', async () => {
    // „drumuri și poduri buzău”: „poduri” is the subject beside another place, not the village (re-judging, 10 November 2026)
    const roads = await read('drumuri si poduri buzau');
    expect(applyInterpretation(roads.scope, roads.result).applied).toMatchObject({ q: 'drumuri sau poduri', place: 'county:buzau' });
    for (const q of ['drumuri si poduri', 'apa nova bucuresti', 'apa nova', 'spitalul judetean buzau', 'piata romana bucuresti']) {
      const { scope, result } = await read(q);
      const t = applyInterpretation(scope, result);
      expect(t.applied, q).toEqual({ q, place: '', from: '', to: '' });
      expect(t.fromWords.place, q).toBeNull();
      expect(t.answer, q).toBeNull();
      expect(t.placeChoices, q).toEqual([]);
    }
    // a firm read in the words, or unexplained words, leave no subject reading at all
    for (const q of ['apa nova bucuresti', 'spitalul judetean buzau', 'piata romana bucuresti']) {
      const { scope, result } = await read(q);
      expect(applyInterpretation(scope, result).subject, q).toBeNull();
    }
  });

  it('shows in chips every scope of the short answer, or gives no answer', async () => {
    const after = await read('iluminat dupa 2020');
    const t1 = applyInterpretation(after.scope, after.result, null, new Date('2026-10-22T12:00:00Z'));
    expect(t1.applied).toEqual({ q: 'iluminat', place: '', from: '2021', to: '2026', names: 'exact' });
    expect(t1.fromWords.period?.label).toBe('din 2021');
    expect(t1.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', yearFrom: 2021 });
    expect(t1.answer?.total.spec.filters.yearTo).toBeUndefined();
    const sector = await read('iluminat sector 3');
    const t2 = applyInterpretation(sector.scope, sector.result);
    expect(t2.answer).toBeNull();
    expect(t2.note).toMatch(/Sectorul 3/);
    const schools = await read('laptopuri scoala');
    const t3 = applyInterpretation(schools.scope, schools.result);
    expect(t3.kind).toEqual({ label: 'școlile', withoutQ: 'laptopuri' });
    // the kind word is a chip, not a word the titles must contain
    expect(t3.applied).toEqual({ q: 'laptopuri', place: '', from: '', to: '', names: 'exact' });
    expect(t3.answer?.total.spec.filters).toMatchObject({ authorityKind: 'scoala' });
  });

  it('does not read a fragment of a catalogue word as a subject', async () => {
    const { result } = await read('iluminat');
    const scope = parseTopicScope(new URLSearchParams('q=construct'));
    const weak = { ...result, interpretation: { ...result.interpretation, text: 'construct', subjects: [{ term: '45247110-4', label: 'Construcţie de canale', cpvName: 'Construcţie de canale', source: 'catalog' as const, matched: { text: 'construct', from: 0, to: 1 } }] } };
    const t = applyInterpretation(scope, weak);
    expect(t.subject).toBeNull();
    expect(t.answer).toBeNull();
  });

  it('answers a whole question first, with the interpreter’s sentence and its specs', async () => {
    for (const q of ['cine ia banii buzau', 'cat a cheltuit primaria buzau pe iluminat']) {
      const { scope, result } = await read(q);
      const t = applyInterpretation(scope, result);
      expect(isCleanQuestion(result), q).toBe(true);
      expect(t.question, q).toEqual({ sentence: result.sentence });
      expect(t.trusted, q).toBe(true);
      expect(t.answer?.total.spec.block, q).toBe('stat');
      expect(t.answer?.top?.spec, q).toMatchObject({ block: 'table', dim: 'supplier', topN: 3 });
      expect(t.answer?.href, q).toBe(`/intreaba?q=${encodeURIComponent(q)}`);
      expect(t.answer?.evidenceHref, q).toMatch(/^\/intreaba\?spec=.+&drill=1$/);
    }
    // without a subject, the words themselves are searched as written, below the answer
    const bare = await read('cine ia banii buzau');
    expect(applyInterpretation(bare.scope, bare.result).applied.q).toBe('cine ia banii buzau');
    const { scope, result } = await read('cat a cheltuit primaria buzau pe iluminat');
    const t = applyInterpretation(scope, result);
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', uatSiruta: 44818 });
    // with one subject, the lists search it in the place the sentence names
    expect(t.applied).toEqual({ q: 'iluminat', place: 'uat:44818', from: '', to: '', names: 'exact' });
    // the subject the answer counts is kept, so the route lists its CPV classes
    expect(t.subject?.term).toBe('iluminat');
  });

  it('searches a question about one subject for that subject, with the place and period of the sentence', async () => {
    const asked = await read('cine castiga cel mai mult pe iluminat in toata tara in 2023');
    const t = applyInterpretation(asked.scope, asked.result, null, NOW);
    expect(t.question).toEqual({ sentence: asked.result.sentence });
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', yearFrom: 2023, yearTo: 2023 });
    // the lists search what the answer counts, not the sentence as title words
    expect(t.applied).toEqual({ q: 'iluminat', place: '', from: '2023', to: '2023', names: 'exact' });
    expect(t.fromWords.period).toEqual({ from: '2023', to: '2023', label: '2023' });
    // no place or period in the words: the subject alone
    const plain = await read('cat s-a dat pe iluminat');
    expect(applyInterpretation(plain.scope, plain.result, null, NOW).applied).toEqual({ q: 'iluminat', place: '', from: '', to: '', names: 'exact' });
    // a București sector has no /cauta filter: the subject is searched in the whole country
    const sector = await read('cine ia banii pe iluminat in sectorul 3');
    const s = applyInterpretation(sector.scope, sector.result, null, NOW);
    expect(s.answer?.total.spec.filters).toMatchObject({ uatSiruta: 179169 });
    expect(s.applied).toEqual({ q: 'iluminat', place: '', from: '', to: '', names: 'exact' });
  });

  it('searches what the words name when the reading is not clean, and says the words not understood', async () => {
    // a subject with a word around it not understood: the subject, the place said as one, the short answer
    const noise = await read('ce firme domina iluminatul in buzau');
    const n = applyInterpretation(noise.scope, noise.result, null, NOW);
    expect(n.applied).toEqual({ q: 'iluminat', place: 'county:buzau', from: '', to: '', names: 'exact' });
    expect(n.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', county: 'Buzău' });
    expect(n.subject?.term).toBe('iluminat');
    expect(n.notes.join(' ')).toMatch(/Nu am înțeles „domina”/);
    // words right after the subject that narrow it and have no domain: searched with it, no total
    const narrow = await read('laptopuri scolare 2024');
    const w = applyInterpretation(narrow.scope, narrow.result, null, NOW);
    expect(w.applied).toEqual({ q: 'laptopuri scolare', place: '', from: '2024', to: '2024' });
    expect(w.answer).toBeNull();
    expect(w.subject).toBeNull();
    expect(w.notes.join(' ')).toMatch(/„scolare” nu are un domeniu/);
    // a firm with a year: the firm's name, the year as a filter
    const firm = await read('Spedition UMB 2023');
    const f = applyInterpretation(firm.scope, firm.result, null, NOW);
    if (firm.result.interpretation.supplier) expect(f.applied).toEqual({ q: 'Spedition UMB', place: '', from: '2023', to: '2023' });
  });

  it('says what the reading dropped, and never adds the second year of „X față de Y”', async () => {
    const versus = await read('iluminat 2024 fata de 2023');
    const v = applyInterpretation(versus.scope, versus.result, null, NOW);
    expect(v.answer?.total.spec.filters).toMatchObject({ yearFrom: 2024, yearTo: 2024 });
    // the two years beside the total of the year asked about, each its own figure (search probe, 23 November 2026)
    expect(v.answer?.top).toMatchObject({ kind: 'years', spec: { block: 'timeseries', filters: { yearFrom: 2023, yearTo: 2024 } } });
    expect(v.notes.join(' ')).not.toMatch(/prima perioadă/);
    if (v.fromWords.period) expect(v.fromWords.period).toMatchObject({ from: '2024', to: '2024' });
    const excluded = await read('iluminat fara buzau');
    const e = applyInterpretation(excluded.scope, excluded.result, null, NOW);
    expect(e.applied.place).toBe('');
    expect(e.answer?.total.spec.filters.county).toBeUndefined();
    expect(e.notes.join(' ')).toMatch(/nu putem scoate un loc/);
  });

  it('never answers a question with unexplained words, a choice to make, or a name search', async () => {
    // "podu" is not understood: no answer about all of Buzău's spending
    for (const q of ['cat a costat podu buzau', 'cine ia banii salcioara', 'primaria buzau', 'buzau']) {
      const { scope, result } = await read(q);
      const t = applyInterpretation(scope, result);
      expect(t.question, q).toBeNull();
    }
    const amb = await read('cine ia banii salcioara');
    expect(applyInterpretation(amb.scope, amb.result).answer).toBeNull();
    // a subject applied to the titles stays a subject search with chips
    const subject = await read('iluminat buzau');
    expect(applyInterpretation(subject.scope, subject.result).question).toBeNull();
    // a filter chosen on the page is never overridden by the place in the words
    for (const extra of ['&place=county:ialomita', '&from=2023&to=2023', '&type=da']) {
      const filtered = await read('cine ia banii buzau', extra);
      expect(applyInterpretation(filtered.scope, filtered.result).question, extra).toBeNull();
    }
  });

  it('offers the same buyers by domain as the alternative to an empty subject', async () => {
    const { scope, result } = await read('iluminat in municipiul buzau');
    const t = applyInterpretation(scope, result);
    expect(t.answer?.domains?.label).toBe('Vezi la ce domenii sunt încadrate achizițiile făcute de primăria Buzău, în toți anii');
    expect(t.answer?.domains?.href).toMatch(/^\/intreaba\?spec=/);
    // no buyer named: nothing narrower than the whole country to offer
    const national = await read('iluminat');
    expect(applyInterpretation(national.scope, national.result).answer?.domains ?? null).toBeNull();
  });

  it('says what was not found instead of a zero total', () => {
    expect(emptyAnswerText('Cât valorează achizițiile pentru „Pod” făcute de primăria Oradea (Bihor), în toți anii?', 'Pod'))
      .toBe('Niciun contract încadrat la „Pod” la primăria Oradea (Bihor), în toți anii.');
    expect(emptyAnswerText('Cât valorează achizițiile făcute de instituțiile publice din județul Buzău, în 2023?', null))
      .toBe('Nicio achiziție înregistrată la instituțiile publice din județul Buzău, în 2023.');
    expect(emptyAnswerText('Altă formulare', 'parcuri')).toBe('Niciun contract încadrat la „parcuri” în această selecție.');
  });

  it('returns the words unchanged without an interpretation or for another text', async () => {
    const { scope, result } = await read('iluminat buzau');
    expect(applyInterpretation(scope, null).applied.q).toBe('iluminat buzau');
    const other = parseTopicScope(new URLSearchParams('q=drumuri'));
    expect(applyInterpretation(other, result).applied).toEqual({ q: 'drumuri', place: '', from: '', to: '' });
  });
});

describe('word plumbing', () => {
  it('removes spans with their leading connectors', () => {
    expect(remainingWords('iluminat în Buzău', [{ from: 2, to: 3 }])).toBe('iluminat');
    expect(remainingWords('asfaltare din judetul Buzau 2022', [{ from: 3, to: 4 }, { from: 4, to: 5 }])).toBe('asfaltare');
    expect(remainingWords('Buzău iluminat', [{ from: 0, to: 1 }])).toBe('iluminat');
    expect(remainingWords('medicamentele din Buzău', [{ from: 2, to: 3 }], { from: 0, to: 1, text: 'medicamente' })).toBe('medicamente');
  });
  it('maps places to /cauta filters; sectors have none', () => {
    expect(placeId({ kind: 'county', county: 'Caraș-Severin' })).toBe('county:caras-severin');
    expect(placeId({ kind: 'locality', county: 'Buzău', siruta: 44818, tip: 'municipiu' })).toBe('uat:44818');
    expect(placeId({ kind: 'locality', county: 'București', siruta: 179141, tip: 'sector' })).toBeNull();
  });
  it('names a picker place as the interpreter does', () => {
    expect(placeMatchFor({ id: 'county:bucuresti', name: 'București', detail: 'Municipiul București', kind: 'county' })).toMatchObject({ county: 'București', name: 'Municipiul București' });
    expect(placeMatchFor({ id: 'uat:94330', name: 'SALCIOARA', detail: 'Comună · ialomita', kind: 'locality' })).toMatchObject({ siruta: 94330, county: 'Ialomița', name: 'Comuna Sălcioara', label: 'Comuna Sălcioara (Ialomița)' });
  });

  it('answers a whole question within the place and the years chosen on the page (Cisnădie feedback, 13 November 2026)', async () => {
    const buzau: Place = { id: 'uat:44818', name: 'MUNICIPIUL BUZAU', detail: 'Municipiu · buzau', kind: 'locality' };
    const { scope, result } = await read('cine ia banii pe iluminat', '&place=uat%3A44818&from=2024&to=2024');
    const t = applyInterpretation(scope, result, buzau);
    // the chips keep the page's filters: no question line, the answer within them
    expect(t.question).toBeNull();
    expect(t.answer?.total.spec.filters).toMatchObject({ cpvTerm: 'iluminat', uatSiruta: 44818, yearFrom: 2024, yearTo: 2024 });
    expect(t.answer?.href).toMatch(/^\/intreaba\?spec=/);
  });

  it('counts a locality\'s institutions as a precise selection, unless the words ask about the town hall', async () => {
    const buzau: Place = { id: 'uat:44818', name: 'MUNICIPIUL BUZAU', detail: 'Municipiu · buzau', kind: 'locality' };
    const { scope, result } = await read('iluminat', '&place=uat%3A44818');
    const t = withLocalityInstitutions(applyInterpretation(scope, result, buzau), 44818, ['1', '2', '3']);
    expect(t.answer?.total.spec.filters.uatSiruta).toBeUndefined();
    expect(t.answer?.total.spec.population).toEqual({ operator: 'and', groups: [{ operator: 'or', conditions: [{ field: 'authority', op: 'in', values: ['1', '2', '3'] }] }] });
    expect(t.answer?.total.sentence).toContain('instituțiile din');
    expect(t.answer?.evidenceHref).toMatch(/&drill=1$/);
    expect(t.answer?.institutions).toBe(true);
    const asked = await read('primaria iluminat', '&place=uat%3A44818');
    const kept = applyInterpretation(asked.scope, asked.result, buzau);
    expect(withLocalityInstitutions(kept, 44818, ['1', '2'])).toBe(kept);
  });

  it('splits a long institution list into the precise selection\'s bounds', () => {
    const ids = Array.from({ length: 950 }, (_, k) => String(k + 1));
    const p = institutionsPopulation(ids)!;
    expect(p.operator).toBe('or');
    expect(p.groups).toHaveLength(2);
    expect(p.groups[0]!.conditions).toHaveLength(8);
    expect(p.groups.flatMap((g) => g.conditions.flatMap((c) => 'values' in c ? c.values : []))).toHaveLength(950);
    expect(institutionsPopulation(Array.from({ length: 3200 }, (_, k) => String(k + 1)))?.groups.flatMap((g) => g.conditions)).toHaveLength(32);
    expect(institutionsPopulation(Array.from({ length: 3201 }, (_, k) => String(k + 1)))).toBeNull();
    expect(institutionsPopulation([])).toBeNull();
  });
});
