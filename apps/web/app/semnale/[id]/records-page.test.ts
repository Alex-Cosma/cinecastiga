import { describe, expect, it } from "vitest";
import { SOURCE_PAGE_SIZE, sourcePage } from "../../../lib/source-groups";
import { SIGNAL_RECORDS_PAGE, titlesPage } from "./records-page";

/** The page of 10 the table shows (components/SourceEvidenceView.tsx, pageSize), with the same bounds as sourcePage. */
function shown(rows: number[], requested: number): number[] {
  const pages = Math.max(1, Math.ceil(rows.length / SIGNAL_RECORDS_PAGE));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return rows.slice(page * SIGNAL_RECORDS_PAGE, (page + 1) * SIGNAL_RECORDS_PAGE);
}

describe("a signal's records, 10 a page (owner, 18 November 2026)", () => {
  it("reads the titles of the 50 that hold the page of 10", () => {
    expect(SOURCE_PAGE_SIZE % SIGNAL_RECORDS_PAGE).toBe(0);
    expect([0, 4, 5, 9, 10, 19].map(titlesPage)).toEqual([0, 0, 1, 1, 2, 3]);
  });

  it("has a title for every row on screen, for any length and any requested page, past the last too", () => {
    for (const n of [0, 1, 9, 10, 11, 49, 50, 51, 99, 200, 201, 537]) {
      const rows = Array.from({ length: n }, (_, i) => i);
      for (let p = 0; p <= Math.ceil(n / SIGNAL_RECORDS_PAGE) + 7; p++) {
        const titled = new Set(sourcePage(rows, titlesPage(p)).rows);
        expect(shown(rows, p).every((r) => titled.has(r)), `${n} rows, page ${p}`).toBe(true);
      }
    }
  });
});
