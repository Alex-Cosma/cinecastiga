import { and, eq, sql } from "drizzle-orm";
import { entities, entitySicapIds, type Db } from "@seap/db";
import { canonicalCui } from "./cui.js";
import { normalizeName } from "./name.js";

/**
 * Canonical-entity resolution (core-layer DEC-003). Deterministic tiers,
 * auto-merge only on tiers 1–2:
 *   1. SICAP internal id  (entity_sicap_ids, namespaced)
 *   2. checksum-valid canonical CUI  (entities.cui_canonical)
 * Fuzzy name matching (tier 3) is a SEPARATE batch pass that writes
 * suggestions — never called here, so nothing auto-merges on a name.
 *
 * Idempotent under replay: keys are natural (SICAP id, CUI), so re-running
 * over the same raw docs resolves to the same rows and only refreshes
 * first/last-seen + backfills.
 */

/** Handle usable as a db or a transaction. */
type ResolveDb = Pick<Db, "insert" | "select" | "update">;

export type EntityNamespace = "supplier" | "authority" | "winner";

export interface ResolveEntityInput {
  /** SICAP internal numeric id, if the payload carries one (tier 1). */
  sicapId?: number | null;
  /** Which SICAP id space `sicapId` belongs to. Required if `sicapId` set. */
  namespace?: EntityNamespace;
  /** Raw CUI token or the full mashed "CUI name" string (tier 2). */
  cuiRaw?: string | null;
  /** Display name (already split out of any mashed string). */
  nameDisplay: string;
  county?: string | null;
  nutsCode?: string | null;
  /** Source-record date, for first/last-seen. */
  seenAt?: Date | null;
}

async function findBySicapId(
  db: ResolveDb,
  namespace: EntityNamespace,
  sicapId: number,
): Promise<bigint | null> {
  const rows = await db
    .select({ entityId: entitySicapIds.entityId })
    .from(entitySicapIds)
    .where(
      and(
        eq(entitySicapIds.namespace, namespace),
        eq(entitySicapIds.sicapId, sicapId),
      ),
    )
    .limit(1);
  return rows[0]?.entityId ?? null;
}

async function findByCui(db: ResolveDb, cui: string): Promise<bigint | null> {
  const rows = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.cuiCanonical, cui), eq(entities.cuiValid, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Resolve (or create) the canonical entity for a source record; returns its id.
 */
export async function resolveEntity(
  db: ResolveDb,
  input: ResolveEntityInput,
): Promise<bigint> {
  const canonical = canonicalCui(input.cuiRaw);
  const seenAt = input.seenAt ?? null;

  // Tier 1: SICAP id.
  let entityId: bigint | null = null;
  if (input.sicapId != null && input.namespace) {
    entityId = await findBySicapId(db, input.namespace, input.sicapId);
  }
  // Tier 2: canonical CUI.
  if (entityId == null && canonical.valid) {
    entityId = await findByCui(db, canonical.cui);
  }

  if (entityId != null) {
    await backfillEntity(db, entityId, input, canonical.valid ? canonical.cui : null);
    await ensureSicapId(db, entityId, input);
    return entityId;
  }

  // Create.
  const { normalized, legalForm } = normalizeName(input.nameDisplay);
  const inserted = await db
    .insert(entities)
    .values({
      cuiCanonical: canonical.valid ? canonical.cui : null,
      cuiValid: canonical.valid,
      nameDisplay: input.nameDisplay,
      nameNormalized: normalized,
      legalForm,
      county: input.county ?? null,
      nutsCode: input.nutsCode ?? null,
      cuiRawVariants: input.cuiRaw ? [input.cuiRaw] : null,
      firstSeen: seenAt,
      lastSeen: seenAt,
    })
    .returning({ id: entities.id });
  const newId = inserted[0]!.id;
  await ensureSicapId(db, newId, input);
  return newId;
}

/** Refresh first/last-seen and backfill any fields that were previously null. */
async function backfillEntity(
  db: ResolveDb,
  entityId: bigint,
  input: ResolveEntityInput,
  validCui: string | null,
): Promise<void> {
  // ISO string, not a JS Date: inside a raw sql fragment drizzle can't infer the
  // timestamp type and postgres.js mis-serializes a bare Date.
  const seenAt = input.seenAt ? input.seenAt.toISOString() : null;
  // Explicit casts: bare NULL bind params have no inferable type in Postgres.
  await db
    .update(entities)
    .set({
      // LEAST/GREATEST ignore NULLs, so a later non-null date still lands.
      firstSeen: sql`least(${entities.firstSeen}, ${seenAt}::timestamptz)`,
      lastSeen: sql`greatest(${entities.lastSeen}, ${seenAt}::timestamptz)`,
      cuiCanonical: sql`coalesce(${entities.cuiCanonical}, ${validCui}::text)`,
      cuiValid: sql`${entities.cuiValid} or (${validCui}::text is not null)`,
      county: sql`coalesce(${entities.county}, ${input.county ?? null}::text)`,
      nutsCode: sql`coalesce(${entities.nutsCode}, ${input.nutsCode ?? null}::text)`,
      cuiRawVariants: input.cuiRaw
        ? sql`(
            select array(select distinct unnest(
              coalesce(${entities.cuiRawVariants}, '{}'::text[]) || array[${input.cuiRaw}::text]
            ))
          )`
        : entities.cuiRawVariants,
    })
    .where(eq(entities.id, entityId));
}

/**
 * Attach a SICAP id to an already-resolved entity (used by the DA-detail
 * parser, whose payload has the numeric ids but not the CUI/name strings).
 * No-op if the (namespace, id) pair is already claimed.
 */
export async function linkSicapId(
  db: ResolveDb,
  entityId: bigint,
  namespace: EntityNamespace,
  sicapId: number,
): Promise<void> {
  await db
    .insert(entitySicapIds)
    .values({ entityId, namespace, sicapId })
    .onConflictDoNothing();
}

/** Attach the SICAP id mapping if present and not already claimed. */
async function ensureSicapId(
  db: ResolveDb,
  entityId: bigint,
  input: ResolveEntityInput,
): Promise<void> {
  if (input.sicapId == null || !input.namespace) return;
  await db
    .insert(entitySicapIds)
    .values({
      entityId,
      namespace: input.namespace,
      sicapId: input.sicapId,
    })
    // If this (namespace, sicap_id) already maps somewhere, leave it — a
    // cross-link to a different entity is a merge candidate surfaced in
    // reconciliation, not something to silently overwrite.
    .onConflictDoNothing();
}
