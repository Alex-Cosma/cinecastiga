"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { menuButtonKey, menuKey } from "../builder/keyboard";

/*
 * P7, the "⋯" menu of an answer row (WAI menu button): the actions on one
 * entity of the answer. "Vezi înregistrările →", "Scoate din calcul −" (the
 * entity leaves the selection: the total changes and the total line says
 * "fără X"), "Detaliază ›", "Fișa firmei ↗". The button opens the menu on
 * its first item (click, Enter, Space, ↓) or its last (↑); inside, ↑/↓ wrap
 * round, Home/End, a letter jumps; Escape closes and focus returns to the
 * button, Tab closes and moves on, a press outside closes. A disabled action
 * ("Scoate din calcul" at five exclusions) stays readable, with its reason.
 */

export interface RowAction {
  id: string;
  label: string;
  /** R8: → records, − leaves the calculation, › another answer, ↗ another page, ▾ a window (the builder's "⋯ › Selecție avansată"). */
  glyph: "→" | "−" | "›" | "↗" | "▾";
  /** A page of the site (↗); otherwise onSelect. */
  href?: string;
  onSelect?: () => void;
  /** Shown but not usable; the reason is its second line. */
  disabled?: string;
  className?: string;
}

const itemsOf = (menu: HTMLElement | null) => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

export default function RowMenu({ name, actions, className, defaultOpen = false }: { name: string; actions: readonly RowAction[]; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState<"first" | "last" | null>(defaultOpen ? "first" : null);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!open) return;
    // A menu drawn open by the demo does not take focus on load; one opened by the reader does.
    if (opened.current) { const items = itemsOf(menu.current); items[open === "last" ? items.length - 1 : 0]?.focus(); }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // Where the open menu fits (review S2-F1b): above its button when the viewport ends below it, and
  // against the button's other edge when it would run past the page's (the builder anchors it left).
  const [place, setPlace] = useState({ up: false, end: false });
  useLayoutEffect(() => {
    if (!open || !menu.current || !button.current) { setPlace((p) => p.up || p.end ? { up: false, end: false } : p); return; }
    const m = menu.current.getBoundingClientRect(), b = button.current.getBoundingClientRect();
    setPlace({ up: m.bottom > window.innerHeight - 8 && b.top - m.height - 8 > 0, end: m.right > document.documentElement.clientWidth - 8 });
  }, [open]);

  const show = (where: "first" | "last") => { opened.current = true; setOpen(where); };
  const close = (refocus: boolean) => { setOpen(null); if (refocus) button.current?.focus(); };
  /**
   * After an action, focus stays on "⋯"; if the action removed the row
   * ("Scoate din calcul"), it goes to the "⋯" of the row that took its place
   * (the next, else the previous), never to the page's start.
   */
  const select = (action: RowAction) => {
    const row = button.current?.closest("[data-qb-arow]");
    const neighbour = row?.nextElementSibling ?? row?.previousElementSibling ?? null;
    close(true);
    action.onSelect?.();
    requestAnimationFrame(() => {
      if (button.current?.isConnected) return;
      const target = neighbour?.isConnected ? neighbour.querySelector<HTMLElement>(".qb-more") ?? (neighbour as HTMLElement) : null;
      target?.focus();
    });
  };

  return <>
    <button
      ref={button}
      type="button"
      className={`qb-more${className ? ` ${className}` : ""}`}
      aria-haspopup="menu"
      aria-expanded={!!open}
      aria-controls={open ? menuId : undefined}
      aria-label={`Mai multe pentru ${name}`}
      onClick={() => open ? close(false) : show("first")}
      onKeyDown={event => { const where = menuButtonKey(event.key); if (where) { event.preventDefault(); show(where); } }}
    ><span aria-hidden="true">⋯</span></button>
    {open && <div
      ref={menu}
      id={menuId}
      className={`qb-menu qb-menu--pop${place.up ? " qb-menu--up" : ""}${place.end ? " qb-menu--end" : ""}`}
      role="menu"
      aria-label={name}
      onKeyDown={event => {
        const items = itemsOf(menu.current);
        const next = menuKey(event.key, items.indexOf(event.target as HTMLElement), items.map(item => item.dataset.label ?? item.textContent ?? ""));
        if (event.key === " " && (event.target as HTMLElement).tagName === "A") { event.preventDefault(); (event.target as HTMLElement).click(); return; }
        if (!next) return;
        if ("focus" in next) { event.preventDefault(); items[next.focus]?.focus(); return; }
        if (next.close === "button") { event.preventDefault(); event.stopPropagation(); close(true); }
        else close(false);
      }}
    >
      {actions.map(action => {
        const body = <><span className="qb-menu-t">{action.label}{action.disabled && <small>{action.disabled}</small>}</span><span aria-hidden="true">{action.glyph}</span></>;
        const common = { role: "menuitem", tabIndex: -1, "data-label": action.label, className: `qb-menu-item${action.className ? ` ${action.className}` : ""}`, "aria-disabled": action.disabled ? true : undefined } as const;
        if (action.href && !action.disabled) return <a key={action.id} {...common} href={action.href} onClick={() => close(false)}>{body}</a>;
        return <button key={action.id} type="button" {...common} onClick={() => { if (!action.disabled) select(action); }}>{body}</button>;
      })}
    </div>}
  </>;
}
