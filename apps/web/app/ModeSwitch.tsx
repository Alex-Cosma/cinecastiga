"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { TOUR_SEEN_KEY } from "@/lib/tour";
import { VIEW_MODE_EVENT, VIEW_MODE_LABEL, VIEW_MODE_SIGNED_KEY, type ViewMode } from "@/lib/view-mode";
import { currentViewMode, setViewMode, storedViewMode } from "@/components/mode/mode-engine";

/** The tour says when it closed, so the box below can appear without a reload (components/tour/TourGate.tsx). */
export const TOUR_CLOSED_EVENT = "cc:tour-closed";

const tourSeen = () => { try { return localStorage.getItem(TOUR_SEEN_KEY) !== null; } catch { return true; } };
const tourOpen = () => document.querySelector(".tr, .tr-invite") !== null;

/**
 * The header switch between Esențial and Complet (lib/view-mode.ts), beside the theme button (owner, 18 November
 * 2026). The words and the thumb follow the mark on <html>, so they are right before React wakes up.
 *
 * A reader who has not chosen yet sees the site in Esențial. The tour's last step asks; whoever skipped the tour, or
 * said „Nu acum” to its invitation, gets one small box under the switch, once. A reader who signs in is moved to
 * Complet once per device: they were invited to investigate, and Radiografie, Comparații and Legături are there.
 */
export default function ModeSwitch({ sessionHint = false }: { sessionHint?: boolean }) {
  const [mode, setMode] = useState<ViewMode>("esential");
  const [ask, setAsk] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const { data, isPending } = authClient.useSession();
  const signedIn = isPending ? sessionHint : Boolean(data);

  useEffect(() => {
    setMode(currentViewMode());
    const onMode = (event: Event) => { setMode((event as CustomEvent<ViewMode>).detail); setAsk(false); };
    window.addEventListener(VIEW_MODE_EVENT, onMode);
    return () => window.removeEventListener(VIEW_MODE_EVENT, onMode);
  }, []);

  // Signed in for the first time on this device: Complet, once. Later the switch is theirs.
  useEffect(() => {
    if (isPending || !data) return;
    try {
      if (localStorage.getItem(VIEW_MODE_SIGNED_KEY)) return;
      localStorage.setItem(VIEW_MODE_SIGNED_KEY, "1");
    } catch { return; }
    setViewMode("complet", { animate: false });
  }, [data, isPending]);

  // The first visit's question, for a reader the tour did not ask: after the tour or its invitation has closed.
  useEffect(() => {
    if (signedIn) { setAsk(false); return; }
    const decide = () => setAsk(storedViewMode() === null && tourSeen() && !tourOpen() && navigator.webdriver !== true);
    const timer = window.setTimeout(decide, 900);
    const onTour = () => window.setTimeout(decide, 700);
    window.addEventListener(TOUR_CLOSED_EVENT, onTour);
    return () => { window.clearTimeout(timer); window.removeEventListener(TOUR_CLOSED_EVENT, onTour); };
  }, [signedIn]);

  // The box keeps inside the screen: its right edge and its arrow are placed from where the switch is.
  useEffect(() => {
    if (!ask) return;
    const place = () => {
      const box = wrap.current;
      if (!box) return;
      const r = box.getBoundingClientRect(), width = Math.min(318, window.innerWidth - 24);
      const right = Math.max(12, Math.min(window.innerWidth - 12, r.right + width / 2 - r.width / 2));
      box.style.setProperty("--mode-pop-right", `${Math.round(r.right - right)}px`);
      box.style.setProperty("--mode-pop-arrow", `${Math.round(right - r.right + 11)}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [ask]);

  const choose = useCallback((next: ViewMode) => { setViewMode(next); }, []);
  useEffect(() => {
    if (!ask) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") choose(currentViewMode()); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ask, choose]);

  const other: ViewMode = mode === "complet" ? "esential" : "complet";
  return <span className="mode-switch-wrap" ref={wrap}>
    <button type="button" className="mode-switch" role="switch" aria-checked={mode === "complet"} aria-label={`Mod de afișare: ${VIEW_MODE_LABEL[mode]}. Treci în ${VIEW_MODE_LABEL[other]}.`} title={mode === "complet" ? "Complet: tot site-ul. Apasă pentru Esențial." : "Esențial: doar răspunsurile. Apasă pentru Complet."} onClick={() => choose(currentViewMode() === "complet" ? "esential" : "complet")}>
      <span data-word="esential" aria-hidden="true">{VIEW_MODE_LABEL.esential}</span><span data-word="complet" aria-hidden="true">{VIEW_MODE_LABEL.complet}</span><i aria-hidden="true" />
    </button>
    {ask && <div className="mode-pop" role="dialog" aria-label="Alege cât vezi">
      <b>Vezi doar esențialul</b>
      <p>Cine, cât și de la cine. Modul Complet adaugă filtre, comparații și scoruri.</p>
      <div><button type="button" className="go" onClick={() => choose("esential")}>Rămân aici</button><button type="button" onClick={() => choose("complet")}>Trec în Complet</button></div>
    </div>}
  </span>;
}
