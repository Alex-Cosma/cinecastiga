"use client";

import Link from "next/link";
import { useId } from "react";
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
export default function FollowButton({ spec, options = {}, title, recipeId, recipeVersion, label = "Urmărește modificările", blocked }: {
  spec: AskSpec; options?: CaptureOptions; title?: string; recipeId?: string; recipeVersion?: number; label?: string; blocked?: string | null;
}) {
  const viewer = useViewer();
  const reasonId = useId();
  if (!viewer.userId) return null;
  if (blocked) return <span className="follow-blocked">
    <button type="button" className="follow-action" aria-disabled="true" aria-describedby={reasonId}>{label}</button>
    <span id={reasonId} className="follow-blocked-reason">{blocked}</span>
    <Term tip title={label} text={blocked} />
  </span>;
  const query = new URLSearchParams({ spec: encodeSpec(spec), options: JSON.stringify(options) });
  if (title) query.set("title", title.slice(0, 200));
  if (recipeId && recipeVersion) { query.set("recipeId", recipeId); query.set("recipeVersion", String(recipeVersion)); }
  return <Link className="follow-action" href={`/urmariri/noua?${query}`}>{label} <span aria-hidden="true">→</span></Link>;
}
