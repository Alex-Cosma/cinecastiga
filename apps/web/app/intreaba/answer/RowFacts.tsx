import { linkNames } from "../../../components/EntityName";
import Term from "../../../components/Term";
import HelpTip from "../builder/HelpTip";
import TagTrace from "./TagTrace";
import type { KitTip } from "../builder/kit-types";

/*
 * P8, the facts on an answer row: not filters, at most three. Neutral = a
 * fact ("în asociere", "prima dată aici: 02.10.2024"); accent = what the
 * question picked out ("client principal"); amber = read with care
 * ("1 contract: 58%", "bilanț 2021"); orange only for the official signals
 * ("posibilă fracționare", FLAG_META.label in lower case). Colour is never
 * the only sign: the words say it.
 */

export type FactTone = "neutral" | "accent" | "caveat" | "signal";

export interface RowFact { text: string; tone?: FactTone; tip?: KitTip; /** A partner the words name, linked to its page. */ entity?: { id: string; name: string } }

export const MAX_FACTS = 3;

/**
 * How long a mouse rests on a tag before its explanation shows (owner, 15 November 2026: exactly one second, drawn as
 * a trace round the tag that closes as the explanation opens; filters-kit.css runs the trace for the same time).
 * A tap or the keyboard show it at once.
 */
export const TAG_HOLD_MS = 1000;

export function FactTag({ fact }: { fact: RowFact }) {
  const tone = fact.tone && fact.tone !== "neutral" ? ` qb-tag--${fact.tone}` : "";
  // A tag with a (?) and no link inside is itself the (?)'s button: the explanation shows after a mouse rests on the tag
  // for TAG_HOLD_MS, while a trace closes round it, or at once on keyboard focus or a tap (owner, 15 November 2026: the
  // signal tags of the risk cloud). A tag that links a name keeps its separate "?", since a button cannot hold a link.
  if (fact.tip && !fact.entity) {
    const className = `qb-tag qb-tag-tip${tone}`;
    const words = <>{fact.text}<TagTrace /></>;
    return "id" in fact.tip
      ? <Term tip hold={TAG_HOLD_MS} id={fact.tip.id} className={className}>{words}</Term>
      : <Term tip hold={TAG_HOLD_MS} title={fact.tip.title} text={fact.tip.text} className={className}>{words}</Term>;
  }
  return <span className={`qb-tag${tone}`}>{fact.entity ? linkNames(fact.text, [fact.entity]) : fact.text}{fact.tip && <HelpTip tip={fact.tip} />}</span>;
}

export default function RowFacts({ facts }: { facts: readonly RowFact[] }) {
  if (!facts.length) return null;
  return <div className="qb-tags">{facts.slice(0, MAX_FACTS).map((fact, index) => <FactTag key={`${index}:${fact.text}`} fact={fact} />)}</div>;
}
