import { describeConditions } from "../../lib/ask/filters/describe";
import { encodeSpec } from "../../lib/ask/permalink";
import { breakdownDeeperSpec } from "../../lib/ask/source-spec";
import { SELECTION_RULES, type AskSpec, type MonthWindow } from "../../lib/ask/spec";
import { specTrendList, trendListSpec, type TrendList } from "../../lib/ask/trend-shared";
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

/** The keys the strip writes in F1b: the data stream (a new query) and the map's lens (the data already fetched). */
export const STRIP_QUERY_KEYS = new Set<StripPatch["path"]>(["dataset"]);

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
  return path === "dataset" ? { ...applied, dataset: value as NonNullable<AskSpec["dataset"]> } : { ...applied, measure: value as AskSpec["measure"] };
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
  if (!raw || spec.block !== "breakdown") return null;
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
  const next = breakdownDeeperSpec(spec, cpvTerm ?? "");
  if (!cpvTerm) delete next.filters.cpvTerm;
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(next))}${thread?.steps.length ? `&fir=${encodeURIComponent(JSON.stringify(thread))}` : ""}`;
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
