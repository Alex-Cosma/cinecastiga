"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntityHit } from "@/lib/search";
import { cleanName } from "@/lib/format";
import DiscoveryIcon from "./DiscoveryIcon";

/** A shared entity search. The GET form remains usable if suggestions fail. */
export default function DiscoverySearch({ hero = false, modal = false, onNavigate }: { hero?: boolean; modal?: boolean; onNavigate?: () => void }) {
  const router = useRouter(), id = useId(), box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{ query: string; hits: EntityHit[]; failed: boolean } | null>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const term = query.trim(), latestTerm = useRef(term);
  latestTerm.current = term;
  const ready = response?.query === term;
  const loading = term.length >= 2 && !ready;
  const hits = ready ? response.hits : [];
  const failed = ready && response.failed;
  const expanded = term.length >= 2 && (modal || open);
  useEffect(() => {
    const q = term;
    box.current?.querySelector(".d-search-results")?.scrollTo({ top: 0 });
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!result.ok) throw new Error("Search unavailable");
        const data = await result.json() as { hits?: EntityHit[] };
        if (controller.signal.aborted || latestTerm.current !== q) return;
        setActive(-1); setResponse({ query: q, hits: Array.isArray(data.hits) ? data.hits : [], failed: false });
      } catch { if (!controller.signal.aborted && latestTerm.current === q) { setActive(-1); setResponse({ query: q, hits: [], failed: true }); } }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const navigate = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };
  const allHref = `/cauta?q=${encodeURIComponent(query.trim())}`;
  const activate = (index: number) => { const hit = hits[index]; navigate(hit ? `/entitati/${hit.id}` : allHref); };
  return <div className={`d-search${hero ? " d-search-hero" : ""}${modal ? " d-search-modal" : ""}`} ref={box}>
    <form action="/cauta" method="get" role="search" autoComplete="off" onSubmit={(event) => {
      if (!query.trim()) { event.preventDefault(); box.current?.querySelector("input")?.focus(); return; }
      event.preventDefault(); activate(expanded && active >= 0 ? active : hits.length);
    }}>
      <DiscoveryIcon name="search" />
      <input type="search" name="q" value={query} {...(hero ? { "data-discovery-search": true } : {})}
        placeholder="O primărie, un spital, o firmă…" aria-label="Caută o instituție, o firmă sau un CUI"
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`} aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
        onChange={(event) => {
          const next = event.target.value, nextTerm = next.trim();
          latestTerm.current = nextTerm;
          if (nextTerm !== term) { setResponse(null); setActive(-1); }
          setQuery(next); setOpen(nextTerm.length >= 2);
        }} onFocus={() => { if (term.length >= 2) setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open && !modal) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
          if (!["ArrowDown", "ArrowUp"].includes(event.key) || term.length < 2) return;
          event.preventDefault(); setOpen(true); setActive((index) => event.key === "ArrowDown" ? Math.min(index + 1, hits.length) : Math.max(index - 1, 0));
        }} />
      <button type="submit" aria-label="Vezi rezultatele căutării"><DiscoveryIcon name="arrow" /></button>
    </form>
    <span className="d-sr-only" role="status">{loading ? "Căutăm…" : expanded ? failed ? "Sugestiile nu sunt disponibile momentan." : `${hits.length} sugestii disponibile. Folosește săgețile pentru a le parcurge.` : ""}</span>
    <div className="d-search-results" hidden={!modal && !open}>
      {term.length < 2 ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>De la un nume, la achizițiile lui.</b><p>Scrie cel puțin două caractere din numele instituției, firmei sau CUI.</p></div>
        : loading ? <div className="d-search-state d-search-loading"><span className="d-search-progress" aria-hidden="true" /><b>Căutăm „{term}”…</b><p>Instituții și firme din datele publice.</p></div>
        : failed ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>Sugestiile nu sunt disponibile momentan.</b><p>Poți deschide pagina de rezultate sau încerca un alt nume.</p></div>
        : hits.length === 0 ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>Nicio sugestie pentru „{term}”.</b><p>Încearcă numele instituției sau CUI-ul.</p></div> : null}
      <ul id={`${id}-results`} role="listbox" aria-label="Sugestii de instituții și firme" aria-busy={loading}>
        {hits.map((hit, index) => <li key={hit.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}>
          <a href={`/entitati/${hit.id}`} tabIndex={-1} className={active === index ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={(event) => { event.preventDefault(); activate(index); }}>
            <span className="d-search-symbol"><DiscoveryIcon name={hit.roles.includes("authority") ? "building" : "network"} /></span>
            <span><b>{cleanName(hit.name)}</b><small>{hit.roles.includes("authority") ? "Instituție publică" : "Furnizor"}{hit.county ? ` · ${hit.county}` : ""}{hit.cui ? ` · CUI ${hit.cui}` : ""}</small></span><DiscoveryIcon name="arrow" />
          </a>
        </li>)}
        {term.length >= 2 && <li id={`${id}-option-${hits.length}`} role="option" aria-selected={active === hits.length}><a className={`d-search-all${active === hits.length ? " active" : ""}`} href={allHref} tabIndex={-1} onMouseEnter={() => setActive(hits.length)} onClick={(event) => { event.preventDefault(); navigate(allHref); }}>Vezi toate rezultatele <DiscoveryIcon name="arrow" /></a></li>}
      </ul>
    </div>
  </div>;
}
