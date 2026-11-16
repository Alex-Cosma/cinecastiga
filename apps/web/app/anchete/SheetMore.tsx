"use client";

import { useState } from "react";
import { formatInt } from "@/lib/format";

/**
 * On a phone a sheet's page shows its rows 25 at a time (audit Z8-37): "Următoarele 25 din N" shows the next ones of
 * the page the server sent (CSS hides the rest under 700px); a wide screen shows the whole page and not this button.
 */
export const PHONE_STEP = 25;
export default function SheetMore({ tableId, pageRows, total }: { tableId: string; pageRows: number; total: number }) {
  const [shown, setShown] = useState(PHONE_STEP);
  if (pageRows <= shown) return null;
  const next = Math.min(PHONE_STEP, pageRows - shown);
  return <button type="button" className="iw-sheet-more" onClick={() => {
    const table = document.getElementById(tableId);
    const to = shown + PHONE_STEP; table?.setAttribute("data-shown", String(to)); setShown(to);
    // The first of the rows just shown takes the focus, so the reader goes on from there.
    requestAnimationFrame(() => table?.querySelectorAll<HTMLElement>("tbody tr")[shown]?.querySelector<HTMLElement>("a")?.focus());
  }}>Următoarele {next} din {formatInt(total)}</button>;
}
