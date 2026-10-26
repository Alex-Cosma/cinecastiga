import { COUNTIES } from "../../../counties";
import { countyIsFirmSeat } from "../../population";
import { FIRM_SEATS, SEAT_RULES, type FirmSeat } from "../../spec";
import { TRANSACTION_FORMS } from "../context";
import type { AnswerForm, FilterDef, FilterSpec } from "../types";
import { alwaysScope, edited, levels } from "./shared";

/*
 * The firm's seat (plan §2.5, §3, F4; kit §5.4, §5.28, §7): one column
 * (entity_profile.seat_county: the latest ONRC registration, then SEAP; a
 * foreign firm apart), two keys. Both are selections, the total changes and
 * the total line says how (G8); neither sits in a group row. Where firms are
 * the subject the seat is a phrase glued to it, "cu sediul [în alt județ]"
 * (R9: "din" is the buyer's place), from "+ Sediul firmei" and the window
 * "Unde au sediul firmele?".
 * - firmSeat: the record's firm against the record's buyer county (same,
 *   other) or abroad (predicates.ts firmSeatCond), on the records only;
 * - seatCounty: the firm's own county (seatCountyCond), on the records of a
 *   question about firms and on firm profiles, where a link's county is the
 *   same condition: the window writes seatCounty in its place.
 */

/** Firm profiles: the risk cloud of firms and "Cine conduce?" on the index (a county there is the seat, countyIsFirmSeat). */
const firmProfile = (spec: FilterSpec) => countyIsFirmSeat(spec, spec.dim === "supplier" ? "supplier" : "authority");

export const firmSeat: FilterDef<FirmSeat> = {
  id: "firmSeat", keys: ["filters.firmSeat"], placement: "sentence", control: "list",
  label: "Sediul firmei", windowTitle: "Unde au sediul firmele?",
  windowNote: "Sediul social, din Registrul Comerțului, apoi din SEAP. Nu e locul lucrării.",
  // A condition on each record (same, other: against its buyer county) or on the firm (abroad); a profile has no record.
  engine: levels(TRANSACTION_FORMS, "row"), scope: alwaysScope("selection"), since: "F4",
  read: (spec) => spec.filters.firmSeat as FirmSeat | undefined,
  // One seat at a time: the relative one replaces the firm's own county.
  write: (spec, value) => edited(spec, (next) => {
    if (value === undefined) delete next.filters.firmSeat;
    else { next.filters.firmSeat = value; delete next.filters.seatCounty; }
  }),
  // "Cine conduce?" by value has no buyer of its own row to compare with: only abroad (kit §6 entity_card 1).
  choices: (_spec, ctx) => ctx.form === "entity_card:value" ? [undefined, "abroad"] : [undefined, ...FIRM_SEATS],
  validate: SEAT_RULES.firmSeat,
};

/** Where firms are the subject (SEAT_COUNTY_BLOCKS): their records, or their profiles. */
const SEAT_COUNTY_FORMS: Partial<Record<AnswerForm, "entityAttr" | "profile">> = {
  table: "entityAttr", trend: "entityAttr", "entity_card:value": "entityAttr", scatter: "profile", "entity_card:risk": "profile",
};

export const seatCounty: FilterDef<string> = {
  id: "seatCounty", keys: ["filters.seatCounty"], placement: "sentence", control: "placeSearch",
  label: "Sediul firmei", windowTitle: "Unde au sediul firmele?",
  windowNote: "Sediul social, din Registrul Comerțului, apoi din SEAP. Nu e locul lucrării.",
  engine: SEAT_COUNTY_FORMS, scope: alwaysScope("selection"), since: "F4",
  read: (spec) => spec.filters.seatCounty as string | undefined,
  // One seat at a time; on a firm profile a link's county was this same seat (plan §2.6: rewritten at the first edit).
  write: (spec, value) => edited(spec, (next) => {
    if (value === undefined) delete next.filters.seatCounty;
    else { next.filters.seatCounty = value; delete next.filters.firmSeat; }
    if (firmProfile(next)) { delete next.filters.county; delete next.filters.uatSiruta; delete next.filters.uatName; }
  }),
  choices: () => [undefined, ...COUNTIES],
  validate: SEAT_RULES.seatCounty,
};

export const SEAT_DEFS: readonly FilterDef[] = [firmSeat, seatCounty];
