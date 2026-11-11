"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePendingRegion } from "@/components/ghost/client";
import { PRICE_ORDERS, priceHref, type PriceOption, type PriceState } from "@/lib/unit-prices-shared";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

/** An option matches when one of its words starts with what was typed („lac” → Lactate și ouă, „lapte” → Lapte). */
export function matchOptions(options: readonly PriceOption[], text: string): PriceOption[] {
  const t = fold(text.trim());
  if (!t) return [...options];
  return options.filter((o) => fold(o.label).startsWith(t) || fold(o.label).split(/[\s,-]+/).some((w) => w.startsWith(t)));
}

/**
 * The filters of /preturi: the year, one typeahead over our own groups and products (owner, 11 November 2026: not
 * CPV), the county and the order. Each change replaces the list in place, dimmed (PendingRegion).
 */
export default function PriceFilters({ state, years, counties, options }: {
  state: PriceState; years: number[]; counties: string[]; options: PriceOption[];
}) {
  const region = usePendingRegion();
  const go = (patch: Partial<PriceState>) => region?.go(priceHref(state, patch));
  const chosen = options.find((o) => o.kind === "product" ? o.value === state.product : o.value === state.group) ?? null;
  const [text, setText] = useState(chosen?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => { setText(chosen?.label ?? ""); }, [chosen?.label]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  const hits = useMemo(() => matchOptions(options, text === chosen?.label ? "" : text), [options, text, chosen?.label]);
  const pick = (o: PriceOption | null) => {
    setOpen(false); setActive(-1); setText(o?.label ?? "");
    go(o == null ? { group: null, product: null } : o.kind === "group" ? { group: o.value as PriceState["group"], product: null } : { product: o.value, group: null });
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = active >= 0 ? hits[active] : text.trim() ? hits[0] : null; if (o || !text.trim()) pick(o ?? null); }
    else if (e.key === "Escape") { setOpen(false); setText(chosen?.label ?? ""); }
  };
  return <div className="pr-filters">
    <label className="pr-field pr-year">An
      <select value={state.year ?? ""} onChange={(e) => go({ year: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Toți anii</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
    <div className="pr-field pr-pick" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <label htmlFor={`${listId}-input`}>Grupă sau produs</label>
      <div className="pr-pick-box">
        <input id={`${listId}-input`} value={text} placeholder="Toate: scrie „legume”, „lapte”…" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={(e) => { e.currentTarget.select(); setOpen(true); }} onKeyDown={onKey} />
        {chosen && <button type="button" className="pr-clear" onClick={() => pick(null)} aria-label={`Arată toate produsele, nu doar ${chosen.label}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>}
      </div>
      {open && <ul className="pr-options" id={listId} role="listbox" aria-label="Grupe și produse">
        {hits.length === 0 && <li className="pr-option-none" role="presentation">Nicio grupă sau produs pentru „{text.trim()}”.</li>}
        {hits.map((o, i) => <li key={`${o.kind}-${o.value}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          className={`pr-option pr-option-${o.kind}${i === active ? " is-active" : ""}`}
          onPointerEnter={() => setActive(i)} onPointerDown={(e) => { e.preventDefault(); pick(o); }}>
          <span>{o.label}</span><small>{o.detail}</small>
        </li>)}
      </ul>}
    </div>
    <label className="pr-field pr-county">Județ
      <select value={state.county ?? ""} onChange={(e) => go({ county: e.target.value || null })}>
        <option value="">Toate</option>
        {counties.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
    <label className="pr-field pr-order">Ordine
      <select value={state.order} onChange={(e) => go({ order: e.target.value as PriceState["order"] })}>
        {PRICE_ORDERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  </div>;
}
