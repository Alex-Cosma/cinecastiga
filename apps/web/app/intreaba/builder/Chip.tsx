"use client";

import { useId, type MouseEvent } from "react";
import HelpTip, { DisabledReason } from "./HelpTip";
import { focusables } from "./keyboard";
import type { KitAvailability } from "./kit-types";

/*
 * Component 4, the condition chip of a row: unset "+ X ▾", active
 * "✓ value · count ▾ ×", open, dimmed with its reason. Two buttons: the main
 * one opens the window, × removes the condition. After ×, focus moves to the
 * next control of the row (kit §3); the new total is announced by the total
 * line (component 21), not here.
 */

export interface ChipProps {
  id: string;
  /** The condition's name unset ("Angajați"), its value when active ("1–49 angajați"). */
  label: string;
  /** The name × removes ("Scoate «Angajați»"); the label when not given. */
  name?: string;
  active?: boolean;
  count?: string;
  open?: boolean;
  availability?: KitAvailability;
  onOpen?: (id: string, trigger: HTMLButtonElement) => void;
  onRemove?: (id: string) => void;
  /** Static state classes on the main button for the dev demo frames. */
  className?: string;
}

/**
 * Removes through `remove` and then focuses, of what is still there: the
 * control that followed in its row, the chip itself (now unset), the one
 * before it in the row, and, when the row left with its last item, the first
 * control after the row on the page, else the last one before it. Never a
 * (?), whose definition would open, and never <body>.
 */
export function removeAndRefocus(event: MouseEvent<HTMLElement>, remove: () => void, holder = ".fk-chip"): void {
  const own = event.currentTarget.closest<HTMLElement>(holder) ?? event.currentTarget;
  const scope = own.closest<HTMLElement>("[data-fk-row]") ?? own.parentElement ?? own;
  const after = (element: HTMLElement) => !!(own.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  const usable = (element: HTMLElement) => !own.contains(element) && !element.classList.contains("term-trigger");
  const row = focusables(scope).filter(usable), page = focusables(document.body).filter(element => usable(element) && !scope.contains(element));
  const main = own.querySelector<HTMLElement>(".fk-chip-main, button");
  const order = [...row.filter(after), main, ...row.filter(element => !after(element)).reverse(), ...page.filter(after), ...page.filter(element => !after(element)).reverse()];
  remove();
  requestAnimationFrame(() => order.find(element => element?.isConnected && element.tabIndex >= 0)?.focus());
}

export default function Chip({ id, label, name = label, active = false, count, open = false, availability, onOpen, onRemove, className }: ChipProps) {
  const reasonId = useId();
  const disabled = availability?.state === "disabled" ? availability : null;
  const chip = <span className={`fk-chip${active ? " is-active" : ""}${disabled ? " is-dim" : ""}`}>
    <button
      type="button"
      className={`fk-chip-main${className ? ` ${className}` : ""}`}
      aria-haspopup="dialog"
      aria-expanded={disabled ? undefined : open}
      aria-disabled={disabled ? true : undefined}
      aria-describedby={disabled ? reasonId : undefined}
      onClick={event => { if (!disabled) onOpen?.(id, event.currentTarget); }}
    >
      {active ? <i className="fk-ck" aria-hidden="true" /> : <span className="fk-plus" aria-hidden="true">+</span>}
      <span>{label}</span>
      {count && <span className="fk-n">{count}</span>}
      <i className="fk-chev" aria-hidden="true" />
    </button>
    {active && onRemove && <button type="button" className="fk-chip-x" aria-label={`Scoate «${name}»`} onClick={event => removeAndRefocus(event, () => onRemove(id))}>×</button>}
  </span>;
  if (!disabled) return chip;
  return <span className="fk-pair fk-tipwrap-sm">{chip}<DisabledReason id={reasonId} reason={disabled.reason} />{disabled.tip && <HelpTip tip={disabled.tip} />}</span>;
}
