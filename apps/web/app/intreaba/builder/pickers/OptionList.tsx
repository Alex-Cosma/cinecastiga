"use client";

import { Fragment, type CSSProperties } from "react";
import { rovingKeyDown, rovingStop } from "../keyboard";
import type { ChangeSource, KitOption, KitRestRow } from "../kit-types";

/*
 * Component 9, the list of a short window: radios (one choice, a radiogroup
 * with a roving tabindex, ↑/↓) or checkboxes (a group, each its own Tab
 * stop). Every option reads as the sentence will say it and shows its share
 * and count (R5). A disabled option keeps its reason in its name. What
 * cannot be classed is a rest row, text that takes no focus, so the window
 * adds to 100%. The link row ("Firme cu sediul în… ›") opens another window.
 */

export interface OptionListProps {
  label: string;
  options: readonly KitOption[];
  /** Checkboxes instead of radios. */
  multiple?: boolean;
  /** Radios: the chosen value. */
  value?: string | null;
  /** Checkboxes: the ticked values. */
  values?: readonly string[];
  /** Radios: the chosen value; checkboxes: the toggled one. */
  onChange?: (value: string, source: ChangeSource) => void;
  rest?: readonly KitRestRow[];
  link?: { label: string; onClick: () => void; className?: string };
}

const pct = (share: number) => `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%`;

/** A rest row: text, out of the radiogroup's roving order. */
function RestRow({ row }: { row: KitRestRow }) {
  return <div className="qb-opt qb-opt--rest">
    <span className="qb-opt-mark" aria-hidden="true" />
    <span className="qb-opt-t"><strong>{row.label}</strong></span>
    <span className="qb-opt-n">{row.count}</span>
  </div>;
}

export default function OptionList({ label, options, multiple = false, value = null, values = [], onChange, rest = [], link }: OptionListProps) {
  const isOn = (option: KitOption) => multiple ? values.includes(option.value) : option.value === value;
  const stop = multiple ? -1 : rovingStop(options.findIndex(isOn), options.map(option => !!option.disabled));
  return <>
    <div
      className={`qb-opts${multiple ? " qb-opts--check" : ""}`}
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      data-roving=""
      onKeyDown={multiple ? undefined : event => rovingKeyDown(event, '[role="radio"]', "both", index => { const next = options[index]; if (next) onChange?.(next.value, "move"); })}
    >
      {options.map((option, index) => {
        const on = isOn(option), heading = option.group && option.group !== options[index - 1]?.group ? option.group : null;
        return <Fragment key={option.value}>
          {heading && <p className="qb-opt-group">{heading}</p>}
          <button
            type="button"
            className={`qb-opt${option.className ? ` ${option.className}` : ""}`}
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            aria-disabled={option.disabled ? true : undefined}
            tabIndex={multiple ? undefined : index === stop ? 0 : -1}
            onClick={() => { if (!option.disabled) onChange?.(option.value, "activate"); }}
          >
            <span className="qb-opt-mark" aria-hidden="true" />
            <span className="qb-opt-t">
              <strong>{option.swatch && <i className={`qb-sw qb-sw--${option.swatch} qb-opt-sw`} aria-hidden="true" />}{option.label}</strong>
              {option.detail && <small>{option.detail}</small>}
              {option.disabled && <small>{option.disabled}</small>}
              {option.swap && <span className="qb-opt-swap">{option.swap}</span>}
              {option.share !== undefined && <span className="qb-opt-bar" aria-hidden="true" style={{ "--w": pct(option.share) } as CSSProperties} />}
            </span>
            <span className="qb-opt-n">{option.count}</span>
          </button>
          {rest.filter(row => row.after === option.value).map(row => <RestRow key={`rest:${row.label}`} row={row} />)}
        </Fragment>;
      })}
      {rest.filter(row => row.after === undefined || !options.some(option => option.value === row.after)).map(row => <RestRow key={`rest:${row.label}`} row={row} />)}
    </div>
    {link && <button type="button" className={`qb-opt--link${link.className ? ` ${link.className}` : ""}`} onClick={link.onClick}>{link.label}<span aria-hidden="true">›</span></button>}
  </>;
}
