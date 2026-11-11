"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import EntityName from "@/components/EntityName";
import { G } from "@/components/ghost/Ghost";
import type { PriceLead, StripLeads } from "@/lib/unit-prices";
import { formatLei, formatQuantity, formatRatio, formatUnitPrice, leadHref } from "@/lib/unit-prices-shared";

/** What a strip's rows are asked by: the strip's own product, pack, year, county and order, as on /preturi. */
export interface StripQuery { family: string; pack: string; year: number | null; county: string | null; byRatio: boolean; per: string }

const leadsUrl = (q: StripQuery) => {
  const p = new URLSearchParams({ produs: q.family });
  if (q.pack) p.set("ambalaj", q.pack);
  if (q.year) p.set("an", String(q.year));
  if (q.county) p.set("judet", q.county);
  if (q.byRatio) p.set("ordine", "multiplu");
  return `/api/preturi/piste?${p}`;
};

function LeadRow({ lead, query, suppliers }: { lead: PriceLead; query: StripQuery; suppliers: Record<string, string> }) {
  const named = lead.supplierIds.slice(0, 2).filter((id) => suppliers[id]);
  return <li className="pr-lead g-content">
    <span className="pr-lead-who">
      <EntityName id={lead.authorityId} role="authority">{lead.name}</EntityName>
      <small>{[lead.county, query.year ? null : lead.year].filter(Boolean).join(" · ") || " "}</small>
    </span>
    <span className="pr-lead-price"><b>{formatUnitPrice(lead.price)}</b> {query.per}<small>mediana {formatUnitPrice(lead.median)}</small></span>
    <span className="pr-lead-x">{formatRatio(lead.ratio)}</span>
    <span className="pr-lead-qty">{formatQuantity(lead.quantity, query.per)}<small>{lead.awards === 1 ? "o achiziție" : `${lead.awards} achiziții`}</small></span>
    <span className="pr-lead-lei">{formatLei(lead.excess)}<small>peste mediană</small></span>
    <span className="pr-lead-sup">{named.length ? <>{named.map((id, i) => <Fragment key={id}>{i > 0 && ", "}<EntityName id={id} role="supplier">{suppliers[id]}</EntityName></Fragment>)}{lead.supplierIds.length > 2 && ` și încă ${lead.supplierIds.length - 2}`}</> : "—"}</span>
    <Link className="pr-lead-open" href={leadHref(query.family, query.pack, query.year, lead)} prefetch={false} aria-label={`Liniile: ${lead.name}, ${lead.year}`}>Liniile</Link>
  </li>;
}

/** A row still loading: the real row's element and cells, text as lines, so the strip keeps its height (ghost kit). */
function GhostRows({ n }: { n: number }) {
  return <G.Rows n={n} className="pr-lead" cells={(i) => <>
    <span className="pr-lead-who"><G.Line w={`${78 - (i % 3) * 14}%`} /><small><G.Line w="34%" /></small></span>
    <span className="pr-lead-price"><G.Line w="72%" /><small><G.Line w="58%" /></small></span>
    <span className="pr-lead-x"><G.Line w="100%" /></span>
    <span className="pr-lead-qty"><G.Line w="60%" /><small><G.Line w="52%" /></small></span>
    <span className="pr-lead-lei"><G.Line w="64%" /><small><G.Line w="70%" /></small></span>
    <span className="pr-lead-sup"><G.Line w={`${70 - (i % 2) * 20}%`} /></span>
    <span className="pr-lead-open pr-lead-open-ghost"><G.Line w="100%" /></span>
  </>} />;
}

type Load = { state: "loading" } | { state: "error" } | { state: "ok"; data: StripLeads };

/** The largest leads of an opened strip, loaded when it first opens (GET /api/preturi/piste). */
function StripLeadRows({ query, expected }: { query: StripQuery; expected: number }) {
  const url = leadsUrl(query);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const stop = new AbortController();
    setLoad({ state: "loading" });
    fetch(url, { signal: stop.signal, headers: { Accept: "application/json" } })
      .then(async (r) => {
        const body = await r.json().catch(() => null) as ({ ok: boolean } & Partial<StripLeads>) | null;
        if (!r.ok || !body?.ok || !Array.isArray(body.leads)) throw new Error(String(r.status));
        setLoad({ state: "ok", data: { leads: body.leads, total: body.total ?? body.leads.length, suppliers: body.suppliers ?? {} } });
      })
      .catch((e: unknown) => { if (!stop.signal.aborted) { console.error("preturi piste", e); setLoad({ state: "error" }); } });
    return () => stop.abort();
  }, [url, attempt]);

  if (load.state === "error") return <p className="pr-load-error" role="alert">Rândurile nu au putut fi încărcate.
    {" "}<button type="button" className="pr-retry" onClick={() => setAttempt((a) => a + 1)}>Încearcă din nou</button></p>;
  if (load.state === "loading") return <ul className="pr-leads" data-ghost="client" aria-busy="true">
    <li className="g-sr" role="status">Se încarcă prețurile peste dublu…</li>
    <GhostRows n={Math.min(expected, 5)} />
  </ul>;
  if (!load.data.leads.length) return <p className="pr-none">Niciun preț peste dublu aici.</p>;
  return <ul className="pr-leads">{load.data.leads.map((l) => <LeadRow key={`${l.authorityId}-${l.year}`} lead={l} query={query} suppliers={load.data.suppliers} />)}</ul>;
}

/**
 * One strip of the list: a `<details>` whose summary is the whole row (one open at a time). The strip that was
 * pressed stays where it was pressed: closing the one open above it would otherwise move it off the screen (measured,
 * 11 November 2026), so the page is scrolled back by exactly what the layout moved. Its lead rows load on first open.
 */
export default function StripRow({ className, query, leads, head, summary, label, children }: {
  className: string; query: StripQuery;
  /** Leads of this strip under the list's filters: the rows to load (none → nothing is asked). */
  leads: number;
  /** One line above the rows: how many of the leads are shown, and that they are leads, not proof. */
  head: string | null;
  summary: ReactNode; label: string;
  /** What follows the rows: the caution and the link to the product page. */
  children: ReactNode;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  const [opened, setOpened] = useState(false);
  const press = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const d = box.current;
    // A dot is a link of its own.
    if (!d || (e.target as Element).closest("a")) return;
    e.preventDefault();
    const sum = e.currentTarget, before = sum.getBoundingClientRect().top, opening = !d.open;
    if (opening) for (const other of d.closest(".pr-strips")?.querySelectorAll<HTMLDetailsElement>("details.pr-row[open]") ?? []) if (other !== d) other.open = false;
    d.open = opening;
    const moved = sum.getBoundingClientRect().top - before;
    if (Math.abs(moved) > 1) window.scrollBy({ top: moved, behavior: "instant" });
    if (opening) setOpened(true);
  }, []);
  return <details className={className} name="pr-strip" ref={box} onToggle={(e) => { if (e.currentTarget.open) setOpened(true); }}>
    <summary className="pr-sum" aria-label={label} onClick={press}>{summary}</summary>
    <div className="pr-open">
      {leads > 0 && head && <p className="pr-open-head">{head}</p>}
      {leads > 0 && opened && <StripLeadRows query={query} expected={leads} />}
      {children}
    </div>
  </details>;
}
