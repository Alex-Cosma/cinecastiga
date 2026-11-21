"use client";

import { arrive, prefersReducedMotion } from "../components/motion/outline";
import WorkLine from "../components/motion/WorkLine";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SuggestResponse } from "@/app/api/suggest/route";
import type { IntentResult } from "@/lib/intent/types";
import type { EntityHit } from "@/lib/search";
import { buildSuggestionGroups, flattenSuggestions } from "@/lib/search-suggestions";
import DiscoveryIcon from "./DiscoveryIcon";
import { namesQuery } from "@/lib/names-query";
import { TOUR_QUERY_EVENT, TOUR_QUERY_KEY } from "@/lib/tour";
import { askHref } from "@/lib/discovery-links";
import { AUTHORITY_CLOUD_SPEC, CONTRACT_WINNERS_SPEC, FIRM_DEPENDENCE_CLOUD_SPEC, HOSPITALS_BREAKDOWN_SPEC, ROADS_RANKING_SPEC } from "@/lib/ask/site-links";
import type { Suggestion } from "@/lib/search-suggestions";
import { isDrawn, stepShown } from "./discovery-keys";

/*
 * The search dialog opened empty (UX audit Z1-17, 16 November 2026): words to try, the home page's starting
 * questions (as suggestion rows, reached with the arrows too) and the keys, in the same frame as the suggestions.
 * `complet`: the two scatter answers exist only in Complet (lib/view-mode.ts; owner, 18 November 2026); the arrows walk
 * the rows that are drawn (discovery-keys.ts).
 */
