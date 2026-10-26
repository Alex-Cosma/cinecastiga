"use client";

import { useEffect, useState } from "react";
import type { BarsResult, MixResult } from "../../../lib/ask/facet-parts";
import { questionKey, type QuestionSpec } from "../../../lib/ask/question-ui";
import type { AskSpec } from "../../../lib/ask/spec";

/*
 * A fact of the answer on screen (F3): stat's „Din care” (part `mix`) and an
 * evolution's bar facts (`bars`), asked of POST /api/ask/facets once the
 * answer is drawn, so they never delay it. The request is aborted when the
 * applied question changes or the answer leaves; a fact read is kept in the
 * page for five minutes. A limit passed, a selection the marts stage will
 * precompute or an error: `none` (the screen says what it can without it).
 */

export type AnswerFact<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "none"; precompute?: boolean };
type Part = "mix" | "bars";
type Value<P extends Part> = P extends "mix" ? MixResult : BarsResult;

const KEPT_MS = 300_000;
const kept = new Map<string, { value: MixResult | BarsResult; at: number }>();
/** Tests: forget the facts kept in the page. */
export function forgetPageAnswerFacts(): void { kept.clear(); }

export function useAnswerFact<P extends Part>(spec: AskSpec | null, part: P): AnswerFact<Value<P>> {
  const key = spec ? `${part}|${questionKey(spec as unknown as QuestionSpec)}` : null;
  const known = (): AnswerFact<Value<P>> => {
    const hit = key ? kept.get(key) : undefined;
    return hit && Date.now() - hit.at <= KEPT_MS ? { status: "ready", value: hit.value as Value<P> } : key ? { status: "loading" } : { status: "none" };
  };
  const [fact, setFact] = useState<AnswerFact<Value<P>>>(known);
  useEffect(() => {
    const now = known();
    setFact(now);
    if (!spec || !key || now.status !== "loading") return;
    const controller = new AbortController();
    void fetch("/api/ask/facets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, part }),
      signal: controller.signal,
    }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean; precompute?: string } & Value<P>) | null).then((answer) => {
      if (controller.signal.aborted) return;
      if (!answer?.ok) { setFact({ status: "none", ...(answer?.precompute ? { precompute: true } : {}) }); return; }
      const { ok: _ok, ...value } = answer;
      kept.set(key, { value: value as unknown as Value<P>, at: Date.now() });
      setFact({ status: "ready", value: value as unknown as Value<P> });
    }).catch(() => { if (!controller.signal.aborted) setFact({ status: "none" }); });
    return () => controller.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `spec` changes with `key` only
  return fact;
}
