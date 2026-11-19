/**
 * Where an answer's notes are read (owner, 19 November 2026). An answer carries every note that shaped its number
 * (compile.ts `caveats`): the export and a saved capture keep them all. The page shows them by kind:
 *
 *  - "general": a rule of the site or the fixed definition of a condition (the sources, the ceilings, whose county a
 *    county is). The guide says it (/metodologie#totaluri and „Alte reguli ale site-ului”); the page does not repeat it.
 *  - "shown": the reader would read the number wrongly without it: a word matched approximately, a name chosen among
 *    several, a period cut or a year only partly in the data. One line under the answer, in both modes.
 *  - "calc": how this question was read (what a word leaves out, who a locality includes, a threshold). In „Cum am
 *    calculat”, Complet only.
 *
 * A note this file does not know is "calc": shown where the details are, never dropped. The patterns are the openings
 * of the texts in compile.ts, filters/describe.ts and per-capita.ts; caveat-kinds.test.ts feeds the real texts through.
 */
export type CaveatKind = "general" | "shown" | "calc";

const GENERAL: readonly RegExp[] = [
  /^Sursă:/,
  /^Contractele prin proceduri peste 1 miliard lei /,
  /^Achizițiile directe peste .+ lei sunt excluse/,
  /^Doar achizițiile directe acceptate/,
  /^Riscul \(0–100\) este un semnal statistic/,
  /^Județul = sediul /,
  /^Județul firmei = /,
  /^„O singură ofertă”: /,
  /^Filtrul pe angajați /,
  /^Filtrul «conduse azi de» /,
  /^Pe locuitor: /,
  /^Populația afișată este /,
  /^Mărimea e valoarea întregului contract /,
];

/** A year or a period only partly in the data (partialYearsCaveat, PERIOD_UNKNOWN_CAVEAT, TREND_2018_NOTE). */
const PARTIAL: readonly RegExp[] = [
  /^(?:An|Ani) (?:cu date parțiale sau provizorii|acoperi(?:t|ți) parțial de date)/,
  /^Perioada aleasă include /,
  /^Nu am putut citi perioada acoperită/,
  /^2018 e incomplet/,
  /^Și contractele din 2018 /,
];

const SHOWN: readonly RegExp[] = [
  /^Am interpretat „/,
  /am ales/i,
  /^Am restrâns /,
  /^Riscul și semnalele sunt calculate pe TOATĂ activitatea/,
  // Notes of older answers and of the written question's reading („am ignorat …”, „… nu există”, „în afara …”).
  /nu există|ignor|în afara/i,
  ...PARTIAL,
];

export function caveatKind(text: string): CaveatKind {
  if (GENERAL.some((pattern) => pattern.test(text))) return "general";
  if (SHOWN.some((pattern) => pattern.test(text))) return "shown";
  return "calc";
}

/** What follows the years in a partial-years note: why it matters, and that late publications may still raise it. */
const PARTIAL_TAIL = / (?:Totalul lui|Totalurile lor|Diferența dintre cei doi ani|Valoarea lui|Valorile lor|SEAP publică) /;

/** The line under the answer: a partial-years note keeps its first sentence (which years, which months). */
export function shownWords(text: string): string {
  if (!PARTIAL.some((pattern) => pattern.test(text))) return text;
  const tail = PARTIAL_TAIL.exec(text);
  return tail ? text.slice(0, tail.index) : text;
}

/**
 * A note as „Cum am calculat” says it: a locality's note keeps who it includes and drops how a town hall is matched to
 * its locality (UAT_SCOPE_METHOD, a fixed rule: the guide's „Tipul instituției”).
 */
export function calcWords(text: string): string {
  if (!text.startsWith("Localitatea „")) return text;
  const method = text.indexOf(" Asocierea autoritate–UAT este o inferență a aplicației");
  return method < 0 ? text : text.slice(0, method);
}

/**
 * An answer's notes for the page: `shown` under the answer in both modes, `calc` in „Cum am calculat”. A note cut for
 * its line under the answer is whole in „Cum am calculat”.
 */
export function splitCaveats(caveats: readonly string[]): { shown: string[]; calc: string[] } {
  const shown: string[] = [], calc: string[] = [];
  for (const text of caveats) {
    const kind = caveatKind(text);
    if (kind === "general") continue;
    if (kind === "calc") { calc.push(calcWords(text)); continue; }
    const line = shownWords(text);
    shown.push(line);
    if (line !== text) calc.push(text);
  }
  return { shown, calc };
}
