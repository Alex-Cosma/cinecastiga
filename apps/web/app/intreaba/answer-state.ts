import { withLens } from "../../lib/ask/map-lens";
import { describeConditions } from "../../lib/ask/filters/describe";
import { encodeSpec } from "../../lib/ask/permalink";
import { breakdownDeeperSpec } from "../../lib/ask/source-spec";
import { SELECTION_RULES, type AskSpec, type MonthWindow, type NetworkOptions, type SankeyOptions } from "../../lib/ask/spec";
import { networkListSpec, type NetworkList, type NetworkOrder } from "../../lib/ask/network-shared";
import { DEFAULT_SANKEY_SHOWN } from "../../lib/ask/sankey-shared";
import { withPeerGroup } from "../../lib/ask/peer-groups-shared";
import { specTrendList, trendListSpec, type TrendList } from "../../lib/ask/trend-shared";
import { formatShare } from "../../lib/ask/answer-text";
import { divisionShortName } from "../../lib/ask/cpv-divisions";
import { monthsLabel } from "../../lib/ask/months-window";
import { readableCpvName } from "../../lib/entity-summary";
import type { SegmentOption } from "./builder/Segmented";
import type { StripPatch } from "./builder/view";

/*
 * The answer's own state around the applied question (plan §2.3), without
 * React: what the strip changes, the words the server sent for each display
 * state (variants), and the breakdown's thread ("fir" in the URL). AskPanel
 * keeps them; the builder hears of a strip change through StripPatch.
 */

/** A display state's words, from the server: its pills and the SQL shown (the map's lens: value, records; a trend's list). */
export interface VariantWords { pills: string[]; displaySql: string }
export interface AnswerVariants { measure?: Partial<Record<string, VariantWords>>; trend?: Partial<Record<TrendList, VariantWords>> }

/** What the page says after a trend's sources found the data newer than its answer (409, plan §2.8) and reloaded it. */
export const DATA_RELOADED = "Datele s-au actualizat; am reîncărcat răspunsul.";

/**
 * What changed the total outside the sentence (G8), in the words of the
 * answer as it ran, like its pills: a trend's `auto` months as they resolved
 * („pe aceleași luni: ian.–mai”), and no months on whole years (trend final
 * §3.3), where the pills have none either.
 */
export function totalConditionWords(applied: AskSpec, executedMonths?: MonthWindow | null): string[] {
  const described = describeConditions(applied, { executedMonths });
  const months = described.byId.trendMonths;
  return months && months.pills?.length === 0 ? described.totalWords.filter((words) => words !== months.words) : described.totalWords;
}

/**
 * The keys the strip writes that ask again: the data stream (F1b), and in F3 the evolution's split and same months
 * (another grouping) and the breakdown's kind (its rows), in F4 a comparison's shared clients (the pre-step P), in
 * F6a the distribution's group. The map's lens and the breakdown's order switch on the data already fetched.
 */
export const STRIP_QUERY_KEYS = new Set<StripPatch["path"]>(["dataset", "timeseries", "purchaseKind", "sharedPartners", "peers"]);

/**
 * The network's strip (F4, final network §3.1–§3.5): a group or an order switches on the answer already
 * fetched; the reference year counts the groups again (a new query). A group takes the period away and
 * writes the year its buttons counted from (networkListSpec), so the link says what the screen shows.
 */
export function appliedAfterNetwork(applied: AskSpec, change: { list?: NetworkList; order?: NetworkOrder; since?: number }, since: number): { spec: AskSpec; dropPeriod: boolean } {
  let next: AskSpec = applied;
  let dropPeriod = false;
  if (change.list !== undefined) {
    dropPeriod = change.list !== "all" && ["yearFrom", "yearTo", "monthFrom", "monthTo"].some((key) => applied.filters[key as keyof AskSpec["filters"]] !== undefined);
    next = networkListSpec(next, change.list, since);
  }
  if (change.order !== undefined || change.since !== undefined) {
    const network: NetworkOptions = { ...next.network };
    if (change.order !== undefined) { if (change.order === "value") delete network.order; else network.order = change.order; }
    if (change.since !== undefined) network.since = change.since;
    next = { ...next, network };
  }
  if (next.network && !Object.keys(next.network).length) { next = { ...next }; delete next.network; }
  return { spec: next, dropPeriod };
}

