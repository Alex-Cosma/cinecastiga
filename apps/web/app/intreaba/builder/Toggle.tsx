"use client";

import { useId } from "react";
import HelpTip, { DisabledReason } from "./HelpTip";
import type { KitAvailability } from "./kit-types";

/*
 * Component 5, the switch: a condition without values ("Clientul lor
 * principal", "Cu semnale", "Doar clienții comuni", "Aceleași luni"). Off
 * "+ X · count", on "✓ X · count"; a second press turns it off, so it has no
 * ×. With 0 it stays visible, disabled, with the reason. "auto" is the warm
 * look of an adjustment the application made (trend's "Aceleași luni").
 */

export interface ToggleProps {
  id: string;
  label: string;
  pressed: boolean;
  count?: string;
  onToggle?: (id: string, pressed: boolean) => void;
  availability?: KitAvailability;
  auto?: boolean;
  /** "half" draws the half disc of "Aceleași luni" in both states instead of + / ✓. */
  glyph?: "half";
  className?: string;
}

export default function Toggle({ id, label, pressed, count, onToggle, availability, auto = false, glyph, className }: ToggleProps) {
  const reasonId = useId();
  const disabled = availability?.state === "disabled" ? availability : null;
  const mark = glyph === "half" ? <i className="qb-half" aria-hidden="true" /> : pressed ? <i className="qb-ck" aria-hidden="true" /> : <span className="qb-plus" aria-hidden="true">+</span>;
  const button = <button
    type="button"
    className={`qb-toggle${auto ? " is-auto" : ""}${className ? ` ${className}` : ""}`}
    aria-pressed={pressed}
    aria-disabled={disabled ? true : undefined}
    aria-describedby={disabled ? reasonId : undefined}
    onClick={() => { if (!disabled) onToggle?.(id, !pressed); }}
  >{mark}{label}{count && <span className="qb-n">{count}</span>}</button>;
  if (!disabled) return button;
  return <span className="qb-pair qb-tipwrap-sm">{button}<DisabledReason id={reasonId} reason={disabled.reason} />{disabled.tip && <HelpTip tip={disabled.tip} />}</span>;
}
