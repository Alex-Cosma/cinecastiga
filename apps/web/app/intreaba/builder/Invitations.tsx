"use client";

import { useId } from "react";
import HelpTip, { DisabledReason } from "./HelpTip";
import type { KitAvailability } from "./kit-types";

/*
 * Component 2, the invitation: an unset fragment of the sentence, named
 * ("+ Ce s-a cumpărat"), in sentence order, at most four (P2). It is also the
 * "+ Administrator" of a condition row. Shown but unusable, it keeps its place
 * with the reason (R1), never offered and then refused.
 */

export const MAX_INVITES = 4;

export interface InviteItem {
  id: string;
  label: string;
  availability?: KitAvailability;
  className?: string;
}

export interface InviteProps extends InviteItem {
  open?: boolean;
  onOpen?: (id: string, trigger: HTMLButtonElement) => void;
}

export function Invite({ id, label, availability, open = false, onOpen, className }: InviteProps) {
  const reasonId = useId();
  const disabled = availability?.state === "disabled" ? availability : null;
  const button = <button
    type="button"
    className={`fk-invite${className ? ` ${className}` : ""}`}
    aria-haspopup="dialog"
    aria-expanded={disabled ? undefined : open}
    aria-disabled={disabled ? true : undefined}
    aria-describedby={disabled ? reasonId : undefined}
    onClick={event => { if (!disabled) onOpen?.(id, event.currentTarget); }}
  ><span className="fk-plus" aria-hidden="true">+</span>{label}</button>;
  if (!disabled) return button;
  return <span className="fk-pair">{button}<DisabledReason id={reasonId} reason={disabled.reason} />{disabled.tip && <HelpTip tip={disabled.tip} />}</span>;
}

/** The invitations under the sentence; the kit's limit of four is kept here too. */
export default function Invitations({ items, openId, onOpen, label = "Adaugă la întrebare" }: { items: readonly InviteItem[]; openId?: string | null; onOpen?: InviteProps["onOpen"]; label?: string }) {
  if (!items.length) return null;
  return <div className="fk-invites fk-tipwrap" role="group" aria-label={label}>
    {items.slice(0, MAX_INVITES).map(item => <Invite key={item.id} {...item} open={openId === item.id} {...(onOpen ? { onOpen } : {})} />)}
  </div>;
}
