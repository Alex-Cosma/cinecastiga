"use client";

import { useEffect } from "react";
import { watchSlides } from "./slide";

/**
 * The site's motion that listens to the whole page, mounted once in the root layout (UX audit, 16 November 2026):
 * a tab's mark sliding to the chosen tab (M-07, slide.ts); the press of a button on a phone (M-12: Safari on iOS
 * applies :active to a tap only when the page listens to touchstart, passively here, so scrolling is never held).
 */
export default function MotionKit() {
  useEffect(() => watchSlides(document.body), []);
  useEffect(() => {
    const press = () => {};
    document.addEventListener("touchstart", press, { passive: true });
    return () => document.removeEventListener("touchstart", press);
  }, []);
  return null;
}
