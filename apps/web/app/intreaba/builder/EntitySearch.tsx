"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { countWords } from "../../../lib/ask/answer-text";
import { comboboxKey, debounce, type ComboState } from "./keyboard";

/*
 * Component 13, the entity search: the buyer, the firm, the focal entity, the
 * comparison, the place. A combobox (WAI editable combobox with a listbox):
 * focus stays in the field, ↑/↓ move the active option (aria-activedescendant),
 * Enter picks it, or the first result, as the site's search does; Escape
 * leaves the list, then empties the field, and only then lets the window
 * close. "Caut…" and the result count are said in a live region.
 * Presentational: the caller fetches. It gets the text through `onSearch`,
 * debounced, and "" at once under `minChars`, and passes the results back.
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
  const searchRef = useRef(onSearch);
  searchRef.current = onSearch;
  const debounced = useMemo(() => debounce((text: string) => searchRef.current?.(text), delay), [delay]);
  useEffect(() => () => debounced.cancel(), [debounced]);

  const typed = query.trim().length >= minChars;
  const active = state.active < results.length ? state.active : -1;
  const expanded = results.length > 0 && (inline || state.expanded && typed);
  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  const change = (text: string) => {
    setQuery(text);
    setState({ active: -1, expanded: true });
    const trimmed = text.trim();
    if (trimmed.length < minChars) { debounced.cancel(); onSearch?.(""); }
    else debounced.call(trimmed);
  };
  const pick = (index: number) => {
    const result = results[index];
    if (!result) return;
    setState({ active: -1, expanded: inline });
    onPick?.(result);
  };
  const status = loading ? "Caut…" : typed && !results.length ? emptyText : typed ? countWords(results.length, "rezultat", "rezultate") : "";
  const quiet = !loading && results.length > 0;

  return <div className={`fk-combo${inline ? "" : " fk-combo--pop"}`}>
    <label className={`fk-search${className ? ` ${className}` : ""}`}>
      <span className="fk-sr">{label}</span>
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
          const next = comboboxKey(event.key, { active, expanded }, results.length, query.length > 0, inline);
          if (!next) return;
          event.preventDefault();
          event.stopPropagation(); // an Escape the field used must not close the window too
          if ("state" in next) setState(next.state);
          else if ("pick" in next) pick(next.pick);
          else change("");
        }}
      />
    </label>
    <div className="fk-listbox" role="listbox" id={listId} aria-label={label} aria-busy={loading || undefined} hidden={!expanded}>
      {resultGroups(results).map(({ group, start, items }) => {
        const options = items.map((result, offset) => {
          const index = start + offset;
          return <div
            key={result.id}
            id={optionId(index)}
            className={`fk-res${result.className ? ` ${result.className}` : ""}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={event => event.preventDefault()} // focus stays in the field
            onClick={() => pick(index)}
          >
            <span className="fk-res-t"><strong>{result.name}</strong>{result.detail && <small>{result.detail}</small>}</span>
            {result.side && <span className="fk-res-side">{result.side}</span>}
          </div>;
        });
        if (!group) return <Fragment key={`g${start}`}>{options}</Fragment>;
        return <div key={`g${start}`} role="group" aria-labelledby={`${base}-g${start}`}>
          <div className="fk-opt-group" id={`${base}-g${start}`} role="presentation">{group}</div>
          {options}
        </div>;
      })}
    </div>
    <p className={`fk-search-status${quiet || !status ? " fk-sr" : ""}`} role="status" aria-live="polite">{status}</p>
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
