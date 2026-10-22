import type { AuthorityKind } from "../ask/spec";
import { placeKey } from "./places";
import { NUMBER_WORDS, STOPWORDS, fold, rawSpan, stems, tokenize, wordMatches, type Token } from "./text";
import type {
  CpvHit, EntityHit, EntityMatch, IntentKind, InterpretContext, Interpretation, PersonHit, PersonMatch,
  PlaceEntry, PlaceMatch, QuestionInterpreter, Span, SubjectMatch, Vocabulary,
} from "./types";

/**
 * Deterministic interpreter (owner decision 1): cue words + the existing
 * vocabulary (CPV catalogue and synonyms, counties, reference.uat localities,
 * authorities, suppliers, ONRC persons). Every rule consumes the words it
 * explains; whatever is left is reported back as not understood, never
 * silently dropped and never guessed into a filter.
 */

export const MAX_QUESTION_LENGTH = 300;
export const RULES_INTERPRETER_ID = "rules-v1";

type Tag = "period" | "cue" | "kind" | "place" | "subject" | "entity" | "person" | "modifier" | "filler";

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

/** Ordered: the more specific phrase first, so it consumes the shared words. */
const INTENT_CUES: [IntentKind, RegExp][] = [
  ["compare", /\b(?:compara\w*|comparati[ea]|comparat\w*|fata de|versus|vs)\b/],
  ["signals", /\b(?:semnal(?:e|ele|ul)?|suspect\w*|risc(?:ul|uri|ului)?|riscant\w*|neregul\w*|dubio\w*|merita verificat\w*|de verificat|ce merita|coruptie|corupt\w*|frauda|fraude|ciudat\w*|anomali\w*|ies din tipar|iese din tipar|indice(?:le|lui)? de risc)\b/],
  ["trend", /\b(?:cum (?:a|au|s a|s au) (?:evoluat|crescut|scazut|schimbat)|evolut\w*|evolueaza|in timp|pe ani|an de an|de la an la an|an cu an|(?:a|au) crescut|(?:a|au) scazut|crestere\w*|scadere\w*|tendint\w*|cum se schimba|istoricul|dinamica)\b/],
  ["ranking_suppliers", /\b(?:de la cine(?: (?:cumpara\w*|a cumparat|au cumparat|ia|iau|achizitioneaza))?|cine (?:castiga|a castigat|au castigat|castigat|face|a facut|fac|au facut|livreaza|a livrat|furnizeaza|vinde|vand|ia|primeste|a primit|executa|a executat|lucreaza|repara|construieste|a construit|asfalteaza|presteaza|asigura|se ocupa)|(?:ce|care) (?:firm\w*|companii\w*|societati\w*|furnizori\w*)|firm(?:e|ele|elor)|furnizor(?:i|ii|ilor)|castigator(?:i|ii|ilor)|antreprenor(?:i|ii)|constructor(?:i|ii)|companii(?:le)?|societati(?:le)?)\b/],
  ["ranking_authorities", /\b(?:cine (?:cumpara|cheltuie\w*|plateste|comanda|a cumparat|au cumparat|achizitioneaza|a cheltuit|au cheltuit|da (?:bani|contracte))|(?:ce|care) (?:institutii|autoritati|primarii|cumparatori)|institutii(?:le|lor)?|autoritati(?:le|lor)?|autoritatile contractante|cumparator(?:i|ii|ilor))\b/],
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
const INSTITUTION_NOUN = /\b(?:spitalul|liceul|colegiul|scoala|universitatea|directia|compania|inspectoratul|agentia|administratia|regia|institutul|institutia|serviciul|politia|teatrul|muzeul|biblioteca|clubul|centrul|casa|ministerul|autoritatea|oficiul|camera|tribunalul|curtea|parchetul|cnair|anaf)\b/;

/** Acronyms people use for large national buyers. */
const ACRONYMS: Record<string, string> = {
  cnair: "compania nationala de administrare a infrastructurii rutiere",
  cnadnr: "compania nationala de administrare a infrastructurii rutiere",
  anaf: "agentia nationala de administrare fiscala",
};

const LEGAL = new Set(["sc", "srl", "sa", "s", "r", "l", "srlv", "pfa", "ii", "if", "snc", "scs", "ra", "spa", "ltd", "gmbh", "sas", "sl", "bv", "nv"]);
/** Generic subject words: a match on them alone is a weak subject. */
const GENERIC_SUBJECT = new Set(["lucrari", "lucrare", "servicii", "serviciu", "produse", "produs", "echipamente", "echipament", "materiale", "material", "reparatii", "reparatie", "intretinere", "constructii", "constructie", "mentenanta", "furnizare", "livrare", "achizitionare", "bunuri", "dotari", "investitii", "investitie", "proiecte", "proiect", "modernizare", "reabilitare"]);
/** Words that only modify a cue ("cel mai mare", "cele mai multe"). */
const MODIFIER = /\b(?:(?:cel|cea|cele|cei) mai (?:mare|mari|mult|multe|multi|multa|bogat\w*|scump\w*|riscant\w*|ridicat\w*|important\w*|mici|mic)|cel mai|cea mai|cele mai|cei mai|in romania|din romania|toata tara|din tara|la nivel national|national|in total)\b/;

const PREPOSITION = new Set(["in", "din", "la", "pentru", "spre", "catre", "dinspre", "de"]);

// ------------------------------------------------------------- the engine

function significant(folded: string): string[] {
  return folded.split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w) && !LEGAL.has(w));
}

