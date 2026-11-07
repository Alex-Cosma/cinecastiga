/*
 * One date format for the private space (owner, 7 November 2026): dd.mm.yyyy, Bucharest time, with the hour only
 * where it matters (a capture, a check, a data validation). Pure helpers, shared by the server and the client pages.
 */

const day = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit", month: "2-digit", year: "numeric" });
const clock = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const instant = (value: string | Date | null | undefined): Date | null => {
  if (value == null || value === "") return null;
  // "2026-11-07 10:16:23.15+00" (PostgreSQL text) is not ISO for every engine: put the T in.
  const at = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00") : value);
  return Number.isFinite(at.getTime()) ? at : null;
};

/** An instant as its calendar day in București: "07.11.2026". A calendar date (YYYY-MM-DD) is read as written. */
export function privateDay(value: string | Date | null | undefined, missing = "Dată necunoscută"): string {
  if (typeof value === "string") {
    const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (calendar) return `${calendar[3]}.${calendar[2]}.${calendar[1]}`;
  }
  const at = instant(value);
  return at ? day.format(at) : missing;
}

/** An instant with its hour in București: "07.11.2026, 12:16". */
export function privateMoment(value: string | Date | null | undefined, missing = "Încă neverificată"): string {
  const at = instant(value);
  return at ? `${day.format(at)}, ${clock.format(at)}` : missing;
}

/**
 * Limits and reading notes said once each (owner, 7 November 2026: three of ten were repeats): the same sentence
 * from two sources counts once; the first `visible` stay in view, the rest go under "Toate limitele (n)".
 */
export function uniqueNotes(notes: readonly unknown[], visible = 3): { shown: string[]; rest: string[]; all: string[] } {
  const seen = new Set<string>(), all: string[] = [];
  for (const note of notes) {
    if (typeof note !== "string") continue;
    const text = note.trim(), key = text.toLocaleLowerCase("ro-RO").replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    if (!text || seen.has(key)) continue;
    seen.add(key); all.push(text);
  }
  return { shown: all.slice(0, visible), rest: all.slice(visible), all };
}

/** The earliest and latest of some calendar dates (YYYY-MM-DD), as "07.09.2026 – 25.09.2026" or one day. */
export function privatePeriod(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null;
  return from === to ? privateDay(from) : `${privateDay(from)} – ${privateDay(to)}`;
}

/** A year list as "2018–2021, 2023–2025": runs of consecutive years joined, oldest first. */
export function yearRuns(years: readonly (string | number)[]): string {
  const numbers = [...new Set(years.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j]! + 1) j++;
    runs.push(i === j ? String(numbers[i]) : `${numbers[i]}–${numbers[j]}`);
    i = j;
  }
  return runs.join(", ");
}

/**
 * A title for people to read (owner, 7 November 2026): the source's all-capitals names in ordinary case
 * ("Cât valorează … ORASUL ODOBESTI (CONSILIUL LOCAL…)" → "… Orasul Odobesti (Consiliul Local…)"). Short all-capitals
 * words stay (SRL, SA, CJ), and so does anything with a digit or a dot (S.R.L., 2024).
 */
export function humanTitle(text: string): string {
  return text.replace(/[\p{Lu}][\p{Lu}\p{M}'-]{3,}/gu, (word) => word.charAt(0) + word.slice(1).toLocaleLowerCase("ro-RO"));
}
