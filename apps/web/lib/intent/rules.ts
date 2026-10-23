import type { AuthorityKind } from "../ask/spec";
import { retiredTerm } from "../ask/retired-terms";
import { lev } from "../ask/intent";
import { placeKey } from "./places";
import { NUMBER_WORDS, STOPWORDS, fold, personPatterns, rawSpan, stems, tokenize, wordMatches, type Token } from "./text";
import type {
  CpvHit, EntityHit, EntityMatch, IntentKind, InterpretContext, Interpretation, PersonHit, PersonMatch,
  PlaceEntry, PlaceMatch, QuestionInterpreter, Span, Vocabulary,
} from "./types";

/**
 * Deterministic interpreter (owner decision 1): cue words + the existing
 * vocabulary (CPV catalogue and synonyms, counties, reference.uat localities,
 * authorities, suppliers, ONRC persons). Every rule consumes the words it
 * explains; whatever is left is reported back as not understood, never
 * silently dropped and never guessed into a filter. A name shared by several
 * registry identities (people, firms, institutions, localities) is never
 * resolved to one of them: the identities become choices.
 */

export const MAX_QUESTION_LENGTH = 300;
export const RULES_INTERPRETER_ID = "rules-v2";

/** "blocked": words of an institution or person name we could not resolve; reported, never reused. */
type Tag = "period" | "cue" | "kind" | "place" | "subject" | "entity" | "person" | "modifier" | "filler" | "blocked";

interface Hit { i: number; j: number; m: RegExpExecArray }

class Cursor {
  readonly s: string;
  readonly starts: number[] = [];
  readonly used: (Tag | null)[];
  constructor(readonly tokens: Token[]) {
    let s = "";
    for (const t of tokens) {
      if (s) s += " ";
      this.starts.push(s.length);
      s += t.f;
    }
    this.s = s;
    this.used = tokens.map(() => null);
  }
  private tokenAt(char: number): number {
    let k = 0;
    while (k + 1 < this.starts.length && this.starts[k + 1]! <= char) k++;
    return k;
  }
  /** Every match of `re` on free tokens, left to right. */
  all(re: RegExp): Hit[] {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const out: Hit[] = [];
    let m: RegExpExecArray | null;
    while ((m = g.exec(this.s))) {
      if (m[0].length === 0) { g.lastIndex++; continue; }
      const i = this.tokenAt(m.index);
      const j = this.tokenAt(m.index + m[0].length - 1) + 1;
      if (this.isFree(i, j)) out.push({ i, j, m });
    }
    return out;
  }
  first(re: RegExp): Hit | null {
    return this.all(re)[0] ?? null;
  }
  isFree(i: number, j: number): boolean {
    for (let k = i; k < j; k++) if (this.used[k]) return false;
    return i < j;
  }
  take(i: number, j: number, tag: Tag) {
    for (let k = i; k < j; k++) this.used[k] = tag;
  }
  span(i: number, j: number): Span {
    return { text: rawSpan(this.tokens, i, j), from: i, to: j };
  }
  f(k: number): string {
    return this.tokens[k]?.f ?? "";
  }
}

// ------------------------------------------------------------------- cues

const YR = "(20[0-3]\\d)";
const KIND_NOUNS = "spitale|spitalele|scoli|scolile|licee|liceele|comune|comunele|orase|orasele|municipii|municipiile|primarii|primariile|consilii|consiliile";

/** Ordered: the more specific phrase first, so it consumes the shared words. */
const INTENT_CUES: [IntentKind, RegExp][] = [
  ["compare", /\b(?:compara\w*|comparati[ea]|comparat\w*|fata de|versus|vs)\b/],
  ["signals", /\b(?:ce merita verificat\w*|merita verificat\w*|ce merita|de verificat|semnal(?:e|ele|ul)?|suspect\w*|risc(?:ul|uri|ului)?|riscant\w*|neregul\w*|dubio\w*|coruptie|corupt\w*|frauda|fraude|ciudat\w*|anomali\w*|ies din tipar|iese din tipar|indice(?:le|lui)? de risc)\b/],
  ["trend", /\b(?:cum (?:a|au|s a|s au) (?:evoluat|crescut|scazut|schimbat)|evolut\w*|evolueaza|in timp|pe ani|an de an|de la an la an|an cu an|(?:a|au) crescut|(?:a|au) scazut|crestere\w*|scadere\w*|tendint\w*|cum se schimba|istoricul|dinamica)\b/],
  ["ranking_suppliers", /\b(?:de la cine(?: (?:cumpara\w*|a cumparat|au cumparat|ia|iau|achizitioneaza))?|cine (?:castiga|a castigat|au castigat|castigat|face|a facut|fac|au facut|livreaza|a livrat|furnizeaza|vinde|vand|ia|primeste|a primit|executa|a executat|lucreaza|repara|construieste|a construit|asfalteaza|presteaza|asigura|se ocupa)|(?:ce|care) (?:firm\w*|companii\w*|societati\w*|furnizori\w*)|firm(?:e|ele|elor)|furnizor(?:i|ii|ilor)|castigator(?:i|ii|ilor)|antreprenor(?:i|ii)|constructor(?:i|ii)|companii(?:le)?|societati(?:le)?)\b/],
  ["ranking_authorities", new RegExp(`\\b(?:cine (?:cumpara|cheltuie\\w*|plateste|comanda|a cumparat|au cumparat|achizitioneaza|a cheltuit|au cheltuit|da (?:bani|contracte))|(?:ce|care) (?:institutii|autoritati|cumparatori)|(?:ce|care)(?= (?:${KIND_NOUNS})\\b)|institutii(?:le|lor)?|autoritati(?:le|lor)?|autoritatile contractante|cumparator(?:i|ii|ilor))\\b`)],
  ["breakdown", /\b(?:pe ce(?: (?:se )?(?:cheltuie\w*|duc banii|merg banii|dau banii|da banii|au cheltuit|a cheltuit))?|la ce(?: (?:se )?(?:cheltuie\w*|folosesc|duc banii))?|unde se duc banii|unde merg banii|ce (?:cumpara|a cumparat|au cumparat|achizitioneaza|a achizitionat|cheltuie\w*)|pe ce domenii|categorii(?:le)?|domenii(?:le)?|structura)\b/],
  ["total", /\b(?:cat|cati|cata|cate|costa|costat|a costat|au costat|total(?:ul)?|in total|cheltuit|cheltuiala|cheltuielile|cheltuieli)\b/],
];

const KIND_CUES: [AuthorityKind, RegExp][] = [
  ["consiliu_judetean", /\b(?:consili(?:ul|ului|ile|ilor|i) judetean\w*|consiliile judetene|cj)\b/],
  ["spital", /\b(?:spital(?:e|ele|elor|ul|ului)?)\b/],
  ["scoala", /\b(?:scol(?:i|ile|ilor)|scoala|scolii|licee(?:le|lor)?|liceu(?:l|lui)?|gradinit(?:e|ele|elor|a)|colegii(?:le)?|unitati(?:le)? de invatamant|invatamant\w*)\b/],
  ["comuna", /\b(?:comun(?:e|ele|elor)|primari(?:i|ile|ilor) de comun\w*)\b/],
  ["oras_municipiu", /\b(?:orase(?:le|lor)?|municipii(?:le|lor)?|primari(?:i|ile|ilor) de oras\w*)\b/],
];

/** A singular institution noun opens a named authority ("Spitalul Județean…"). */
const INSTITUTION_NOUN = /\b(?:consiliul|cj|spitalul|liceul|colegiul|scoala|universitatea|directia|compania|inspectoratul|agentia|administratia|regia|institutul|institutia|serviciul|politia|teatrul|muzeul|biblioteca|clubul|centrul|casa|ministerul|autoritatea|oficiul|camera|tribunalul|curtea|parchetul|cnair|anaf)\b/;
/** Words of institution names: never a purchase subject, and they keep a following name from being read as a locality. */
const INSTITUTION_WORD = /^(?:spital\w*|liceu\w*|licee\w*|colegi\w*|scoal\w*|scoli\w*|universitat\w*|directi\w*|inspectorat\w*|agenti\w*|administrati\w*|regia|institut\w*|teatr\w*|muze\w*|bibliotec\w*|club\w*|minister\w*|autoritat\w*|oficiu\w*|tribunal\w*|curte\w*|parchet\w*|primari\w*|consili\w*|judetean\w*|national\w*|gimnazial\w*|tehnolog\w*|teoretic\w*|clinic\w*|municipal\w*|orasenesc|asistenta|sociala|sociale|strada|strazi|strazii|strazile|strazilor|capital\w*|nr|numarul)$/;
/** Words that open or qualify a singular institution name ("Colegiul Național Dimitrie Cantemir"): a name after them is not a locality. */
const INSTITUTION_NAME_CONTEXT = /^(?:spitalul|liceul|colegiul|scoala|universitatea|directia|inspectoratul|agentia|institutul|national|nationala|gimnaziala|tehnologic|teoretic|clinic|judetean|judeteana|municipal|orasenesc|nr|numarul)$/;

/** Acronyms people use for large national buyers. */
const ACRONYMS: Record<string, string> = {
  cnair: "compania nationala de administrare a infrastructurii rutiere",
  cnadnr: "compania nationala de administrare a infrastructurii rutiere",
  anaf: "agentia nationala de administrare fiscala",
  cj: "consiliul judetean",
};

/**
 * SEAP procedure types. The first word alone already means "a procedure"
 * (understood as the contracts stream); the qualifier after it names a
 * procedure type the engine cannot filter on yet.
 */
