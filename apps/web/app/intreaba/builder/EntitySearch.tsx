"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import { comboboxKey, debounce, revealDelta, type ComboState } from "./keyboard";

/*
 * Component 13, the entity search: the buyer, the firm, the focal entity, the
 * comparison, the place. A combobox (WAI editable combobox with a listbox):
 * focus stays in the field, ↑/↓ move the active option (aria-activedescendant),
 * Enter picks it, or the first result, as the site's search does; Escape
 * leaves the list, then empties the field, and only then lets the window
 * close. "Caut…" and the result count are said in a live region.
 * Presentational: the caller fetches. It gets the text through `onSearch`,
 * debounced, and "" at once under `minChars`, and passes the results back.
 * From a keystroke until those results arrive (the delay, then `loading`)
 * the list on screen is the previous text's: the status says "Caut…", and
 * Enter waits, then picks the first fresh result, never an out-of-date one.
 * In a window the list is drawn under the field (`inline`); "Unde e …?"
 * (Locate) opens it under the field instead.
 */

export interface SearchResult {
  id: string;
  name: string;
  /** Second line ("primăria și consiliul local"). */
  detail?: string;
  /** On the right: the county of a locality (Vânători is in five counties). */
  side?: string;
  /** Heading above this result when it differs from the previous one ("Primăria localității"). */
  group?: string;
  className?: string;
}

export interface EntitySearchProps {
  /** The field's accessible name ("Instituție sau localitate"). */
  label: string;
  placeholder?: string;
  results: readonly SearchResult[];
  /** True from `onSearch` until its results are passed back (Enter waits for them). */
  loading?: boolean;
  /** The trimmed text, `delay` ms after the last keystroke; "" at once when it gets shorter than `minChars`. */
  onSearch?: (query: string) => void;
  onPick?: (result: SearchResult) => void;
  delay?: number;
  minChars?: number;
  defaultQuery?: string;
  /** Said when a search found nothing. */
  emptyText?: string;
  /** Drawn under the field in a window (default), or opened under it (Locate). */
  inline?: boolean;
  /** Static state classes for the dev demo frames: on the field, and the active result. */
  className?: string;
  activeIndex?: number;
}

export default function EntitySearch({ label, placeholder, results, loading = false, onSearch, onPick, delay = 200, minChars = 2, defaultQuery = "", emptyText = "Nicio potrivire. Încearcă un nume mai scurt sau codul fiscal.", inline = true, className, activeIndex = -1 }: EntitySearchProps) {
  const base = useId();
  const listId = `${base}-list`, optionId = (index: number) => `${base}-o${index}`;
  const [query, setQuery] = useState(defaultQuery);
  const [state, setState] = useState<ComboState>({ active: activeIndex, expanded: inline });
  // `due`: the text is typed but not sent yet (the delay); `held`: Enter came before its results.
  const [due, setDue] = useState(false);
  const [held, setHeld] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;
  const debounced = useMemo(() => debounce((text: string) => { setDue(false); searchRef.current?.(text); }, delay), [delay]);
  useEffect(() => () => debounced.cancel(), [debounced]);

  const typed = query.trim().length >= minChars;
  const busy = loading || typed && due;
  const active = state.active < results.length ? state.active : -1;
  const expanded = results.length > 0 && (inline || state.expanded && typed);
  // Only the list (or, drawn in a window, the window) scrolls to the active result, never the page.
  useEffect(() => {
    const option = active >= 0 && expanded ? document.getElementById(optionId(active)) : null;
    const box = inline ? option?.closest<HTMLElement>("dialog") : listRef.current;
    if (option && box) box.scrollTop += revealDelta(option.getBoundingClientRect(), box.getBoundingClientRect());
  }, [active, expanded]);

  const change = (text: string) => {
    setQuery(text);
    setState({ active: -1, expanded: true });
    setHeld(false);
    const trimmed = text.trim();
    if (trimmed.length < minChars) { debounced.cancel(); setDue(false); onSearch?.(""); }
    else { setDue(true); debounced.call(trimmed); }
  };
  const pick = (index: number) => {
    const result = results[index];
    if (!result) return;
    setState({ active: -1, expanded: inline });
    onPick?.(result);
  };
  // The Enter that waited picks the first fresh result, if any.
  useEffect(() => {
    if (!held || busy) return;
    setHeld(false);
    if (typed) pick(0);
  }, [held, busy]);
  const status = busy ? "Caut…" : typed && !results.length ? emptyText : typed ? countWords(results.length, "rezultat", "rezultate") : "";
  const quiet = !busy && results.length > 0;

  return <div className={`qb-combo${inline ? "" : " qb-combo--pop"}`}>
    <label className={`qb-search${className ? ` ${className}` : ""}`}>
      <span className="qb-sr">{label}</span>
      <input
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        data-autofocus=""
        value={query}
        placeholder={placeholder}
        onChange={event => change(event.target.value)}
        onFocus={() => { if (!inline) setState(current => ({ ...current, expanded: true })); }}
        onBlur={() => { if (!inline) setState({ active: -1, expanded: false }); }}
        onKeyDown={event => {
          const next = comboboxKey(event.key, { active, expanded }, results.length, query.length > 0, inline, busy && typed);
          if (!next) return;
          event.preventDefault();
          event.stopPropagation(); // an Escape the field used must not close the window too
          if ("state" in next) setState(next.state);
          else if ("pick" in next) pick(next.pick);
          else if ("wait" in next) setHeld(true);
          else change("");
        }}
      />
    </label>
    <div ref={listRef} className="qb-listbox" role="listbox" id={listId} aria-label={label} aria-busy={busy || undefined} hidden={!expanded}>
      {resultGroups(results).map(({ group, start, items }) => {
        const options = items.map((result, offset) => {
          const index = start + offset;
          return <div
            key={result.id}
            id={optionId(index)}
            className={`qb-res${result.className ? ` ${result.className}` : ""}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={event => event.preventDefault()} // focus stays in the field
            onClick={() => pick(index)}
          >
            <span className="qb-res-t"><strong>{result.name}</strong>{result.detail && <small>{result.detail}</small>}</span>
            {result.side && <span className="qb-res-side">{result.side}</span>}
          </div>;
        });
        if (!group) return <Fragment key={`g${start}`}>{options}</Fragment>;
        return <div key={`g${start}`} role="group" aria-labelledby={`${base}-g${start}`}>
          <div className="qb-opt-group" id={`${base}-g${start}`} role="presentation">{group}</div>
          {options}
        </div>;
      })}
    </div>
    <p className={`qb-search-status${quiet || !status ? " qb-sr" : ""}`} role="status" aria-live="polite">{status}</p>
  </div>;
}

/** Consecutive results with the same heading, in order, with the index of their first result. */
export function resultGroups(results: readonly SearchResult[]): { group: string | undefined; start: number; items: SearchResult[] }[] {
  const runs: { group: string | undefined; start: number; items: SearchResult[] }[] = [];
  results.forEach((result, index) => {
    const last = runs[runs.length - 1];
    if (last && last.group === result.group) last.items.push(result);
    else runs.push({ group: result.group, start: index, items: [result] });
  });
  return runs;
}
