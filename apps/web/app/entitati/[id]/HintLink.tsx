"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { tipPlace } from "@/components/Term";
import { cancelNavPending } from "@/components/ghost/client";
import { EASE, cssMs, prefersReducedMotion } from "../../../components/motion/outline";

/**
 * An analysis button that says what is behind it (UX audit Z5-21, 16 November 2026): its explanation floats from it,
 * in the top layer like the site's (?) explanations, after the mouse rests on it for --hold, the one wait the site
 * gives a hover explanation (M-01, motion pass 16 November 2026; it was 350 ms), at once on keyboard focus, and on a
 * phone after a long press, which then does not open the page. A tap opens the page. No outline draws the wait here:
 * a button one means to press never "loads" under the mouse (the audit's rule; the verifier found the trace too slow
 * for navigation). It comes out of the button and goes back like every explanation (M-02).
 */
const LONG_PRESS_MS = 500;
const TIP_LEAVE_MS = 150;

export default function HintLink({ href, hint, className, ariaLabel, dataBand, children }: {
  href: string; hint: string; className?: string | undefined; ariaLabel?: string | undefined; dataBand?: string | undefined; children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const link = useRef<HTMLAnchorElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);

  const place = useCallback(() => {
    const def = tip.current, anchor = link.current;
    if (!def || !anchor) return;
    const at = anchor.getBoundingClientRect(), width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    Object.assign(def.style, { maxWidth: `${Math.min(360, width - 32)}px` });
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    const size = def.getBoundingClientRect();
    const spot = tipPlace(at, { width: size.width, height: size.height }, { width, height }, header);
    Object.assign(def.style, { left: `${spot.left}px`, top: `${spot.top}px`, right: "auto", bottom: "auto", margin: "0" });
    def.dataset.side = spot.top >= at.bottom ? "below" : "above";
  }, []);
  useLayoutEffect(() => {
    const def = tip.current;
    if (!def || typeof def.showPopover !== "function") return;
    if (!shown) { if (def.matches(":popover-open")) def.hidePopover(); return; }
    if (!def.matches(":popover-open")) def.showPopover();
    place();
    const still = prefersReducedMotion(), from = def.dataset.side === "below" ? -4 : 4;
    const entry = def.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${from}px)` }, { opacity: 1, transform: "none" }], { duration: still ? 100 : 140, easing: EASE });
    const follow = () => place();
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => { entry.cancel(); window.removeEventListener("scroll", follow, { capture: true }); };
  }, [shown, place]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A long press showed it: a tap elsewhere closes it.
  useEffect(() => {
    if (!shown) return;
    const away = (e: PointerEvent) => { if (!(e.target instanceof Node) || !link.current?.contains(e.target)) setShown(false); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [shown]);

  const later = (ms: number, then: () => void) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(then, ms); };
  return (
    <span className={`term-tip hint-link${shown ? " term-shown" : ""}`}>
      <Link ref={link} href={href} className={className} data-band={dataBand} aria-label={ariaLabel} aria-describedby={id}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") later(cssMs("--hold", 1000), () => setShown(true)); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") later(TIP_LEAVE_MS, () => setShown(false)); }}
        onPointerDown={(e) => { pressed.current = false; if (e.pointerType === "touch") later(LONG_PRESS_MS, () => { pressed.current = true; setShown(true); }); }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onPointerCancel={() => window.clearTimeout(timer.current)}
        onContextMenu={(e) => { if (pressed.current) e.preventDefault(); }}
        onClick={(e) => { if (pressed.current) { e.preventDefault(); pressed.current = false; cancelNavPending(); } }}
        onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setShown(true); }}
        onBlur={() => setShown(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setShown(false); }}>
        {children}
      </Link>
      <span id={id} ref={tip} className="term-def" role="tooltip" popover="manual">{hint}</span>
    </span>
  );
}