const PROCEDURE_TYPE = /\b(?:(licitati(?:e|a|ei|i|ile|ilor))\s+(?:deschis(?:a|e)|restrans(?:a|e))|(procedur(?:a|i|ii|ile|ilor))\s+(?:simplificat(?:a|e)|(?:de\s+)?negociere(?:\s+(?:fara|cu)\s+(?:publicare|publicarea)(?:\s+prealabila)?(?:\s+a\s+unui\s+anunt(?:\s+de\s+participare)?)?)?|competitiv(?:a|e))|(negocier(?:e|ea|i|ile))\s+(?:fara|cu)\s+(?:publicare|publicarea)(?:\s+prealabila)?(?:\s+a\s+unui\s+anunt(?:\s+de\s+participare)?)?|(dialog(?:ul)?)\s+competitiv|(cerer(?:e|ea|i|ile))\s+de\s+ofert(?:e|a)|(concurs(?:ul)?)\s+de\s+solutii|(parteneriat(?:ul)?)\s+pentru\s+inovare)\b/;
/** How to narrow a partial list of choices: a locality for institutions and firms, birth data only for people. */
export const ENTITY_HINT = "Scrie numele complet, cu localitatea.";
export const PERSON_HINT = "Scrie numele complet, cu localitatea ori anul nașterii.";
/** Where an institution's name gives way to its place ("… din județul Satu Mare"). */
const PLACE_CUT = /^(?:din|in|la|judetul|judetului|jud|municipiul|orasul|comuna|localitatea)$/;
/** Words institutions' registry names often leave out ("Spitalul Județean Satu Mare" for "… de Urgență Satu Mare"). */
const OPTIONAL_NAME_WORD = /^(?:urgenta|clinic|clinica)$/;

const LEGAL = new Set(["sc", "srl", "sa", "s", "r", "l", "srlv", "pfa", "ii", "if", "snc", "scs", "ra", "spa", "ltd", "gmbh", "sas", "sl", "bv", "nv"]);
/** Generic subject words: never a subject on their own, understood next to a real one. */
const GENERIC_SUBJECT = new Set(["lucrari", "lucrare", "lucrarile", "servicii", "serviciu", "serviciile", "produse", "produs", "echipamente", "echipament", "materiale", "material", "reparatii", "reparatie", "intretinere", "constructii", "constructie", "mentenanta", "furnizare", "livrare", "achizitionare", "bunuri", "dotari", "investitii", "investitie", "proiecte", "proiect", "modernizare", "reabilitare", "chestii", "lucruri"]);
/** Words that only modify a cue ("cel mai mare", "cele mai multe"). */
const MODIFIER = /\b(?:(?:cel|cea|cele|cei) mai (?:mare|mari|mult|multe|multi|multa|bogat\w*|scump\w*|riscant\w*|ridicat\w*|important\w*|mici|mic)|cel mai|cea mai|cele mai|cei mai|in romania|din romania|toata tara|din tara|la nivel national|in total)\b/;

const PREPOSITION = new Set(["in", "din", "la", "pentru", "spre", "catre", "dinspre", "de"]);
/** Place aliases people use for București. */
const PLACE_ALIAS: Record<string, string> = {
  capitalei: "bucuresti", capitala: "bucuresti", "capitala tarii": "bucuresti",
  // names people use for municipalities registered under a longer one
  "turnu severin": "drobeta turnu severin", "tr severin": "drobeta turnu severin", "dr tr severin": "drobeta turnu severin",
  "drobeta": "drobeta turnu severin", "severin": "drobeta turnu severin",
  "campulung muscel": "campulung", "cimpulung muscel": "campulung",
  "sighet": "sighetu marmatiei", "odorhei": "odorheiu secuiesc",
  "rm valcea": "ramnicu valcea", "rm sarat": "ramnicu sarat", "valcea ramnicu": "ramnicu valcea",
};

/** The calendar year in Romania (relative periods follow the visitor's year, not the server's zone). */
export function bucharestYear(now: Date): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Bucharest", year: "numeric" }).format(now));
}

// ------------------------------------------------------------- the engine

/** Connectors inside registry names ("Compania de Utilități Publice" keeps "publice"). */
const NAME_STOP = new Set(["de", "si", "a", "al", "ale", "din", "la", "in", "pentru", "cu", "lui", "le", "pe", "sau"]);

function significant(folded: string): string[] {
  return folded.split(/[^a-z0-9]+/).filter((w) => w && !NAME_STOP.has(w) && !LEGAL.has(w));
}

function typedForName(typedWords: string[], name: string): string[] {
  const n = fold(name).trim();
  // "primăria Buzău" names the UAT itself ("MUNICIPIUL BUZAU")
  if (/^(municipiul|orasul|oras|comuna|sectorul) /.test(n)) return typedWords.filter((w) => !/^(primari\w*|consiliul|local)$/.test(w));
  // "Consiliul Județean Iași" is registered as "JUDETUL IASI" or "JUDETUL CLUJ (CONSILIUL JUDETEAN)"
  if (/^judetul /.test(n)) return typedWords.filter((w) => !/^(consiliul|judetean|cj)$/.test(w));
  return typedWords;
}

/** The town-hall / county-council title word that the typed words replace ("municipiul", "judetul"). */
function titleWordDropped(typedWords: string[], words: string[]): string[] {
  const first = words[0] ?? "";
  if (/^(municipiul|orasul|oras|comuna|sectorul)$/.test(first) && typedWords.some((w) => /^primari/.test(w))) return words.slice(1);
  if (first === "judetul" && typedWords.some((w) => /^(consiliul|cj)$/.test(w))) return words.slice(1);
  return words;
}

/** Every typed word is a word of the name (inflection and light typos allowed). */
function coversName(typedWords: string[], name: string): boolean {
  const words = significant(fold(name));
  const typed = typedForName(typedWords, name);
  if (!typed.length || !words.length) return false;
  const used = new Set<number>();
  for (const t of typed) {
    const k = words.findIndex((w, idx) => !used.has(idx) && (w === t || wordMatches(t, w) || wordMatches(w, t)));
    if (k < 0) return false;
    used.add(k);
  }
  return true;
}

/** Strong name match: every typed word is in the name and the name adds at most two words. */
export function strongNameMatch(typedWords: string[], name: string): boolean {
  if (!coversName(typedWords, name)) return false;
  const words = significant(fold(name));
  const typed = typedForName(typedWords, name);
  const extra = words.length - typed.length;
  return extra <= 2 && extra <= Math.max(1, Math.floor(words.length / 2));
}

/** The name is exactly the typed words (legal forms and connectors aside). */
function sameName(typedWords: string[], name: string): boolean {
  const words = [...new Set(titleWordDropped(typedWords, significant(fold(name))))];
  const typed = [...new Set(typedForName(typedWords, name))];
  return words.length === typed.length && [...typed].sort().join(" ") === [...words].sort().join(" ");
}

/** Every typed word is literally a word of the name (inflected forms aside): "Dimitrie Cantemir Onești" carries "Dimitrie Cantemir". */
function carriesName(typedWords: string[], name: string): boolean {
  const words = significant(fold(name));
  const typed = typedForName(typedWords, name);
  return typed.length > 0 && typed.every((t) => words.some((w) => w === t || stems(w).includes(t) || stems(t).includes(w)));
}

type Resolution =
  | { kind: "one"; role: "authority" | "supplier"; hit: EntityHit }
  | { kind: "many"; role: "authority" | "supplier"; hits: EntityHit[]; total: number }
  | { kind: "none" };

function confidenceLabel(c: number): Interpretation["confidenceLabel"] {
  return c >= 0.75 ? "high" : c >= 0.5 ? "medium" : c > 0 ? "low" : "none";
}

function emptyInterpretation(text: string, id: string): Interpretation {
  return {
    text, interpreter: id, intent: null, intentSource: null, otherIntents: [], dimHint: null,
    subjects: [], place: null, placeAlternatives: [], placeAmbiguous: false, authorityKind: null,
    authority: null, supplier: null, entityAlternatives: [], choicesPartial: null, compareWith: null, person: null, personAlternatives: [],
    period: null, dataset: null, singleBidder: false, measure: null, topN: null, superlative: false,
    employees: null, leftover: [], confidence: 0, confidenceLabel: "none", notes: [], placeNote: null,
    compareChoices: [], askedTownHalls: false,
  };
}

export class RulesInterpreter implements QuestionInterpreter {
  readonly id = RULES_INTERPRETER_ID;
  constructor(private readonly vocab: Vocabulary) {}

