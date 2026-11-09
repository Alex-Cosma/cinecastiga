"use client";

import type { Thread } from "./answer-state";
import { domainName } from "./sankey-answer";

/*
 * The names of a thread read from a link (fir=33.331 carries codes only since 9 November 2026): each level's
 * catalogue name from /api/cpv/label (cached a day), named as the flow names its domains. The levels opened in
 * this tab are remembered, so «Înapoi» names them at once.
 */
const names = new Map<string, Promise<string>>();

/** Remembers the names a thread already has (a level opened on screen). */
export function rememberThreadNames(thread: Thread): void {
  for (const step of thread.steps) if (step.name && !names.has(step.code)) names.set(step.code, Promise.resolve(step.name));
}

function levelName(code: string): Promise<string> {
  const known = names.get(code);
  if (known) return known;
  const pending = fetch(`/api/cpv/label?code=${encodeURIComponent(code)}`)
    .then((response) => response.ok ? response.json() as Promise<{ name?: unknown }> : null)
    .then((data) => domainName({ code, name: typeof data?.name === "string" ? data.name : null }))
    .catch(() => { names.delete(code); return domainName({ code, name: null }); });
  names.set(code, pending);
  return pending;
}

/** The thread with every level named. */
export async function namedThread(thread: Thread): Promise<Thread> {
  const steps = await Promise.all(thread.steps.map(async (step) => step.name ? step : { code: step.code, name: await levelName(step.code) }));
  return { ...thread, steps };
}
