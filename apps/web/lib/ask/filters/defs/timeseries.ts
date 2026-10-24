import type { FilterDef } from "../types";
import { readAhead } from "./shared";

/* The evolution's lenses (plan §4.3): month by month, split by channel or domain, the same months. Read ahead; F3. */

export const timeseriesGrain = readAhead<"month">({
  id: "timeseriesGrain", keys: ["timeseries.grain"], placement: "sentence", control: "segmented",
  label: "Lună de lună", windowTitle: "Când?", scope: "display",
  sample: { block: "timeseries", value: "month", base: { filters: { yearFrom: 2024, yearTo: 2025 } } },
});

export const timeseriesSplit = readAhead<"channel" | "domain">({
  id: "timeseriesSplit", keys: ["timeseries.split"], placement: "strip", control: "segmented",
  label: "Împarte", scope: "display",
  sample: { block: "timeseries", value: "channel" },
});

export const timeseriesMonths = readAhead<"auto" | readonly [number, number]>({
  id: "timeseriesMonths", keys: ["timeseries.months"], placement: "under", control: "toggle",
  label: "Aceleași luni", scope: "selection",
  sample: { block: "timeseries", value: "auto" },
});

export const TIMESERIES_DEFS: readonly FilterDef[] = [timeseriesGrain, timeseriesSplit, timeseriesMonths];
