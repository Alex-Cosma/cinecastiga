import { cpvCodes, unitMap, type Db } from "@seap/db";
import type { UnitMapping } from "./unit.js";

/** Db or transaction handle sufficient for the parsers + entity resolution. */
export type CoreDb = Pick<Db, "insert" | "select" | "update">;

/**
 * Shared per-run state: the CPV catalog (for O(1) validity checks) and the
 * unit map, both loaded once so parsers don't hit the DB per record.
 */
export interface NormalizeCtx {
  tx: CoreDb;
  cpvCatalog: Set<string>;
  units: Map<string, UnitMapping>;
}

export async function loadCpvCatalog(db: Db): Promise<Set<string>> {
  const rows = await db.select({ code: cpvCodes.code }).from(cpvCodes);
  return new Set(rows.map((r) => r.code));
}

export async function loadUnitMap(db: Db): Promise<Map<string, UnitMapping>> {
  const rows = await db
    .select({
      rawPattern: unitMap.rawPattern,
      canonicalUnit: unitMap.canonicalUnit,
      factor: unitMap.factor,
    })
    .from(unitMap);
  return new Map(
    rows.map((r) => [
      r.rawPattern,
      { canonicalUnit: r.canonicalUnit, factor: r.factor },
    ]),
  );
}
