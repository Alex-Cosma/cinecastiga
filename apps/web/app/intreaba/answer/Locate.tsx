"use client";

import { formatInt } from "../../../lib/format";
import EntitySearch, { type EntitySearchProps } from "../builder/EntitySearch";

/*
 * Component 20, "Unde e …?": finds an entity in the answer without filtering
 * it ("Unde e o firmă?" on the ranking, "Unde e o instituție?" on the
 * scatter). The same combobox as the entity search, its list opening under
 * the field; the place found is said in a status region: "locul 20 din 82,
 * după semnale", or why it is not in the list ("nu intră în listă: sub 20 de
 * achiziții directe"). The rank comes from the facets (part=locate).
 */

/** "locul 37 din 413", "locul 20 din 82, după semnale" (not "#1 din 46"). */
export function placeWords(rank: number, total: number, by?: string): string {
  return `locul ${formatInt(rank)} din ${formatInt(total)}${by ? `, după ${by}` : ""}`;
}

export interface LocateProps extends Omit<EntitySearchProps, "inline" | "placeholder"> {
  /** What was found and where: { name: "Comuna Sageata", place: placeWords(20, 82, "semnale") }. */
  found?: { name: string; place: string } | null;
}

export default function Locate({ found, ...search }: LocateProps) {
  return <div className="fk-find">
    <EntitySearch {...search} placeholder={search.label} inline={false} />
    <span className="fk-find-res" role="status">{found && <><b>{found.name}</b> {found.place}</>}</span>
  </div>;
}
