"use client";

import { useId, type ReactNode } from "react";
import { DisabledReason } from "./HelpTip";
import { rovingKeyDown, rovingStop } from "./keyboard";
import type { ChangeSource } from "./kit-types";

/*
 * Component 7, the segmented control (= today's .qb-shortcuts look): one
 * choice of two to four, applied at once ("Toate · Directe 5% · Proceduri
 * 95%", "Vizual | Tabel", "Împarte"). A radiogroup with a roving tabindex:
 * Tab enters once, ←/→ (and ↑/↓) move and choose, Home/End, disabled options
 * are skipped. The tabs of "De la cine?" use the same drawing as a tablist.
 */

export interface SegmentOption {
  value: string;
  label: ReactNode;
  /** The share from the answer ("5%"), or "—" for an empty option. */
  count?: string;
  /** Shown but not choosable; a string is the reason, read with the option. */
  disabled?: boolean | string;
  /** The kind the domain implies (dashed outline), not chosen. */
  inferred?: boolean;
  /** The channel colour of the charts, as a legend. */
  swatch?: "da" | "proc";
  /** Tabs only: the id of the panel this tab shows. */
  controls?: string;
  className?: string;
}

/**
 * A channel colour with its word, kept on one line so the key is never read
 * as the neighbour's: `<SwatchLabel swatch="da">Directe</SwatchLabel> /
 * <SwatchLabel swatch="proc">proceduri</SwatchLabel>` ("Împarte").
 */
export function SwatchLabel({ swatch, children }: { swatch: NonNullable<SegmentOption["swatch"]>; children: ReactNode }) {
  return <span className="qb-sw-l"><i className={`qb-sw qb-sw--${swatch}`} aria-hidden="true" />{children}</span>;
}

export interface SegmentedProps {
  /** The accessible name ("Ce fel de achiziții"); a visible label is the caller's. */
  label: string;
  options: readonly SegmentOption[];
  value: string | null;
  onChange?: (value: string, source: ChangeSource) => void;
  size?: "sm";
  /** Equal columns on the full width (the phone layout is always full width). */
  full?: boolean;
  mode?: "radio" | "tabs";
  className?: string;
}

export default function Segmented({ label, options, value, onChange, size, full = false, mode = "radio", className }: SegmentedProps) {
  const base = useId();
  const tabs = mode === "tabs";
  const checked = options.findIndex(option => option.value === value);
  const stop = rovingStop(checked, options.map(option => !!option.disabled));
  const role = tabs ? "tab" : "radio";
  return <div
    className={`qb-seg${size === "sm" ? " qb-seg--sm" : ""}${full ? " qb-seg--full" : ""}${className ? ` ${className}` : ""}`}
    role={tabs ? "tablist" : "radiogroup"}
    aria-label={label}
    data-roving=""
    onKeyDown={event => rovingKeyDown(event, `[role="${role}"]`, tabs ? "horizontal" : "both", index => { const next = options[index]; if (next) onChange?.(next.value, "move"); })}
  >
    {options.map((option, index) => {
      const on = index === checked, reason = typeof option.disabled === "string" ? option.disabled : null;
      const reasonId = `${base}-r${index}`;
      return <button
        key={option.value}
        type="button"
        id={tabs ? `${base}-t${index}` : undefined}
        className={`qb-seg-opt${option.inferred ? " is-inferred" : ""}${option.className ? ` ${option.className}` : ""}`}
        role={role}
        aria-checked={tabs ? undefined : on}
        aria-selected={tabs ? on : undefined}
        aria-controls={tabs ? option.controls : undefined}
        aria-disabled={option.disabled ? true : undefined}
        aria-describedby={reason ? reasonId : undefined}
        tabIndex={index === stop ? 0 : -1}
        onClick={() => { if (!option.disabled) onChange?.(option.value, "activate"); }}
      >
        <span className="qb-seg-l">{option.swatch ? <SwatchLabel swatch={option.swatch}>{option.label}</SwatchLabel> : option.label}</span>
        {option.count && <span className="qb-seg-n">{option.count}</span>}
      </button>;
    })}
    {options.map((option, index) => typeof option.disabled === "string" && <DisabledReason key={`r${index}`} id={`${base}-r${index}`} reason={option.disabled} />)}
  </div>;
}
