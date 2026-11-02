"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { entityHref, type EntityRole } from "../lib/entity-href";

/**
 * The name of an institution or a firm wherever it appears: a link to its page, in the same tab (owner, 2 November
 * 2026). Its records are a control of their own beside it, never the name. Inside a row that selects on click, the
 * click stays the link's. Without an id (an unidentified party) the name is plain text. Not prefetched: a list can
 * hold dozens of names.
 */
export default function EntityName({ id, role, className, title, children }: {
  id: string | number | null | undefined;
  role?: EntityRole | null | undefined;
  className?: string | undefined;
  title?: string | undefined;
  children: ReactNode;
}) {
  if (id == null || id === "") return <span className={className}>{children}</span>;
  return (
    <Link href={entityHref(id, role)} prefetch={false} className={className ? `entity-name ${className}` : "entity-name"} title={title}
      onClick={(event) => event.stopPropagation()}>
      {children}
    </Link>
  );
}

export interface NamedEntity { id: string | number; name: string; role?: EntityRole | null | undefined }

/**
 * A sentence with the names it mentions as links to their pages: a question's title („Cu cine lucrează SPITALUL
 * MUNICIPAL GHERLA?”), a tag („cel mai mare furnizor: X · 17%”). Each occurrence, the longest name first where two
 * overlap; a name that is not in the text changes nothing.
 */
export function linkNames(text: string, entities: readonly NamedEntity[]): ReactNode {
  const named = [...new Map(entities.filter((e) => e.name && text.includes(e.name)).map((e) => [e.name, e])).values()]
    .sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return text;
  const out: ReactNode[] = [];
  let rest = text;
  while (rest) {
    let best: { at: number; entity: NamedEntity } | null = null;
    for (const entity of named) {
      const at = rest.indexOf(entity.name);
      if (at >= 0 && (!best || at < best.at)) best = { at, entity };
    }
    if (!best) { out.push(rest); break; }
    if (best.at > 0) out.push(rest.slice(0, best.at));
    out.push(<EntityName key={out.length} id={best.entity.id} role={best.entity.role}>{best.entity.name}</EntityName>);
    rest = rest.slice(best.at + best.entity.name.length);
  }
  return out;
}