  async interpret(input: string, context: InterpretContext): Promise<Interpretation> {
    const text = input.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);
    const out = emptyInterpretation(text, this.id);
    const tokens = tokenize(text);
    if (!tokens.length) return out;
    const c = new Cursor(tokens);
    const year = bucharestYear(context.now);
    const places = await this.vocab.places();
    const byKey = new Map<string, PlaceEntry[]>();
    for (const p of places) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);

    this.periods(c, out, year);
    this.modifiers(c, out);
    await this.fiscalCodes(c, out);
    await this.people(c, out);
    const cues = this.cues(c, out);
    this.kinds(c, out);
    const compareCue = cues.find((x) => x.intent === "compare")?.at ?? null;
    await this.institutions(c, out, compareCue !== null);
    await this.compare(c, out, compareCue);
    await this.suppliersByMarker(c, out);
    // Place names before subjects: "Alba Iulia", "Satu Mare", "Constanța" are places, not cabbage, sole or consultancy.
    const marked = this.markedPlaces(c, out, byKey);
    const unmarked = this.unmarkedPlaces(c, byKey);
    await this.namedRuns(c, out);
    await this.subjects(c, out);
    this.settlePlaces([...marked, ...unmarked].sort((a, b) => a.from - b.from), out);
    await this.choicesInPlace(out);
    if (cues.some((x) => x.intent === "signals")) await this.townHall(out);
    await this.leftoverEntity(c, out);
    this.settleIntent(cues, out);
    this.leftover(c, out);
    this.score(c, out);
    return out;
  }

  // --------------------------------------------------------------- periods
  private periods(c: Cursor, out: Interpretation, year: number) {
    // future years have no data and are not a question about the past
    const ok = (y: number) => y >= 2000 && y <= year;
    const set = (h: Hit, from?: number, to?: number) => {
      if ((from !== undefined && !ok(from)) || (to !== undefined && !ok(to))) {
        c.take(h.i, h.j, "blocked");
        out.notes.push(`Perioada „${c.span(h.i, h.j).text}” nu are încă date (suntem în ${year}); nu am aplicat-o.`);
        return;
      }
      if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
      c.take(h.i, h.j, "period");
      if (out.period) {
        out.notes.push(`Am folosit prima perioadă din întrebare; „${c.span(h.i, h.j).text}” nu a fost aplicată.`);
        return;
      }
      out.period = { ...(from !== undefined ? { yearFrom: from } : {}), ...(to !== undefined ? { yearTo: to } : {}), matched: c.span(h.i, h.j) };
    };
    const n = (s: string | undefined) => (s === undefined ? NaN : /^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] ?? NaN);
    const rules: [RegExp, (m: RegExpExecArray) => [number | undefined, number | undefined]][] = [
      [new RegExp(`\\b(?:(?:intre|din|de la|in perioada)\\s+)?(?:anii\\s+|anul\\s+)?${YR}\\s+(?:si|pana in|pana la|pina in|pina la|la|spre)\\s+(?:anul\\s+)?${YR}\\b`), (m) => [Number(m[1]), Number(m[2])]],
      [new RegExp(`\\b(?:(?:in|pe|din)\\s+)?(?:anii\\s+)?${YR}\\s+${YR}\\b`), (m) => [Number(m[1]), Number(m[2])]],
      [new RegExp(`\\b(?:pana|pina)(?:\\s+(?:in|la))?\\s+(?:anul\\s+)?${YR}(?:\\s+inclusiv)?\\b`), (m) => [undefined, Number(m[1])]],
      [new RegExp(`\\binainte de\\s+(?:anul\\s+)?${YR}\\b`), (m) => [undefined, Number(m[1]) - 1]],
      [new RegExp(`\\bdupa\\s+(?:anul\\s+)?${YR}\\b`), (m) => [Number(m[1]) + 1, undefined]],
      [new RegExp(`\\b(?:din|incepand cu|incepand din|de la|de prin)\\s+(?:anul\\s+)?${YR}(?:\\s+(?:incoace|pana azi|pana acum|pana in prezent|pana astazi))?\\b`), (m) => [Number(m[1]), undefined]],
      [/\b(?:in\s+|pe\s+|din\s+)?ultimii\s+(\d{1,2}|doi|trei|patru|cinci|sase|sapte|opt|noua|zece)\s+ani\b/, (m) => { const k = Math.max(1, Math.min(20, n(m[1]))); return [year - k + 1, year]; }],
      [/\b(?:in\s+)?ultimii\s+ani\b/, () => [year - 2, year]],
      [/\b(?:in\s+|pe\s+|din\s+)?anul\s+(?:trecut|precedent)\b/, () => [year - 1, year - 1]],
      [/\b(?:in\s+|pe\s+)?(?:anul\s+(?:acesta|asta|curent|in curs)|acest an)\b/, () => [year, year]],
      [/\bacum\s+(\d|doi|trei|patru|cinci)\s+ani\b/, (m) => [year - n(m[1]), year - n(m[1])]],
      [new RegExp(`\\b(?:(?:in|pe|pentru|din)\\s+)?(?:anul\\s+)?${YR}\\b`), (m) => [Number(m[1]), Number(m[1])]],
    ];
    for (const [re, toYears] of rules) {
      for (const h of c.all(re)) {
        const [from, to] = toYears(h.m);
        if ((from !== undefined && Number.isNaN(from)) || (to !== undefined && Number.isNaN(to))) continue;
        set(h, from, to);
      }
    }
  }

  // ------------------------------------------------- dataset, size, top N
  private modifiers(c: Cursor, out: Interpretation) {
    const once = (re: RegExp, apply: (m: RegExpExecArray) => void, tag: Tag = "modifier") => {
      for (const h of c.all(re)) { c.take(h.i, h.j, tag); apply(h.m); }
    };
    once(/\b(?:cu\s+)?(?:un\s+singur\s+ofertant|o\s+singura\s+oferta|un\s+singur\s+participant|ofertant\s+unic|unic\s+ofertant|singurul\s+ofertant|(?:o\s+)?ofert(?:a|e|ele)\s+unic(?:a|e)|fara\s+(?:concurenta|competitie|concurs))\b/, () => { out.singleBidder = true; });
    // SEAP procedure types: always procedures (contracts), never a purchase subject ("deschisă" is not a letter opener)
    for (const h of c.all(PROCEDURE_TYPE)) {
      c.take(h.i, h.i + 1, "modifier");
      c.take(h.i + 1, h.j, "blocked");
      if (out.dataset !== "da") out.dataset = "contracts";
      out.notes.push(`Nu putem filtra încă după tipul procedurii („${c.span(h.i, h.j).text}”); am folosit toate contractele atribuite prin proceduri.`);
    }
    once(/\b(?:achizitii(?:le|lor)?|cumparari(?:le|lor)?|cumparaturi(?:le|lor)?)\s+direct(?:e|a)\b|\bachizitie\s+directa\b|\bachizitia\s+directa\b|\bin\s+mod\s+direct\b/, () => { out.dataset = "da"; });
    // "cele mai multe licitații": the number of records, before "licitații" is read as the stream
    once(/\b(?:cele mai multe|cei mai multi|cel mai des)(?=\s+(?:contracte|contractele|achizitii|achizitiile|licitatii|licitatiile|cumparari))/, () => { if (out.measure === null) out.measure = "count"; });
    once(/\b(?:licitati(?:e|i|ile|ilor)|proceduri(?:le|lor)?|procedura|procedurii)\b/, () => { if (out.dataset !== "da") out.dataset = "contracts"; });
    once(/\b(?:pe|per)\s+(?:cap\s+de\s+)?locuitor\b|\bpe\s+cap\s+de\s+om\b/, () => { out.measure = "value_per_capita"; });
    once(/\b(?:cate|numarul(?:\s+de)?|cat de multe)\s+(?:achizitii|contracte|cumparari|licitatii)\b|\bde cate ori\b/, () => { if (out.measure === null) out.measure = "count"; });
    once(/\b(?:top|primele|primii|primul|primele cele)\s+(\d{1,3}|cinci|zece|trei|douazeci|cincizeci|cincisprezece)\b/, (m) => {
      const k = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!] ?? 10;
      out.topN = Math.max(1, Math.min(50, k));
      if (k > 50) out.notes.push("Arătăm cel mult 50 de rânduri; lista surselor păstrează toată selecția.");
    });
    once(/\b(\d{1,2})(?=\s+(?:cele mai |cei mai )?(?:mari |importante )?(?:firme|institutii|furnizori|companii|primarii|spitale|scoli|comune))/, (m) => { out.topN = Math.max(1, Math.min(50, Number(m[1]))); });
    once(/\b(?:cu\s+)?(sub|peste|cel mult|cel putin|maxim|minim|mai putin de|mai mult de)\s+(\d{1,6})\s+(?:de\s+)?angajat(?:i|ii)?\b/, (m) => {
      const k = Number(m[2]);
      out.employees = /^(sub|mai putin de)$/.test(m[1]!) ? { max: Math.max(0, k - 1) } : /^(cel mult|maxim)$/.test(m[1]!) ? { max: k } : /^(peste|mai mult de)$/.test(m[1]!) ? { min: k + 1 } : { min: k };
    });
    once(/\bfara\s+angajat(?:i|ii)\b/, () => { out.employees = { max: 0 }; });
    once(/(?<=\b(?:firme|firmele|companii|companiile|furnizori)\s)mici\b/, () => { out.employees = { max: 49 }; out.notes.push("„Firme mici” = cel mult 49 de angajați, din ultimul bilanț depus; firmele fără bilanț sunt excluse."); });
    once(/(?<=\b(?:firme|firmele|companii|companiile|furnizori)\s)mari\b/, () => { out.employees = { min: 250 }; out.notes.push("„Firme mari” = cel puțin 250 de angajați, din ultimul bilanț depus; firmele fără bilanț sunt excluse."); });
    // "care firmă / care spital": one superlative entity; the noun stays for kinds and dims
    for (const h of c.all(/\b(?:care|ce)\s+(institutie|firma|primarie|spital|scoala|companie|societate|autoritate)\b/)) {
      out.superlative = true;
      const noun = h.m[1]!;
      if (/^(firma|companie|societate)$/.test(noun)) { out.dimHint = "supplier"; c.take(h.i, h.j, "cue"); }
      else if (/^(institutie|autoritate|primarie)$/.test(noun)) {
        out.dimHint = "authority";
        c.take(h.i, h.j, "cue");
        if (noun === "primarie") {
          out.askedTownHalls = true;
          out.notes.push("Nu putem restrânge clasamentul doar la primării (primăriile de comună și de oraș sunt tipuri separate); clasamentul cuprinde toate instituțiile.");
        }
      }
      else { out.dimHint = "authority"; c.take(h.i, h.i + 1, "cue"); }
    }
    for (const h of c.all(MODIFIER)) c.take(h.i, h.j, "modifier");
  }

  private cues(c: Cursor, out: Interpretation): { intent: IntentKind; at: number }[] {
    const found: { intent: IntentKind; at: number }[] = [];
    for (const [intent, re] of INTENT_CUES) {
      for (const h of c.all(re)) {
        c.take(h.i, h.j, "cue");
        found.push({ intent, at: h.i });
        if (intent === "ranking_suppliers") out.dimHint = out.dimHint ?? "supplier";
        if (intent === "ranking_authorities") out.dimHint = out.dimHint ?? "authority";
        if (intent === "total" && /^cate$/.test(h.m[0]) && out.measure === null) out.measure = "count";
      }
    }
    // a lone "cine" still asks for a ranking
    for (const h of c.all(/\bcine\b/)) { c.take(h.i, h.j, "cue"); found.push({ intent: "ranking_suppliers", at: h.i }); }
    // "care firmă …" / "care instituție …" is itself a (one-row) ranking
    if (out.superlative && out.dimHint && !found.some((x) => x.intent.startsWith("ranking")))
      found.push({ intent: out.dimHint === "supplier" ? "ranking_suppliers" : "ranking_authorities", at: 0 });
    // "primării" alone has no kind in the engine: say what the ranking covers
    for (const h of c.all(/\bprimari(?:i|ile|ilor)\b/)) {
      c.take(h.i, h.j, "kind");
      if (!out.authorityKind) out.askedTownHalls = true;
      if (out.measure !== "value_per_capita" && !out.authorityKind)
        out.notes.push("Nu putem restrânge clasamentul doar la primării (primăriile de comună și de oraș sunt tipuri separate); arătăm toate instituțiile. Valoarea pe locuitor se calculează doar pentru primării.");
    }
    return found;
  }

  private kinds(c: Cursor, out: Interpretation) {
    for (const [kind, re] of KIND_CUES) {
      // a singular institution noun followed by a name is a named authority (handled next)
      for (const h of c.all(re)) {
        const word = c.f(h.i);
        const singular = /^(spitalul|scoala|liceul|colegiul)$/.test(word) || (/^(consiliul|cj)$/.test(word) && (word === "cj" || c.f(h.i + 1) === "judetean"));
        if (singular && h.j < c.tokens.length && c.isFree(h.j, h.j + 1) && !PREPOSITION.has(c.f(h.j)) && !STOPWORDS.has(c.f(h.j))) continue;
        c.take(h.i, h.j, "kind");
        if (!out.authorityKind) out.authorityKind = { kind, matched: c.span(h.i, h.j) };
      }
    }
  }

  // ------------------------------------------------------------ entities
  /**
   * Resolve typed words to one registry identity. Exactly one entity with
   * exactly this name → that entity. Several entities with that name, or a
   * partial name carried by several → "many" (choices). A partial name is
   * picked only when the complete list holds a single entity carrying it.
   */
  private async resolve(role: "authority" | "supplier", typedWords: string[]): Promise<Resolution> {
    const typed = typedWords.filter((w) => w.length > 0);
    if (!typed.length) return { kind: "none" };
    const { hits, total } = await this.vocab.entities(role, typed.join(" "));
    const loose = hits.filter((e) => coversName(typed, e.name));
    const exact = loose.filter((e) => sameName(typed, e.name));
    const complete = total <= hits.length;
    // a unique exact name wins only when no other entity's name contains it ("Colegiul X" vs "Colegiul X Onești")
    const containing = loose.filter((e) => e !== exact[0] && carriesName(typed, e.name));
    if (exact.length === 1 && !containing.length && (complete || loose.length === exact.length)) return { kind: "one", role, hit: exact[0]! };
    // "primăria X" is the UAT itself; bodies named after it ("Municipiul X - Serviciul …") are other buyers
    if (exact.length === 1 && typed.some((w) => /^(primari\w*|consiliul|cj)$/.test(w))) return { kind: "one", role, hit: exact[0]! };
    if (exact.length > 1) return { kind: "many", role, hits: exact, total: exact.length };
    if (exact.length === 1) return { kind: "many", role, hits: [exact[0]!, ...containing, ...loose.filter((e) => e !== exact[0] && !containing.includes(e))], total: complete ? loose.length : Math.max(total, loose.length) };
    if (loose.length === 1 && complete) return { kind: "one", role, hit: loose[0]! };
    if (loose.length) {
      // closest names first; the count is every entity carrying the words
      const ordered = [...loose.filter((e) => strongNameMatch(typed, e.name)), ...loose.filter((e) => !strongNameMatch(typed, e.name))];
      return { kind: "many", role, hits: ordered, total: complete ? loose.length : Math.max(total, loose.length) };
    }
    return { kind: "none" };
  }

  private applyResolution(r: Resolution, out: Interpretation, span: Span, search: string): "one" | "many" | "none" {
    if (r.kind === "one") {
      const match: EntityMatch = { role: r.role, id: r.hit.id, name: r.hit.name, county: r.hit.county, matched: span };
      if (r.role === "supplier") {
        out.supplier = match;
        if (out.dimHint === "supplier") out.dimHint = "authority";
      } else out.authority = match;
      return "one";
    }
    if (r.kind === "many") {
      const shown = r.hits.slice(0, 6);
      out.entityAlternatives = shown.map((e) => ({ role: r.role, id: e.id, name: e.name, county: e.county, matched: span }));
      if (r.total > shown.length) out.choicesPartial = { shown: shown.length, total: r.total, search, hint: ENTITY_HINT };
      out.notes.push(`${r.total} ${r.role === "supplier" ? "firme" : "instituții"} se potrivesc cu „${span.text}”.`);
      return "many";
    }
    return "none";
  }

  /** "Spitalul Județean de Urgență Buzău", "Compania Națională …": a named authority. */
  private async institutions(c: Cursor, out: Interpretation, comparing: boolean) {
    for (const h of c.all(INSTITUTION_NOUN)) {
      if (out.authority || out.entityAlternatives.length) break;
      // "spitalul din Buzău": a kind and a place, not a name
      if (h.j < c.tokens.length && /^(din|la|in|pentru)$/.test(c.f(h.j)) && !/^(cnair|anaf|cj)$/.test(c.f(h.i))) continue;
      // "consiliul local" is a town hall (a place marker), not a named institution
      if (c.f(h.i) === "consiliul" && c.f(h.j) !== "judetean") continue;
      let end = h.j;
      // "și" belongs to names ("… Asistență Socială și Protecția Copilului Iași") unless two names are compared
      const stop = comparing ? /^(si|sau|cu|vs)$/ : /^(sau|cu|vs)$/;
      while (end < c.tokens.length && end - h.i < 12 && !c.used[end] && !stop.test(c.f(end))) end++;
      while (end > h.j && NAME_STOP.has(c.f(end - 1))) end--;
      const acronym = /^(cnair|anaf|cj)$/.test(c.f(h.i));
      if (end - h.i < 2 && !acronym) continue;
      // the longest name first, then shorter ones ("Ministerul Sănătății medicamente" → "Ministerul Sănătății")
      let resolved = false;
      const ends: number[] = [];
      for (let j = end; j > h.i && ends.length < 3; j--) {
        if (j - h.i < 2 && !acronym) break;
        if (NAME_STOP.has(c.f(j - 1))) continue;
        ends.push(j);
      }
      // "spitalul județean de urgență din județul Satu Mare": the name ends before the place
      let cut = -1;
      for (let k = h.j; k < end && cut < 0; k++) if (PLACE_CUT.test(c.f(k)) && k - h.i >= 2) cut = k;
      if (cut > 0 && !ends.includes(cut)) ends.push(cut);
      for (const j of ends) {
        const words = c.tokens.slice(h.i, j).flatMap((t) => (ACRONYMS[t.f] ?? t.f).split(" "));
        const typed = significant(words.join(" "));
        let resolution = await this.resolve("authority", typed);
        // "Spitalul Județean de Urgență Satu Mare" is registered as "SPITALUL JUDETEAN SATU MARE"
        const relaxed = typed.filter((w) => !OPTIONAL_NAME_WORD.test(w)).map((w) => (w === "judeteana" ? "judetean" : w));
        const left = c.tokens.slice(h.i, j).filter((t) => OPTIONAL_NAME_WORD.test(t.f)).map((t) => t.raw);
        let usedRelaxed = false;
        if (resolution.kind === "none" && relaxed.length >= 2 && relaxed.join(" ") !== typed.join(" ")) {
          resolution = await this.resolve("authority", relaxed);
          usedRelaxed = resolution.kind !== "none";
        }
        const result = this.applyResolution(resolution, out, c.span(h.i, j), rawSpan(c.tokens, h.i, j));
        if (result !== "none") {
          c.take(h.i, j, "entity");
          resolved = true;
          if (usedRelaxed && left.length) out.notes.push(`Niciun nume din SEAP nu are și ${left.length > 1 ? "cuvintele" : "cuvântul"} „${left.join(" ")}”; am căutat instituția fără ${left.length > 1 ? "ele" : "el"}.`);
          break;
        }
      }
      if (resolved) break;
      // a name we cannot resolve stays a name: reported, never a subject or a place (a place after it stays a place)
      const nameEnd = cut > 0 ? cut : end;
      if (!/^(spitalul|scoala|liceul|colegiul|consiliul|cj)$/.test(c.f(h.i))) {
        c.take(h.i, nameEnd, "blocked");
        out.notes.push(`Nu am găsit instituția „${c.span(h.i, nameEnd).text}”. Scrie numele complet, de exemplu cu localitatea.`);
      } else c.take(h.i + 1, nameEnd, "blocked");
    }
    // singular nouns without a (resolvable) name fall back to their kind ("spitalul din Buzău")
    if (!out.authority && !out.entityAlternatives.length) {
      for (const h of c.all(/\b(?:spitalul|scoala|liceul|colegiul|consiliul judetean|cj)\b/)) {
        c.take(h.i, h.j, "kind");
        const kind: AuthorityKind = c.f(h.i) === "spitalul" ? "spital" : /^(consiliul|cj)$/.test(c.f(h.i)) ? "consiliu_judetean" : "scoala";
        if (!out.authorityKind) out.authorityKind = { kind, matched: c.span(h.i, h.j) };
      }
    }
  }

  // ---------------------------------------------------------------- places
  /** Longest place name starting at token i (1–4 words), exact or one typo. */
  private placeAt(c: Cursor, i: number, byKey: Map<string, PlaceEntry[]>, fuzzy: boolean): { j: number; entries: PlaceEntry[] } | null {
    for (let len = Math.min(4, c.tokens.length - i); len >= 1; len--) {
      if (!c.isFree(i, i + len)) continue;
      const raw = c.tokens.slice(i, i + len).map((t) => t.f);
      if (STOPWORDS.has(raw[0]!) || STOPWORDS.has(raw[raw.length - 1]!)) continue;
      const joined = raw.join(" ");
      const key = placeKey((PLACE_ALIAS[joined] ?? joined).replace(/^rm\b/, "ramnicu").replace(/^tg\b/, "targu").replace(/^sf\b/, "sfantu").replace(/^cimpulung\b/, "campulung"));
      const exact = byKey.get(key);
      if (exact) return { j: i + len, entries: exact };
      if (fuzzy && key.length >= 7) {
        const near = [...byKey.entries()].filter(([k]) => Math.abs(k.length - key.length) <= 1 && k[0] === key[0] && k.slice(0, 3) === key.slice(0, 3) && lev(key, k, 1) <= 1);
        if (near.length === 1) return { j: i + len, entries: near[0]![1] };
      }
    }
    return null;
  }

  private markedPlaces(c: Cursor, out: Interpretation, byKey: Map<string, PlaceEntry[]>): PlaceFound[] {
    const found: PlaceFound[] = [];
    const markers: [RegExp, PlaceFound["constraint"]][] = [
      [/\bjud(?:etul|etului|et)?\b/, "county"],
      [/\b(?:primari(?:a|ei)|consiliul local)(?:\s+(?:din|de la|al|a|lui|municipiului|orasului|comunei))?\b/, "locality"],
      [/\b(?:municipiul|municipiului)\b/, "municipiu"],
      [/\b(?:orasul|orasului|oras)\b/, "oras"],
      [/\b(?:comuna|comunei)\b/, "comuna"],
      [/\b(?:localitatea|localitatii|satul|satului)\b/, "locality"],
      [/\b(?:in|din|la|de la|pentru|spre)\b/, "any"],
    ];
    // "sectorul 3", "primăria sectorului 3"
    for (const h of c.all(/\b(?:primari(?:a|ei)\s+)?sector(?:ul|ului)?\s+([1-6])\b/)) {
      const entries = byKey.get(`sectorul ${h.m[1]}`) ?? [];
      if (!entries.length) continue;
      c.take(h.i, h.j, "place");
      found.push({ from: h.i, to: h.j, entries, constraint: "locality", span: c.span(h.i, h.j) });
    }
    for (const [re, constraint] of markers) {
      for (const h of c.all(re)) {
        const at = this.placeAt(c, h.j, byKey, true);
        if (!at) {
          if (constraint === "locality" && /^primari/.test(c.f(h.i))) {
            c.take(h.i, h.i + 1, "filler");
            out.notes.push("Nu am recunoscut numele primăriei. Scrie localitatea, de exemplu „primăria din Râmnicu Sărat”.");
          }
          continue;
        }
        const entries = at.entries.filter((e) => fits(e, constraint));
        if (!entries.length) continue;
        c.take(h.i, at.j, "place");
        found.push({ from: h.i, to: at.j, entries, constraint, span: c.span(h.i, at.j) });
      }
    }
    // "primărie" with no name: understood as a word, not a purchase
    for (const h of c.all(/\bprimari(?:e|a|ei)\b/)) {
      c.take(h.i, h.j, "filler");
      out.notes.push("Nu am recunoscut numele primăriei. Scrie localitatea, de exemplu „primăria din Râmnicu Sărat”.");
    }
    return found;
  }

  private unmarkedPlaces(c: Cursor, byKey: Map<string, PlaceEntry[]>): PlaceFound[] {
    const found: PlaceFound[] = [];
    for (let i = 0; i < c.tokens.length; i++) {
      if (c.used[i]) continue;
      const at = this.placeAt(c, i, byKey, false);
      if (!at) continue;
      const single = at.j - i === 1;
      const counties = at.entries.filter((e) => e.kind === "county");
      // a lone common-looking word is a place only when it is a county or long enough to be a name
      if (single && !counties.length && c.f(i).length < 5) continue;
      // "firmele lui Matei": a person, not the commune Matei
      if (i > 0 && /^(lui|domnul|doamna|dl|dna|administratorul)$/.test(c.f(i - 1))) continue;
      // "Colegiul Național Dimitrie Cantemir": part of an institution's name, not the commune
      if (!counties.length && [1, 2, 3].some((d) => i - d >= 0 && c.used[i - d] !== "kind" && INSTITUTION_NAME_CONTEXT.test(c.f(i - d)))) continue;
      c.take(i, at.j, "place");
      found.push({ from: i, to: at.j, entries: at.entries, constraint: "any", span: c.span(i, at.j) });
      i = at.j - 1;
    }
    return found;
  }

  /** Choose the place; ambiguous names become alternatives, never a guess. */
  private settlePlaces(found: PlaceFound[], out: Interpretation) {
    if (!found.length) return;
    const explicitLocality = (f: PlaceFound) => ["locality", "municipiu", "oras", "comuna"].includes(f.constraint);
    const hasCounty = (f: PlaceFound) => f.entries.some((e) => e.kind === "county");
    const onlyLocality = (f: PlaceFound) => !hasCounty(f);
    const pick = found.find(explicitLocality) ?? found.find(onlyLocality) ?? found[0]!;
    // Another county in the question qualifies an ambiguous locality ("Sălcioara, Ialomița").
    const qualifierFound = found.find((f) => f !== pick && hasCounty(f) && f.constraint !== "locality");
    const qualifier = qualifierFound?.entries.find((e) => e.kind === "county")?.county ?? null;
    const match = (e: PlaceEntry, span: Span = pick.span): PlaceMatch => ({
      kind: e.kind, county: e.county, ...(e.siruta !== undefined ? { siruta: e.siruta } : {}), ...(e.tip ? { tip: e.tip } : {}),
      name: e.name, label: e.label, matched: span,
    });
    const countyMatch = (county: string): PlaceMatch => ({
      kind: "county", county, name: county === "București" ? "București" : `Județul ${county}`,
      label: county === "București" ? "București (tot municipiul)" : `Județul ${county}`, matched: pick.span,
    });
    const byPopulation = (a: PlaceEntry, b: PlaceEntry) => (b.population ?? 0) - (a.population ?? 0);
    const counties = pick.entries.filter((e) => e.kind === "county");
    let locs = pick.entries.filter((e) => e.kind === "locality");
    let usedQualifier = false;
    if (qualifier && onlyLocality(pick) && locs.some((e) => e.county === qualifier)) {
      locs = locs.filter((e) => e.county === qualifier);
      usedQualifier = true;
    }
    const extra = found.filter((f) => f !== pick && !(usedQualifier && f === qualifierFound));
    if (extra.length) out.notes.push(`Am folosit un singur loc; „${extra.map((f) => f.span.text).join("”, „")}” nu a fost aplicat.`);
    if (counties.length && !explicitLocality(pick)) {
      const county = counties[0]!;
      out.place = match(county);
      // the county seat of the same name, e.g. Municipiul Buzău
      out.placeAlternatives = out.authorityKind ? [] : locs.filter((e) => e.county === county.county).sort(byPopulation).slice(0, 2).map((e) => match(e));
      if (out.placeAlternatives.length && pick.constraint === "any")
        out.placeNote = (county.county === "București"
          ? "Am ales tot Bucureștiul, adică toate instituțiile din oraș și din sectoare; poți alege doar Primăria Municipiului București."
          : `„${county.county}” poate fi județul sau ${out.placeAlternatives[0]!.name}. Am ales județul, adică toate instituțiile din județ; poți alege doar primăria ${genitive(out.placeAlternatives[0]!)}.`);
      return;
    }
    if (locs.length === 1) {
      out.place = match(locs[0]!);
      // a locality means its town hall; the whole county is one click away
      out.placeAlternatives = [countyMatch(locs[0]!.county)];
      return;
    }
    out.placeAmbiguous = true;
    out.placeAlternatives = [...locs].sort(byPopulation).slice(0, 6).map((e) => match(e));
    const bare = locs[0]!.name.replace(/^(Comuna|Orașul|Municipiul) /, "");
    const where = [...new Set(locs.map((e) => e.county))];
    out.placeNote = `Există ${locs.length} localități cu numele „${bare}”, în ${where.length > 1 ? `${where.slice(0, -1).join(", ")} și ${where.at(-1)}` : where[0]}.`;
  }

  // ---------------------------------------------------------- fiscal codes
  /** "RO4305857", "RO 4305857", "CUI 4305857": the firm or institution registered with that fiscal code. */
  private async fiscalCodes(c: Cursor, out: Interpretation) {
    if (!this.vocab.entitiesByCui) return;
    const h = c.first(/\b(?:ro(\d{2,10})|(?:ro|cui|cif|cod(?:ul)?\s+fiscal|codul\s+de\s+identificare\s+fiscala)\s+(?:ro\s*)?(\d{2,10}))\b/);
    if (!h) return;
    const cui = h.m[1] ?? h.m[2]!;
    const span = c.span(h.i, h.j);
    const found = await this.vocab.entitiesByCui(cui);
    if (!found.length) {
      c.take(h.i, h.j, "blocked");
      out.notes.push(`Nu am găsit o firmă sau o instituție cu codul fiscal „${span.text}”.`);
      return;
    }
    c.take(h.i, h.j, "entity");
    if (found.length === 1) {
      this.applyResolution({ kind: "one", role: found[0]!.role, hit: found[0]!.hit }, out, span, span.text);
      return;
    }
    out.entityAlternatives = found.map(({ role, hit }) => ({ role, id: hit.id, name: hit.name, county: hit.county, matched: span }));
    out.notes.push(`Codul fiscal „${span.text}” aparține mai multor rânduri din date (firmă și instituție sau mai multe identități). Alege-l pe cel la care te gândești.`);
  }

  // --------------------------------------------------------- persons, firms
  private async people(c: Cursor, out: Interpretation) {
    const h = c.first(/\b(?:(?:firmele|firmelor|companiile|societatile|afacerile)\s+(?:lui|conduse de|administrate de|detinute de|ale lui)|conduse de|administrate de|detinute de|administratorul|administratoarea|patronul|patroana|omul de afaceri|afaceristul)\b/);
    if (!h) return;
    let end = h.j;
    while (end < c.tokens.length && end - h.j < 4 && !c.used[end] && !STOPWORDS.has(c.f(end)) && !PREPOSITION.has(c.f(end))) end++;
    if (end === h.j) {
      // "firmele lui …" without a name: never a national ranking nobody asked for
      c.take(h.i, h.j, "blocked");
      out.notes.push("Scrie numele persoanei ale cărei firme vrei să le vezi.");
      return;
    }
    if (end - h.j < 2) return;
    if (/^(firmele|firmelor|companiile|societatile|afacerile)$/.test(c.f(h.i))) out.dimHint = out.dimHint ?? "supplier";
    const words = c.tokens.slice(h.j, end).map((t) => t.f);
    const typedName = rawSpan(c.tokens, h.j, end);
    // ONRC writes the surname first ("POPESCU ION"); people write it last. Exact names only: "Maria" is not "Marian".
    const orders = [...new Set([words.join(" "), [...words.slice(1), words[0]!].join(" "), [...words].reverse().join(" ")])];
    if (!personPatterns(orders).patterns.length) {
      // only letters that may carry diacritics: no index can find it safely
      c.take(h.i, h.j, "filler");
      c.take(h.j, end, "blocked");
      out.notes.push(`Numele „${typedName}” e prea scurt pentru o căutare sigură în Registrul Comerțului. Scrie numele complet al persoanei.`);
      return;
    }
    const { hits, total, exhaustive = true, timedOut = false } = await this.vocab.personsNamed(orders);
    if (timedOut) {
      c.take(h.i, h.j, "filler");
      c.take(h.j, end, "blocked");
      out.notes.push(`Căutarea numelui „${typedName}” în Registrul Comerțului a durat prea mult. Scrie numele complet al persoanei sau încearcă din nou.`);
      return;
    }
    const asMatch = (p: PersonHit): PersonMatch => ({ ...p, matched: c.span(h.i, end) });
    if (total === 1 && hits.length === 1 && exhaustive) {
      c.take(h.i, end, "person");
      out.person = asMatch(hits[0]!);
      return;
    }
    if (total === 0) {
      // the name stays a name: reported, never read as a commune or a firm
      c.take(h.i, h.j, "filler");
      c.take(h.j, end, "blocked");
      out.notes.push(exhaustive
        ? `Nu am găsit în Registrul Comerțului o persoană cu numele „${typedName}” (cu data nașterii cunoscută).`
        : `Nu am găsit în Registrul Comerțului o persoană cu numele „${typedName}” scris exact așa. Același nume scris cu diacritice nu a putut fi căutat sigur; scrie-l cu diacritice sau complet.`);
      return;
    }
    c.take(h.i, end, "person");
    // identical labels (same name, birth year and locality) are one choice for a reader
    const label = (p: PersonHit) => `${fold(p.name)}|${p.birthYear ?? ""}|${fold(p.birthLocality ?? "").replace(/[^a-z]+/g, " ").trim()}`;
    const unique = [...new Map(hits.map((p) => [label(p), p])).values()];
    out.personAlternatives = unique.map(asMatch);
    if (total > hits.length) out.choicesPartial = { shown: unique.length, total, search: typedName, hint: PERSON_HINT };
    out.notes.push(total === 1
      ? `Am găsit o persoană cu numele „${typedName}” scris exact așa. Același nume scris cu diacritice nu a putut fi căutat sigur; alege persoana dacă este cea la care te gândești.`
      : `${total} persoane se numesc „${typedName}” în Registrul Comerțului. ${total > hits.length ? `Arătăm primele ${unique.length}, cele cu cele mai multe firme. ` : ""}${exhaustive ? "" : "Variantele scrise cu diacritice nu au putut fi căutate sigur. "}Alege persoana după anul și locul nașterii.`);
  }

  private async suppliersByMarker(c: Cursor, out: Interpretation) {
    if (out.supplier) return;
    const marker = c.first(/\b(?:firma|firmei|societatea|societatii|compania|companiei|furnizorul|furnizorului|constructorul|sc)\b/);
    const suffix = c.first(/\b(?:srl|sa)\b/);
    let from = -1, to = -1, consumeFrom = -1;
    if (marker) {
      from = marker.j; consumeFrom = marker.i;
      to = from;
      while (to < c.tokens.length && to - from < 6 && !c.used[to] && !(STOPWORDS.has(c.f(to)) && !LEGAL.has(c.f(to))) && !PREPOSITION.has(c.f(to))) to++;
    } else if (suffix) {
      to = suffix.j;
      from = suffix.i;
      while (from > 0 && suffix.i - from < 5 && !c.used[from - 1] && !STOPWORDS.has(c.f(from - 1)) && !PREPOSITION.has(c.f(from - 1))) from--;
      consumeFrom = from;
    }
    if (from < 0 || to <= from) return;
    const typed = significant(c.tokens.slice(from, to).map((t) => t.f).join(" "));
    if (!typed.length) return;
    const result = this.applyResolution(await this.resolve("supplier", typed), out, c.span(consumeFrom, to), rawSpan(c.tokens, from, to));
    if (result !== "none") c.take(consumeFrom, to, "entity");
    else {
      c.take(consumeFrom, from, "filler");
      c.take(from, to, "blocked");
      out.notes.push(`Nu am găsit firma „${c.span(from, to).text}”.`);
    }
  }

  /**
   * A run of words that holds a word unknown to the subject vocabulary and
   * names one firm exactly ("constructii erbasu"): the firm wins over the
   * subject its first word happens to be ("construcții").
   */
  private async namedRuns(c: Cursor, out: Interpretation) {
    if (out.supplier || out.authority || out.entityAlternatives.length) return;
    const synonyms = await this.vocab.synonyms();
    const known = (w: string) => STOPWORDS.has(w) || PREPOSITION.has(w) || synonyms.some((syn) => !syn.includes(" ") && wordMatches(w, syn));
    for (let i = 0; i < c.tokens.length; i++) {
      if (c.used[i] || STOPWORDS.has(c.f(i))) continue;
      let j = i;
      while (j < c.tokens.length && j - i < 5 && !c.used[j] && !STOPWORDS.has(c.f(j)) && !PREPOSITION.has(c.f(j))) j++;
      const words = c.tokens.slice(i, j).map((t) => t.f);
      const candidates = words.filter((w) => !known(w) && !/^\d+$/.test(w) && w.length >= 4);
      // distinctive = not even a fragment of a catalogue label ("festiv" is in "festivaluri"; "erbasu" is nowhere)
      const distinctive = candidates.length ? (await Promise.all(candidates.map(async (w) => (await this.vocab.cpv(w)).length === 0))).some(Boolean) : false;
      if (words.length >= 2 && distinctive && words.some(known)) {
        const typed = significant(words.join(" "));
        const r = await this.resolve("supplier", typed);
        // only an exact firm name wins over the subject words it contains
        if (r.kind === "one" && sameName(typed, r.hit.name)) {
          this.applyResolution(r, out, c.span(i, j), rawSpan(c.tokens, i, j));
          c.take(i, j, "entity");
          return;
        }
        if (r.kind === "many" && r.hits.every((e) => sameName(typed, e.name))) {
          this.applyResolution(r, out, c.span(i, j), rawSpan(c.tokens, i, j));
          c.take(i, j, "entity");
          return;
        }
      }
      i = j;
    }
  }

  // -------------------------------------------------------------- subjects
  private async subjects(c: Cursor, out: Interpretation) {
    // a CPV code typed directly ("45233140", "45233140-2") is that domain, with its whole sub-tree
    for (let k = 0; k < c.tokens.length; k++) {
      const code = c.f(k);
      if (c.used[k] || !/^\d{8}$/.test(code)) continue;
      const hit = (await this.vocab.cpv(code)).find((h) => h.term.startsWith(code));
      if (!hit) continue;
      const check = k + 1 < c.tokens.length && !c.used[k + 1] && /^\d$/.test(c.f(k + 1)) && out.text.includes(`${c.tokens[k]!.raw}-${c.tokens[k + 1]!.raw}`);
      const end = check ? k + 2 : k + 1;
      c.take(k, end, "subject");
      out.subjects.push({ term: hit.term, label: hit.cpvName ?? `CPV ${hit.term}`, cpvName: hit.cpvName, source: "catalog", matched: c.span(k, end) });
    }
    const runs: [number, number][] = [];
    const usable = (k: number) => !c.used[k] && !INSTITUTION_WORD.test(c.f(k));
    for (let i = 0; i < c.tokens.length; i++) {
      if (!usable(i) || (STOPWORDS.has(c.f(i)) && c.f(i) !== "de")) continue;
      let j = i;
      while (j < c.tokens.length && usable(j) && (!STOPWORDS.has(c.f(j)) || c.f(j) === "de")) j++;
      const next = j;
      while (j > i && c.f(j - 1) === "de") j--;
      let k = i;
      while (k < j && c.f(k) === "de") k++;
      if (j > k) runs.push([k, j]);
      i = next;
    }
    const synonyms = await this.vocab.synonyms();
    const candidates: { i: number; j: number; hit: CpvHit; generic: boolean }[] = [];
    // words that are not a subject on their own: never looked up, offered as choices below
    let retired: { k: number; entry: NonNullable<ReturnType<typeof retiredTerm>> } | null = null;
    for (const [i, j] of runs.slice(0, 4)) {
      const content = c.tokens.slice(i, j).map((t) => t.f).filter((w) => w !== "de");
      if (content.length >= 2) {
        const hit = await this.cpvFor(content);
        if (hit) { candidates.push({ i, j, hit, generic: false }); continue; }
      }
      const words: { k: number; hit: CpvHit | null }[] = await Promise.all(
        c.tokens.slice(i, j).map(async (t, idx) => ({
          k: i + idx,
          hit: t.f.length >= 3 && t.f !== "de" && !GENERIC_SUBJECT.has(t.f) && !retiredTerm(t.f) ? await this.cpvFor([t.f]) ?? typoSynonym(t.f, synonyms) : null,
        })),
      );
      for (const w of words) if (w.hit) candidates.push({ i: w.k, j: w.k + 1, hit: w.hit, generic: false });
      for (let k = i; k < j && !retired; k++) { const entry = retiredTerm(c.f(k)); if (entry) retired = { k, entry }; }
    }
    const isSynonym = (h: CpvHit) => !/^\d/.test(h.term);
    const ordered = [...candidates.filter((x) => isSynonym(x.hit)), ...candidates.filter((x) => !isSynonym(x.hit))];
    for (const cand of ordered) {
      if (!c.isFree(cand.i, cand.j)) continue;
      c.take(cand.i, cand.j, "subject");
      const isCode = /^\d/.test(cand.hit.term);
      const typedWords = significant(fold(rawSpan(c.tokens, cand.i, cand.j))).join(" ");
      out.subjects.push({
        term: cand.hit.term,
        label: isCode ? cand.hit.cpvName ?? `CPV ${cand.hit.term}` : typedWords === significant(fold(cand.hit.term)).join(" ") ? rawSpan(c.tokens, cand.i, cand.j).toLocaleLowerCase("ro-RO") : cand.hit.term,
        cpvName: cand.hit.cpvName,
        source: isCode ? "catalog" : "synonym",
        matched: c.span(cand.i, cand.j),
      });
      if (out.subjects.length >= 3) break;
    }
    // a retired word alone ("lucrări", "mese"): the person chooses what it means
    if (!out.subjects.length && retired && c.isFree(retired.k, retired.k + 1)) {
      c.take(retired.k, retired.k + 1, "subject");
      out.subjectChoices = { matched: c.span(retired.k, retired.k + 1), message: retired.entry.message, options: retired.entry.choices.map((o) => ({ label: o.label, term: o.cpvTerm })) };
    }
    // generic words ("lucrări", "servicii") are understood next to a real subject, never a subject alone
    if (out.subjects.length) for (let k = 0; k < c.tokens.length; k++) if (!c.used[k] && GENERIC_SUBJECT.has(c.f(k))) c.take(k, k + 1, "filler");
    if (out.subjects.length > 1)
      out.notes.push(`Am adunat ${out.subjects.length === 2 ? "ambele domenii" : `toate cele ${out.subjects.length} domenii`}: ${out.subjects.map((s) => `„${s.label}”`).join(", ")}. O achiziție care se potrivește cu mai multe e numărată o singură dată.`);
  }

  /**
   * Best vocabulary hit whose label contains every typed word as a whole
   * word (inflection-tolerant). A curated synonym equal to the word wins over
   * a catalogue label ("asfalt" means road works to a person, not bitumen);
   * a single word must lead a catalogue label, not hide inside it.
   */
  private async cpvFor(words: string[]): Promise<CpvHit | null> {
    const shortest = (w: string) => stems(w).reduce((a, b) => (b.length < a.length ? b : a));
    const variants = words.length === 1 ? [...new Set([words[0]!, shortest(words[0]!)])] : [words.map(shortest).join(" ")];
    const lists = await Promise.all(variants.map((v) => this.vocab.cpv(v)));
    const hits = [...new Map(lists.flat().map((h) => [h.term, h])).values()];
    const labelWords = (h: CpvHit) => significant(fold(/^\d/.test(h.term) ? h.cpvName ?? "" : h.term));
    const hitsWord = (w: string, l: string) => l === w || stems(w).includes(l) || stems(l).includes(w) || (Math.min(w.length, l.length) >= 5 && (wordMatches(w, l) || wordMatches(l, w)));
    const accepted = hits.filter((h) => {
      const label = labelWords(h);
      if (words.length === 1 && /^\d/.test(h.term)) return label.slice(0, 2).some((l) => hitsWord(words[0]!, l));
      return words.every((w) => label.some((l) => hitsWord(w, l)));
    });
    const typed = words.join(" ");
    const rank = (h: CpvHit) => {
      const synonym = !/^\d/.test(h.term);
      const label = labelWords(h).join(" ");
      const exact = label === typed || variants.includes(label) || stems(typed).includes(label);
      return synonym && exact ? 0 : exact ? 1 : synonym ? 2 : 3;
    };
    const best = accepted.map((h, idx) => ({ h, idx })).sort((a, b) => rank(a.h) - rank(b.h) || labelWords(a.h).length - labelWords(b.h).length || a.idx - b.idx)[0]?.h ?? null;
    // "lucrări de drumuri": the curated "drumuri" (the whole road-works family) beats the
    // narrower catalogue label "Lucrări de drumuri"; a generic word adds nothing to the subject
    if (best && rank(best) === 0) return best;
    const core = words.filter((w) => !GENERIC_SUBJECT.has(w));
    if (words.length > 1 && core.length && core.length < words.length) {
      const broad = await this.cpvFor(core);
      const label = broad ? significant(fold(broad.term)).join(" ") : "";
      if (broad && !/^\d/.test(broad.term) && (label === core.join(" ") || (core.length === 1 && stems(core[0]!).includes(label)))) return broad;
    }
    return best;
  }

  // ------------------------------------------------- compare, leftovers
  /**
   * "compară X cu Y": two institutions or two firms, named on each side of
   * the connector ("primăria X" names the town hall of X). Both must be
   * single identities; otherwise no comparison is proposed.
   */
  private async compare(c: Cursor, out: Interpretation, cueAt: number | null) {
    if (cueAt === null) return;
    const connector = c.all(/\b(?:cu|si|vs|versus|fata de)\b/).find((h) => h.i > cueAt);
    if (!connector) return;
    const side = (from: number, to: number) => {
      const ks: number[] = [];
      for (let k = from; k < to; k++) if (!c.used[k] && !STOPWORDS.has(c.f(k))) ks.push(k);
      return ks;
    };
    const lookup = async (ks: number[], role: "authority" | "supplier" | null) => {
      const typed = significant(ks.map((k) => c.f(k)).join(" "));
      if (!typed.length) return null;
      const roles: ("authority" | "supplier")[] = role ? [role] : ["supplier", "authority"];
      for (const r of roles) {
        const res = await this.resolve(r, typed);
        if (res.kind === "one") return { ...res.hit, role: r };
      }
      return null;
    };
    let focal: EntityMatch | null = out.supplier ?? out.authority;
    // two named institutions or firms first; two places only when no name resolves
    const placesInstead = async () => {
      if (out.supplier || out.authority) return;
      const pairs = await this.comparePlaces(c, side(cueAt, connector.i), side(connector.j, c.tokens.length));
      if (!pairs.length) return;
      out.compareChoices = pairs;
      for (let k = cueAt; k < c.tokens.length; k++) if (!c.used[k] && !STOPWORDS.has(c.f(k))) c.take(k, k + 1, "entity");
      c.take(connector.i, connector.j, "cue");
    };
    let focalKs: number[] = [];
    if (!focal) {
      focalKs = side(cueAt, connector.i);
      const hit = await lookup(focalKs, null);
      if (!hit) return placesInstead();
      focal = { role: hit.role, id: hit.id, name: hit.name, county: hit.county, matched: c.span(focalKs[0]!, focalKs[focalKs.length - 1]! + 1) };
    }
    const ks = side(connector.j, c.tokens.length);
    const other = await lookup(ks, focal.role);
    if (!other || other.id === focal.id) return placesInstead();
    for (const k of focalKs) c.take(k, k + 1, "entity");
    if (!out.supplier && !out.authority) { if (focal.role === "supplier") out.supplier = focal; else out.authority = focal; }
    c.take(connector.i, connector.j, "cue");
    for (const k of ks) c.take(k, k + 1, "entity");
    out.compareWith = { role: focal.role, id: other.id, name: other.name, county: other.county, matched: c.span(ks[0]!, ks[ks.length - 1]! + 1) };
  }

  /**
   * "compară Buzău cu Brăila": places are not comparable entities. The
   * engine compares two institutions, so the honest readings are the two
   * town halls and the two county councils, offered as choices.
   */
  private async comparePlaces(c: Cursor, left: number[], right: number[]): Promise<NonNullable<Interpretation["compareChoices"]>> {
    const words = (ks: number[]) => significant(ks.map((k) => c.f(k)).filter((w) => !/^(primari\w*|judetul|judetului|municipiul|orasul)$/.test(w)).join(" "));
    const a = words(left), b = words(right);
    if (!a.length || !b.length || a.length > 3 || b.length > 3) return [];
    const one = async (typed: string[]) => {
      const r = await this.resolve("authority", typed);
      return r.kind === "one" ? r.hit : null;
    };
    const span = (ks: number[]) => c.span(ks[0]!, ks[ks.length - 1]! + 1);
    const asMatch = (e: EntityHit, ks: number[]): EntityMatch => ({ role: "authority", id: e.id, name: e.name, county: e.county, matched: span(ks) });
    const out: NonNullable<Interpretation["compareChoices"]> = [];
    const [ha, hb, ca, cb] = await Promise.all([one(["primaria", ...a]), one(["primaria", ...b]), one(["consiliul", "judetean", ...a]), one(["consiliul", "judetean", ...b])]);
    if (ha && hb && ha.id !== hb.id) out.push({ label: `Primăriile: ${ha.name} și ${hb.name}`, focal: asMatch(ha, left), other: asMatch(hb, right) });
    if (ca && cb && ca.id !== cb.id) out.push({ label: `Consiliile județene: ${ca.name} și ${cb.name}`, focal: asMatch(ca, left), other: asMatch(cb, right) });
    return out;
  }

  /**
   * "semnale la primăria Buzău": risk profiles exist per institution, so the
   * locality becomes its town hall, only when exactly one registry identity
   * carries the UAT's name in that county.
   */
  private async townHall(out: Interpretation) {
    const place = out.place;
    if (!place || place.kind !== "locality" || out.authority || out.supplier || out.dimHint === "supplier") return;
    const typed = significant(placeKey(place.name));
    const { hits } = await this.vocab.entities("authority", typed.join(" "));
    const same = hits.filter((e) => sameName(typed, e.name) && (!e.county || fold(e.county).replace(/[^a-z]+/g, " ") === fold(place.county).replace(/[^a-z]+/g, " ")));
    if (same.length !== 1) return;
    const hit = same[0]!;
    out.authority = { role: "authority", id: hit.id, name: hit.name, county: hit.county, matched: place.matched ?? { text: place.name, from: 0, to: 0 } };
    out.place = null;
    out.placeAlternatives = [];
    out.placeNote = null;
  }

  /**
   * "Spitalul Județean Arad": a partial name plus a place. Only the choices in
   * that place's county are offered; one left is the institution meant.
   */
  private async choicesInPlace(out: Interpretation) {
    const place = out.place;
    // a firm's seat says nothing about where it sells: only institutions are narrowed by place
    if (!place || !out.entityAlternatives.length || out.entityAlternatives.some((e) => e.role !== "authority")) return;
    const key = (s: string | null) => fold(s ?? "").replace(/[^a-z]+/g, " ").trim();
    let here = out.entityAlternatives.filter((e) => key(e.county) === key(place.county));
    if (!here.length && out.choicesPartial) {
      // the choices shown are the largest buyers carrying the name: look for the name in that place
      const span = out.entityAlternatives[0]!.matched;
      const typed = significant(fold(span.text)).filter((w) => !OPTIONAL_NAME_WORD.test(w));
      const placeWords = significant(placeKey(place.kind === "county" ? place.county : place.name)).filter((w) => !typed.includes(w));
      const r = await this.resolve("authority", [...typed, ...placeWords]);
      const hits = r.kind === "one" ? [r.hit] : r.kind === "many" ? r.hits : [];
      here = hits.filter((e) => key(e.county) === key(place.county)).slice(0, 6)
        .map((e): EntityMatch => ({ role: "authority", id: e.id, name: e.name, county: e.county, matched: span }));
    }
    if (here.length === 1) {
      const e = here[0]!;
      if (e.role === "supplier") out.supplier = e; else out.authority = e;
      out.entityAlternatives = [];
      out.choicesPartial = null;
      out.notes = out.notes.filter((n) => !/se potrivesc cu/.test(n));
      if (place.kind === "county") { out.place = null; out.placeAlternatives = []; out.placeNote = null; }
    } else if (here.length > 1) {
      out.entityAlternatives = here;
      out.choicesPartial = null;
    } else if (!out.choicesPartial) {
      // none of the complete list is in that county: the place stays, the name is reported
      out.notes.push(`Nu am găsit „${out.entityAlternatives[0]!.matched.text}” în ${place.kind === "county" ? `județul ${place.county}` : place.name}.`);
      out.entityAlternatives = [];
    }
  }

  /** A question that is only a name ("Constructii Erbașu", "cu cine lucrează erbasu"). */
  private async leftoverEntity(c: Cursor, out: Interpretation) {
    if (out.subjects.length || out.place || out.authority || out.supplier || out.person || out.personAlternatives.length || out.placeAmbiguous || out.entityAlternatives.length) return;
    const free: number[] = [];
    for (let k = 0; k < c.tokens.length; k++) if (!c.used[k] && !STOPWORDS.has(c.f(k)) && !PREPOSITION.has(c.f(k))) free.push(k);
    if (!free.length || free.length > 6) return;
    const typed = significant(free.map((k) => c.f(k)).join(" "));
    if (!typed.length || (typed.length === 1 && typed[0]!.length < 5)) return;
    const span = c.span(free[0]!, free[free.length - 1]! + 1);
    const [s, a] = await Promise.all([this.resolve("supplier", typed), this.resolve("authority", typed)]);
    const take = () => { for (const k of free) c.take(k, k + 1, "entity"); };
    if (s.kind === "one" && a.kind === "none") { take(); this.applyResolution(s, out, span, span.text); return; }
    if (a.kind === "one" && s.kind === "none") { take(); this.applyResolution(a, out, span, span.text); return; }
    const many = [s, a].filter((r): r is Extract<Resolution, { kind: "one" | "many" }> => r.kind !== "none");
    if (!many.length) return;
    take();
    const all = many.flatMap((r) => (r.kind === "one" ? [{ role: r.role, hit: r.hit }] : r.hits.map((hit) => ({ role: r.role, hit }))));
    const total = many.reduce((n, r) => n + (r.kind === "one" ? 1 : r.total), 0);
    out.entityAlternatives = all.slice(0, 6).map(({ role, hit }) => ({ role, id: hit.id, name: hit.name, county: hit.county, matched: span }));
    if (total > out.entityAlternatives.length) out.choicesPartial = { shown: out.entityAlternatives.length, total, search: span.text, hint: ENTITY_HINT };
    out.notes.push(`${total} firme sau instituții se potrivesc cu „${span.text}”.`);
  }

  private settleIntent(cues: { intent: IntentKind; at: number }[], out: Interpretation) {
    const unique = (list: IntentKind[]) => [...new Set(list)];
    const ordered = [...cues].sort((a, b) => a.at - b.at).map((x) => x.intent);
    const has = (k: IntentKind) => ordered.includes(k);
    let primary: IntentKind | null = null;
    if (has("compare") && (out.compareWith || out.compareChoices?.length)) primary = "compare";
    else if (has("signals")) primary = "signals";
    else if (has("trend")) primary = "trend";
    else primary = ordered.find((k) => k !== "compare") ?? null;
    if (has("compare") && !out.compareWith && !out.compareChoices?.length)
      out.notes.push("Pentru o comparație, numește două instituții sau două firme, de exemplu „compară Spitalul Județean de Urgență Buzău cu Spitalul Județean de Urgență Brăila”.");
    if (primary) {
      out.intent = primary;
      out.intentSource = "cue";
    } else if (out.subjects.length || out.subjectChoices || out.place || out.placeAmbiguous || out.authorityKind || out.authority || out.supplier || out.entityAlternatives.length || out.person || out.personAlternatives.length || out.singleBidder || out.dataset || out.period || out.employees) {
      out.intentSource = "default";
      const supplierLike = out.supplier || (out.entityAlternatives[0]?.role === "supplier");
      const authorityLike = out.authority || (out.entityAlternatives[0]?.role === "authority");
      out.intent = supplierLike && !authorityLike ? "ranking_authorities"
        : authorityLike || ((out.place?.kind === "locality" || out.placeAmbiguous) && !out.subjects.length) ? "breakdown"
        : out.subjects.length || out.subjectChoices || out.person || out.personAlternatives.length || out.singleBidder || out.employees ? "ranking_suppliers"
        : out.place || out.authorityKind ? "breakdown"
        : "total";
    }
    out.otherIntents = unique(ordered.filter((k) => k !== out.intent && k !== "compare"));
  }

  private leftover(c: Cursor, out: Interpretation) {
    const words: string[] = [];
    for (let k = 0; k < c.tokens.length; k++) {
      if (c.used[k] && c.used[k] !== "blocked") continue;
      const f = c.f(k);
      if (STOPWORDS.has(f) || PREPOSITION.has(f) || /^\d{1,2}$/.test(f)) continue;
      words.push(c.tokens[k]!.raw);
    }
    out.leftover = [...new Map(words.map((w) => [fold(w), w])).values()];
  }

  private score(c: Cursor, out: Interpretation) {
    let content = 0, understood = 0;
    for (let k = 0; k < c.tokens.length; k++) {
      const f = c.f(k);
      const meaningful = !STOPWORDS.has(f) && !PREPOSITION.has(f);
      if (c.used[k] && c.used[k] !== "blocked") { understood++; content++; }
      else if (meaningful) content++;
    }
    if (out.intent === null) { out.confidence = 0; out.confidenceLabel = "none"; return; }
    let score = content ? understood / content : 0;
    if (out.intentSource === "default") score -= 0.1;
    if (out.placeAmbiguous) score -= 0.25;
    if (out.personAlternatives.length || out.entityAlternatives.length) score -= 0.2;
    if (!hasNamedScope(out)) score -= 0.15;
    out.confidence = Math.max(0.05, Math.min(1, Math.round(score * 100) / 100));
    out.confidenceLabel = confidenceLabel(out.confidence);
  }
}

