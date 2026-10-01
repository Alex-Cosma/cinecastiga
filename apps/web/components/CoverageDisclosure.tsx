"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AskSpec } from "@/lib/ask/spec";
import { isHistoricalProfile } from "@/lib/ask/population";
import { COVERAGE_LABELS, coverageSources, publicationDay, sourceDay, type PublicCoverage } from "@/lib/coverage-summary";
import "./coverage-disclosure.css";

/** Read on demand: opening a page or running a question never waits for coverage. */
export default function CoverageDisclosure({ spec, children }: { spec?: AskSpec; children?: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PublicCoverage | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Native details may already have been opened before React hydrated the page.
  useEffect(() => { setOpen(disclosure.current?.open ?? false); }, []);

  useEffect(() => {
    if (!open || data) return;
    const controller = new AbortController();
    setError(false);
    const timeout = setTimeout(() => { setError(true); controller.abort(); }, 15000);
    void fetch("/api/data-coverage", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Coverage unavailable");
        const result = await response.json() as PublicCoverage;
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, data, attempt]);

  return <details ref={disclosure} className={`coverage-disclosure ${spec ? "coverage-disclosure-answer" : "coverage-disclosure-home"}`}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{spec ? "Datele și calculul" : "Ce date includ aceste cifre?"}</summary>
    <div className="coverage-disclosure-body">
      <div className="coverage-periods" aria-busy={open && !data && !error}>
        {!data && !error && <p role="status">Se încarcă perioadele disponibile…</p>}
        {error && <p role="status">Perioadele nu pot fi citite acum. <button type="button" onClick={() => { setError(false); setAttempt(n => n + 1); }}>Reîncearcă</button></p>}
        {data && <>
          <p className="coverage-periods-title">Perioade în arhiva surselor</p>
          <dl>{coverageSources(spec).map(dataset => {
            const source = data.sources.find(row => row.dataset === dataset);
            return <div key={dataset}><dt>{COVERAGE_LABELS[dataset]}</dt>
              <dd>{source?.from && source.to ? `${sourceDay(source.from)} — ${sourceDay(source.to)}` : "Perioadă neconfirmată"}</dd></div>;
          })}</dl>
          <p>Intervalele pot avea goluri{spec ? " și descriu arhiva, nu acoperirea fiecărei instituții" : ""}.</p>
          <p className="coverage-freshness">{data.dataAt ? `Date publicate în aplicație la ${publicationDay(data.dataAt)}.` : "Data publicării acestui set de date nu este confirmată."}
            {spec && isHistoricalProfile(spec) && ` Semnale recalculate: ${publicationDay(data.riskAt)}.`}</p>
        </>}
      </div>
      {children}
      <Link href={spec ? "/metodologie" : "/metodologie#acoperire"}>Metodologie, surse și limite ↗</Link>
    </div>
  </details>;
}
