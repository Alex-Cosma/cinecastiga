"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useViewer } from "@/lib/use-viewer";
import type { AskSpec } from "@/lib/ask/spec";
import type { CaptureOptions } from "@/lib/evidence-captures-shared";
import { encodeSpec } from "@/lib/ask/permalink";
import Term from "./Term";

/**
 * An explicit selection travels to a dedicated setup page; no nested modal.
 * `blocked`: why this selection cannot be followed as it is (a trend's group
 * over the members limit): the action stays visible, disabled, with the reason.
 */
export default function FollowButton({ spec, options = {}, title, recipeId, recipeVersion, label = "Urmărește modificările", hint, arrow = true, blocked, back }: {
  spec: AskSpec; options?: CaptureOptions; title?: string; recipeId?: string; recipeVersion?: number; label?: string;
  /** Where the setup page leads back to and its name (audit Z8-31); by default the page it was opened from, "răspuns". */
  back?: { href: string; label: string };
  /** The full action for a short label, on hover and for screen readers. */
  hint?: string; arrow?: boolean; blocked?: string | null;
}) {
  const viewer = useViewer();
  const reasonId = useId();
  // The page the reader came from, read after hydration (the server does not know the address's query).
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => setHere(window.location.pathname + window.location.search), []);
  if (!viewer.userId) return null;
  if (blocked) return <span className="follow-blocked">
    <button type="button" className="follow-action" aria-disabled="true" aria-describedby={reasonId}>{label}</button>
    <span id={reasonId} className="follow-blocked-reason">{blocked}</span>
    <Term tip title={label} text={blocked} />
  </span>;
  const query = new URLSearchParams({ spec: encodeSpec(spec), options: JSON.stringify(options) });
  if (title) query.set("title", title.slice(0, 200));
  if (recipeId && recipeVersion) { query.set("recipeId", recipeId); query.set("recipeVersion", String(recipeVersion)); }
  const from = back?.href ?? here;
  if (from) { query.set("inapoi", from.slice(0, 1500)); query.set("inapoiLa", (back?.label ?? "răspuns").slice(0, 120)); }
  return <Link className="follow-action" href={`/urmariri/noua?${query}`} title={hint} aria-label={hint}>
    {label}{arrow ? <> <span aria-hidden="true">→</span></> : null}
  </Link>;
}
