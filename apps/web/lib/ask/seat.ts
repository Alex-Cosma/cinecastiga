import { countyIsFirmSeat } from "./population";
import { countyWords } from "./question-ui";
import { FIRM_SEATS, type FirmSeat } from "./spec";
import { employeesWords, newFirmsPhrase } from "./filters/words";

/** A question as the engine and the builder hold it (AskSpec, QuestionSpec). */
type SeatSpec = { block: string; dim?: string; rankBy?: string; filters: { [key: string]: unknown } };

/*
 * The firm's seat in words and where answers show it (plan §2.5, F4; kit §4
 * "Sediul firmei", §5.4; owner-seat-switch, 24 October 2026). One column,
 * entity_profile.seat_county (the latest ONRC registration, then SEAP; a
 * foreign firm apart), read by two keys: firmSeat, the seat against the
 * buyer's county of each record, and seatCounty, the firm's own county. Plain
 * TypeScript for client and server; the SQL is lib/ask/predicates.ts.
 */

/** A foreign firm's place in the county column (packages/db SEAT_ABROAD_LABEL; seat.test.ts keeps them equal). */
export const SEAT_ABROAD = "Străinătate";

/** "în județul Cluj", "în București": a county as a seat (R9: "din" is the buyer's place). */
export const seatCountyWords = (county: string): string => countyWords(county).replace(/^din /, "în ");

/**
 * The seat against the buyer (kit §4): "în județul instituției", or the county
 * itself when the question fixes the buyers' county ("în județul Cluj"); "în
 * alt județ"; "în străinătate".
 */
export function firmSeatWords(seat: FirmSeat, buyerCounty?: string | null): string {
  if (seat === "same") return buyerCounty ? seatCountyWords(buyerCounty) : "în județul instituției";
  return seat === "other" ? "în alt județ" : "în străinătate";
}

/**
 * „De la cine › Ce fel de firme” on a ranking of institutions or counties
 * (plan §4.2 P2, kit §5.28: the seat is a chip there, S4r-from-seat): the
 * firms by their size and their seat against the buyer, "firme cu 1–9
 * angajați, cu sediul în alt județ", "firme cu sediul în străinătate"; the
 * size alone where the tab has no seat (`seat` false). Null without either.
 */
export function firmsKindPhrase(f: { [key: string]: unknown }, seat: boolean): string | null {
  const size = employeesWords(f.minEmployees, f.maxEmployees);
  const where = seat && typeof f.firmSeat === "string" && (FIRM_SEATS as readonly string[]).includes(f.firmSeat)
    ? `cu sediul ${firmSeatWords(f.firmSeat as FirmSeat, f.county ? String(f.county) : null)}` : null;
  // F5 (kit §5 table 5): the firms' own year first, "firme înmatriculate din 2024, fără angajați".
  const aged = seat && f.newSince !== undefined && (f.newScope === "archive" || f.newScope === "registry")
    ? newFirmsPhrase(f.newScope, Number(f.newSince)).replace(/^firme /, "") : null;
  const parts = [aged, size, where].filter((part): part is string => Boolean(part));
  return parts.length ? `firme ${parts.join(", ")}` : null;
}

/** The seat a question selects, in words ("în alt județ", "în județul Cluj"), or null without one. */
export function seatWords(spec: SeatSpec): string | null {
  const f = spec.filters;
  if (f.firmSeat) return firmSeatWords(f.firmSeat as FirmSeat, f.county ? String(f.county) : null);
  if (f.seatCounty) return seatCountyWords(String(f.seatCounty));
  // A link's county on firm profiles is the seat too (countyIsFirmSeat).
  if (f.county && countyIsFirmSeat(spec, spec.dim === "supplier" ? "supplier" : "authority")) return seatCountyWords(String(f.county));
  return null;
}

/** A question that names one firm: its own role is the focal one (question-ui focalRole, without its import cycle). */
const namedFirm = (spec: Pick<SeatSpec, "filters">) =>
  !(spec.filters.authorityName || spec.filters.authorityId) && Boolean(spec.filters.supplierName || spec.filters.supplierId);

/**
 * The questions of before F4 whose answer the seat switch changed
 * (owner-seat-switch; the key version "seat-2", answer-core.ts): a ranking,
 * trend, cloud or "Cine conduce?" of firms (the county beside each firm, and a
 * county on firm profiles), a comparison of two firms (their cards), a
 * distribution of a firm among the firms of a county.
 */
export function seatSwitched(spec: SeatSpec): boolean {
  if (["table", "trend", "entity_card", "scatter"].includes(spec.block)) return spec.dim === "supplier";
  if (spec.block === "compare") return namedFirm(spec);
  if (spec.block === "distribution") return Boolean(spec.filters.county) && namedFirm(spec);
  return false;
}

/** The answers that show a firm's own county or select firms by their seat: the note on where the seat comes from. */
export function firmCountyShown(spec: SeatSpec): boolean {
  // F4: the network around an institution shows each firm's seat beside it (network-2's own version, not seat-2).
  const firmsAround = spec.block === "network" && Boolean(spec.filters.authorityName || spec.filters.authorityId);
  return Boolean(spec.filters.firmSeat || spec.filters.seatCounty) || seatSwitched(spec) || firmsAround;
}