/** The flow's „Arată 6 · 10 · 15” (F4, kit §6 sankey 5): six is the question without the key. */
export function appliedAfterSankeyShown(applied: AskSpec, shown: number): AskSpec {
  const next: AskSpec = { ...applied };
  if (shown === DEFAULT_SANKEY_SHOWN) delete next.sankey;
  else next.sankey = { shown: shown as NonNullable<SankeyOptions["shown"]> };
  return next;
}

/** The strip's data stream (kit §4: "Toate · Directe · Proceduri", the charts' channel colours as a legend). */
const STREAM_OPTIONS: readonly SegmentOption[] = [
  { value: "all", label: "Toate" },
  { value: "da", label: "Directe", swatch: "da" },
  { value: "contracts", label: "Proceduri", swatch: "proc" },
];
/** Why an old link's "o singură ofertă" keeps the strip on procedures: the engine counts offers on contracts only (spec.ts). */
export const SINGLE_OFFER_STREAM = "Linkul cere contractele cu o singură ofertă: doar din proceduri.";
/** Why a procedure keeps the strip on procedures (F3): a procedure is a contract's (spec.ts SELECTION_RULES). */
export const PROCEDURE_STREAM = "Întrebarea cere o procedură anume: doar contracte din proceduri.";

/**
 * The strip's streams on the applied question. An old link's single offer,
 * or a procedure, leaves only procedures choosable: validateSpec would put
 * any other stream back on contracts (or refuse it), so the radio, the
 * builder and the answer would disagree.
 */
export function streamOptions(spec: Pick<AskSpec, "filters">): readonly SegmentOption[] {
  const reason = spec.filters.singleBidder ? SINGLE_OFFER_STREAM : spec.filters.procedure ? PROCEDURE_STREAM : null;
  if (reason) return STREAM_OPTIONS.map((option) => option.value === "contracts" ? option : { ...option, disabled: reason });
  // A size above the analysis ceiling holds no direct acquisition (SELECTION_RULES.purchaseValue).
  const above = SELECTION_RULES.purchaseValue({ block: "stat", measure: "value", dataset: "da", filters: spec.filters });
  return above ? STREAM_OPTIONS.map((option) => option.value === "da" ? { ...option, disabled: above } : option) : STREAM_OPTIONS;
}

/** The applied question after a strip change: only that key (plan §2.3). */
export function appliedAfterStrip(applied: AskSpec, path: StripPatch["path"], value: string): AskSpec {
  if (path === "dataset") return { ...applied, dataset: value as NonNullable<AskSpec["dataset"]> };
  if (path === "timeseries") return seriesAfterStrip(applied, value);
  // F6a: the distribution's "Schimbă grupul" writes its ticks, the county and an old link's kind (a new query).
  if (path === "peers") return withPeerGroup(applied as AskSpec & { filters: Record<string, unknown> }, value);
  if (path === "purchaseKind") {
    const filters = { ...applied.filters };
    if (value) filters.purchaseKind = value as NonNullable<AskSpec["filters"]["purchaseKind"]>;
    else delete filters.purchaseKind;
    return { ...applied, filters };
  }
  // A comparison of firms (F4, final compare §3.4): „Doar clienții comuni” on ("true") or off.
  if (path === "sharedPartners") {
    const filters = { ...applied.filters };
    if (value === "true") filters.sharedPartners = true;
    else delete filters.sharedPartners;
    return { ...applied, filters };
  }
  // The measure, or the map's lens beyond it (F5: map.lens for „Firme din județ” and „Cota firmei”).
  return withLens(applied, value) as AskSpec;
}

/**
 * The evolution's strip (F3, final timeseries §3.8–§3.9) writes one option of
 * `timeseries`, named in the value: "split:channel", "split:domain",
 * "split:" (Total), "months:auto", "months:" (whole years).
 */
export function seriesAfterStrip(applied: AskSpec, value: string): AskSpec {
  const [key, option] = value.split(":") as ["split" | "months", string];
  const options: NonNullable<AskSpec["timeseries"]> = { ...applied.timeseries };
  if (key === "split") { if (option === "channel" || option === "domain") options.split = option; else delete options.split; }
  if (key === "months") { if (option === "auto") options.months = "auto"; else delete options.months; }
  const next: AskSpec = { ...applied };
  if (Object.keys(options).length) next.timeseries = options;
  else delete next.timeseries;
  return next;
}

/**
 * The strip's „Aceleași luni: ian.–{M}” (final timeseries §3.9), on years
 * only: on, with the months the answer ran on; off, where the answer found
 * the last year incomplete and knows its complete months (its marker,
 * data.ref); absent otherwise (no "complet până la" day, complete years).
 */
