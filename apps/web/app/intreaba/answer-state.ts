import { encodeSpec } from "../../lib/ask/permalink";
import { breakdownDeeperSpec } from "../../lib/ask/source-spec";
import type { AskSpec } from "../../lib/ask/spec";
import type { StripPatch } from "./builder/view";

/*
 * The answer's own state around the applied question (plan §2.3), without
 * React: what the strip changes, the words the server sent for each display
 * state (variants), and the breakdown's thread ("fir" in the URL). AskPanel
 * keeps them; the builder hears of a strip change through StripPatch.
 */

/** A display state's words, from the server: its pills and the SQL shown (the map's lens: value, records). */
export interface VariantWords { pills: string[]; displaySql: string }
export interface AnswerVariants { measure?: Partial<Record<string, VariantWords>> }

/** The keys the strip writes in F1b: the data stream (a new query) and the map's lens (the data already fetched). */
export const STRIP_QUERY_KEYS = new Set<StripPatch["path"]>(["dataset"]);

/** The applied question after a strip change: only that key (plan §2.3). */
export function appliedAfterStrip(applied: AskSpec, path: StripPatch["path"], value: string): AskSpec {
  return path === "dataset" ? { ...applied, dataset: value as NonNullable<AskSpec["dataset"]> } : { ...applied, measure: value as AskSpec["measure"] };
}

/** The pills and the SQL of the state on screen: the variant of the applied lens, else the answer's own. */
export function shownWords(answer: { pills?: string[]; displaySql?: string; variants?: AnswerVariants }, applied: AskSpec): { pills: string[]; displaySql?: string } {
  const variant = answer.variants?.measure?.[applied.measure];
  if (variant) return { pills: variant.pills, displaySql: variant.displaySql };
  return { pills: answer.pills ?? [], ...(answer.displaySql ? { displaySql: answer.displaySql } : {}) };
}

/**
 * The thread of a breakdown (kit component 14, Crumbs): where the domains
 * started (the question's own domain, or none) and each level opened since,
 * with its name. It lives in the URL, never in the spec; a capture keeps it in
 * its snapshot so what was seen stays readable.
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

/** The thread in words, for the CSV and a capture: "toate › Construcții › Lucrări de drumuri". */
export const threadWords = (thread: Thread): string =>
  [thread.root ? `„${thread.root}”` : "toate", ...thread.steps.map((s) => s.name)].join(" › ");
