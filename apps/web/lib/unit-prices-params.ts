/*
 * Unit prices: reading the address of /preturi and /preturi/[produs]. Pure (no database, no Next), so it is tested
 * alone (unit-prices-params.test.ts). Anything malformed is dropped, never guessed, and never reaches SQL.
 */

/** Next gives a repeated parameter (`?judet=Cluj&judet=Alba`) as an array: the first value stands, the rest are dropped. */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(sp)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") out[key] = first;
  }
  return out;
}

/** The largest page an address may name; the list is clamped to its own last page once its total is known. */
export const MAX_PAGE = 100_000;

/** `pagina` (1-based in the address) as a 0-based page: whole numbers from 1 only, anything else is the first page. */
export function parsePage(raw: string | undefined): number {
  if (!raw || !/^[1-9]\d{0,5}$/.test(raw)) return 0;
  return Math.min(Number(raw), MAX_PAGE) - 1;
}

/** The pages a list of `total` rows has (at least one), and `page` kept inside them. */
export function clampPage(page: number, total: number, pageSize: number): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1), pages };
}

/** `an`: a year of this century, or null. */
export function parseYear(raw: string | undefined): number | null {
  return raw && /^20\d\d$/.test(raw) ? Number(raw) : null;
}

/** The institution a dot or a lead opens: `deschis=<authority id>-<year>` (one row), or `<authority id>` alone (its rows). */
export interface Pin { authorityId: string; year: number | null }
export function parsePin(raw: string | undefined): Pin | null {
  const m = /^([1-9]\d{0,17})(?:-(20\d\d))?$/.exec(raw ?? "");
  return m ? { authorityId: m[1]!, year: m[2] ? Number(m[2]) : null } : null;
}
/** The value of `deschis` for one institution in one year. */
export const pinParam = (authorityId: string, year: number) => `${authorityId}-${year}`;

/**
 * The page's rows with the pinned ones first. A pinned row already on the page moves up; one from another page is
 * added, and `extra` says how many were, so the page can say it shows more rows than its range.
 */
export function applyPin<T extends { authority_id: string; year: number }>(rows: readonly T[], pinned: readonly T[]): { rows: T[]; extra: number } {
  if (!pinned.length) return { rows: [...rows], extra: 0 };
  const key = (r: T) => `${r.authority_id}-${Number(r.year)}`;
  const keys = new Set(pinned.map(key));
  const rest = rows.filter((r) => !keys.has(key(r)));
  return { rows: [...pinned, ...rest], extra: pinned.length - (rows.length - rest.length) };
}