/** Strong name match: every typed word is in the name and the name adds at most two words. */
export function strongNameMatch(typedWords: string[], name: string): boolean {
  const words = significant(fold(name));
  // "primăria Buzău" names the UAT itself ("MUNICIPIUL BUZAU")
  const typed = /^(municipiul|orasul|oras|comuna|sectorul) /.test(fold(name).trim())
    ? typedWords.filter((w) => !/^(primari\w*|consiliul|local)$/.test(w))
    : typedWords;
  if (!typed.length || !words.length) return false;
  const used = new Set<number>();
  for (const t of typed) {
    const k = words.findIndex((w, idx) => !used.has(idx) && (wordMatches(t, w) || wordMatches(w, t)));
    if (k < 0) return false;
    used.add(k);
  }
  const extra = words.length - used.size;
  return extra <= 2 && extra <= Math.max(1, Math.floor(words.length / 2));
}

function confidenceLabel(c: number): Interpretation["confidenceLabel"] {
  return c >= 0.75 ? "high" : c >= 0.5 ? "medium" : c > 0 ? "low" : "none";
}

export class RulesInterpreter implements QuestionInterpreter {
  readonly id = RULES_INTERPRETER_ID;
  constructor(private readonly vocab: Vocabulary) {}

  async interpret(input: string, context: InterpretContext): Promise<Interpretation> {
    const text = input.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);
    const out: Interpretation = {
      text, interpreter: this.id, intent: null, intentSource: null, otherIntents: [], dimHint: null,
      subjects: [], place: null, placeAlternatives: [], placeAmbiguous: false, authorityKind: null,
      authority: null, supplier: null, entityAlternatives: [], compareWith: null, person: null, personAlternatives: [],
      period: null, dataset: null, singleBidder: false, measure: null, topN: null, superlative: false,
      employees: null, leftover: [], confidence: 0, confidenceLabel: "none", notes: [], placeNote: null,
    };
    const tokens = tokenize(text);
    if (!tokens.length) return out;
    const c = new Cursor(tokens);
    const year = context.now.getFullYear();
    const places = await this.vocab.places();
    const byKey = new Map<string, PlaceEntry[]>();
    for (const p of places) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);

    this.periods(c, out, year);
    this.modifiers(c, out);
    await this.people(c, out);
    const cues = this.cues(c, out);
    this.kinds(c, out);
    await this.institutions(c, out);
    const compareCue = cues.find((x) => x.intent === "compare")?.at ?? null;
    await this.compare(c, out, compareCue);
    const marked = this.markedPlaces(c, out, byKey);
    await this.suppliersByMarker(c, out);
    await this.namedRuns(c, out);
    await this.subjects(c, out);
    const unmarked = this.unmarkedPlaces(c, out, byKey);
    this.settlePlaces([...marked, ...unmarked].sort((a, b) => a.from - b.from), out);
    if (cues.some((x) => x.intent === "signals")) await this.townHall(out);
    await this.leftoverEntity(c, out);
    this.settleIntent(cues, out);
    this.leftover(c, out);
    this.score(c, out);
    return out;
  }

  // --------------------------------------------------------------- periods
  private periods(c: Cursor, out: Interpretation, year: number) {
    const ok = (y: number) => y >= 2000 && y <= year + 1;
    const set = (h: Hit, from?: number, to?: number) => {
      if ((from !== undefined && !ok(from)) || (to !== undefined && !ok(to))) return false;
      if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
      c.take(h.i, h.j, "period");
      if (out.period) {
        out.notes.push(`Am folosit prima perioadă din întrebare; „${c.span(h.i, h.j).text}” nu a fost aplicată.`);
        return true;
      }
      out.period = { ...(from !== undefined ? { yearFrom: from } : {}), ...(to !== undefined ? { yearTo: to } : {}), matched: c.span(h.i, h.j) };
      return true;
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
    once(/\b(?:cu\s+)?(?:un\s+singur\s+ofertant|o\s+singura\s+oferta|un\s+singur\s+participant|ofertant\s+unic|fara\s+(?:concurenta|competitie|concurs))\b/, () => { out.singleBidder = true; });
    once(/\b(?:achizitii(?:le|lor)?|cumparari(?:le|lor)?|cumparaturi(?:le|lor)?)\s+direct(?:e|a)\b|\bachizitie\s+directa\b|\bachizitia\s+directa\b|\bin\s+mod\s+direct\b/, () => { out.dataset = "da"; });
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
      else if (/^(institutie|autoritate|primarie)$/.test(noun)) { out.dimHint = "authority"; c.take(h.i, h.j, "cue"); }
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
    return found;
  }

  private kinds(c: Cursor, out: Interpretation) {
    for (const [kind, re] of KIND_CUES) {
      // a singular institution noun followed by a name is a named authority (handled next)
      for (const h of c.all(re)) {
        const word = c.f(h.i);
        const singular = /^(spitalul|scoala|liceul|colegiul)$/.test(word);
        if (singular && h.j < c.tokens.length && c.isFree(h.j, h.j + 1) && !PREPOSITION.has(c.f(h.j)) && !STOPWORDS.has(c.f(h.j))) continue;
        c.take(h.i, h.j, "kind");
        if (!out.authorityKind) out.authorityKind = { kind, matched: c.span(h.i, h.j) };
      }
    }
  }

  /** "Spitalul Județean de Urgență Buzău", "Compania Națională …": a named authority. */
  private async institutions(c: Cursor, out: Interpretation) {
    for (const h of c.all(INSTITUTION_NOUN)) {
      if (out.authority) break;
      let end = h.j;
      while (end < c.tokens.length && end - h.i < 9 && !c.used[end]) end++;
      let attempts = 0;
      for (let j = end; j > h.i && attempts < 3; j--) {
        if (j - h.i === 1 && !/^(cnair|anaf)$/.test(c.f(h.i))) break;
        if (STOPWORDS.has(c.f(j - 1)) && j - 1 > h.i) continue;
        attempts++;
        const words = c.tokens.slice(h.i, j).flatMap((t) => (ACRONYMS[t.f] ?? t.f).split(" "));
        const typed = significant(words.join(" "));
        const hits = (await this.vocab.authorities(words.join(" "))).filter((e) => strongNameMatch(typed, e.name));
        const picked = this.pickEntity(hits, typed);
        if (picked) {
          c.take(h.i, j, "entity");
          out.authority = { role: "authority", id: picked.id, name: picked.name, county: picked.county, matched: c.span(h.i, j) };
          break;
        }
      }
    }
    // singular nouns without a name fall back to their kind ("spitalul din Buzău")
    if (!out.authority) {
      for (const h of c.all(/\b(?:spitalul|scoala|liceul|colegiul)\b/)) {
        c.take(h.i, h.j, "kind");
        const kind: AuthorityKind = c.f(h.i) === "spitalul" ? "spital" : "scoala";
        if (!out.authorityKind) out.authorityKind = { kind, matched: c.span(h.i, h.j) };
      }
    }
  }

  private pickEntity(hits: EntityHit[], typed: string[]): EntityHit | null {
    if (!hits.length) return null;
    const exact = hits.filter((e) => significant(fold(e.name)).join(" ") === typed.join(" "));
    if (exact.length === 1) return exact[0]!;
    // distinct registry rows with the same core name are distinct firms: never pick one
    return hits.length === 1 ? hits[0]! : null;
  }

  // ---------------------------------------------------------------- places
  /** Longest place name starting at token i (1–4 words), exact or one typo. */
  private placeAt(c: Cursor, i: number, byKey: Map<string, PlaceEntry[]>, fuzzy: boolean): { j: number; entries: PlaceEntry[] } | null {
    for (let len = Math.min(4, c.tokens.length - i); len >= 1; len--) {
      if (!c.isFree(i, i + len)) continue;
      const raw = c.tokens.slice(i, i + len).map((t) => t.f);
      if (STOPWORDS.has(raw[0]!) || STOPWORDS.has(raw[raw.length - 1]!)) continue;
      const key = placeKey(raw.join(" ").replace(/^rm\b/, "ramnicu").replace(/^tg\b/, "targu").replace(/^sf\b/, "sfantu").replace(/^cimpulung\b/, "campulung"));
      const exact = byKey.get(key);
      if (exact) return { j: i + len, entries: exact };
      if (fuzzy && key.length >= 6) {
        const near = [...byKey.entries()].filter(([k]) => Math.abs(k.length - key.length) <= 1 && k[0] === key[0] && wordMatches(key, k) && key.length >= k.length - 1 && !k.startsWith(key + " "));
        const closest = near.filter(([k]) => k.length >= key.length - 1 && k.length <= key.length + 1);
        if (closest.length === 1) return { j: i + len, entries: closest[0]![1] };
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
          if (constraint === "locality" && /^primari/.test(c.f(h.i))) out.notes.push("Nu am recunoscut numele primăriei. Scrie localitatea, de exemplu „primăria din Râmnicu Sărat”.");
          continue;
        }
        const entries = at.entries.filter((e) => fits(e, constraint));
        if (!entries.length) continue;
        c.take(h.i, at.j, "place");
        found.push({ from: h.i, to: at.j, entries, constraint, span: c.span(h.i, at.j) });
      }
    }
    return found;
  }

  private unmarkedPlaces(c: Cursor, _out: Interpretation, byKey: Map<string, PlaceEntry[]>): PlaceFound[] {
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
      c.take(i, at.j, "place");
      found.push({ from: i, to: at.j, entries: at.entries, constraint: "any", span: c.span(i, at.j) });
      i = at.j - 1;
    }
    return found;
  }

  /** Choose the place; ambiguous names become alternatives, never a guess. */
  private settlePlaces(found: PlaceFound[], out: Interpretation): PlaceFound[] {
    if (!found.length) return [];
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
      return extra;
    }
    if (locs.length === 1) {
      out.place = match(locs[0]!);
      return extra;
    }
    out.placeAmbiguous = true;
    out.placeAlternatives = [...locs].sort(byPopulation).slice(0, 6).map((e) => match(e));
    const bare = locs[0]!.name.replace(/^(Comuna|Orașul|Municipiul) /, "");
    const where = [...new Set(locs.map((e) => e.county))];
    out.placeNote = `Există ${locs.length} localități cu numele „${bare}”, în ${where.length > 1 ? `${where.slice(0, -1).join(", ")} și ${where.at(-1)}` : where[0]}.`;
    return extra;
  }

  // --------------------------------------------------------- persons, firms
  private async people(c: Cursor, out: Interpretation) {
    const h = c.first(/\b(?:(?:firmele|firmelor|companiile|societatile|afacerile)\s+(?:lui|conduse de|administrate de|detinute de|ale lui)|conduse de|administrate de|detinute de|administratorul|administratoarea|patronul|patroana|omul de afaceri|afaceristul)\b/);
    if (!h) return;
    let end = h.j;
    while (end < c.tokens.length && end - h.j < 4 && !c.used[end] && !STOPWORDS.has(c.f(end)) && !PREPOSITION.has(c.f(end))) end++;
    if (end - h.j < 2) return;
    const words = c.tokens.slice(h.j, end).map((t) => t.f);
    // ONRC writes the surname first ("POPESCU ION"); people write it last
    const orders = [words.join(" "), [...words].reverse().join(" ")];
    const lists = await Promise.all([...new Set(orders)].map((q) => this.vocab.persons(q)));
    const hits = [...new Map(lists.flat().map((p) => [p.key, p])).values()];
    const same = hits.filter((p) => {
      const nameWords = significant(fold(p.name));
      return nameWords.length === words.length && words.every((w) => nameWords.includes(w));
    });
    const asMatch = (p: PersonHit): PersonMatch => ({ ...p, matched: c.span(h.i, end) });
    if (/^(firmele|firmelor|companiile|societatile|afacerile)$/.test(c.f(h.i))) out.dimHint = out.dimHint ?? "supplier";
    if (same.length === 1) {
      c.take(h.i, end, "person");
      out.person = asMatch(same[0]!);
    } else if (same.length > 1) {
      c.take(h.i, end, "person");
      out.personAlternatives = same.map(asMatch);
      out.notes.push(`Mai multe persoane se numesc „${c.span(h.j, end).text}” în Registrul Comerțului. Alege persoana după anul nașterii.`);
    }
  }

  private async suppliersByMarker(c: Cursor, out: Interpretation) {
    if (out.supplier) return;
    const marker = c.first(/\b(?:firma|firmei|societatea|societatii|compania|companiei|furnizorul|furnizorului|constructorul|sc)\b/);
    const suffix = c.first(/\b(?:srl|sa)\b/);
    let from = -1, to = -1, consumeFrom = -1;
    if (marker) {
      from = marker.j; consumeFrom = marker.i;
      to = from;
      while (to < c.tokens.length && to - from < 6 && !c.used[to] && !(STOPWORDS.has(c.f(to)) && !LEGAL.has(c.f(to)))) to++;
    } else if (suffix) {
      to = suffix.j;
      from = suffix.i;
      while (from > 0 && suffix.i - from < 5 && !c.used[from - 1] && !STOPWORDS.has(c.f(from - 1))) from--;
      consumeFrom = from;
    }
    if (from < 0 || to <= from) return;
    const words = c.tokens.slice(from, to).map((t) => t.f);
    const typed = significant(words.join(" "));
    if (!typed.length) return;
    const hits = (await this.vocab.suppliers(typed.join(" "))).filter((e) => strongNameMatch(typed, e.name));
    const picked = this.pickEntity(hits, typed);
    if (picked) {
      c.take(consumeFrom, to, "entity");
      out.supplier = { role: "supplier", id: picked.id, name: picked.name, county: picked.county, matched: c.span(consumeFrom, to) };
      out.dimHint = out.dimHint === "supplier" ? "authority" : out.dimHint;
    } else if (hits.length > 1) {
      c.take(consumeFrom, to, "entity");
      out.entityAlternatives = hits.map((e) => ({ role: "supplier" as const, id: e.id, name: e.name, county: e.county, matched: c.span(consumeFrom, to) }));
      out.notes.push(`Mai multe firme se potrivesc cu „${c.span(from, to).text}”.`);
    }
  }

  /**
   * A run of words that holds a word unknown to the subject vocabulary and
   * names one firm exactly ("constructii erbasu"): the firm wins over the
   * subject its first word happens to be ("construcții").
   */
  private async namedRuns(c: Cursor, out: Interpretation) {
    if (out.supplier || out.authority) return;
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
        const hits = (await this.vocab.suppliers(typed.join(" "))).filter((e) => {
          const name = significant(fold(e.name));
          return strongNameMatch(typed, e.name) && name.length - typed.length <= 1;
        });
        const picked = this.pickEntity(hits, typed);
        if (picked) {
          c.take(i, j, "entity");
          out.supplier = { role: "supplier", id: picked.id, name: picked.name, county: picked.county, matched: c.span(i, j) };
          if (out.dimHint === "supplier") out.dimHint = "authority";
          return;
        }
      }
      i = j;
    }
  }

  // -------------------------------------------------------------- subjects
  private async subjects(c: Cursor, out: Interpretation) {
    const runs: [number, number][] = [];
    for (let i = 0; i < c.tokens.length; i++) {
      if (c.used[i] || (STOPWORDS.has(c.f(i)) && c.f(i) !== "de")) continue;
      let j = i;
      while (j < c.tokens.length && !c.used[j] && (!STOPWORDS.has(c.f(j)) || c.f(j) === "de")) j++;
      const next = j;
      while (j > i && c.f(j - 1) === "de") j--;
      let k = i;
      while (k < j && c.f(k) === "de") k++;
      if (j > k) runs.push([k, j]);
      i = next;
    }
    const synonyms = await this.vocab.synonyms();
    const candidates: { i: number; j: number; hit: CpvHit; generic: boolean }[] = [];
    for (const [i, j] of runs.slice(0, 4)) {
      const content = c.tokens.slice(i, j).map((t) => t.f).filter((w) => w !== "de");
      if (content.length >= 2) {
        const hit = await this.cpvFor(content);
        if (hit) { candidates.push({ i, j, hit, generic: false }); continue; }
      }
      const words: { k: number; hit: CpvHit | null }[] = await Promise.all(
        c.tokens.slice(i, j).map(async (t, idx) => ({
          k: i + idx,
          hit: t.f.length >= 3 && t.f !== "de" ? await this.cpvFor([t.f]) ?? typoSynonym(t.f, synonyms) : null,
        })),
      );
      for (const w of words) if (w.hit) candidates.push({ i: w.k, j: w.k + 1, hit: w.hit, generic: GENERIC_SUBJECT.has(c.f(w.k)) });
    }
    const ordered = [...candidates.filter((x) => !x.generic), ...candidates.filter((x) => x.generic)];
    for (const cand of ordered) {
      if (!c.isFree(cand.i, cand.j)) continue;
      c.take(cand.i, cand.j, "subject");
      const isCode = /^\d/.test(cand.hit.term);
      out.subjects.push({
        term: cand.hit.term,
        label: isCode ? cand.hit.cpvName ?? `CPV ${cand.hit.term}` : fold(rawSpan(c.tokens, cand.i, cand.j)) === fold(cand.hit.term) ? rawSpan(c.tokens, cand.i, cand.j).toLocaleLowerCase("ro-RO") : cand.hit.term,
        cpvName: cand.hit.cpvName,
        source: isCode ? "catalog" : "synonym",
        matched: c.span(cand.i, cand.j),
      });
      if (out.subjects.length >= 3) break;
    }
    // generic words around a found subject ("lucrări de asfaltare") are understood
    if (out.subjects.length) for (let k = 0; k < c.tokens.length; k++) if (!c.used[k] && GENERIC_SUBJECT.has(c.f(k))) c.take(k, k + 1, "filler");
    if (out.subjects.length > 1)
      out.notes.push(`Am folosit primul domeniu, „${out.subjects[0]!.label}”. Am mai recunoscut: ${out.subjects.slice(1).map((s) => `„${s.label}”`).join(", ")}.`);
  }

  /**
   * Best vocabulary hit whose label contains every typed word
   * (inflection-tolerant). A curated synonym equal to the word wins over a
   * catalogue label: "asfalt" means road works to a person, not bitumen.
   */
  private async cpvFor(words: string[]): Promise<CpvHit | null> {
    const shortest = (w: string) => stems(w).reduce((a, b) => (b.length < a.length ? b : a));
    const variants = words.length === 1 ? [...new Set([words[0]!, shortest(words[0]!)])] : [words.map(shortest).join(" ")];
    const lists = await Promise.all(variants.map((v) => this.vocab.cpv(v)));
    const hits = [...new Map(lists.flat().map((h) => [h.term, h])).values()];
    const labelWords = (h: CpvHit) => fold(/^\d/.test(h.term) ? h.cpvName ?? "" : h.term).split(/[^a-z0-9]+/).filter(Boolean);
    const accepted = hits.filter((h) => {
      const label = labelWords(h);
      return words.every((w) => label.some((l) => wordMatches(w, l) || stems(w).some((s) => wordMatches(s, l))));
    });
    const typed = words.join(" ");
    const rank = (h: CpvHit) => {
      const synonym = !/^\d/.test(h.term);
      const label = labelWords(h).join(" ");
      const exact = label === typed || variants.includes(label) || stems(typed).includes(label);
      return synonym && exact ? 0 : exact ? 1 : synonym ? 2 : 3;
    };
    return accepted.map((h, idx) => ({ h, idx })).sort((a, b) => rank(a.h) - rank(b.h) || a.idx - b.idx)[0]?.h ?? null;
  }

  // ------------------------------------------------- compare, leftovers
  /**
   * "compară X cu Y": two institutions or two firms, named on each side of
   * the connector ("primăria X" names the town hall of X).
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
        const hits = (await (r === "supplier" ? this.vocab.suppliers(typed.join(" ")) : this.vocab.authorities(typed.join(" ")))).filter((e) => strongNameMatch(typed, e.name));
        const picked = this.pickEntity(hits, typed);
        if (picked) return { ...picked, role: r };
      }
      return null;
    };
    let focal: EntityMatch | null = out.supplier ?? out.authority;
    if (!focal) {
      const ks = side(cueAt, connector.i);
      const hit = await lookup(ks, null);
      if (!hit) return;
      focal = { role: hit.role, id: hit.id, name: hit.name, county: hit.county, matched: c.span(ks[0]!, ks[ks.length - 1]! + 1) };
      for (const k of ks) c.take(k, k + 1, "entity");
      if (hit.role === "supplier") out.supplier = focal; else out.authority = focal;
    }
    const ks = side(connector.j, c.tokens.length);
    const other = await lookup(ks, focal.role);
    if (!other || other.id === focal.id) return;
    c.take(connector.i, connector.j, "cue");
    for (const k of ks) c.take(k, k + 1, "entity");
    out.compareWith = { role: focal.role, id: other.id, name: other.name, county: other.county, matched: c.span(ks[0]!, ks[ks.length - 1]! + 1) };
  }

  /**
   * "semnale la primăria Buzău": risk profiles exist per institution, so the
   * locality becomes its town hall (an exact registry name in that county).
   */
  private async townHall(out: Interpretation) {
    const place = out.place;
    if (!place || place.kind !== "locality" || out.authority || out.supplier || out.dimHint === "supplier") return;
    const typed = significant(fold(place.name));
    const hits = (await this.vocab.authorities(typed.join(" ")))
      .filter((e) => strongNameMatch(typed, e.name) && (!e.county || fold(e.county) === fold(place.county)));
    const picked = this.pickEntity(hits, typed);
    if (!picked) return;
    out.authority = { role: "authority", id: picked.id, name: picked.name, county: picked.county, matched: place.matched ?? { text: place.name, from: 0, to: 0 } };
    out.place = null;
    out.placeAlternatives = [];
    out.placeNote = null;
  }

  /** A question that is only a name ("Constructii Erbașu", "cu cine lucrează erbasu"). */
  private async leftoverEntity(c: Cursor, out: Interpretation) {
    if (out.subjects.length || out.place || out.authority || out.supplier || out.person || out.placeAmbiguous) return;
    const free: number[] = [];
    for (let k = 0; k < c.tokens.length; k++) if (!c.used[k] && !STOPWORDS.has(c.f(k)) && !PREPOSITION.has(c.f(k))) free.push(k);
    if (!free.length || free.length > 6) return;
    const typed = significant(free.map((k) => c.f(k)).join(" "));
    if (!typed.length || (typed.length === 1 && typed[0]!.length < 5)) return;
    const [suppliers, authorities] = await Promise.all([this.vocab.suppliers(typed.join(" ")), this.vocab.authorities(typed.join(" "))]);
    const strong = (hits: EntityHit[]) => hits.filter((e) => strongNameMatch(typed, e.name));
    const s = this.pickEntity(strong(suppliers), typed);
    const a = this.pickEntity(strong(authorities), typed);
    const span = c.span(free[0]!, free[free.length - 1]! + 1);
    if (s && !a) {
      for (const k of free) c.take(k, k + 1, "entity");
      out.supplier = { role: "supplier", id: s.id, name: s.name, county: s.county, matched: span };
    } else if (a && !s) {
      for (const k of free) c.take(k, k + 1, "entity");
      out.authority = { role: "authority", id: a.id, name: a.name, county: a.county, matched: span };
    } else if (strong(suppliers).length + strong(authorities).length > 1) {
      for (const k of free) c.take(k, k + 1, "entity");
      out.entityAlternatives = [
        ...strong(suppliers).map((e) => ({ role: "supplier" as const, id: e.id, name: e.name, county: e.county, matched: span })),
        ...strong(authorities).map((e) => ({ role: "authority" as const, id: e.id, name: e.name, county: e.county, matched: span })),
      ].slice(0, 6);
      out.notes.push(`Numele „${span.text}” se potrivește cu mai multe firme sau instituții.`);
    }
  }

  private settleIntent(cues: { intent: IntentKind; at: number }[], out: Interpretation) {
    const unique = (list: IntentKind[]) => [...new Set(list)];
    const ordered = [...cues].sort((a, b) => a.at - b.at).map((x) => x.intent);
    const has = (k: IntentKind) => ordered.includes(k);
    let primary: IntentKind | null = null;
    if (has("compare") && out.compareWith) primary = "compare";
    else if (has("signals")) primary = "signals";
    else if (has("trend")) primary = "trend";
    else primary = ordered.find((k) => k !== "compare") ?? null;
    if (has("compare") && !out.compareWith)
      out.notes.push("Pentru o comparație, numește două instituții sau două firme, de exemplu „compară Spitalul Județean Buzău cu Spitalul Județean Brăila”.");
    // "firme" with "cât"/"pe ce" first stays a ranking only when it leads the question
    if (primary) {
      out.intent = primary;
      out.intentSource = "cue";
    } else if (out.subjects.length || out.place || out.placeAmbiguous || out.authorityKind || out.authority || out.supplier || out.entityAlternatives.length || out.person || out.personAlternatives.length || out.singleBidder || out.dataset || out.period || out.employees) {
      out.intentSource = "default";
      const supplierLike = out.supplier || (out.entityAlternatives[0]?.role === "supplier");
      const authorityLike = out.authority || (out.entityAlternatives[0]?.role === "authority");
      out.intent = supplierLike && !authorityLike ? "ranking_authorities"
        : authorityLike || ((out.place?.kind === "locality" || out.placeAmbiguous) && !out.subjects.length) ? "breakdown"
        : out.subjects.length || out.person || out.personAlternatives.length || out.singleBidder || out.employees ? "ranking_suppliers"
        : out.place || out.authorityKind ? "breakdown"
        : "total";
    }
    out.otherIntents = unique(ordered.filter((k) => k !== out.intent && k !== "compare"));
  }

  private leftover(c: Cursor, out: Interpretation) {
    const words: string[] = [];
    for (let k = 0; k < c.tokens.length; k++) {
      if (c.used[k]) continue;
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
      if (c.used[k]) { understood++; content++; }
      else if (meaningful) content++;
    }
    const anything = out.intent !== null;
    if (!anything) { out.confidence = 0; out.confidenceLabel = "none"; return; }
    let score = content ? understood / content : 0;
    if (out.intentSource === "default") score -= 0.1;
    if (out.placeAmbiguous) score -= 0.25;
    if (out.personAlternatives.length || out.entityAlternatives.length) score -= 0.2;
    const named = out.subjects.length || out.place || out.authority || out.supplier || out.person || out.authorityKind;
    if (!named) score -= 0.15;
    out.confidence = Math.max(0.05, Math.min(1, Math.round(score * 100) / 100));
    out.confidenceLabel = confidenceLabel(out.confidence);
  }
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

function typoSynonym(word: string, synonyms: string[]): CpvHit | null {
  if (word.length < 5) return null;
  const hit = synonyms.find((s) => !s.includes(" ") && s.length >= 5 && wordMatches(word, s));
  return hit ? { term: hit, cpvName: null } : null;
}
