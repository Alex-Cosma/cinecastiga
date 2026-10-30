"use client";

import { useId } from "react";
import HelpTip, { DisabledReason } from "./HelpTip";
import type { KitAvailability, KitTip } from "./kit-types";

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
  /** What the condition means (the explanations live in (?) tips): beside the switch, in both states. */
  tip?: KitTip;
}

export default function Toggle({ id, label, pressed, count, onToggle, availability, auto = false, glyph, className, tip }: ToggleProps) {
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
  if (!disabled) return tip ? <span className="qb-pair qb-tipwrap-sm">{button}<HelpTip tip={tip} /></span> : button;
  const why = disabled.tip ?? tip;
  return <span className="qb-pair qb-tipwrap-sm">{button}<DisabledReason id={reasonId} reason={disabled.reason} />{why && <HelpTip tip={why} />}</span>;
}
