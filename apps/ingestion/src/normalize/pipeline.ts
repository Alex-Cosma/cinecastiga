import { and, asc, eq, gt } from "drizzle-orm";
import {
  normalizeWatermarks,
  quarantine,
  rawDocuments,
  type Db,
  type DbSql,
} from "@seap/db";
import {
  loadCpvCatalog,
  loadUnitMap,
  type NormalizeCtx,
} from "./context.js";
import { PARSERS } from "./parsers.js";

/**
 * Replayable raw→core runner (core-layer DEC-004). Processes each
 * endpoint_version stream in id order from its watermark; a parse failure
 * quarantines the record and advances past it (never loops on bad data).
 * Idempotent: natural-key upserts mean re-running is a no-op.
 *
 * Order matters for linkage quality: list streams run before their detail
 * streams so entities resolve (by CUI) before detail attaches SICAP ids.
 */
const TRANSFORM_ORDER = [
  "tender-list:v1",
  "award-list:v1",
  "award-contracts:v1",
  "da-list:v1",
  "da-detail:v1",
] as const;

const BATCH = 200;

export interface TransformReport {
  transform: string;
  processed: number;
  quarantined: number;
}

export interface NormalizeReport {
  perTransform: TransformReport[];
  processed: number;
  quarantined: number;
}

async function getCursor(db: Db, transform: string): Promise<bigint> {
  const rows = await db
    .select({ lastRawId: normalizeWatermarks.lastRawId })
    .from(normalizeWatermarks)
    .where(eq(normalizeWatermarks.transform, transform))
    .limit(1);
  return rows[0]?.lastRawId ?? 0n;
}

async function setCursor(db: Db, transform: string, lastRawId: bigint): Promise<void> {
  await db
    .insert(normalizeWatermarks)
    .values({ transform, lastRawId })
    .onConflictDoUpdate({
      target: normalizeWatermarks.transform,
      set: { lastRawId, updatedAt: new Date() },
    });
}

/** TRUNCATE all derived tables + reset watermarks. Keeps reference data. */
async function rebuildReset(sql: DbSql): Promise<void> {
  await sql`
    truncate
      core.contract_winners, core.contracts, core.da_items,
      core.direct_acquisitions, core.notices, core.awards,
      core.entity_sicap_ids, core.entity_name_suggestions, core.entities,
      core.quarantine
    restart identity cascade
  `;
  await sql`truncate core.normalize_watermarks`;
}

export async function runNormalize(
  db: Db,
  sql: DbSql,
  opts: { rebuild?: boolean; only?: string; log?: (m: string) => void } = {},
): Promise<NormalizeReport> {
  const log = opts.log ?? (() => {});
  if (opts.rebuild) {
    await rebuildReset(sql);
    log("rebuild: derived tables truncated, watermarks reset");
  }

  const cpvCatalog = await loadCpvCatalog(db);
  const units = await loadUnitMap(db);
  log(`loaded ${cpvCatalog.size} CPV codes, ${units.size} unit mappings`);

  const perTransform: TransformReport[] = [];
  let totalProcessed = 0;
  let totalQuarantined = 0;

  for (const transform of TRANSFORM_ORDER) {
    if (opts.only && opts.only !== transform) continue;
    const parser = PARSERS[transform]!;
    let cursor = await getCursor(db, transform);
    let processed = 0;
    let quarantined = 0;

    for (;;) {
      const rows = await db
        .select({ id: rawDocuments.id, payload: rawDocuments.payload })
        .from(rawDocuments)
        .where(
          and(
            eq(rawDocuments.endpointVersion, transform),
            gt(rawDocuments.id, cursor),
          ),
        )
        .orderBy(asc(rawDocuments.id))
        .limit(BATCH);
      if (rows.length === 0) break;

      for (const row of rows) {
        const ctx: NormalizeCtx = { tx: db, cpvCatalog, units };
        try {
          await db.transaction(async (tx) => {
            await parser.load({ ...ctx, tx }, row.id, row.payload);
          });
          processed += 1;
        } catch (err) {
          await db.insert(quarantine).values({
            rawId: row.id,
            endpointVersion: transform,
            zodError: errMessage(err),
            payloadExcerpt: excerpt(row.payload),
          });
          quarantined += 1;
        }
        cursor = row.id;
        await setCursor(db, transform, cursor);
      }
    }

    perTransform.push({ transform, processed, quarantined });
    totalProcessed += processed;
    totalQuarantined += quarantined;
    log(`${transform}: processed ${processed}, quarantined ${quarantined}`);
  }

  return {
    perTransform,
    processed: totalProcessed,
    quarantined: totalQuarantined,
  };
}

/** Flatten an error + its cause chain (drizzle wraps the real PG error in `.cause`). */
function errMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let msg = err.message;
  let cause: unknown = (err as { cause?: unknown }).cause;
  while (cause instanceof Error) {
    msg += ` | cause: ${cause.message}`;
    cause = (cause as { cause?: unknown }).cause;
  }
  return msg;
}

/** Keep a small, bounded slice of the payload for quarantine debugging. */
function excerpt(payload: unknown): unknown {
  const s = JSON.stringify(payload);
  return s.length <= 2000 ? payload : { truncated: s.slice(0, 2000) };
}
