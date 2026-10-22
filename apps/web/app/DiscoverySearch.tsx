"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SuggestResponse } from "@/app/api/suggest/route";
import type { IntentResult } from "@/lib/intent/types";
import type { EntityHit } from "@/lib/search";
import { buildSuggestionGroups, flattenSuggestions } from "@/lib/search-suggestions";
import DiscoveryIcon from "./DiscoveryIcon";

type Source<T> = { query: string; data: T | null; failed: boolean };
const SOURCES = ["intent", "vocab", "last", "entities"] as const;
type SourceName = (typeof SOURCES)[number];

/** Last word of a longer text, for place suggestions ("iluminat buz" → "buz"). */
function lastWordOf(term: string): string | null {
  const parts = term.split(/\s+/);
  const last = parts.at(-1) ?? "";
  return parts.length >= 2 && last.length >= 3 ? last : null;
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return await response.json() as T;
}

/**
 * The shared search box (home page and the header dialog). While typing it
 * shows how the words were understood (the rules interpreter), then subjects,
 * places, institutions, firms and persons. Enter without a chosen row opens
 * the results page, which shows the same interpretation on top (owner
 * decision 2). The GET form keeps working if every suggestion source fails.
 */
export default function DiscoverySearch({ hero = false, modal = false, onNavigate }: { hero?: boolean; modal?: boolean; onNavigate?: () => void }) {
  const router = useRouter(), id = useId(), box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Partial<Record<SourceName, Source<unknown>>>>({});
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const term = query.trim().replace(/\s+/g, " "), latestTerm = useRef(term);
  latestTerm.current = term;
  const lastWord = lastWordOf(term);
  const wanted: SourceName[] = lastWord ? [...SOURCES] : SOURCES.filter((s) => s !== "last");
  const ready = (name: SourceName) => sources[name]?.query === term;
  const value = <T,>(name: SourceName) => (ready(name) && !sources[name]!.failed ? sources[name]!.data as T : null);
  const loading = term.length >= 2 && wanted.some((name) => !ready(name));
  const failedAll = term.length >= 2 && wanted.every((name) => ready(name) && sources[name]!.failed);
  const intent = value<IntentResult>("intent"), vocab = value<SuggestResponse>("vocab"), last = value<SuggestResponse>("last"), entities = value<{ hits?: EntityHit[] }>("entities");
  const groups = useMemo(() => buildSuggestionGroups({
    text: term, intent, vocab,
    lastWord: lastWord && last ? { word: lastWord, vocab: last } : null,
    entities: Array.isArray(entities?.hits) ? entities.hits : null,
  }), [term, intent, vocab, last, lastWord, entities]);
  const options = useMemo(() => flattenSuggestions(groups), [groups]);
  const expanded = term.length >= 2 && (modal || open);

  useEffect(() => {
    const q = term;
    box.current?.querySelector(".d-search-results")?.scrollTo({ top: 0 });
    if (q.length < 2) return;
    const controller = new AbortController(), { signal } = controller;
    const word = lastWordOf(q);
    const settle = (name: SourceName, request: Promise<unknown>) => request.then(
      (data) => { if (!signal.aborted && latestTerm.current === q) setSources((s) => ({ ...s, [name]: { query: q, data, failed: false } })); },
      () => { if (!signal.aborted && latestTerm.current === q) setSources((s) => ({ ...s, [name]: { query: q, data: null, failed: true } })); },
    );
    // One debounce for all sources; each one fails alone (entities still work if /api/intent fails).
    const timer = window.setTimeout(() => {
      void settle("intent", getJson(`/api/intent?q=${encodeURIComponent(q)}`, signal));
      void settle("vocab", getJson(`/api/suggest?q=${encodeURIComponent(q)}`, signal));
      if (word) void settle("last", getJson(`/api/suggest?q=${encodeURIComponent(word)}`, signal));
      void settle("entities", getJson(`/api/search?q=${encodeURIComponent(q)}`, signal));
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);
  // A new list keeps no stale highlighted row.
  useEffect(() => { setActive(-1); }, [options]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const navigate = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };
  const resultsHref = `/cauta?q=${encodeURIComponent(term)}`;
  let index = -1;
  return <div className={`d-search${hero ? " d-search-hero" : ""}${modal ? " d-search-modal" : ""}`} ref={box}>
    <form action="/cauta" method="get" role="search" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      if (!term) { box.current?.querySelector("input")?.focus(); return; }
      // Enter opens the results page (with the interpretation on top), unless a row was chosen with the arrows.
      const chosen = expanded && active >= 0 ? options[active] : undefined;
      navigate(chosen ? chosen.href : resultsHref);
    }}>
      <DiscoveryIcon name="search" />
      <input type="search" name="q" value={query} {...(hero ? { "data-discovery-search": true } : {})}
        placeholder="Un subiect, un loc, o instituție, o firmă…" aria-label="Caută un subiect, un loc, o instituție, o firmă sau un CUI"
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`} aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
        onChange={(event) => {
          const next = event.target.value, nextTerm = next.trim().replace(/\s+/g, " ");
          latestTerm.current = nextTerm;
          if (nextTerm !== term) setActive(-1);
          setQuery(next); setOpen(nextTerm.length >= 2);
        }} onFocus={() => { if (term.length >= 2) setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open && !modal) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); return; }
          if (!["ArrowDown", "ArrowUp"].includes(event.key) || term.length < 2 || !options.length) return;
          event.preventDefault(); setOpen(true);
          setActive((current) => event.key === "ArrowDown" ? Math.min(current + 1, options.length - 1) : Math.max(current - 1, -1));
        }} />
      <button type="submit" aria-label="Vezi rezultatele căutării"><DiscoveryIcon name="arrow" /></button>
    </form>
    <span className="d-sr-only" role="status">{!expanded ? "" : failedAll ? "Sugestiile nu sunt disponibile momentan. Apasă Enter pentru rezultate." : loading && !options.length ? "Căutăm…" : `${options.length === 1 ? "O sugestie" : `${options.length} sugestii`}. Folosește săgețile pentru a le parcurge; Enter fără o sugestie aleasă deschide rezultatele.`}</span>
    <div className="d-search-results" hidden={!modal && !open}>
      {term.length < 2 ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>Ce vrei să urmărești?</b><p>Scrie un subiect („iluminat”), un loc, numele unei instituții, o firmă sau un CUI.</p></div>
        : failedAll ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>Sugestiile nu sunt disponibile momentan.</b><p>Apasă Enter pentru a căuta „{term}” în achiziții și documente.</p></div>
        : null}
      {term.length >= 2 && !loading && !failedAll && groups.length === 1 && groups[0]!.id === "words" && <p className="d-search-none">Nu am recunoscut un subiect, un loc sau un nume în „{term}”.</p>}
      <div id={`${id}-results`} role="listbox" aria-label="Sugestii" aria-busy={loading}>
        {term.length >= 2 && groups.map((group) => <ul role="group" key={group.id} aria-labelledby={`${id}-group-${group.id}`} className={`d-search-group d-search-group-${group.id}`}>
          <li role="presentation" id={`${id}-group-${group.id}`} className="d-search-group-title">{group.title}</li>
          {group.items.map((item) => {
            const at = ++index;
            return <li key={item.id} id={`${id}-option-${at}`} role="option" aria-selected={active === at}>
              <a href={item.href} tabIndex={-1} className={`${active === at ? "active" : ""}${group.id === "words" ? " d-search-all" : ""}`} onClick={(event) => { event.preventDefault(); navigate(item.href); }}>
                <span className="d-search-symbol"><DiscoveryIcon name={item.icon} /></span>
                <span><b>{item.label}</b>{item.detail && <small>{item.detail}</small>}</span><DiscoveryIcon name="arrow" />
              </a>
            </li>;
          })}
        </ul>)}
        {loading && term.length >= 2 && <div role="presentation" className="d-search-pending"><span className="d-search-progress" aria-hidden="true" />Căutăm sugestii pentru „{term}”… Enter deschide rezultatele.</div>}
      </div>
    </div>
  </div>;
}
