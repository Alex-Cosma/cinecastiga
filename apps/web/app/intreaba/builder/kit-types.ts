import type { ReactNode } from "react";
import type { GlossaryId } from "../../../lib/glossary";

/*
 * Prop shapes of the filter kit (F1a). The kit is presentational: props in,
 * events out, no fetching. These mirror the plan's FilterDef side (plan §2.2:
 * Availability, the option rows of a window, the sentence tokens) without
 * importing lib/ask/filters, so F1b maps a FilterDef onto them in one place.
 */

/** A (?) explanation: a glossary entry, or words built by the caller. */
export type KitTip = { id: GlossaryId } | { title: string; text: ReactNode };

/**
 * Plan §2.2 Availability, as a component sees it. "hidden" never reaches a
 * component (R1: what cannot apply is not drawn); "disabled" keeps the control
 * readable with its reason (aria-disabled + aria-describedby, kit §8).
 */
export type KitAvailability = { state: "offered" } | { state: "disabled"; reason: string; tip?: KitTip };

/** One sentence token (plan §2.2 sentence.ts: text | slot | fixed). */
export type SentenceToken =
  | { kind: "text"; text: string }
  /** An editable phrase. `slot` names it for screen readers: "Perioada: 2025". */
  | { kind: "slot"; id: string; slot: string; value: string; className?: string }
  /** A word that cannot change here ("din toată țara" for county councils). Text, not a button. */
  | { kind: "fixed"; text: string };

/**
 * One row of a window's list (component 9), with its count computed on the
 * draft without this window's own key (R5). Counts arrive formatted
 * ("32,0% · 88", "→ 336", "doar 1"): numerals follow countWords upstream.
 */
export interface KitOption {
  value: string;
  label: string;
  /** Second line ("județul instituției", "din care București 49,6%"). */
  detail?: string;
  count?: string;
  /** 0–1: the share bar under the label. */
  share?: number;
  /** "în locul populației apropiate": what choosing this replaces. */
  swap?: string;
  /** Shown but not choosable; the reason is read with the option. */
  disabled?: string;
  /** Group heading above this option when it differs from the previous one ("Firme", "Instituții"). */
  group?: string;
  /** Static state classes for the dev demo frames (is-hover, is-focus). */
  className?: string;
}

/** A row that cannot be chosen, so the window adds to 100% ("Sediu necunoscut", "Fără bilanț"). */
export interface KitRestRow { label: string; count?: string }

/**
 * Why a choice changed: "move" is an arrow key inside a radiogroup (the WAI
 * radio pattern checks while moving), "activate" a click, Enter or Space. A
 * window that closes on a choice closes only on "activate".
 */
export type ChangeSource = "move" | "activate";
