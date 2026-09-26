import Link from "next/link";
import type { AskSpec } from "@/lib/ask/spec";
import type { CaptureOptions } from "@/lib/evidence-captures-shared";
import { encodeSpec } from "@/lib/ask/permalink";

/** An explicit selection travels to a dedicated setup page; no nested modal. */
export default function FollowButton({ spec, options = {}, title, recipeId, recipeVersion, label = "Urmărește modificările" }: {
  spec: AskSpec; options?: CaptureOptions; title?: string; recipeId?: string; recipeVersion?: number; label?: string;
}) {
  const query = new URLSearchParams({ spec: encodeSpec(spec), options: JSON.stringify(options) });
  if (title) query.set("title", title.slice(0, 200));
  if (recipeId && recipeVersion) { query.set("recipeId", recipeId); query.set("recipeVersion", String(recipeVersion)); }
  return <Link className="follow-action" href={`/urmariri/noua?${query}`}>{label} <span aria-hidden="true">→</span></Link>;
}
