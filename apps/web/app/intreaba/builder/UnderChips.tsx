"use client";

import type { ReactNode } from "react";
import { removeAndRefocus } from "./Chip";
import HelpTip from "./HelpTip";
import type { KitTip } from "./kit-types";

/*
 * Component 6, the chips under the sentence (P4): what does not read as a
 * phrase. Always in this order: restrictions ("Doar …"), exclusions
 * ("Fără X", collapsed from three: "Fără 3 firme ▾"), adjustments the
 * application made (amber), then conditions from an old link ("Din link: …",
 * dashed amber) and selections made on another page of the site (solid
 * amber, with their own label). The last two are not editable here: text
 * with a (?) and ×. Parked conditions are their own row (ParkedRow).
 */

export type UnderChipItem =
  /** "Doar cele de peste 1 mil. lei": opens its window. */
  | { kind: "only"; id: string; label: string; name: string }
  /** "Fără SYSTRA" (text), or collapsed "Fără 3 firme" (opens the list) from the third exclusion. */
  | { kind: "exclude"; id: string; label: string; name?: string; collapsed?: boolean }
  /** "Aceleași luni: ian.–mai", set by the application; opens its window. */
  | { kind: "auto"; id: string; label: string; name: string }
  /** A condition from an old link, applied as before, no longer offered here. */
  | { kind: "legacy"; id: string; words: string; tip: KitTip }
  /** A selection another page made ("Selecția relației: 2 firme"). Current, not old. */
  | { kind: "origin"; id: string; prefix: string; words: string; tip: KitTip };

const ORDER: Record<UnderChipItem["kind"], number> = { only: 0, exclude: 1, auto: 2, legacy: 3, origin: 4 };

/** The kit's order (P4), stable within a kind. */
export function orderUnderChips<T extends Pick<UnderChipItem, "kind">>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ item, index })).sort((a, b) => ORDER[a.item.kind] - ORDER[b.item.kind] || a.index - b.index).map(entry => entry.item);
}

interface Handlers {
  openId?: string | null;
  onOpen?: (id: string, trigger: HTMLButtonElement) => void;
  onRemove?: (id: string) => void;
}

export function UnderChip({ item, openId, onOpen, onRemove }: { item: UnderChipItem } & Handlers) {
  const remove = (name: string) => onRemove && <button type="button" className="fk-chip-x" aria-label={`Scoate «${name}»`} onClick={event => removeAndRefocus(event, () => onRemove(item.id))}>×</button>;
  const open = openId === item.id;
  const opener = (children: ReactNode) => <button
    type="button"
    className="fk-chip-main"
    aria-haspopup="dialog"
    aria-expanded={open}
    onClick={event => onOpen?.(item.id, event.currentTarget)}
  >{children}<i className="fk-chev" aria-hidden="true" /></button>;
  switch (item.kind) {
    case "only":
      return <span className="fk-chip fk-chip--only">{opener(item.label)}{remove(item.name)}</span>;
    case "exclude":
      return <span className="fk-chip fk-chip--exclude">
        {item.collapsed ? opener(item.label) : <span className="fk-chip-main">{item.label}</span>}
        {remove(item.name ?? item.label)}
      </span>;
    case "auto":
      return <span className="fk-chip fk-chip--auto">{opener(<><i className="fk-half" aria-hidden="true" /><span>{item.label}</span></>)}{remove(item.name)}</span>;
    // The two with a (?): on a phone the tip opens over its own chip (.fk-tipwrap-sm), outside the chip's clip.
    case "legacy":
      return <span className="fk-tipwrap-sm"><span className="fk-chip fk-chip--legacy">
        <span className="fk-chip-main"><span><b>Din link:</b> {item.words}</span></span>
        <HelpTip tip={item.tip} />
        {remove(`Din link: ${item.words}`)}
      </span></span>;
    case "origin":
      return <span className="fk-tipwrap-sm"><span className="fk-chip fk-chip--origin">
        <span className="fk-chip-main"><span><b>{item.prefix}:</b> {item.words}</span></span>
        <HelpTip tip={item.tip} />
        {remove(item.prefix)}
      </span></span>;
  }
}

export default function UnderChips({ items, label = "Alte condiții", ...handlers }: { items: readonly UnderChipItem[]; label?: string } & Handlers) {
  if (!items.length) return null;
  return <div className="fk-under fk-tipwrap" role="group" aria-label={label} data-fk-row="">
    {orderUnderChips(items).map(item => <UnderChip key={`${item.kind}:${item.id}`} item={item} {...handlers} />)}
  </div>;
}
