"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The work sign (UX audit M-15, motion pass 16 November 2026): one thin line under the question or the field at work.
 * After 150 ms a piece of it runs along (1.1 s a run) for as long as the request is open; when the answer is in it
 * fills (200 ms) and fades (300 ms); on an error it goes at once. A request answered within 150 ms shows nothing. It
 * replaces the bars and the spinner; the ghosts stay (they say the shape of what comes) and the status text stays (it
 * is all there is with reduced motion). Its parent must be positioned; it sits on the parent's bottom edge.
 */
export default function WorkLine({ busy, failed = false, className }: { busy: boolean; failed?: boolean; className?: string | undefined }) {
  const [state, setState] = useState<"idle" | "run" | "end">("idle");
  const since = useRef(0);
  useEffect(() => {
    if (busy) { since.current = performance.now(); setState("run"); return; }
    // Done: only a request that showed its line closes it.
    if (failed || performance.now() - since.current < 150) { setState("idle"); return; }
    setState((was) => (was === "run" ? "end" : "idle"));
    const t = window.setTimeout(() => setState("idle"), 500);
    return () => window.clearTimeout(t);
  }, [busy, failed]);
  if (state === "idle") return null;
  return <span className={`mo-hair${className ? ` ${className}` : ""}`} data-state={state} aria-hidden="true" />;
}
