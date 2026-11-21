"use client";

import { useEffect, useId, useRef, useState } from "react";
import { tidyName } from "../../lib/tidy-name";
import type { MapSearchInstitution, MapSearchPlace, MapSearchResult } from "@/lib/map-search";

/*
 * /harta's search (UX audit Z4-01, owner 16 November 2026): „Caută o localitate sau o instituție”, the first control of
 * the filter row (its own row on phones). The localities open their county and the UAT's panel; a hospital or a school
 * opens its county on that layer with its circle lit. A combobox as the home page's town-hall dialog (TownHallTile):
 * the keyboard stays in the field (aria-activedescendant), ↑ ↓ choose, Enter opens, Escape closes the list.
 */

type Item = { kind: "place"; place: MapSearchPlace } | { kind: "institution"; institution: MapSearchInstitution };
const KIND_INSTITUTION = { hospitals: "spital", schools: "școală sau grădiniță" } as const;

export default function MapSearch({ chosen, onPlace, onInstitution }: {
  /** The name of what was chosen here, while the map still shows it (the field keeps it); null clears the field. */
  chosen: string | null;
  onPlace: (place: MapSearchPlace) => void;
  onInstitution: (institution: MapSearchInstitution) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<{ q: string; data: MapSearchResult } | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // The field shows what the map shows: a choice made here, cleared when the map moves elsewhere.
  useEffect(() => { setTerm(chosen ?? ""); setOpen(false); }, [chosen]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2 || q === chosen) { setResult(null); setFailed(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/map/cauta?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() as Promise<MapSearchResult> : Promise.reject(new Error(String(r.status)))))
        .then((data) => { setResult({ q, data }); setActive(0); setFailed(false); })
        .catch((e: unknown) => { if ((e as Error).name !== "AbortError") setFailed(true); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, chosen]);

  // A press outside closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const items: Item[] = result ? [...result.data.places.map((place) => ({ kind: "place" as const, place })), ...result.data.institutions.map((institution) => ({ kind: "institution" as const, institution }))] : [];
  const current = result?.q === term.trim();
  const status = failed ? "Nu am putut căuta acum. Încearcă din nou." : current && !items.length ? "Nimic cu acest nume pe hartă." : "";
  const dropped = open && term.trim().length >= 2 && term.trim() !== chosen && (items.length > 0 || Boolean(status));
  const listId = `${id}-list`;
  const choose = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    if (item.kind === "place") onPlace(item.place); else onInstitution(item.institution);
  };
  const places = items.filter((i) => i.kind === "place").length;

  return <div className="mx-find" ref={box}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="mx-find-pin"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
    <input type="search" value={term} placeholder="Caută o localitate sau o instituție" aria-label="Caută o localitate sau o instituție pe hartă" autoComplete="off" spellCheck={false}
      role="combobox" aria-autocomplete="list" aria-expanded={dropped && items.length > 0} aria-controls={listId} aria-activedescendant={dropped && items.length ? `${id}-${active}` : undefined}
      onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" && items.length) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % items.length); }
        else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
        else if (e.key === "Enter") { e.preventDefault(); if (current && dropped) choose(items[active]); }
        // The list closes first; the map's own Escape (closing a panel or a county) waits for the next one.
        else if (e.key === "Escape" && dropped) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      }} />
    <div className="mx-find-drop" hidden={!dropped}>
      <ul id={listId} role="listbox" aria-label="Localități și instituții">
        {items.map((item, i) => {
          const head = i === 0 && item.kind === "place" ? "Localități" : i === places ? "Instituții" : null;
          return <li key={item.kind === "place" ? `p${item.place.siruta}` : `i${item.institution.key}`} role="presentation">
            {head && <span className="mx-find-g" aria-hidden="true">{head}</span>}
            <div id={`${id}-${i}`} role="option" aria-selected={i === active} className="mx-find-o" onMouseEnter={() => setActive(i)} onClick={() => choose(item)}>
              {item.kind === "place"
                ? <span><b>{item.place.name}</b><small>{item.place.kind} · {item.place.county === "bucuresti" ? "București" : `județul ${item.place.countyName}`}</small></span>
                : <span><b>{tidyName(item.institution.name)}</b><small>{KIND_INSTITUTION[item.institution.kind]} · {item.institution.place}</small></span>}
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 6h7.5M6.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </li>;
        })}
      </ul>
      {status && <p className="mx-find-status">{status}</p>}
    </div>
    <p className="g-sr" role="status" aria-live="polite">{status || (dropped && items.length ? `${items.length} ${items.length === 1 ? "rezultat" : "rezultate"}` : "")}</p>
  </div>;
}
