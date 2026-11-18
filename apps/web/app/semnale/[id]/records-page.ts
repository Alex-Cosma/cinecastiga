import { SOURCE_PAGE_SIZE } from "../../../lib/source-groups";

/** A signal's records, 10 a page in both modes (owner, 18 November 2026); the shared table's default stays 50. */
export const SIGNAL_RECORDS_PAGE = 10;

/**
 * lib/signal-page.ts reads the published titles of one page of SOURCE_PAGE_SIZE rows: the one that holds this page of
 * SIGNAL_RECORDS_PAGE rows. A page past the last lands on the last in both, so its rows keep their titles too.
 */
export function titlesPage(page: number): number {
  return Math.floor((page * SIGNAL_RECORDS_PAGE) / SOURCE_PAGE_SIZE);
}
