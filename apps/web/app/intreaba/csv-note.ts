import { expect } from "vitest";
import { CSV_SIGNAL_NOTE } from "./answer-csv";

/**
 * For tests of an exported CSV that has risk or signal columns: every row ends with the caveat column (owner, 18
 * November 2026, legal audit). Checks it and gives the line back without it, so the rest is compared as before.
 * Use as `lines.map(noted)`: the first line is the header.
 */
export const noted = (line: string, i: number): string => {
  if (!line) return line;
  const end = i === 0 ? ",nota" : `,"${CSV_SIGNAL_NOTE}"`;
  expect(line.endsWith(end), `line ${i} ends with the note column`).toBe(true);
  return line.slice(0, -end.length);
};
