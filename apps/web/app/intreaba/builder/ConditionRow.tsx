import type { ReactNode } from "react";
import HelpTip from "./HelpTip";
import type { KitTip } from "./kit-types";

/*
 * Component 3, the labelled condition row. A group row (P3a: CÂȘTIGĂTORII,
 * INSTITUȚIILE) narrows the list while the total and "% din total" stay the
 * sentence's. A selection row (P3b: FURNIZORII, CLIENȚII on network and
 * sankey) chooses which partners are counted: the total changes, the total
 * line says how, and the label carries a (?) that says so. A row never mixes
 * the two; the registry test checks the keys (plan §2.1).
 */

export const MAX_ROW_CHIPS = 5;

/** The row's noun without its article: "Furnizorii" → "furnizori", "Clienții" → "clienți", "Firmele" → "firme". */
export function rowNoun(label: string): string {
  const word = label.trim().toLocaleLowerCase("ro");
  return word.endsWith("ii") ? word.slice(0, -1) : word.endsWith("le") ? word.slice(0, -2) : word;
}

/** The (?) of a selection row when the caller gives none: what the row does to the total, in the row's own noun (kit). */
export function selectionTip(label: string): KitTip {
  return { title: label, text: `Alege ce ${rowNoun(label)} intră în calcul. Totalul se schimbă, iar linia de sub răspuns spune cum.` };
}

export default function ConditionRow({ label, kind, tip, children }: { label: string; kind: "group" | "selection"; tip?: KitTip; children: ReactNode }) {
  const help = tip ?? (kind === "selection" ? selectionTip(label) : undefined);
  return <div className={`fk-row${kind === "selection" ? " fk-row--select" : ""} fk-tipwrap`} role="group" aria-label={label} data-fk-row="">
    <span className="fk-row-label" aria-hidden={help ? undefined : true}>{label}{help && <HelpTip tip={help} />}</span>
    {children}
  </div>;
}
