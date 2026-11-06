import { questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { AskSpec } from "../../../lib/ask/spec";

/*
 * "Înapoi" from an entity's page opened from the risk cloud's list (owner, 6 November 2026: a row opens the
 * institution's or the firm's page): the list comes back as long as it was, with that row where it was on the
 * screen, instead of the answer's first ten rows under its title. The row's link writes where it was; the answer of
 * the same question reads it, and Întreabă then leaves the scroll and the focus to the list. Session storage: one tab,
 * gone with it; where it is refused (a private window), the answer opens at its title as before.
 */

export interface ListReturn {
  /** The question (questionKey of the applied spec): another question does not take it. */
  key: string;
  /** The rows shown ("Arată încă 10"). */
  shown: number;
  /** The entity of the row that was left. */
  id: string;
  /** The row's top in the window when it was clicked, in px. */
  top: number;
  /** When, in ms: an older return is a new visit. */
  at: number;
}

const STORE = "intreaba:list-return";
/** Past this, a return is a new visit and the answer opens at its title. */
export const LIST_RETURN_MS = 30 * 60 * 1000;

export const listReturnKey = (spec: AskSpec): string => questionKey(spec as unknown as QuestionSpec);

/** The stored return when it is this question's and recent; null otherwise (or unreadable). */
export function parseListReturn(raw: string | null, key: string, now: number): ListReturn | null {
  if (!raw) return null;
  let r: Partial<ListReturn>;
  try { r = JSON.parse(raw) as Partial<ListReturn>; } catch { return null; }
  if (!r || r.key !== key || typeof r.id !== "string" || !r.id) return null;
  if (typeof r.shown !== "number" || !Number.isFinite(r.shown) || r.shown < 1) return null;
  if (typeof r.top !== "number" || !Number.isFinite(r.top) || typeof r.at !== "number" || r.at > now || now - r.at > LIST_RETURN_MS) return null;
  return { key: r.key, shown: Math.floor(r.shown), id: r.id, top: r.top, at: r.at };
}

/** A plain click on a row's link: where the list was. Ctrl/Cmd/Shift-click opens another tab and leaves nothing. */
export function rememberListReturn(spec: AskSpec, at: Omit<ListReturn, "key" | "at">): void {
  try { sessionStorage.setItem(STORE, JSON.stringify({ ...at, key: listReturnKey(spec), at: Date.now() })); } catch { /* refused */ }
}

/** This question's return, if it has one (read, not taken: Întreabă and the list both ask). */
export function readListReturn(spec: AskSpec): ListReturn | null {
  try { return parseListReturn(sessionStorage.getItem(STORE), listReturnKey(spec), Date.now()); } catch { return null; }
}

/** Once the list is back, the return is spent. */
export function forgetListReturn(): void {
  try { sessionStorage.removeItem(STORE); } catch { /* refused */ }
}
