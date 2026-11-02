import { linkNames } from "../../../components/EntityName";
import HelpTip from "../builder/HelpTip";
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

export function FactTag({ fact }: { fact: RowFact }) {
  const tone = fact.tone && fact.tone !== "neutral" ? ` qb-tag--${fact.tone}` : "";
  return <span className={`qb-tag${tone}`}>{fact.entity ? linkNames(fact.text, [fact.entity]) : fact.text}{fact.tip && <HelpTip tip={fact.tip} />}</span>;
}

export default function RowFacts({ facts }: { facts: readonly RowFact[] }) {
  if (!facts.length) return null;
  return <div className="qb-tags">{facts.slice(0, MAX_FACTS).map((fact, index) => <FactTag key={`${index}:${fact.text}`} fact={fact} />)}</div>;
}
