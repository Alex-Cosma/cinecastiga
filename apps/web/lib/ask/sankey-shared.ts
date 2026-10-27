import type { AskSpec } from "./spec";

/*
 * "Ce cumpără X și de la cine" (sankey-2, plan §4.9, F4; final sankey §3,
 * kit §6 sankey) as the screen and the engine read it, without SQL: the
 * partners × domains of the selection, the first 15 partners and 5 domains
 * with their counts, the rest of each side, the share from contracts with
 * several winners and the domain the flow could go down into. Plain
 * TypeScript for client and server; lib/ask/relations.ts holds the SQL.
 */

/** How many partners the flow draws (kit §6 sankey 5: `sankey.shown`); a link without the key draws 6, as before sankey-2. */
export const SANKEY_SHOWN = [6, 10, 15] as const;
export const DEFAULT_SANKEY_SHOWN = 6;
/** The partners and domains the answer holds: the client cuts the partners to `shown` and folds the rest. */
export const SANKEY_PARTNERS = 15;
export const SANKEY_DOMAINS = 5;
/** The rest of either side, a node of its own (dotted, kit §6 sankey 6). */
export const SANKEY_REST = "_alt";
/** „Detaliază ›” when one domain holds at least this share of the value and a deeper level exists (trusa-5, as the breakdown's). */
export const SANKEY_SUGGEST_SHARE = 0.9;

export const sankeyShown = (spec: Pick<AskSpec, "sankey">): number => spec.sankey?.shown ?? DEFAULT_SANKEY_SHOWN;

/** A flow between a partner (or the rest of them) and a domain (or the rest), with its records. */
export interface SankeyFlow {
  partnerId: string;
  partner: string;
  categoryCode: string;
  category: string | null;
  value: number;
  count: number;
}
/** A partner of the flow: its value, records and domains; the firms it shares contracts with (an institution in the centre). */
export interface SankeyPartner {
  entityId: string;
  name: string;
  value: number;
  count: number;
  /** Domains it has records in. */
  domains: number;
  /** Value from contracts with several winners. */
  joint: number;
  /** The firms that won the same contracts with it, by name (at most 3), and how many more. */
  with?: string[];
  withMore?: number;
}
/** A domain of the flow: its value, records and partners; with one record, that record's channel (absent on an answer stored before). */
export interface SankeyDomain { code: string; name: string | null; value: number; count: number; partners: number; single?: "da" | "contracts" }

/** A sankey-2 answer (plan §4.9). */
export interface SankeyData {
  block: "sankey";
  focal: { entityId: string; name: string; role: string };
  /** The first SANKEY_PARTNERS partners and their rest × the first SANKEY_DOMAINS domains and their rest. */
  flows: SankeyFlow[];
  /** The first SANKEY_PARTNERS partners, by value. */
  partners: SankeyPartner[];
  /** The first SANKEY_DOMAINS domains, by value. */
  domains: SankeyDomain[];
  /** The whole selection: every partner and domain, not only those held. */
  totals: { value: number; count: number; partners: number; domains: number };
  /** The length of the domains' codes (2 → 4 → 6 → 8, as the breakdown's), or 0 for the term's own prefixes. */
  stemLen: number;
  /** The value from contracts with several winners, shared equally (the note under the flow). */
  joint: number;
  /** Each channel in the same selection on every channel (the strip's shares); absent with a procedure or a single bidder. */
  streams?: Record<"da" | "contracts", { value: number; count: number }>;
}

/** An answer of before sankey-2: its flows only (ResultComparison and captures read both). */
export const isSankey2 = (data: { flows: unknown[]; partners?: unknown }): data is SankeyData => Array.isArray(data.partners);
