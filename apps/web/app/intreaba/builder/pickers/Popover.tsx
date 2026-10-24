"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import HelpTip from "../HelpTip";
import { SHEET_QUERY, focusables, popoverPlacement } from "../keyboard";
import type { KitTip } from "../kit-types";

/*
 * Component 9, the short window (R6). On desktop a non-modal dialog beside
 * its phrase or chip, kept inside the viewport; under 600 px a modal bottom
 * sheet on the full width, with a grip. Escape, × or a click outside close it
 * and focus returns to the trigger; Tab out of the desktop window closes it
 * too. Searches keep today's modal .qb-dialog (EntitySearch, F1a part 2).
 * The title is the question the phrase answers (R10).
 */

export interface PanelProps {
  title: string;
  titleId: string;
  tip?: KitTip;
  onClose?: () => void;
  /** The bottom line: what is applied, "Scoate condiția", "Folosește". */
  foot?: ReactNode;
  children: ReactNode;
}

/** The inside of a window: grip, title with its (?), ×, body, foot. */
export function PopoverPanel({ title, titleId, tip, onClose, foot, children }: PanelProps) {
  return <>
    <span className="fk-sheet-grip" aria-hidden="true" />
    <div className="fk-pop-head">
      <div className="fk-pop-title"><h3 id={titleId}>{title}</h3>{tip && <HelpTip tip={tip} />}</div>
      <button type="button" className="fk-close" aria-label="Închide" onClick={onClose}>×</button>
    </div>
    {children}
    {foot && <div className="fk-pop-foot">{foot}</div>}
  </>;
}

/** A window drawn open in the page flow, for the dev demo's frames (kit components.html §6). */
export function StaticPopover({ wide = false, ...panel }: Omit<PanelProps, "titleId"> & { wide?: boolean }) {
  const titleId = useId();
  return <div className={`fk-pop fk-tipwrap${wide ? " fk-pop--wide" : ""}`} role="dialog" aria-labelledby={titleId}>
    <PopoverPanel titleId={titleId} {...panel} />
  </div>;
}

export interface PopoverProps extends Omit<PanelProps, "titleId"> {
  open: boolean;
  /** The phrase or chip that opened it: the window sits beside it, and focus returns to it. */
  anchor: HTMLElement | null;
  onClose: () => void;
  wide?: boolean;
}

/** Where focus goes on opening: a marked field, a search field, the chosen option, the first control. */
function initialFocus(dialog: HTMLElement): HTMLElement | null {
  const marked = dialog.querySelector<HTMLElement>("[data-autofocus]");
  if (marked) return marked;
  const input = dialog.querySelector<HTMLElement>("input:not([type=hidden])");
  if (input) return input;
  const chosen = dialog.querySelector<HTMLElement>('[aria-checked="true"][tabindex="0"], [aria-selected="true"][tabindex="0"]');
  if (chosen) return chosen;
  const all = focusables(dialog);
  return all.find(element => !element.classList.contains("fk-close") && !element.classList.contains("term-trigger")) ?? all[0] ?? null;
}

export default function Popover({ open, anchor, onClose, wide = false, ...panel }: PopoverProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const anchorRef = useRef(anchor), closeRef = useRef(onClose);
  // The trigger focus returns to: the caller usually clears `anchor` with `open`.
  const returnTo = useRef<HTMLElement | null>(null);
  anchorRef.current = anchor;
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) {
        // The content unmounts with `open`; focus then sits on <body>, and goes back to the trigger.
        const inside = dialog.contains(document.activeElement) || document.activeElement === document.body;
        dialog.close();
        if (inside && returnTo.current?.isConnected) returnTo.current.focus();
      }
      return;
    }
    const media = window.matchMedia(SHEET_QUERY);
    const place = () => {
      const trigger = anchorRef.current;
      if (media.matches || !trigger || !dialog.open) return;
      const { top, left } = popoverPlacement(trigger.getBoundingClientRect(), { width: dialog.offsetWidth, height: dialog.offsetHeight }, { width: document.documentElement.clientWidth, height: window.innerHeight });
      dialog.style.top = `${top}px`;
      dialog.style.left = `${left}px`;
    };
    returnTo.current = anchorRef.current;
    const show = () => {
      if (dialog.open) dialog.close();
      dialog.style.top = dialog.style.left = "";
      if (media.matches) dialog.showModal();
      else { dialog.show(); place(); }
      initialFocus(dialog)?.focus();
    };
    // A press outside a desktop window closes it (the sheet has its backdrop).
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (media.matches || dialog.contains(target) || anchorRef.current?.contains(target)) return;
      closeRef.current();
    };
    show();
    media.addEventListener("change", show);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      media.removeEventListener("change", show);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, anchor]);

  return <dialog
    ref={ref}
    className={`fk fk-pop fk-tipwrap${wide ? " fk-pop--wide" : ""}`}
    aria-labelledby={titleId}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      // The sheet's backdrop: a click on the dialog box itself, outside its content.
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}
    onBlur={event => {
      const next = event.relatedTarget as Node | null;
      if (!next || window.matchMedia(SHEET_QUERY).matches) return;
      if (!event.currentTarget.contains(next) && !anchorRef.current?.contains(next)) onClose();
    }}
  >
    {open && <PopoverPanel titleId={titleId} onClose={onClose} {...panel} />}
  </dialog>;
}
