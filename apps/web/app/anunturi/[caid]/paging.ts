/** A notice's records, ten a page in both modes (owner, 18 November 2026; until then 50, so most notices showed all). */
export const NOTICE_PAGE_SIZE = 10;

/** The page the address asks for (`?p=`): a whole number from 1; anything else is the first page. */
export function noticePage(p: string | undefined): number {
  const n = Math.floor(Number(p));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** How many pages a list of `shown` records takes; at least one, so an empty list still has its page. */
export function noticePages(shown: number, pageSize = NOTICE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(shown / pageSize));
}
