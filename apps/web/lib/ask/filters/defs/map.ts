import { MAP_LENSES, type MapLens } from "../../spec";
import type { FilterDef } from "../types";
import { alwaysScope, edited } from "./shared";

/*
 * The map's lens beyond the measure (F5, plan §4.4 P6, map final §3.7):
 * „Firme din județ” (seat) and „Cota firmei” (share), beside the measure's
 * Valoare · Pe locuitor · Înregistrări in the strip's „Harta arată”. Display
 * only: the county facts (part `map`, lib/ask/map-facts.ts) hold every lens,
 * so a switch asks nothing. A lens the question cannot show (the share
 * without a firm, the seat beside one) is kept and drawn as the value until
 * it can (map final §3.7 „Implicit”).
 */

export const mapLens: FilterDef<MapLens> = {
  id: "mapLens", keys: ["map.lens"], placement: "strip", control: "segmented",
  label: "Harta arată", windowTitle: "Ce arată harta?",
  engine: { map: "display" }, scope: alwaysScope("display"), since: "F5",
  read: (spec) => spec.map?.lens,
  write: (spec, value) => edited(spec, (next) => {
    if (value === undefined) delete next.map;
    else next.map = { ...next.map, lens: value };
  }),
  choices: () => [undefined, ...MAP_LENSES],
};

export const MAP_DEFS: readonly FilterDef[] = [mapLens];