// One casing, as the home page's chips (polish 20 Nov, L10); the search ignores case.
const TRY = ["Iluminat", "Cluj", "Strabag", "Asfaltare în Iași"];
const STARTERS: (Suggestion & { complet?: boolean })[] = [
  { id: "start:hospitals", label: "Ce cumpără spitalele?", detail: "în Întreabă", href: askHref(HOSPITALS_BREAKDOWN_SPEC), icon: "question" },
  // Esențial had one starting question under a plural heading (polish 20 Nov, M4): the home page's „who wins” and roads.
  { id: "start:winners", label: "Cine câștigă contractele?", detail: "în Întreabă", href: askHref(CONTRACT_WINNERS_SPEC), icon: "question" },
  { id: "start:roads", label: "Cine repară drumurile?", detail: "în Întreabă", href: askHref(ROADS_RANKING_SPEC), icon: "question" },
  { id: "start:outliers", label: "Cine iese din tipar?", detail: "Instituțiile după risc · un semnal e o pistă, nu o dovadă", href: askHref(AUTHORITY_CLOUD_SPEC), icon: "question", complet: true },
  { id: "start:dependence", label: "Ce firme depind de un singur client?", detail: "în Întreabă", href: askHref(FIRM_DEPENDENCE_CLOUD_SPEC), icon: "question", complet: true },
];
/** How many sugestii the screen reader hears for the starting questions, in each mode. */
const suggestionWords = (n: number) => (n === 1 ? "O sugestie" : `${n} sugestii`);
const STARTERS_ESENTIAL = STARTERS.filter((item) => !item.complet).length;

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
export default function DiscoverySearch({ hero = false, modal = false, shown = true, onNavigate, onClose }: { hero?: boolean; modal?: boolean; /** The dialog around a modal search is open. */ shown?: boolean; onNavigate?: () => void; onClose?: () => void }) {
  const router = useRouter(), id = useId(), box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Partial<Record<SourceName, Source<unknown>>>>({});
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  // The welcome tour ends by leaving its question here (home page only): written in the field, the list stays closed
  // and the field is not focused, so a phone does not raise its keyboard over the page.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!hero) return;
    const fill = (text: string) => { setQuery(text); setOpen(false); setArrived(true); };
    try { const kept = sessionStorage.getItem(TOUR_QUERY_KEY); if (kept) { sessionStorage.removeItem(TOUR_QUERY_KEY); fill(kept); } } catch { /* no storage: nothing was kept */ }
    const onTour = (event: Event) => { const text = (event as CustomEvent<string>).detail; if (typeof text === "string" && text) fill(text); };
    window.addEventListener(TOUR_QUERY_EVENT, onTour);
    return () => window.removeEventListener(TOUR_QUERY_EVENT, onTour);
  }, [hero]);
  // Where the tour's question landed: once the field has settled (the tour's rise, 1.1 s), its outline draws once (M-09;
  // it replaced an orange ring). Without motion the field does not rise and the outline is whole at once.
  useEffect(() => {
    if (!arrived) return;
    const t = window.setTimeout(() => arrive(box.current?.querySelector("form")), prefersReducedMotion() ? 0 : 1100);
    return () => window.clearTimeout(t);
  }, [arrived]);
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
  // Opened empty, the dialog's starting questions are the rows the arrows go through.
  const starting = modal && term.length < 2;
  const options = useMemo(() => starting ? STARTERS : flattenSuggestions(groups), [groups, starting]);
  // A closed dialog's list is not expanded (polish, 20 November 2026: the hidden field said aria-expanded="true").
  const expanded = (term.length >= 2 || starting) && (modal ? shown : open);

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
      // A question or a subject phrase searches names only by its name-like words, all of them (lib/names-query.ts).
      const names = namesQuery(q);
      if (names) void settle("entities", getJson(`/api/search?q=${encodeURIComponent(names.q)}${names.allWords ? "&all=1" : ""}`, signal));
      else setSources((s) => ({ ...s, entities: { query: q, data: { hits: [], total: 0 }, failed: false } }));
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);
  // A new list keeps no stale highlighted row.
  useEffect(() => { setActive(-1); }, [options]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  // The home page's list closes once its field scrolls up under the sticky header, instead of floating over the page.
  useEffect(() => {
    if (modal || !open) return;
    const away = () => { const top = box.current?.getBoundingClientRect().top ?? 0, header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-h")) || 64; if (top < header) setOpen(false); };
    window.addEventListener("scroll", away, { passive: true }); return () => window.removeEventListener("scroll", away);
  }, [modal, open]);
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const navigate = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };
  const resultsHref = `/cauta?q=${encodeURIComponent(term)}`;
  let index = -1;
  return <div className={`d-search${hero ? " d-search-hero" : ""}${modal ? " d-search-modal" : ""}${arrived ? " d-search-arrive" : ""}`} ref={box}>
    <form action="/cauta" method="get" role="search" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      // Enter opens the results page (with the interpretation on top), unless a row was chosen with the arrows: also a
      // starting question in the empty dialog, which Enter used to ignore (found 18 November 2026).
      const chosen = expanded && active >= 0 ? options[active] : undefined;
      if (chosen) { navigate(chosen.href); return; }
      if (!term) { box.current?.querySelector("input")?.focus(); return; }
      navigate(resultsHref);
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
          // In the dialog Escape closes it at once (UX audit Z1-34): the search field would only clear its words first.
          // The words stay for the next opening; the field's own × clears them.
          if (event.key === "Escape" && modal) { event.preventDefault(); onClose?.(); return; }
          if (!["ArrowDown", "ArrowUp"].includes(event.key) || (term.length < 2 && !starting) || !options.length) return;
          event.preventDefault(); setOpen(true);
          // Over the rows that are drawn: in Esențial two starting questions are in the list but not shown. The one place
          // the mode reaches script, and it reads the page, not the mode (owner, 18 November 2026). A closed list (the
          // home page's, opening on this key) has no row drawn yet: every row counts, as before.
          const drawn = isDrawn(document.getElementById(`${id}-results`));
          setActive(stepShown(active, event.key === "ArrowDown", options.length, (at) => !drawn || isDrawn(document.getElementById(`${id}-option-${at}`))));
        }} />
      <button type="submit" aria-label="Vezi rezultatele căutării"><DiscoveryIcon name="arrow" /></button>
      {/* The work sign under the field while suggestions come (M-15; it replaced the spinner). */}
      <WorkLine busy={loading && term.length >= 2} failed={failedAll} />
    </form>
    <span className="d-sr-only" role="status">{!expanded ? "" : failedAll ? "Sugestiile nu sunt disponibile momentan. Apasă Enter pentru rezultate." : loading && !options.length ? "Căutăm…" : <>{starting ? <><span data-only="complet">{suggestionWords(options.length)}</span><span data-only="esential">{suggestionWords(STARTERS_ESENTIAL)}</span></> : suggestionWords(options.length)}. Folosește săgețile pentru a le parcurge; Enter fără o sugestie aleasă deschide rezultatele.</>}</span>
    <div className="d-search-results" hidden={!modal && !open}>
      {starting ? <div className="d-search-start"><div className="d-townhall-try"><span>Încearcă:</span>{TRY.map((t) => <button type="button" key={t} onClick={() => { setQuery(t); latestTerm.current = t; setOpen(true); box.current?.querySelector("input")?.focus(); }}>{t}</button>)}</div></div>
        : term.length < 2 ? <div className="d-search-state"><DiscoveryIcon name="search" /><p>De ex.: iluminat, Buzău, o firmă sau un CUI</p></div>
        : failedAll ? <div className="d-search-state"><DiscoveryIcon name="search" /><b>Sugestiile nu sunt disponibile momentan.</b><p>Apasă Enter pentru a căuta „{term}” în achiziții și documente.</p></div>
        : null}
      {term.length >= 2 && !loading && !failedAll && groups.length === 1 && groups[0]!.id === "words" && <p className="d-search-none">Nu am recunoscut un subiect, un loc sau un nume în „{term}”.</p>}
      <div id={`${id}-results`} role="listbox" aria-label="Sugestii" aria-busy={loading}>
        {starting && <ul role="group" aria-labelledby={`${id}-group-start`} className="d-search-group d-search-group-start">
          <li role="presentation" id={`${id}-group-start`} className="d-search-group-title">Întrebări de început</li>
          {STARTERS.map((item, at) => <li key={item.id} id={`${id}-option-${at}`} role="option" aria-selected={active === at} data-only={item.complet ? "complet" : undefined}>
            <a href={item.href} tabIndex={-1} className={active === at ? "active" : ""} onClick={(event) => { event.preventDefault(); navigate(item.href); }}>
              <span className="d-search-symbol"><DiscoveryIcon name={item.icon} /></span>
              <span><b>{item.label}</b>{item.detail && <small>{item.detail}</small>}</span><DiscoveryIcon name="arrow" />
            </a>
          </li>)}
        </ul>}
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
        {modal && <ul role="group" aria-label="Mai multe condiții" className="d-search-group d-search-more"><li role="presentation"><a href="/intreaba" onClick={() => onClose?.()}>Mai multe condiții? <b>Construiește o întrebare <span aria-hidden="true">→</span></b></a></li></ul>}
        {loading && term.length >= 2 && <div role="presentation" className="d-search-pending">Căutăm sugestii pentru „{term}”… Enter deschide rezultatele.</div>}
      </div>
      {starting && <p className="d-search-keys" aria-hidden="true">↑ ↓ alegi · Enter caută · Esc închizi</p>}
    </div>
  </div>;
}
