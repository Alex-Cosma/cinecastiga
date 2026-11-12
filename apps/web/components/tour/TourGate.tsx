"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOUR_PARAM, TOUR_QUERY_EVENT, TOUR_QUERY_KEY, TOUR_SEEN_COOKIE, TOUR_SEEN_KEY, tourEntry } from "@/lib/tour";
import "./tour-gate.css";

/**
 * Decides, once per page load, what a visitor sees of the welcome tour (lib/tour.ts tourEntry): the tour itself on
 * the home page at a first visit, a small invitation on any other page, nothing afterwards. It runs after the page
 * is shown, so the page's own HTML (and what a crawler or the shared cache gets) never changes. The tour's code is
 * loaded only when it opens. `/?tur=1` (the footer's link) opens it again.
 */
const Tour = dynamic(() => import("./Tour"), { ssr: false });

function seen(): boolean {
  try { if (localStorage.getItem(TOUR_SEEN_KEY)) return true; } catch { /* storage blocked: the cookie may still answer */ }
  return document.cookie.split("; ").some((part) => part.startsWith(`${TOUR_SEEN_COOKIE}=`));
}
function markSeen(): void {
  try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* the cookie below is enough */ }
  document.cookie = `${TOUR_SEEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
}
const automated = () => navigator.webdriver === true || /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);

export default function TourGate({ sessionHint }: { sessionHint: boolean }) {
  const pathname = usePathname(), search = useSearchParams(), router = useRouter();
  const [mode, setMode] = useState<"none" | "tour" | "invite">("none");
  const decided = useRef(false);
  const forced = search?.get(TOUR_PARAM) === "1";

  useEffect(() => {
    if (forced) {
      decided.current = true;
      setMode("tour");
      // The address keeps no trace of the request: a reload or a shared link does not open the tour again.
      const params = new URLSearchParams(location.search);
      params.delete(TOUR_PARAM);
      history.replaceState(history.state, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
      return;
    }
    if (decided.current) return;
    decided.current = true;
    setMode(tourEntry({ pathname, forced: false, seen: seen(), signedIn: sessionHint, automated: automated() }));
  }, [forced, pathname, sessionHint]);

  const close = useCallback(() => { markSeen(); setMode("none"); }, []);
  const finish = useCallback((query: string) => {
    markSeen();
    setMode("none");
    if (!query) return;
    if (location.pathname === "/") { window.dispatchEvent(new CustomEvent(TOUR_QUERY_EVENT, { detail: query })); return; }
    // From another page: the home page's search field picks the question up when it mounts.
    try { sessionStorage.setItem(TOUR_QUERY_KEY, query); } catch { /* without storage the home page opens with an empty field */ }
    router.push("/");
  }, [router]);

  if (mode === "tour") return <Tour onSkip={close} onFinish={finish} />;
  if (mode === "invite") return <aside className="tr-invite" aria-label="Tur de bun venit">
    <p><b>Prima dată aici?</b> Un tur de un minut: de unde vin datele și cum le citești.</p>
    <div><button type="button" className="tr-invite-go" onClick={() => setMode("tour")}>Începe turul</button><button type="button" className="tr-invite-no" onClick={close}>Nu acum</button></div>
  </aside>;
  return null;
}
