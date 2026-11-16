"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { menuButtonKey, menuKey } from "@/app/intreaba/builder/keyboard";

/*
 * The "⋯" of a dossier card (audit Z8-05, owner 16 November 2026): the card's rarer actions in one WAI menu button,
 * so a card shows its title, its line and "Fișa de probă →" only. The button opens the menu on its first item (click,
 * Enter, Space, ↓) or its last (↑); inside, ↑/↓ wrap round, Home/End, a letter jumps; Escape closes and the focus goes
 * back to "⋯", Tab closes and moves on, a press outside closes. The menu opens under its button, against the card's
 * right edge, or above it when the window ends below it. A separator stands before the removing action.
 */
export interface CardAction {
  id: string;
  label: string;
  /** Opens a page (Compară cu înregistrările de azi); otherwise onSelect. */
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
}

const itemsOf = (menu: HTMLElement | null) => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

export default function CardMenu({ name, actions }: { name: string; actions: readonly CardAction[] }) {
  const [open, setOpen] = useState<"first" | "last" | null>(null);
  const [up, setUp] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = itemsOf(menu.current);
    items[open === "last" ? items.length - 1 : 0]?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !menu.current || !button.current) { setUp(false); return; }
    const m = menu.current.getBoundingClientRect(), b = button.current.getBoundingClientRect();
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    setUp(m.bottom > window.innerHeight - 8 && b.top - m.height - 8 > header);
  }, [open]);

  const close = (refocus: boolean) => { setOpen(null); if (refocus) button.current?.focus(); };
  if (!actions.length) return null;
  return <div className="iw-card-menu">
    <button ref={button} type="button" className="iw-more" aria-haspopup="menu" aria-expanded={!!open} aria-controls={open ? menuId : undefined}
      aria-label={`Mai multe pentru ${name}`} onClick={() => open ? close(false) : setOpen("first")}
      onKeyDown={event => { const where = menuButtonKey(event.key); if (where) { event.preventDefault(); setOpen(where); } }}>
      <span aria-hidden="true">⋯</span>
    </button>
    {open && <div ref={menu} id={menuId} role="menu" aria-label={name} className={up ? "iw-menu iw-menu-up" : "iw-menu"}
      onKeyDown={event => {
        const items = itemsOf(menu.current);
        const next = menuKey(event.key, items.indexOf(event.target as HTMLElement), items.map(item => item.textContent ?? ""));
        if (event.key === " " && (event.target as HTMLElement).tagName === "A") { event.preventDefault(); (event.target as HTMLElement).click(); return; }
        if (!next) return;
        if ("focus" in next) { event.preventDefault(); items[next.focus]?.focus(); return; }
        if (next.close === "button") { event.preventDefault(); event.stopPropagation(); close(true); } else close(false);
      }}>
      {actions.map(action => {
        const common = { role: "menuitem", tabIndex: -1, className: action.danger ? "iw-menu-item iw-menu-danger" : "iw-menu-item" } as const;
        return action.href ? <a key={action.id} {...common} href={action.href} onClick={() => close(false)}>{action.label}</a>
          : <button key={action.id} type="button" {...common} onClick={() => { close(true); action.onSelect?.(); }}>{action.label}</button>;
      })}
    </div>}
  </div>;
}
