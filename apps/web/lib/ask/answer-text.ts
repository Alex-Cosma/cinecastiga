/**
 * Plain-Romanian wording for the Ask answer: counts, percentages, the opening
 * line of an answer, the "rest" row of a ranking and the auto-run decision.
 * Pure functions (no React, no database), shared by the answer and its tests.
 */
import { formatInt, formatRon } from "../format";

const pct1 = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });

/**
 * "1 înregistrare", "14 înregistrări", "36 de înregistrări", "1.250 de înregistrări".
 * Romanian numerals take "de" when the last two digits are 00 or 20–99.
 */
export function countWords(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`;
  const lastTwo = Math.abs(Math.trunc(n)) % 100;
  const de = n !== 0 && (lastTwo === 0 || lastTwo >= 20);
  return `${formatInt(n)} ${de ? "de " : ""}${many}`;
}

/** A share (0.403) as "40,3%"; under 0,1% says so instead of "0,0%". */
export function formatShare(share: number): string {
  if (!Number.isFinite(share)) return "—";
  const percent = share * 100;
  if (percent > 0 && percent < 0.1) return "sub 0,1%";
  return `${pct1.format(percent)}%`;
}

/** A whole-number percentage change with a sign: "+12%", "−8%". */
export function formatChange(percent: number): string {
  if (!Number.isFinite(percent)) return "—";
  const rounded = Math.round(percent);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${pct0.format(Math.abs(rounded))}%`;
}

/** A decimal with a Romanian comma: 0.4 → "0,40" (digits = 2). */
export function formatDecimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** The first line of a breakdown answer: the total, before any slice. */
export function breakdownLead(slices: { value: number; count: number }[], other: { value: number; count: number }): string | null {
  const value = slices.reduce((sum, s) => sum + s.value, 0) + other.value;
  const count = slices.reduce((sum, s) => sum + s.count, 0) + other.count;
  if (value <= 0 && count <= 0) return null;
  return `În total: ${formatRon(value)} în ${countWords(count, "înregistrare", "înregistrări")} · valoare înregistrată, nu plăți`;
}

export interface RankingTotals {
  /** Sum of the ranked measure over every ranked entity, not only the shown rows. */
  value: number;
  /** Records behind the whole ranking. */
  count: number;
  /** Ranked entities (firms, institutions or counties). */
  entities: number;
}

/** "firme", "instituții", "județe" with Romanian agreement for the rest row. */
export function entityNoun(dim: string | undefined, n: number): string {
  if (dim === "supplier") return countWords(n, "firmă", "firme");
  if (dim === "county") return countWords(n, "județ", "județe");
  return countWords(n, "instituție", "instituții");
}

/**
 * The ranking's last row: everything after the shown entities. Null when the
 * total is unknown, nothing is left, or the numbers do not reconcile (never a
 * negative or invented rest).
 */
export function rankingRest(
  rows: { value: number; count: number }[],
  totals: RankingTotals | undefined,
): { entities: number; value: number; count: number; share: number } | null {
  if (!totals || totals.value <= 0) return null;
  const shownValue = rows.reduce((sum, r) => sum + r.value, 0);
  const shownCount = rows.reduce((sum, r) => sum + r.count, 0);
  const entities = totals.entities - rows.length;
  const value = totals.value - shownValue;
  const count = totals.count - shownCount;
  // Rounding in numeric sums may leave a fraction of a leu; anything below
  // that means the totals do not describe these rows.
  if (entities <= 0 || value < -1 || count < 0) return null;
  return { entities, value: Math.max(0, value), count, share: Math.max(0, value) / totals.value };
}

/** The share of one ranked row in the whole ranking, or null when unknown. */
export function rankingShare(value: number, totals: RankingTotals | undefined): number | null {
  return totals && totals.value > 0 ? value / totals.value : null;
}

/**
 * Should an interpreted free-text question be answered right away? Only when
 * the rules produced one reading (a spec and its sentence). Several readings
 * (namesakes, same-named places) or no reading wait for the person.
 */
export function shouldAutoRun(intent: { spec: unknown; sentence: string | null } | null | undefined): boolean {
  return Boolean(intent && intent.spec && intent.sentence);
}

/** The message a person sees when an answer cannot be computed. */
export const ANSWER_ERROR = "Nu am putut calcula răspunsul acum. Încearcă din nou.";

/** A short file name from the answer title ("cine-castiga-contractele-de-la….csv"). */
export function fileSlug(title: string, fallback = "intreaba-rezultat"): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/**
 * Is an /api/ask error already written for people (a Romanian explanation of
 * the selection), or technical text that belongs under "Detalii tehnice"?
 */
export function isHumanError(status: number, message: string | undefined | null): boolean {
  if (!message || status >= 500) return false;
  return !/eroare la execuție|could not|connect|ECONN|syntax|relation |column |must be|invalid|JSON|undefined|null|\{|\}/i.test(message);
}
