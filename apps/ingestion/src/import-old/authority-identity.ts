import { canonicalCui } from "../normalize/cui.js";
import { normalizeName, parseEntityString } from "../normalize/name.js";

export interface LegacyAuthority {
  sicapId: number;
  cui: string | null;
  name: string;
}

export type LegacyAuthorityIdentity =
  | { kind: "cui" | "sicap"; cui: string | null; sicapIds: number[]; name: string }
  | { kind: "unresolved" | "conflict"; cui: null; sicapIds: number[]; name: string };

/** Only the ORIGINAL dimension defines the two namespaces. Never use the
 * already-polluted core.entity_sicap_ids to infer what a legacy prefix means.
 * A name corroborates an identifier; it is never an identity key on its own. */
export function legacyAuthorityResolver(rows: Iterable<Record<string, unknown>>) {
  const byId = new Map<number, LegacyAuthority>();
  const byCui = new Map<string, LegacyAuthority[]>();
  for (const row of rows) {
    const sicapId = Number(row._id);
    if (!Number.isSafeInteger(sicapId) || sicapId <= 0 || sicapId > 2_147_483_647)
      throw new Error("Invalid authority dimension ID");
    const c = canonicalCui(typeof row.cui === "string" ? row.cui : null);
    const value = { sicapId, cui: c.valid ? c.cui : null, name: normalizeName(String(row.name ?? "")).normalized };
    if (byId.has(sicapId)) throw new Error(`Repeated authority dimension ID ${sicapId}`);
    byId.set(sicapId, value);
    if (value.cui) byCui.set(value.cui, [...(byCui.get(value.cui) ?? []), value]);
  }
  return (raw: string): LegacyAuthorityIdentity => {
    const parsed = parseEntityString(raw);
    const name = parsed.name.trim();
    const normalized = normalizeName(name).normalized;
    const c = canonicalCui(parsed.cuiRaw);
    if (!parsed.cuiRaw || !normalized)
      return { kind: "unresolved", cui: null, sicapIds: [], name };
    const fiscal = c.valid ? (byCui.get(c.cui) ?? []).filter(r => r.name === normalized) : [];
    // An explicit R/RO prefix is fiscal, never a SICAP participant ID.
    const participant = /^\d+$/.test(parsed.cuiRaw) ? byId.get(Number(parsed.cuiRaw)) : undefined;
    const sicap = participant?.name === normalized ? participant : undefined;
    if (fiscal.length && sicap && sicap.cui !== c.cui)
      return { kind: "conflict", cui: null, sicapIds: [sicap.sicapId], name };
    if (fiscal.length)
      return { kind: "cui", cui: c.cui, sicapIds: fiscal.map(r => r.sicapId), name };
    if (sicap)
      return { kind: "sicap", cui: sicap.cui, sicapIds: [sicap.sicapId], name };
    return { kind: "unresolved", cui: null, sicapIds: [], name };
  };
}
