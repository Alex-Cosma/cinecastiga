"use client";

import type { ReactNode } from "react";
import KitLink from "../answer/KitLink";
import { removeAndRefocus } from "./Chip";
import HelpTip from "./HelpTip";
import type { KitLink as Link, KitTip } from "./kit-types";

/*
 * Component 6, the chips under the sentence (P4): what does not read as a
 * phrase. Always in this order: restrictions ("Doar …"), exclusions
 * ("Fără X", collapsed from three: "Fără 3 firme ▾"), adjustments the
 * application made (amber; or could not make, "2026: luni neconfirmate", with
 * the button that asks; or the switch to make again, "+ Aceleași luni"),
 * then conditions from an old link ("Din link: …",
 * dashed amber) and selections made on another page of the site (solid
 * amber, with their own label). The last two are not editable here: text
 * with a (?) and ×. Parked conditions are their own row (ParkedRow).
 */

export type UnderChipItem =
  /** "Doar cele de peste 1 mil. lei": opens its window. */
  | { kind: "only"; id: string; label: string; name: string }
  /** "Fără SYSTRA" (text), or collapsed "Fără 3 firme" (opens the list) from the third exclusion. */
  | { kind: "exclude"; id: string; label: string; name?: string; collapsed?: boolean }
  /** "Aceleași luni: ian.–mai", set by the application; opens its window; (?) says which months and why. */
  | { kind: "auto"; id: string; label: string; name: string; tip?: KitTip }
  /** What the application could not set by itself ("2026: luni neconfirmate" (?)), with the button that opens its window. No ×. */
  | { kind: "notice"; id: string; label: string; tip: KitTip; action: string }
  /** A switch for a condition the reader turned off ("Aceleași luni", component 5): pressing it turns it on, or opens its window. */
  | { kind: "toggle"; id: string; label: string; glyph?: "half"; opens?: boolean }
  /** A condition from an old link, applied as before, no longer offered here; `link`: another answer about it ("Cât câștigă X ›"). */
  | { kind: "legacy"; id: string; words: string; tip: KitTip; link?: Link }
  /** A selection another page made ("Selecția relației: 2 firme"). Current, not old. */
  | { kind: "origin"; id: string; prefix: string; words: string; tip: KitTip };

const ORDER: Record<UnderChipItem["kind"], number> = { only: 0, exclude: 1, auto: 2, notice: 2, toggle: 2, legacy: 3, origin: 4 };

/** The kit's order (P4), stable within a kind. */
export function orderUnderChips<T extends Pick<UnderChipItem, "kind">>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) => ORDER[a.item.kind] - ORDER[b.item.kind] || a.index - b.index).map(entry => entry.item);
}

interface Handlers {
  openId?: string | null;
  onOpen?: (id: string, trigger: HTMLButtonElement) => void;
  onRemove?: (id: string) => void;
  /** A switch pressed (`toggle` without `opens`). */
  onToggle?: (id: string) => void;
}

export function UnderChip({ item, openId, onOpen, onRemove, onToggle }: { item: UnderChipItem } & Handlers) {
  const remove = (name: string) => onRemove && <button type="button" className="qb-chip-x" aria-label={`Scoate «${name}»`} onClick={event => removeAndRefocus(event, () => onRemove(item.id))}>×</button>;
  const open = openId === item.id;
  const opener = (children: ReactNode) => <button
    type="button"
    className="qb-chip-main"
    aria-haspopup="dialog"
    aria-expanded={open}
    onClick={event => onOpen?.(item.id, event.currentTarget)}
  >{children}<i className="qb-chev" aria-hidden="true" /></button>;
  switch (item.kind) {
    case "only":
      return <span className="qb-chip qb-chip--only">{opener(item.label)}{remove(item.name)}</span>;
    case "exclude":
      return <span className="qb-chip qb-chip--exclude">
        {item.collapsed ? opener(item.label) : <span className="qb-chip-main">{item.label}</span>}
        {remove(item.name ?? item.label)}
      </span>;
    case "auto": {
      const chip = <span className="qb-chip qb-chip--auto">{opener(<><i className="qb-half" aria-hidden="true" /><span>{item.label}</span></>)}{item.tip && <HelpTip tip={item.tip} />}{remove(item.name)}</span>;
      return item.tip ? <span className="qb-tipwrap-sm">{chip}</span> : chip;
    }
    case "notice":
      return <>
        <span className="qb-tipwrap-sm"><span className="qb-chip qb-chip--auto qb-chip--notice">
          <span className="qb-chip-main"><i className="qb-half" aria-hidden="true" /><span>{item.label}</span></span>
          <HelpTip tip={item.tip} />
        </span></span>
        <button type="button" className="qb-invite" aria-haspopup="dialog" aria-expanded={open} onClick={event => onOpen?.(item.id, event.currentTarget)}>{item.action}</button>
      </>;
    case "toggle":
      return <button type="button" className="qb-toggle" {...(item.opens ? { "aria-haspopup": "dialog" as const, "aria-expanded": open } : { "aria-pressed": false })}
        onClick={event => { if (item.opens) onOpen?.(item.id, event.currentTarget); else onToggle?.(item.id); }}>
        {item.glyph === "half" ? <i className="qb-half" aria-hidden="true" /> : <span className="qb-plus" aria-hidden="true">+</span>}{item.label}
      </button>;
    // The two with a (?): on a phone the tip opens over its own chip (.qb-tipwrap-sm), outside the chip's clip.
    case "legacy": {
      const chip = <span className="qb-tipwrap-sm"><span className="qb-chip qb-chip--legacy">
        <span className="qb-chip-main"><span><b>Din link:</b> {item.words}</span></span>
        <HelpTip tip={item.tip} />
        {remove(`Din link: ${item.words}`)}
      </span></span>;
      return item.link ? <>{chip}<KitLink link={item.link} className="qb-relax-link" /></> : chip;
    }
    case "origin":
      return <span className="qb-tipwrap-sm"><span className="qb-chip qb-chip--origin">
        <span className="qb-chip-main"><span><b>{item.prefix}:</b> {item.words}</span></span>
        <HelpTip tip={item.tip} />
        {remove(item.prefix)}
      </span></span>;
  }
}

export default function UnderChips({ items, label = "Alte condiții", ...handlers }: { items: readonly UnderChipItem[]; label?: string } & Handlers) {
  if (!items.length) return null;
  return <div className="qb-under qb-tipwrap" role="group" aria-label={label} data-qb-row="">
    {orderUnderChips(items).map(item => <UnderChip key={`${item.kind}:${item.id}`} item={item} {...handlers} />)}
  </div>;
}
