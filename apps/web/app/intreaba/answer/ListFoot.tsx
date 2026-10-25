"use client";

import type { RefObject } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import { formatInt } from "../../../lib/format";
import type { KitLink as Link } from "../builder/kit-types";
import KitLink from "./KitLink";

/*
 * Component 21, the longer list (kit §5.34): "Arată încă 10" pages, "Arată
 * toate cele 14" shows the rest at once (up to 50, the caller's rule), and
 * what stays folded is a dashed line of text, "alte 392 de firme · 25% din
 * valoare". Showing more moves focus to the first new row, so a keyboard or
 * screen reader does not start again at the top. The records button
 * ("Vezi cele 124 de înregistrări →") sits at the end.
 */

export interface ListFootWords { more: string | null; rest: string | null }

/**
 * The rows' noun, one and many, and its gender, which chooses "alte" or
 * "alți": ["firmă", "firme", "f"], ["partener", "parteneri", "m"],
 * ["domeniu", "domenii", "n"].
 */
export type ListNoun = readonly [one: string, many: string, gender: "f" | "m" | "n"];

/** "o altă firmă" / "alte 392 de firme", "un alt partener" / "alți 267 de parteneri", "un alt domeniu" / "alte 30 de domenii". */
const OTHER = { f: ["o altă", "alte"], m: ["un alt", "alți"], n: ["un alt", "alte"] } as const;

/** The words of the foot, numerals with "de" from 20 (kit §4). */
export function listFootWords({ shown, total, noun, step = 10, all = false, restDetail }: { shown: number; total: number; noun: ListNoun; step?: number; all?: boolean; restDetail?: string }): ListFootWords {
  const remaining = Math.max(0, total - shown);
  if (!remaining) return { more: null, rest: null };
  const more = all ? `Arată toate cele ${formatInt(total)}` : `Arată încă ${formatInt(Math.min(step, remaining))}`;
  const [one, many] = OTHER[noun[2]];
  const rest = `${remaining === 1 ? `${one} ${noun[0]}` : `${many} ${countWords(remaining, noun[0], noun[1])}`}${restDetail ? ` · ${restDetail}` : ""}`;
  return { more, rest };
}

/** After more rows arrive, focus the first new one (rows marked data-qb-arow, or .qb-arow). */
export function focusFirstNew(list: HTMLElement | null, shown: number): void {
  const rows = list ? Array.from(list.querySelectorAll<HTMLElement>("[data-qb-arow]")) : [];
  rows[shown]?.focus();
}

export interface ListFootProps {
  shown: number;
  total: number;
  noun: ListNoun;
  step?: number;
  all?: boolean;
  restDetail?: string;
  onMore?: () => void;
  /** Where the rows are, so focus can move to the first new one. */
  list?: RefObject<HTMLElement | null>;
  records?: Link;
}

export default function ListFoot({ shown, total, noun, step = 10, all = false, restDetail, onMore, list, records }: ListFootProps) {
  const words = listFootWords({ shown, total, noun, step, all, ...(restDetail ? { restDetail } : {}) });
  if (!words.more && !records) return null;
  return <div className="qb-listfoot">
    {words.more && <span className="qb-row">
      <button type="button" className="qb-more-btn" onClick={() => { onMore?.(); requestAnimationFrame(() => focusFirstNew(list?.current ?? null, shown)); }}>{words.more}</button>
      <span className="qb-rest">{words.rest}</span>
    </span>}
    {records && <KitLink link={{ glyph: "→", ...records }} className="qb-secondary" />}
  </div>;
}
