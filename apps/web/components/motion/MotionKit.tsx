"use client";

import { useEffect } from "react";
import { watchSlides } from "./slide";

/**
 * The site's motion that listens to the whole page, mounted once in the root layout (UX audit, 16 November 2026):
 * a tab's mark sliding to the chosen tab (M-07, slide.ts).
 */
export default function MotionKit() {
  useEffect(() => watchSlides(document.body), []);
  return null;
}
