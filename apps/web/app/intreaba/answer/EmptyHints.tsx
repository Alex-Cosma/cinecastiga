"use client";

import { useEffect, useState } from "react";
import type { AskSpec } from "../../../lib/ask/spec";
import type { EmptyHints as Hints } from "../../../lib/ask/empty-hints";
import { formatRonFull } from "../../../lib/format";
import { countWords } from "../../../lib/ask/answer-text";

/*
 * Under an empty answer about a domain (Cisnădie feedback, 13 November 2026; mockup A, owner-approved): the
 * categories searched, the broader categories holding them in which the same selection has records, and the whole
 * selection without its domain. Each is a wider question, answered in place like the relaxing buttons.
 */

/** „făcute de primăria Cisnădie (Sibiu), în 2026” from the answer's title. */
export const whoOf = (title: string): string | null => /(făcute de .+?)\?$/.exec(title)?.[1] ?? null;

export default function EmptyHints({ spec, title, subject, onRun }: { spec: AskSpec; title: string; subject: string | null; onRun: (next: AskSpec) => void }) {
  const key = JSON.stringify(spec);
  const [state, setState] = useState<{ key: string; hints: Hints } | null>(null);
  useEffect(() => {
    if (!spec.filters.cpvTerm) return;
    const controller = new AbortController();
    void fetch("/api/ask/empty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec: JSON.parse(key) as AskSpec }), signal: controller.signal })
      .then((r) => r.json() as Promise<{ ok: boolean } & Hints>)
      .then((d) => { if (d.ok) setState({ key, hints: d }); })
      .catch(() => {});
    return () => controller.abort();
  }, [key, spec.filters.cpvTerm]);
  const hints = state?.key === key ? state.hints : null;
  if (!hints || (!hints.searched.length && !hints.broader.length && !hints.all)) return null;
  const withCode = (code: string | null): AskSpec => {
    const filters = { ...spec.filters } as Record<string, unknown>;
    if (code) filters.cpvTerm = code; else { delete filters.cpvTerm; delete filters.cpvExclude; }
    return { ...spec, filters } as AskSpec;
  };
  const who = whoOf(title);
  const records = (n: number) => countWords(n, "înregistrare", "înregistrări");
  return <div className="qb-empty-hints">
    {hints.searched.length > 0 && <details className="qb-empty-searched">
      <summary>Am căutat în <strong>{countWords(hints.searched.length, "categorie", "categorii")}{subject ? ` de „${subject}”` : ""}</strong></summary>
      <ul>{hints.searched.map((c) => <li key={c.code}>{c.name}</li>)}</ul>
    </details>}
    {hints.broader.length > 0 && <>
      <p className="qb-empty-lead">Există înregistrări în categorii mai largi, care le cuprind:</p>
      <ul className="qb-empty-broader">{hints.broader.map((c) => <li key={c.code}>
        <button type="button" onClick={() => onRun(withCode(c.code))}>
          <span><strong>{c.name}</strong><small>cuprinde „{c.contains}”</small></span>
          <span className="qb-empty-num">{records(c.n)} · <strong>{formatRonFull(c.v)}</strong></span>
          <span aria-hidden="true">→</span>
        </button>
      </li>)}</ul>
      <p className="qb-empty-note">Categoria o alege instituția: o lucrare poate sta într-o categorie mai largă.</p>
    </>}
    {hints.all && <button type="button" className="qb-empty-all" onClick={() => onRun(withCode(null))}>
      Toate achizițiile {who ?? "din această selecție"}, din orice domeniu · {records(hints.all.n)} <span aria-hidden="true">→</span>
    </button>}
  </div>;
}
