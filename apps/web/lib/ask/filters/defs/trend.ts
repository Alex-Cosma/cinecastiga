import type { FilterDef } from "../types";
import { readAhead } from "./shared";

/*
 * The trend's lenses (plan §4.7): which change, the same months of both
 * years, the order and the base of a growth, the first year only. Read ahead
 * (F0a); F2 implements them, with trend-2. A trend without them is today's
 * answer: every change, ordered by its absolute size in lei.
 */

const trend = { dim: "supplier", filters: { yearFrom: 2024, yearTo: 2025 } };

export const trendChange = readAhead<string>({
  id: "trendChange", keys: ["trend.change"], placement: "strip", control: "countGroups",
  label: "Felul schimbării", scope: "group",
  sample: { block: "trend", value: "up", base: trend },
});

export const trendMonths = readAhead<"auto" | "whole" | readonly [number, number]>({
  id: "trendMonths", keys: ["trend.months"], placement: "under", control: "toggle",
  label: "Aceleași luni", scope: "selection",
  sample: { block: "trend", value: "auto", base: trend },
});

export const trendOrder = readAhead<"lei" | "percent">({
  id: "trendOrder", keys: ["trend.order"], placement: "strip", control: "segmented",
  label: "Ordinea", scope: "display",
  sample: { block: "trend", value: "percent", base: trend },
});

export const trendMinBase = readAhead<number>({
  id: "trendMinBase", keys: ["trend.minBase"], placement: "strip", control: "rangePills",
  label: "Baza minimă", scope: "group",
  sample: { block: "trend", value: 100_000, base: trend },
});

export const trendFirstOnly = readAhead<true>({
  id: "trendFirstOnly", keys: ["trend.firstOnly"], placement: "strip", control: "toggle",
  label: "Prima dată", scope: "group",
  sample: { block: "trend", value: true, base: trend },
});

export const TREND_DEFS: readonly FilterDef[] = [trendChange, trendMonths, trendOrder, trendMinBase, trendFirstOnly];