/** Something in the question narrows the answer beyond "everything, everywhere". */
export function hasNamedScope(i: Interpretation): boolean {
  return Boolean(i.subjects.length || i.subjectChoices || i.place || i.placeAmbiguous || i.authorityKind || i.authority || i.supplier || i.entityAlternatives.length
    || i.person || i.personAlternatives.length || i.period || i.dataset || i.singleBidder || i.employees || i.measure === "value_per_capita");
}

interface PlaceFound {
  from: number;
  to: number;
  entries: PlaceEntry[];
  constraint: "county" | "locality" | "municipiu" | "oras" | "comuna" | "any";
  span: Span;
}

function fits(e: PlaceEntry, constraint: PlaceFound["constraint"]): boolean {
  switch (constraint) {
    case "county": return e.kind === "county";
    case "locality": return e.kind === "locality";
    case "municipiu": return e.kind === "locality" && e.tip === "municipiu";
    case "oras": return e.kind === "locality" && (e.tip === "oraș" || e.tip === "municipiu");
    case "comuna": return e.kind === "locality" && e.tip === "comună";
    default: return true;
  }
}

/** "Municipiul Buzău" → "Municipiului Buzău" (for "primăria …"). */
export function genitive(place: Pick<PlaceMatch, "name" | "tip">): string {
  return place.name
    .replace(/^Municipiul /, "Municipiului ")
    .replace(/^Orașul /, "Orașului ")
    .replace(/^Comuna /, "Comunei ")
    .replace(/^Sectorul /, "Sectorului ");
}

/** One typo on a long word, same first three letters: "medicamnte" → "medicamente", never "constanta" → "consultanta". */
function typoSynonym(word: string, synonyms: string[]): CpvHit | null {
  if (word.length < 6 || INSTITUTION_WORD.test(word)) return null;
  const hit = synonyms.find((s) => !s.includes(" ") && s.length >= 6 && s.slice(0, 3) === word.slice(0, 3) && (lev(word, s, 1) <= 1 || (word.length > s.length && lev(word.slice(0, s.length), s, 1) <= 1 && word.length - s.length <= 3)));
  return hit ? { term: hit, cpvName: null } : null;
}
