import { useLayoutEffect, useRef, useState } from "react";

/*
 * A window's exit (UX audit M-06; components/motion/windows.css). A window React draws only while it is open stays
 * drawn for its exit, marked `data-leaving` (no clicks, the `win-out` / `sheet-out` keyframes), and is removed after.
 * Focus goes back to the trigger at once: the exit never holds it.
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How long a window takes to leave: 140 ms, a phone's sheet 180 ms, 90 ms with reduced motion (windows.css). */
export function leaveMs(sheet = false, reduce = reduced()): number {
  return reduce ? 90 : sheet ? 180 : 140;
}

/** True from the moment `open` turns false until the window's exit has played. */
export function useLeaving(open: boolean, sheet = false): boolean {
  const [leaving, setLeaving] = useState(false);
  const was = useRef(open);
  // Before paint: the frame that closes the window already draws it leaving, never without it.
  useLayoutEffect(() => {
    const closed = was.current && !open;
    was.current = open;
    if (!closed) { setLeaving(false); return; }
    setLeaving(true);
    const timer = window.setTimeout(() => setLeaving(false), leaveMs(sheet));
    return () => window.clearTimeout(timer);
  }, [open, sheet]);
  return leaving;
}

/** The value a window showed last while it was open, so that its exit draws the same content. */
export function useLastOpen<T>(value: T, open: boolean): T {
  const last = useRef(value);
  if (open) last.current = value;
  return open ? value : last.current;
}

/**
 * A modal <dialog> its owner unmounts to close: closed at once (the page is usable again and takes the focus back),
 * its exit plays (windows.css keeps it drawn), and only then is the owner told. Returns a cancel for an unmount first.
 */
export function closeThenLeave(dialog: HTMLDialogElement | null, done: () => void, sheet = false): () => void {
  if (!dialog?.open) { done(); return () => {}; }
  dialog.close();
  const timer = window.setTimeout(done, leaveMs(sheet));
  return () => window.clearTimeout(timer);
}

/** For a window built outside React: marks it leaving and removes it once its exit has played. */
export function leaveThenRemove(element: HTMLElement, sheet = false): void {
  element.dataset.leaving = "";
  window.setTimeout(() => element.remove(), leaveMs(sheet));
}
