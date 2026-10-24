import type { FilterDef } from "../types";
import { readAhead } from "./shared";

/* How many partners the flow draws (plan §4.9): six today, 10 or 15 from F4 (sankey-2). Read ahead. */

export const sankeyShown = readAhead<6 | 10 | 15>({
  id: "sankeyShown", keys: ["sankey.shown"], placement: "strip", control: "segmented",
  label: "Arată", scope: "display",
  sample: { block: "sankey", value: 10, base: { dim: "supplier", filters: { supplierId: 1 } } },
});

export const SANKEY_DEFS: readonly FilterDef[] = [sankeyShown];
