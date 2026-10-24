"use client";

import { useId } from "react";
import { DisabledReason } from "./HelpTip";
import { rovingKeyDown, rovingStop } from "./keyboard";
import type { ChangeSource } from "./kit-types";

/*
 * Component 11, the pills: a short choice from a small set. Ranges with an
 * interval ("Mărimea achiziției": the ranges are not legal thresholds), years
 * ("Firme noi · Din"), and pills with counts, one choice applied at once
 * (the "Semnal" of the scatter strip). A radiogroup with a roving tabindex.
 * The signal dot ties a pill to the chart's points; it is decoration, the
 * count is in the name. Chosen is green; orange stays on the dot.
 */

export interface PillOption {
  value: string;
  label: string;
  count?: string;
  signal?: boolean;
  /** Shown but not choosable (struck through); a string is the reason. */
  disabled?: boolean | string;
  className?: string;
}

export interface PillsProps {
  label: string;
  options: readonly PillOption[];
  value: string | null;
  onChange?: (value: string, source: ChangeSource) => void;
}

export default function Pills({ label, options, value, onChange }: PillsProps) {
  const base = useId();
  const checked = options.findIndex(option => option.value === value);
  const stop = rovingStop(checked, options.map(option => !!option.disabled));
  return <div
    className="fk-pills"
    role="radiogroup"
    aria-label={label}
    data-roving=""
    onKeyDown={event => rovingKeyDown(event, '[role="radio"]', "both", index => { const next = options[index]; if (next) onChange?.(next.value, "move"); })}
  >
    {options.map((option, index) => {
      const on = index === checked, reason = typeof option.disabled === "string" ? option.disabled : undefined;
      return <button
        key={option.value}
        type="button"
        className={`fk-pill${option.className ? ` ${option.className}` : ""}`}
        role="radio"
        aria-checked={on}
        aria-disabled={option.disabled ? true : undefined}
        aria-describedby={reason ? `${base}-r${index}` : undefined}
        title={reason}
        tabIndex={index === stop ? 0 : -1}
        onClick={() => { if (!option.disabled) onChange?.(option.value, "activate"); }}
      >
        {option.signal && <i className="fk-dot fk-dot--signal" aria-hidden="true" />}
        {option.label}
        {option.count && <span className="fk-n">{option.count}</span>}
      </button>;
    })}
    {options.map((option, index) => typeof option.disabled === "string" && <DisabledReason key={`r${index}`} id={`${base}-r${index}`} reason={option.disabled} />)}
  </div>;
}

/**
 * The free interval under the ranges: two labelled numeric fields ("Între",
 * "și"). The values stay text, as typed; the caller parses and validates.
 */
export function RangeFields({ from, to, onChange, labels = ["Între", "și"], unit = "lei" }: { from: string; to: string; onChange?: (from: string, to: string) => void; labels?: readonly [string, string]; unit?: string }) {
  return <div className="fk-inputs">
    <label className="fk-field"><span>{labels[0]}</span><input inputMode="numeric" autoComplete="off" placeholder={unit} value={from} onChange={event => onChange?.(event.target.value, to)} /></label>
    <label className="fk-field"><span>{labels[1]}</span><input inputMode="numeric" autoComplete="off" placeholder={unit} value={to} onChange={event => onChange?.(from, event.target.value)} /></label>
  </div>;
}