export function sameMonthsSwitch(data: { grain?: string; months?: { from: number; to: number }; ref?: { year: number; months: readonly [number, number] }; series: readonly { year: number }[] },
  applied: Pick<AskSpec, "timeseries">): { label: string; on: boolean; year: number } | null {
  if (data.grain === "month") return null;
  const last = Math.max(...data.series.map((p) => p.year));
  if (applied.timeseries?.months !== undefined) {
    const window = data.months;
    return { label: window && !(window.from === 1 && window.to === 12) ? monthsLabel(window) : "toate lunile", on: true, year: last };
  }
  return data.ref ? { label: monthsLabel({ from: data.ref.months[0], to: data.ref.months[1] }), on: false, year: data.ref.year + 1 } : null;
}

/** Why a breakdown's channels have shares (final breakdown §3.6): of the whole selection, with every channel. */
export const CHANNEL_SHARE_TIP = { title: "Ponderile", text: "Directe: fără licitație, cel mult 2 mil. lei pe achiziție. Proceduri: licitații și alte proceduri, cel mult 1 mld. lei pe contract. Plafoane de analiză, nu praguri legale. Procentul: partea din toate achizițiile selecției." };

/**
 * The breakdown's channels with their shares of the selection on every channel
 * (data.streams, F3): by value, or by records when the legend is ordered by
 * them; a channel without records is disabled („—”).
 */
export function channelShares(data: { streams?: Record<"da" | "contracts", { value: number; count: number }> }, byCount: boolean):
  { options: (base: readonly SegmentOption[]) => SegmentOption[]; unit: string } | null {
  const streams = data.streams;
  if (!streams) return null;
  const amount = (s: { value: number; count: number }) => byCount ? s.count : s.value;
  const total = amount(streams.da) + amount(streams.contracts);
  if (total <= 0) return null;
  return {
    unit: byCount ? "% din înregistrări" : "% din valoare",
    options: (base) => base.map((option) => {
      if (option.value !== "da" && option.value !== "contracts") return option;
      const share = amount(streams[option.value]) / total;
      return share > 0 ? { ...option, count: formatShare(share) } : { ...option, count: "—", disabled: option.disabled ?? "Nicio înregistrare pe acest canal în selecție." };
    }),
  };
}

/** A level's suggestion to go down (kit item 5, trusa-5): one group with at least this share of the value. */
export const SUGGEST_SHARE = 0.9;
/**
 * „98% e Construcții · Detaliază ›” (final breakdown §3.5, trusa-5): the
 * group that holds ≥ 90% of the level's value, when a deeper level exists;
 * the link opens it as its slice does (the thread goes with it).
 */
export function breakdownSuggestion(data: { slices: readonly { code: string; name: string | null; value: number }[]; other: { value: number } }, applied: AskSpec, thread: Thread | null):
  { text: string; href: string } | null {
  const top = data.slices[0];
  const total = data.slices.reduce((t, s) => t + s.value, 0) + data.other.value;
  if (!top || total <= 0 || top.code.length >= 8 || top.value / total < SUGGEST_SHARE) return null;
  const full = top.code.length === 2 ? divisionShortName(top.code) : top.name ? readableCpvName(top.name) : `CPV ${top.code}`;
  const name = full.length > 42 ? `${full.slice(0, 40).trimEnd()}…` : full;
  return { text: `${formatShare(top.value / total)} e ${name}`, href: threadHref(applied, top.code, deeperThread(thread, applied, top.code, full)) };
}

/** "Împarte" (final timeseries §3.8): the parts the selection can show, the others disabled with the reason (R1). */
export function seriesSplitOptions(spec: Pick<AskSpec, "dataset" | "filters">): SegmentOption[] {
  const channel = (spec.dataset ?? "all") !== "all" ? "„Directe / proceduri” împarte toate achizițiile." : null;
  const domain = spec.filters.cpvTerm || spec.filters.purchaseKind === "lucrari" ? "Un singur domeniu nu se împarte pe domenii." : null;
  return [
    { value: "split:", label: "Total" },
    { value: "split:channel", label: "Directe / proceduri", ...(channel ? { disabled: channel } : {}) },
    { value: "split:domain", label: "Domenii", ...(domain ? { disabled: domain } : {}) },
  ];
}

/**
 * The applied question after a trend's group button (or „Toate · Prima dată”):
 * only its `trend` key, the one of that list of the answered question
 * (trendListSpec), so the growths keep the order their list was computed in.
 */
