import { entities, entitySicapIds, type Db, type DbSql } from "@seap/db";
import { canonicalCui } from "../normalize/cui.js";
import { normalizeName } from "../normalize/name.js";
import { readBson } from "./bson.js";

/**
 * Load the `supplier` / `contractingAuthority` dimension collections from the
 * 2020 dump into `core.entities`, reusing the same CUI + name normalization the
 * live pipeline uses. Their `_id` is the SICAP participant id → maps 1:1 to
 * `core.entity_sicap_ids` (namespaces `supplier` / `authority`).
 *
 * Applies the same dedup invariant as `resolveEntity`: at most one entity per
 * checksum-valid canonical CUI (enforced by `entities_cui_canonical_uq`). So a
 * second SICAP id carrying an already-seen valid CUI does NOT create a row — it
 * just attaches another `entity_sicap_ids` link to the existing entity. This is
 * what merges a company that appears both as supplier and as authority, and what
 * merges the ~793 live entities with their 2020 counterparts. Records with an
 * invalid/absent CUI have no merge key, so each becomes its own entity.
 *
 * Idempotent: pre-seeds the SICAP map from `entity_sicap_ids`, so an already
 * imported SICAP id is skipped and a re-run is a no-op.
 */
export type EntityNs = "supplier" | "authority";

const BATCH = 500;

export interface LoadEntitiesResult {
  namespace: EntityNs;
  seen: number;
  /** New entity rows created. */
  inserted: number;
  /** Records merged onto an existing entity by valid CUI. */
  merged: number;
  /** SICAP ids already present (idempotent re-run). */
  skipped: number;
  /** SICAP id → canonical entity id, for the marts build. */
  map: Map<number, bigint>;
}

export async function loadEntities(
  db: Db,
  sql: DbSql,
  file: string,
  namespace: EntityNs,
  log: (m: string) => void = () => {},
): Promise<LoadEntitiesResult> {
  // Committed valid CUI → entity id (the merge index) and SICAP id → entity id.
  const cuiMap = new Map<string, bigint>();
  for (const r of (await sql`
    select cui_canonical, id from core.entities where cui_valid = true
  `) as unknown as { cui_canonical: string; id: bigint }[]) {
    cuiMap.set(r.cui_canonical, r.id);
  }
  const map = new Map<number, bigint>();
  for (const r of (await sql`
    select sicap_id, entity_id from core.entity_sicap_ids where namespace = ${namespace}
  `) as unknown as { sicap_id: number; entity_id: bigint }[]) {
    map.set(Number(r.sicap_id), r.entity_id);
  }

  let seen = 0;
  let inserted = 0;
  let merged = 0;
  let skipped = 0;

  // Entities to create this batch; their valid CUIs are held in `stagedCui`
  // until the batch commits (so a repeat CUI within a batch merges correctly).
  let newBatch: { sicapId: number; cui: string | null; row: typeof entities.$inferInsert }[] = [];
  const stagedCui = new Set<string>();
  // SICAP links onto already-known entities (merges + idempotent adds).
  let linkBatch: { sicapId: number; entityId: bigint }[] = [];

  const flushNew = async (): Promise<void> => {
    if (newBatch.length === 0) return;
    // Single INSERT ... VALUES → RETURNING preserves VALUES order.
    const ids = await db
      .insert(entities)
      .values(newBatch.map((b) => b.row))
      .returning({ id: entities.id });
    const links = newBatch.map((b, i) => ({ entityId: ids[i]!.id, namespace, sicapId: b.sicapId }));
    await db.insert(entitySicapIds).values(links).onConflictDoNothing();
    for (let i = 0; i < newBatch.length; i++) {
      const b = newBatch[i]!;
      const id = ids[i]!.id;
      map.set(b.sicapId, id);
      if (b.cui) cuiMap.set(b.cui, id);
    }
    inserted += newBatch.length;
    newBatch = [];
    stagedCui.clear();
  };

  const flushLinks = async (): Promise<void> => {
    if (linkBatch.length === 0) return;
    await db
      .insert(entitySicapIds)
      .values(linkBatch.map((l) => ({ entityId: l.entityId, namespace, sicapId: l.sicapId })))
      .onConflictDoNothing();
    for (const l of linkBatch) map.set(l.sicapId, l.entityId);
    merged += linkBatch.length;
    linkBatch = [];
  };

  const progress = (): void => {
    const done = inserted + merged;
    if (done > 0 && done % 20000 < BATCH) {
      log(`  ${namespace}: ${inserted} new, ${merged} merged, ${skipped} skipped`);
    }
  };

  for (const d of readBson(file)) {
    seen += 1;
    const sicapId = Number(d["_id"]);
    if (!Number.isFinite(sicapId)) continue;
    if (map.has(sicapId)) {
      skipped += 1;
      continue;
    }
    const canonical = canonicalCui((d["cui"] as string | undefined) ?? null);

    if (canonical.valid) {
      const cui = canonical.cui;
      // Merge target already committed?
      let target = cuiMap.get(cui);
      if (target == null && stagedCui.has(cui)) {
        // Same valid CUI is staged in the uncommitted batch — commit so it lands
        // in cuiMap, then merge onto it.
        await flushNew();
        target = cuiMap.get(cui);
      }
      if (target != null) {
        linkBatch.push({ sicapId, entityId: target });
        if (linkBatch.length >= BATCH) await flushLinks();
        progress();
        continue;
      }
    }

    const name = String(d["name"] ?? "").trim() || "(fără nume)";
    const cuiRaw = (d["cui"] as string | undefined) ?? null;
    const county = (d["county"] as string | undefined) ?? null;
    const { normalized, legalForm } = normalizeName(name);
    newBatch.push({
      sicapId,
      cui: canonical.valid ? canonical.cui : null,
      row: {
        cuiCanonical: canonical.valid ? canonical.cui : null,
        cuiValid: canonical.valid,
        nameDisplay: name,
        nameNormalized: normalized,
        legalForm: legalForm ?? null,
        county,
        cuiRawVariants: cuiRaw ? [cuiRaw] : null,
      },
    });
    if (canonical.valid) stagedCui.add(canonical.cui);
    if (newBatch.length >= BATCH) await flushNew();
    progress();
  }
  await flushNew();
  await flushLinks();
  return { namespace, seen, inserted, merged, skipped, map };
}
