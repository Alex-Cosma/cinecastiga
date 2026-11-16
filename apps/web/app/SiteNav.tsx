"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { navItems } from "@/lib/site-nav";
import { newsWords, usePrivateNews } from "../lib/use-private-news";

/** The phone's header stays whole this near the top of the page (px). */
const CONDENSE_BELOW = 240;
/** Scrolling this far one way changes the header (px): a finger's small corrections do not. */
const CONDENSE_AFTER = 24;

/**
 * `sessionHint` is only "a session cookie was sent" (no identity, no token),
 * so signed-in readers see "Anchete" without a flash. Once the client knows
 * the session, it decides: an expired cookie hides the item again.
 */
export default function SiteNav({ sessionHint = false }: { sessionHint?: boolean }) {
  const pathname = usePathname() ?? "/";
  const { data, isPending, error } = authClient.useSession();
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => setHydrated(true), []);
  // Sticky elements below the header (entity section tabs, side rails) read
  // --site-header-h, so they sit under the header at every width instead of
  // sliding beneath it. CSS keeps per-breakpoint fallbacks for the first paint.
  useEffect(() => {
    const header = ref.current?.closest<HTMLElement>(".site-header");
    if (!header) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--site-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  // On a phone the header is one row while the page is scrolled down, whole at the top and on the first scroll up
  // (owner, 16 November 2026). Its margin keeps the space it gave up, so the page under it does not move.
  useEffect(() => {
    const header = ref.current?.closest<HTMLElement>(".site-header");
    if (!header) return;
    const phone = window.matchMedia("(max-width: 700px)");
    let last = window.scrollY;
    let travelled = 0;
    let condensed = false;
    const set = (next: boolean) => {
      if (next === condensed) return;
      condensed = next;
      if (!next) {
        delete header.dataset.condensed;
        header.style.removeProperty("--site-header-fold");
        return;
      }
      const whole = header.getBoundingClientRect().height;
      header.dataset.condensed = "true";
      header.style.setProperty("--site-header-fold", `${Math.max(0, whole - header.getBoundingClientRect().height)}px`);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      if (!phone.matches || y < CONDENSE_BELOW) { travelled = 0; set(false); return; }
      travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta;
      // A reader using the header keeps it whole: the row under a finger or the focus does not change.
      if (travelled > CONDENSE_AFTER && !header.contains(document.activeElement)) set(true);
      else if (travelled < -CONDENSE_AFTER) set(false);
    };
    const onWidth = () => { if (!phone.matches) set(false); };
    window.addEventListener("scroll", onScroll, { passive: true });
    phone.addEventListener("change", onWidth);
    return () => { window.removeEventListener("scroll", onScroll); phone.removeEventListener("change", onWidth); set(false); };
  }, []);
  const known = hydrated && !isPending;
  // A refused session check (a 429 under load) is not "signed out": with the cookie hint "Anchete" stays (audit bug).
  const signedIn = known ? Boolean(data) || (Boolean(error) && sessionHint) : sessionHint;
  // Something waits in the private space (an invitation, an update to review): the dot by „Anchete”, never permanent
  // (UX audit Z8-33 and Z1-28, 16 November 2026). The same count names the avatar's menu (HeaderUserNav).
  const news = usePrivateNews(signedIn);
  const waiting = (news?.invites ?? 0) + (news?.updates ?? 0);
  const items = navItems({ pathname, signedIn, news: waiting });
  // The page already open with a question in its address (Întreabă with ?spec=…): a Link to the same route keeps the
  // answer on screen, so the item loads the bare page instead (owner, 1 November 2026). A new tab keeps the browser's way.
  const toBarePage = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.location.pathname !== href || !window.location.search) return;
    event.preventDefault();
    window.location.assign(href);
  };
  return <nav ref={ref} className="main-nav d-main-nav" aria-label="Navigare principală">
    {items.map((item) => <Link key={item.href} href={item.href} onClick={toBarePage(item.href)} className={item.active ? "on" : undefined} aria-current={item.active ? (pathname === item.href ? "page" : "true") : undefined}>{item.label}{item.dot ? <><span className="d-nav-dot" aria-hidden="true" /><span className="sr-only">, {newsWords(waiting)}</span></> : null}</Link>)}
  </nav>;
}