export function appliedAfterTrendList(applied: AskSpec, answered: AskSpec, list: TrendList): AskSpec {
  const { trend } = trendListSpec(answered, list);
  const next: AskSpec = { ...applied };
  if (trend) next.trend = trend;
  else delete next.trend;
  return next;
}

/** A trend answer holds this list with the rest (owner-R-facts-all-lists): its group buttons and the sentence's group switch to it with no request. */
export function answerHoldsList(data: { block: string; composition?: unknown; groups?: Partial<Record<TrendList, unknown>> } | undefined, list: TrendList): boolean {
  return data?.block === "trend" && Boolean(data.composition) && data.groups?.[list] !== undefined;
}

/** The pills and the SQL of the state on screen: the variant of the applied lens or trend list, else the answer's own. */
export function shownWords(answer: { pills?: string[]; displaySql?: string; variants?: AnswerVariants }, applied: AskSpec): { pills: string[]; displaySql?: string } {
  const variant = applied.block === "trend" ? answer.variants?.trend?.[specTrendList(applied)] : answer.variants?.measure?.[applied.measure];
  if (variant) return { pills: variant.pills, displaySql: variant.displaySql };
  return { pills: answer.pills ?? [], ...(answer.displaySql ? { displaySql: answer.displaySql } : {}) };
}

/**
 * The thread of a breakdown (kit component 14, Crumbs): where the domains
 * started (the question's own domain, or none) and each level opened since,
 * with its name. It lives in the URL, never in the spec. The shown result's CSV
 * names it; a capture does not (its server-built snapshot reads the spec, whose
 * domain is the thread's last level).
 */
export interface Thread { root: string | null; steps: { code: string; name: string }[] }

/** The thread of a URL, when it leads to the breakdown on screen (its last step is the question's domain). */
export function readThread(raw: string | null, spec: AskSpec): Thread | null {
  if (!raw || (spec.block !== "breakdown" && spec.block !== "sankey")) return null;
  try {
    const value = JSON.parse(raw) as Partial<Thread>;
    const steps = Array.isArray(value.steps) ? value.steps.filter((s): s is Thread["steps"][number] => typeof s?.code === "string" && typeof s?.name === "string").slice(0, 8) : [];
    if (!steps.length || steps[steps.length - 1]!.code !== String(spec.filters.cpvTerm ?? "")) return null;
    return { root: typeof value.root === "string" && value.root ? value.root : null, steps };
  } catch { return null; }
}

/** The thread one level down (a slice opened from the breakdown on screen). */
export function deeperThread(thread: Thread | null, spec: AskSpec, code: string, name: string): Thread {
  const root = thread ? thread.root : spec.filters.cpvTerm ? String(spec.filters.cpvTerm) : null;
  return { root, steps: [...thread?.steps ?? [], { code, name }] };
}

/** The link to a breakdown level, with the thread that leads to it (none at the root). */
export function threadHref(spec: AskSpec, cpvTerm: string | null, thread: Thread | null): string {
  // The flow goes down on itself (final sankey §3.3): the same question with the code; the breakdown opens its slice.
  const next = spec.block === "sankey" ? sankeyDeeperSpec(spec, cpvTerm ?? "") : breakdownDeeperSpec(spec, cpvTerm ?? "");
  if (!cpvTerm) delete next.filters.cpvTerm;
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(next))}${thread?.steps.length ? `&fir=${encodeURIComponent(JSON.stringify(thread))}` : ""}`;
}

/** The flow one CPV level down: the same question with that code as its domain (a code decides the kind). */
export function sankeyDeeperSpec(spec: AskSpec, code: string): AskSpec {
  const filters = { ...spec.filters, cpvTerm: code };
  delete filters.purchaseKind;
  return { ...spec, filters };
}

/** The crumbs above the level on screen, each back to its level, and the current one's name. */
export function threadCrumbs(thread: Thread, spec: AskSpec): { items: { label: string; href: string }[]; current: string } {
  const items = [
    { label: thread.root ? `„${thread.root}”` : "toate", href: threadHref(spec, thread.root, null) },
    ...thread.steps.slice(0, -1).map((step, i) => ({ label: step.name, href: threadHref(spec, step.code, { root: thread.root, steps: thread.steps.slice(0, i + 1) }) })),
  ];
  return { items, current: thread.steps[thread.steps.length - 1]!.name };
}

/** The thread in words, for the shown result's CSV: "toate › Construcții › Lucrări de drumuri". */
export const threadWords = (thread: Thread): string =>
  [thread.root ? `„${thread.root}”` : "toate", ...thread.steps.map((s) => s.name)].join(" › ");
