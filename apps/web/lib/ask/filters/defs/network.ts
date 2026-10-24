import type { FilterDef } from "../types";
import { readAhead } from "./shared";

/*
 * The network's groups and display (plan §4.8): new, continuing or gone
 * partners since a reference year, the order, how many, with signals. Read
 * ahead; F4 implements them, with network-2. Without them: every partner, 14 nodes.
 */

const focal = { dim: "authority", filters: { authorityId: 1 } };

export const networkPartners = readAhead<"new" | "continuing" | "gone">({
  id: "networkPartners", keys: ["network.partners"], placement: "strip", control: "countGroups",
  label: "Ce parteneri", scope: "group",
  sample: { block: "network", value: "new", base: focal },
});

export const networkSince = readAhead<number>({
  id: "networkSince", keys: ["network.since"], placement: "strip", control: "rangePills",
  label: "Anul de referință", scope: "group",
  sample: { block: "network", value: 2023, base: focal },
});

export const networkOrder = readAhead<"value" | "count" | "years">({
  id: "networkOrder", keys: ["network.order"], placement: "strip", control: "segmented",
  label: "Ordinea", scope: "display",
  sample: { block: "network", value: "years", base: focal },
});

export const networkShow = readAhead<10 | 15 | 25 | 50>({
  id: "networkShow", keys: ["network.show"], placement: "strip", control: "segmented",
  label: "Câți parteneri", scope: "display",
  sample: { block: "network", value: 25, base: focal },
});

export const networkSignals = readAhead<true>({
  id: "networkSignals", keys: ["network.signals"], placement: "row", control: "toggle",
  label: "Cu semnale", scope: "selection",
  sample: { block: "network", value: true, base: focal },
});

export const NETWORK_DEFS: readonly FilterDef[] = [networkPartners, networkSince, networkOrder, networkShow, networkSignals];
