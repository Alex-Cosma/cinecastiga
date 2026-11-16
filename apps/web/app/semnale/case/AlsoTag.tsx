"use client";

import Term from "@/components/Term";
import { FLAG_META, flagLabel } from "@/lib/flags";

/**
 * „This acquisition is in another pattern too” (UX audit Z6-39): a small neutral tag with the pattern's short name
 * („+ Adunate”, „+ Sub plafon”), its whole name on hover or a tap; not the risk colour, which coloured half the rows.
 */
const SHORT: Record<string, string> = { da_split: "Adunate", da_round: "Sub plafon", da_above_ceiling: "Peste plafon" };
const codeOf = (label: string) => Object.keys(FLAG_META).find((c) => flagLabel(c) === label);

export default function AlsoTag({ label }: { label: string }) {
  const code = codeOf(label);
  const short = (code && SHORT[code]) ?? label;
  return <Term tip className="sgc-also" title="Și în alt tipar" text={`Aceeași achiziție apare și la „${label}”; tiparul are tabul lui mai sus.`}>+ {short}</Term>;
}
