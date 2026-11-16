"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { countyName } from "../../lib/counties";
import {
  SUGGEST_TITLES, applySuggestion, matchedPart, suggestCue, suggestRows, suggestUrl,
  type EntityFeed, type PlaceFeed, type SuggestCue, type SuggestPin, type SuggestRow,
} from "./ask-suggest";

/**
 * The question box's suggestions (UX audit Z2-08): a combobox list under the box while a name is typed after its cue
 * word. Only typing opens it (an example or a link that fills the box does not); the feed is asked 120 ms after the
 * last keystroke and a newer keystroke aborts it, so Enter never waits for it. Enter asks the words as written unless
 * the arrows chose a row; a pick puts the exact name into the question and keeps the firm or institution for
 * pinnedChoice.
 */
export function useAskSuggest(value: string, onChange: (value: string) => void, inputRef: RefObject<HTMLInputElement | null>) {
  const base = useId();
  const [typed, setTyped] = useState<SuggestCue | null>(null);
  const [shown, setShown] = useState<{ cue: SuggestCue; rows: SuggestRow[] } | null>(null);
  const [active, setActive] = useState(-1);
  const pin = useRef<SuggestPin | null>(null);
  const key = typed ? `${typed.kind}|${typed.from}|${typed.query}` : "";
  useEffect(() => {
    if (!typed) { setShown(null); setActive(-1); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(suggestUrl(typed), { signal: controller.signal });
        if (!r.ok) return;
        const feed = (await r.json()) as EntityFeed | PlaceFeed;
        if (controller.signal.aborted) return;
        const rows = suggestRows(typed, feed, (raw) => countyName(raw));
        setShown(rows.length ? { cue: typed, rows } : null);
        setActive(-1);
      } catch { /* aborted, or no suggestions now: the box works without them */ }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
    // `key` stands for `typed`: the same words typed again do not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const close = useCallback(() => { setTyped(null); setShown(null); setActive(-1); }, []);
  /** A keystroke in the box: the cue at its end, when the caret is there. */
  const onInput = (text: string, caretAtEnd: boolean) => setTyped(caretAtEnd ? suggestCue(text) : null);
  const pick = (row: SuggestRow) => {
    if (!shown) return;
    const next = applySuggestion(value, shown.cue, row.insert);
    pin.current = row.pin ?? null;
    onChange(next);
    close();
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.length, next.length);
    });
  };
  const open = Boolean(shown);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(a + 1, shown.rows.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); pick(shown.rows[active]!); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") close();
  };
  const optionId = (i: number) => `${base}-o${i}`;
  const inputProps = {
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": `${base}-list`,
    ...(open && active >= 0 ? { "aria-activedescendant": optionId(active) } : {}),
    onKeyDown,
    onBlur: close,
  };
  return { open, shown, active, pin, close, onInput, pick, inputProps, listId: `${base}-list`, optionId };
}

function Highlight({ name, fragment }: { name: string; fragment: string }) {
  const part = matchedPart(name, fragment);
  if (!part) return <>{name}</>;
  return <>{name.slice(0, part[0])}<mark>{name.slice(part[0], part[1])}</mark>{name.slice(part[1])}</>;
}

export function AskSuggestList({ suggest }: { suggest: ReturnType<typeof useAskSuggest> }) {
  const { shown, active, pick, listId, optionId } = suggest;
  if (!shown) return null;
  const title = SUGGEST_TITLES[shown.cue.kind];
  return (
    <div className="ia-sug">
      <p className="ia-sug-h" id={`${listId}-h`}>{title}</p>
      <ul role="listbox" id={listId} aria-labelledby={`${listId}-h`}>
        {shown.rows.map((row, i) => (
          // The focus stays in the box (combobox): a press on a row must not blur it before the click picks.
          <li key={`${row.insert}|${row.meta}`} id={optionId(i)} role="option" aria-selected={i === active} className="ia-sug-i"
            onMouseDown={(event) => event.preventDefault()} onClick={() => pick(row)}>
            <span className="ia-sug-n"><Highlight name={row.name} fragment={shown.cue.fragment} /></span>
            <span className="ia-sug-m">{row.meta}</span>
          </li>
        ))}
      </ul>
      <p className="ia-sug-f">
        {active >= 0 ? <><kbd>Enter</kbd> pune numele ales în întrebare.</> : <>Alegerea pune numele exact în întrebare. <kbd>Enter</kbd> întreabă așa cum ai scris.</>}
      </p>
      <p className="d-sr-only" role="status">{`${title}: ${shown.rows.length} sugestii`}</p>
    </div>
  );
}
