"use client";

import { useEffect, useState } from "react";
import DiscoveryIcon from "../../DiscoveryIcon";
import RowMenu, { type RowAction } from "./RowMenu";
import { DoneCheck } from "../../../components/motion/Done";

/*
 * „Trimite ▾” in the answer's head (UX audit Z3-15, owner 16 November 2026): one place for the answer's link. Its menu
 * holds „Copiază linkul” (the short link, /l/…) and, where the device has a share sheet, „Trimite…”; the old
 * „Copiază linkul” under the notes is gone. The menu is the kit's menu button (RowMenu: keys, focus, a press outside).
 * The short link is prepared as the pointer goes down on the button, so the copy has it at once. A copy says „Copiat” on
 * the button itself (UX audit M-08).
 */
export default function ShareMenu({ onCopy, onShare, onPrepare, copied = false }: { onCopy: () => void; onShare: () => void; onPrepare: () => void; copied?: boolean }) {
  // The share sheet is the device's: known only in the browser, after the first paint (no hydration mismatch).
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, []);
  const actions: RowAction[] = [
    { id: "copy", label: "Copiază linkul", note: "Un link scurt, de lipit oriunde", onSelect: onCopy },
    ...(canShare ? [{ id: "share", label: "Trimite…", note: "Prin aplicațiile telefonului", onSelect: onShare }] : []),
  ];
  return <span className="qb cq-share-menu" onPointerDown={onPrepare}>
    <RowMenu name="Trimite răspunsul" actions={actions} trigger={{
      className: "cq-share",
      label: "Trimite",
      // „Copiat” on the button for 1.6 s with its check drawn (M-08; it replaced a toast), and read out beside it.
      text: copied ? <><DoneCheck /><span>Copiat</span><DiscoveryIcon name="chevronDown" /></> : <><ShareIcon /><span>Trimite</span><DiscoveryIcon name="chevronDown" /></>,
    }} />
    <span className="d-sr-only" role="status">{copied ? "Link copiat." : ""}</span>
  </span>;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
