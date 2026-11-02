import HelpTip from "./HelpTip";
import type { KitTip } from "./kit-types";

/*
 * Component 18, the profile line under the sentence of the historical
 * profiles (distribution, scatter, entity_card on the index): text, not a
 * control, the same words on all three (kit §4 "Profilul", §5.36). The
 * period and the domain are not chosen there; the line says why.
 */

/**
 * The one profile line the plan names (BlockFilters.scopeLine = "historical-da"): only the kind, the archive and the
 * ceiling in its (?) (owner, 2 November 2026: „Profil istoric · achiziții directe, toată arhiva” said too much).
 */
export const HISTORICAL_DA = {
  label: "Achiziții directe",
  words: "",
  tip: { title: "Achiziții directe", text: "Toată arhiva, fiecare de cel mult 2 mil. lei (filtru analitic, nu prag legal). Perioada și domeniul nu se aleg aici." },
} as const satisfies { label: string; words: string; tip: KitTip };

export default function ScopeLine({ label = HISTORICAL_DA.label, words = HISTORICAL_DA.words, tip = HISTORICAL_DA.tip }: { label?: string; words?: string; tip?: KitTip }) {
  if (!words) return <p className="qb-scopeline qb-tipwrap"><span className="qb-nowrap"><b>{label}</b> <HelpTip tip={tip} /></span></p>;
  // The (?) stays on the line of the last two words ("toată arhiva (?)").
  const split = /^(.*?)(\S+\s+\S+|\S+)$/s.exec(words);
  const head = split?.[1] ?? "", tail = split?.[2] ?? words;
  return <p className="qb-scopeline qb-tipwrap">
    <b>{label}</b><span className="qb-scope-sep" aria-hidden="true">·</span>
    {head}<span className="qb-nowrap">{tail} <HelpTip tip={tip} /></span>
  </p>;
}
