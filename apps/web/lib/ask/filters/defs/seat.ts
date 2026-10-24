import type { FilterDef } from "../types";
import { readAhead } from "./shared";

/*
 * The firm's seat (plan §2.5, kit §5.4): relative to the buyer's county on
 * each record (same, other) or abroad, and an absolute county. Both are
 * selections (the total changes, with the total line) and never sit in a
 * group row. Read ahead (F0a); F4 implements them. Today the only seat a
 * question applies is `county` on firm profiles (profilePredicates, entity_flags.county).
 */

export const firmSeat = readAhead<string>({
  id: "firmSeat", keys: ["filters.firmSeat"], placement: "sentence", control: "list",
  label: "Sediul firmei", windowTitle: "Unde au sediul firmele?", scope: "selection",
  sample: { block: "table", value: "other", base: { dim: "supplier" } },
});

export const seatCounty = readAhead<string>({
  id: "seatCounty", keys: ["filters.seatCounty"], placement: "sentence", control: "placeSearch",
  label: "Sediul firmei", windowTitle: "Unde au sediul firmele?", scope: "selection",
  sample: { block: "entity_card", value: "Cluj", base: { dim: "supplier", rankBy: "value" } },
});

export const SEAT_DEFS: readonly FilterDef[] = [firmSeat, seatCounty];
