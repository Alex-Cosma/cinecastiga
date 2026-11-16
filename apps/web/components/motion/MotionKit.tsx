"use client";

import { useEffect } from "react";
import { watchSlides } from "./slide";
import { watchNameTravel } from "./name-travel";

/**
 * The site's motion that listens to the whole page, mounted once in the root layout (UX audit, 16 November 2026):
 * a tab's mark sliding to the chosen tab (M-07, slide.ts); the press of a button on a phone (M-12: Safari on iOS
 * applies :active to a tap only when the page listens to touchstart, passively here, so scrolling is never held); a name
 * clicked in a list travelling into its page's title (M-14, name-travel.ts).
 */
export default function MotionKit() {
  useEffect(() => watchSlides(document.body), []);
  useEffect(() => watchNameTravel(), []);
  useEffect(() => {
    const press = () => {};
    document.addEventListener("touchstart", press, { passive: true });
    return () => document.removeEventListener("touchstart", press);
  }, []);
  return null;
}
