"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useEffect, useState, useTransition, type ComponentProps, type ReactNode } from "react";

/** The floating status under the sticky header: it never moves the page and shows only once a wait passes 150 ms. */
export function FloatStatus({ children }: { children: ReactNode }) {
  return <p className="ask-loader g-float" role="status"><span className="bars" aria-hidden="true"><i /><i /><i /></span>{children}</p>;
}

type Region = { pending: boolean; go: (href: string, o?: { replace?: boolean; scroll?: boolean }) => void };
const RegionCtx = createContext<Region | null>(null);

/**
 * A region whose answer is replaced by another of the same shape (a filter, the sort, a page of a list): the old
 * answer stays in place, dimmed, and a status floats under the header (DESIGN.md; owner, 6 November 2026). Links
 * inside go through `RegionLink`; client controls call `usePendingRegion().go`.
 */
export function PendingRegion({ label = "Se încarcă…", as: Tag = "div", className, children, id }: {
  label?: string; as?: "div" | "section"; className?: string | undefined; children: ReactNode; id?: string | undefined;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = useCallback<Region["go"]>((href, o = {}) => {
    start(() => { if (o.replace) router.replace(href, { scroll: o.scroll ?? false }); else router.push(href, { scroll: o.scroll ?? false }); });
  }, [router]);
  return <RegionCtx value={{ pending, go }}>
    <Tag id={id} className={[className, pending && "g-stale"].filter(Boolean).join(" ") || undefined} aria-busy={pending || undefined} data-pending-region="">
      {children}
    </Tag>
    {pending && <FloatStatus>{label}</FloatStatus>}
  </RegionCtx>;
}

export function usePendingRegion(): Region | null { return use(RegionCtx); }

/** A next/link that, inside a PendingRegion, navigates as the region's transition (Ctrl/Cmd-click still opens a tab). */
export function RegionLink(props: ComponentProps<typeof Link>) {
  const region = use(RegionCtx);
  const { href, replace, scroll, onNavigate } = props;
  return <Link {...props} onNavigate={(e) => {
    onNavigate?.(e);
    if (!region) return;
    e.preventDefault();
    region.go(typeof href === "string" ? href : String(href), { replace: Boolean(replace), scroll: scroll ?? false });
  }} />;
}

/**
 * "Se deschide…" for a click to another page without a route ghost (fast pages): shown only after 150 ms, gone when
 * the address changes. Routes with a ghost commit it at once, so the status never shows there. Clicks inside a
 * PendingRegion are the region's own status.
 */
export function NavPending() {
  const path = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  useEffect(() => { setPending(false); }, [path, search]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 12000);
    const stop = (e: KeyboardEvent) => { if (e.key === "Escape") setPending(false); };
    const back = () => setPending(false);
    addEventListener("keydown", stop);
    addEventListener("popstate", back);
    return () => { clearTimeout(t); removeEventListener("keydown", stop); removeEventListener("popstate", back); };
  }, [pending]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.closest("[data-pending-region], [data-no-pending]")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || to.pathname.startsWith("/api/")) return;
      if (to.pathname === location.pathname && to.search === location.search) return; // an anchor on this page
      setPending(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return pending ? <FloatStatus>Se deschide…</FloatStatus> : null;
}
