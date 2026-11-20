"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Term from "../../../components/Term";
import { DoneCheck } from "../../../components/motion/Done";

/**
 * „Cum am calculat” (owner, 19 November 2026): how this question was read, in a box that floats over the page instead
 * of a fold that pushes it down. It replaces „Limite · N” and „Surse și date” under an answer; the rules of every
 * answer are the guide's (lib/ask/caveat-kinds.ts sorts the notes). Complet only: the caller marks it.
 *
 * The box is the site's floating explanation (components/Term.tsx) on words with the dotted line and the small "?",
 * as a label of a record page: it explains, it is not a button, and it does not look like one (owner). A resting mouse
 * turns the line solid and opens it, the "?", a tap or the keyboard open it at once, and it stays while the mouse is
 * on it, so the query can be copied. The query itself is not printed: who wants it pastes it.
 */
export default function HowComputed({ notes, sql }: { notes: readonly string[]; sql?: string | null | undefined }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!sql) return;
    let result: "done" | "failed" = "done";
    try { await navigator.clipboard.writeText(sql); } catch { result = "failed"; }
    setCopied(result);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), result === "done" ? 1600 : 2400);
  };
  return <p className="cq-how" data-only="complet">
    <Term tip hold="line" className="cq-how-tag" title="Cum am calculat" text={<>
      {notes.map((note) => <span key={note} className="cq-how-n">{note}</span>)}
      <span className="cq-how-n">Regulile oricărui răspuns (surse, plafoane, ce intră în totaluri) sunt în <Link href="/metodologie#totaluri">Ghid</Link>.</span>
      {sql && <span className="cq-how-n cq-how-act">
        <button type="button" className="cq-how-copy" onClick={() => void copy()}>
          {copied === "done" ? <><DoneCheck />Copiat</> : copied === "failed" ? "Nu am putut copia" : "Copiază interogarea SQL"}
        </button>
        <span className="d-sr-only" role="status">{copied === "done" ? "Interogarea SQL a fost copiată." : copied === "failed" ? "Interogarea SQL nu a putut fi copiată." : ""}</span>
      </span>}
    </>}>
      Cum am calculat
    </Term>
  </p>;
}
