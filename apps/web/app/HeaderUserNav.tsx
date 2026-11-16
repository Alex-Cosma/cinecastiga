"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { newsWords, usePrivateNews } from "../lib/use-private-news";
import { menuButtonKey, menuKey } from "./intreaba/builder/keyboard";
import "./header-user-menu.css";

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Right side of the site header. Anonymous visitors get a quiet
 * "Autentificare" link; signed-in readers an avatar that opens a small menu of
 * the private space (audit Z8-34): "Anchetele mele · Urmăriri · Contul meu",
 * with what waits in each (an invitation, updates to review) and a dot on the
 * avatar while something does (Z8-33). Admins also get the admin link.
 * "Anchete" stays in the main navigation (owner, 16 November 2026). Until the session is confirmed, the server's cookie hint
 * decides what stands there, so the header does not shift: no cookie draws the
 * link at once, a cookie keeps the avatar's room.
 */
export default function HeaderUserNav({ sessionHint }: { sessionHint: boolean }) {
  const { data, isPending, error } = authClient.useSession();
  const path = usePathname() ?? "";
  // Another auth subscriber can resolve the session before this streamed
  // boundary hydrates. Keep its first client render identical to the server.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const signedIn = hydrated && !isPending && Boolean(data);
  const news = usePrivateNews(signedIn);
  const [open, setOpen] = useState<"first" | "last" | null>(null);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    items[open === "last" ? items.length - 1 : 0]?.focus();
    const outside = (event: PointerEvent) => { const t = event.target as Node; if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  // A refused session check (a 429 under load, a network error) is not "signed out": with the cookie hint the room stays.
  if ((!hydrated || isPending || (error && !data)) && sessionHint) return <span className="user-nav user-nav-wait" aria-hidden />;
  if (!hydrated || isPending || !data) {
    return (
      <nav className="user-nav" aria-label="Cont">
        <Link href="/login" className={path.startsWith("/login") ? "on" : undefined} aria-current={path.startsWith("/login") ? "page" : undefined}>
          Autentificare
        </Link>
      </nav>
    );
  }
  const user = data.user as { role?: string; name?: string | null; email: string };
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const onAdmin = under(path, "/admin"), onAccount = under(path, "/cont");
  const waiting = (news?.invites ?? 0) + (news?.updates ?? 0);
  const accountName = `Contul tău (${user.email})${waiting ? `, ${newsWords(waiting)}` : ""}`;
  const items: { href: string; label: string; note: string | null }[] = [
    { href: "/anchete", label: "Anchetele mele", note: news?.invites ? (news.invites === 1 ? "1 invitație" : `${news.invites} invitații`) : null },
    { href: "/urmariri", label: "Urmăriri", note: news?.updates ? `${news.updates} de verificat` : null },
    { href: "/cont", label: "Contul meu", note: null },
  ];
  return (
    <nav className="user-nav" aria-label="Cont">
      {user.role === "admin" && (
        <Link href="/admin" className={onAdmin ? "on" : undefined} aria-current={onAdmin ? "page" : undefined}>
          admin
        </Link>
      )}
      <div className="user-menu">
        <button ref={button} type="button" className={onAccount ? "avatar-link on" : "avatar-link"} aria-haspopup="menu" aria-expanded={Boolean(open)}
          aria-controls={open ? menuId : undefined} aria-label={accountName} title={accountName}
          onClick={() => setOpen(current => current ? null : "first")}
          onKeyDown={event => { const where = menuButtonKey(event.key); if (where) { event.preventDefault(); setOpen(where); } }}>
          <span className="avatar" aria-hidden="true">{initials}</span>
          {waiting > 0 && <span className="avatar-dot" aria-hidden="true" />}
        </button>
        {open && <div ref={menu} id={menuId} role="menu" aria-label="Spațiul tău" className="user-menu-list"
          onKeyDown={event => {
            const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            const next = menuKey(event.key, list.indexOf(event.target as HTMLElement), list.map(item => item.dataset.label ?? ""));
            if (event.key === " ") { event.preventDefault(); (event.target as HTMLElement).click(); return; }
            if (!next) return;
            if ("focus" in next) { event.preventDefault(); list[next.focus]?.focus(); return; }
            if (next.close === "button") { event.preventDefault(); setOpen(null); button.current?.focus(); } else setOpen(null);
          }}>
          {items.map(item => <Link key={item.href} role="menuitem" tabIndex={-1} data-label={item.label} href={item.href}
            aria-current={under(path, item.href) ? "page" : undefined} onClick={() => setOpen(null)}>
            <span>{item.label}</span>{item.note && <small>{item.note}</small>}
          </Link>)}
        </div>}
      </div>
    </nav>
  );
}
