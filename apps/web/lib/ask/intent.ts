/**
 * Input-intelligence layer for the "Construiește" builder — ported from the
 * search-mock's intent.js (tg-bridge session). Two rules it enforces:
 *
 * 1. EVERYTHING is folded before matching. Patterns are written in plain
 *    ASCII, never [aăâ] — "pana"/"până"/"pînă" are the same string by the time
 *    any pattern sees them. (A literal `â` in a regex cost us a silent
 *    no-match once; never again.)
 * 2. Candidates are SCORED, not filtered. The dropdown ranks options by how
 *    well they explain what was typed, so the best guess is row 1 and Enter is
 *    safe to press blind.
 */

/** Diacritic-fold + lowercase — the one true normalization. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Bounded edit distance (bails past `max`). */
export function lev(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev: number[] = new Array(lb + 1);
  let cur: number[] = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j]! < best) best = cur[j]!;
    }
    if (best > max) return max + 1;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[lb]!;
}

/**
 * How well does `text` answer the query `q`? 0 = no, 1 = perfect.
 * Tiers: exact > starts-with > word-starts-with > contains > fuzzy.
 * Typo tolerance scales with length — short words get none, so "Cluj" never
 * fuzzy-matches "Gorj".
 */
export function score(q: string, text: string): number {
  const a = fold(q);
  const b = fold(text);
  if (!a) return 0;
  if (a === b) return 1;
  if (b.startsWith(a)) return 0.92 - Math.min(0.1, (b.length - a.length) / 400);
  const words = b.split(/[\s\-,.()/"']+/).filter(Boolean);
  if (words.some((w) => w.startsWith(a))) return 0.8;
  const idx = b.indexOf(a);
  if (idx >= 0) return 0.66 - Math.min(0.12, idx / 200);
  const budget = a.length >= 9 ? 2 : a.length >= 5 ? 1 : 0;
  if (!budget) {
    // multiword query: every token must land somewhere
    const toks = a.split(/\s+/).filter((t) => t.length > 1);
    if (toks.length > 1 && toks.every((t) => b.includes(t))) return 0.7;
    return 0;
  }
  if (lev(a, b, budget) <= budget) return 0.6;
  // typo'd PREFIX of a long name: "nucler" → "Nuclearelectrica"
  if (b.length > a.length && lev(a, b.slice(0, a.length), budget) <= budget) return 0.58;
  for (const w of words) {
    if (w.length > a.length && lev(a, w.slice(0, a.length), budget) <= budget) return 0.56;
  }
  for (const w of words) {
    if (Math.abs(w.length - a.length) > budget) continue;
    const d = lev(a, w, budget);
    if (d <= budget) return 0.55 - d * 0.05;
  }
  const toks = a.split(/\s+/).filter((t) => t.length > 1);
  if (toks.length > 1 && toks.every((t) => b.includes(t))) return 0.7;
  return 0;
}

const NUM_WORDS: Record<string, number> = {
  unu: 1, doi: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8,
  noua: 9, zece: 10, cincisprezece: 15, douazeci: 20, cincizeci: 50,
};

export const CURRENT_YEAR = 2026;

export interface Intents {
  raw: string;
  q: string;
  /** A control phrase matched — suppress the free-text-CPV fallback. */
  consumed: boolean;
  topN?: { n: number | null; over?: boolean; bare?: boolean };
  yearFrom?: { digits: string };
  yearTo?: { digits: string };
  yearExact?: { year: number; label?: string };
  yearRange?: { from: number; to: number; label: string };
  yearBare?: { year: number };
  perCapita?: boolean;
  risk?: boolean;
  /** "un singur ofertant" / "fără licitație" — partial = word still being typed. */
  singleBidder?: { partial: boolean };
  /** "contracte", "licitații", "peste prag" → the contracts stream. */
  datasetContracts?: boolean;
  /** "achiziții directe", "sub prag" → back to the DA stream. */
  datasetDa?: boolean;
  /** "sub 5 angajați" / "peste 100 angajați" / "fără angajați" — supplier size. */
  employees?: { min?: number; max?: number; label: string; partial?: boolean };
  stripped: { dim: string; kind: string; county: string; place: string };
}

/**
 * Parse the query into typed intents. Partial intents are returned too
 * ({topN: {n: null}} for a bare "primele"), so the dropdown offers the
 * completions instead of falling through to CPV search.
 */
export function parseIntents(qRaw: string): Intents {
  const q = fold(qRaw);
  const out: Intents = {
    raw: qRaw,
    q,
    consumed: false,
    stripped: {
      dim: qRaw.replace(/^\s*(cu|pe|dupa|după)\s+/i, "").trim(),
      kind: qRaw.replace(/^\s*(doar|numai)\s+/i, "").trim(),
      county: qRaw.replace(/^\s*(jud|judetul|județul|jud\.)\s+/i, "").trim(),
      place: qRaw.replace(/^\s*(in|în|din|la)\s+/i, "").trim(),
    },
  };
  if (!q) return out;
  let m: RegExpExecArray | null;

  // ranking size: "primele 5", "primii", "top 10", "top5", "primele cinci", bare "8"
  if ((m = /^(primele|primii|primul|top|cele mai|cei mai)\s*(\d{1,4})?$/.exec(q))) {
    const n = m[2] ? parseInt(m[2], 10) : null;
    out.topN = { n: n == null ? null : Math.min(Math.max(n, 1), 50), over: n != null && n > 50 };
    out.consumed = true;
  } else if ((m = /^(\d{1,3})$/.exec(q)) && +m[1]! >= 1 && +m[1]! <= 99) {
    out.topN = { n: Math.min(+m[1]!, 50), over: +m[1]! > 50, bare: true };
  } else if (/^(primele|primii|top)\s+/.test(q)) {
    const w = NUM_WORDS[q.replace(/^(primele|primii|top)\s+/, "")];
    if (w) {
      out.topN = { n: w };
      out.consumed = true;
    }
  }

  // period: "din 2019", "pana in 2024", "in 2023", "anul trecut", "ultimii 3 ani"
  if ((m = /^din(?:\s+anul)?\s*(\d{0,4})$/.exec(q))) {
    out.yearFrom = { digits: m[1]! };
    out.consumed = true;
  }
  if ((m = /^p[ai]n[ai](?:\s+in)?\s*(\d{0,4})$/.exec(q))) {
    out.yearTo = { digits: m[1]! };
    out.consumed = true;
  }
  if ((m = /^in\s*(\d{4})$/.exec(q))) {
    out.yearExact = { year: +m[1]! };
    out.consumed = true;
  }
  if (/^anul trecut$/.test(q)) {
    out.yearExact = { year: CURRENT_YEAR - 1, label: "anul trecut" };
    out.consumed = true;
  }
  if (/^anul acesta$/.test(q)) {
    out.yearExact = { year: CURRENT_YEAR, label: "anul acesta" };
    out.consumed = true;
  }
  if ((m = /^ultimii?\s*(\d{1,2})?\s*ani$/.exec(q))) {
    const n = m[1] ? +m[1] : 3;
    out.yearRange = { from: CURRENT_YEAR - n, to: CURRENT_YEAR, label: `ultimii ${n} ani` };
    out.consumed = true;
  }
  if ((m = /^(\d{4})$/.exec(q)) && +m[1]! >= 2015 && +m[1]! <= 2030) {
    out.yearBare = { year: +m[1]! };
  }

  // risk phrasing → entity_card/rankBy=risk territory
  if (/^(riscant|riscante|risc|cele mai riscante|suspect|suspecte|semnalate)$/.test(q)) {
    out.risk = true;
    out.consumed = true;
  }

  // per-capita phrasing
  if (/^(pe locuitor|per locuitor|pe cap de locuitor|lei pe locuitor|pe cap)$/.test(q)) {
    out.perCapita = true;
    out.consumed = true;
  }

  // competition phrasing → contracts stream + singleBidder
  if (
    /^(fara licitatie|un singur ofertant|ofertant unic|singur ofertant|necompetitiv|fara competitie)$/.test(q) ||
    /^(fara|un singur|ofertant|ofertan)$/.test(q)
  ) {
    out.singleBidder = { partial: /^(fara|un singur|ofertant|ofertan)$/.test(q) };
    out.consumed = true;
  }
  // supplier size: "sub 5 angajati", "cel mult 10 angajati", "peste 100 angajati",
  // "fara angajati"; partial while the number/word is still being typed
  if (/^fara angajati$/.test(q)) {
    out.employees = { max: 0, label: "fără angajați" };
    out.consumed = true;
  } else if ((m = /^(sub|cel mult|maxim?|max)\s+(\d{1,6})\s*angajati?$/.exec(q))) {
    const n = +m[2]!;
    const max = /^sub$/.test(m[1]!) ? Math.max(0, n - 1) : n;
    out.employees = { max, label: `${m[1]} ${n} angajați` };
    out.consumed = true;
  } else if ((m = /^(peste|cel putin|minim?|min)\s+(\d{1,6})\s*angajati?$/.exec(q))) {
    const n = +m[2]!;
    const min = /^peste$/.test(m[1]!) ? n + 1 : n;
    out.employees = { min, label: `${m[1]} ${n} angajați` };
    out.consumed = true;
  } else if (/^(sub|peste|cel mult|cel putin|maxim|minim)\s+\d{0,6}\s*(a|an|ang|anga|angaj|angaja|angajat|angajati?)?$/.test(q) && /\d/.test(q)) {
    out.employees = { label: q, partial: true };
    out.consumed = true;
  } else if (/^(fara|fara a|fara an|fara ang|fara anga|fara angaj|fara angaja|fara angajat)$/.test(q)) {
    out.employees = { label: q, partial: true };
    out.consumed = true;
  }

  // data stream phrasing
  if (/^(contracte|licitatii|licitatie|peste prag|proceduri)$/.test(q)) {
    out.datasetContracts = true;
    out.consumed = true;
  }
  if (/^(achizitii directe|sub prag|directe)$/.test(q)) {
    out.datasetDa = true;
    out.consumed = true;
  }

  return out;
}
