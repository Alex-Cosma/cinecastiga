import type { AskSpec } from "./spec";

export interface ProfileLink { id: string; role: "authority" | "supplier"; label: string; name: string | null }

/**
 * The profiles a question's answer links to from its head (owner, 19 November 2026): the institution the question
 * names, the firm it names, both when it names both. "Primăria X" (a locality) is its town hall, the identity the
 * answer brings (`townHall`, lib/ask/town-hall.ts); until the answer comes, `pending` reserves its place.
 * The one compared with and a person have no button here: the title links them.
 */
export function profileLinks(spec: AskSpec | null | undefined, townHall?: { id: string } | null): ProfileLink[] {
  if (!spec) return [];
  const f = spec.filters, out: ProfileLink[] = [];
  if (f.authorityId) out.push({ id: String(f.authorityId), role: "authority", label: "Profilul instituției", name: f.authorityName ?? null });
  else if (f.uatSiruta && townHall) out.push({ id: townHall.id, role: "authority", label: "Profilul primăriei", name: f.uatName ?? null });
  if (f.supplierId) out.push({ id: String(f.supplierId), role: "supplier", label: "Profilul firmei", name: f.supplierName ?? null });
  return out;
}
