import { and, asc, eq, gt, lte, isNull } from "drizzle-orm";
import {
  normalizeWatermarks,
  quarantine,
  rawDocuments,
  type Db,
  type DbSql,
} from "@seap/db";
import {
  loadCpvCatalog,
  loadCpvPrefixMap,
  loadUnitMap,
  type NormalizeCtx,
} from "./context.js";
import { PARSERS } from "./parsers.js";
import { applyReviewedEntityNames } from "./reviewed-entity-names.js";
import { applyNutsCounties } from "./nuts-county.js";
import { applyDaSupplierVatIdentities } from "./da-supplier-vat.js";
import { reopenFixedQuarantine } from "./quarantine-reopen.js";
import { clearCopiedAwardEstimates } from "./award-estimate.js";

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
  "ted-eforms:v1",
  "ted-fforms:v1",
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
  /** Entities renamed now by a reviewed name rule (0 once applied). */
  reviewedNames: number;
  /** Romanian entities given a county from their NUTS-3 code now (0 once applied). */
  nutsCounties: number;
  /** Key-less DA supplier fragments redirected to their VAT-number entity now (0 once applied). */
  daSupplierVat: number;
  /** Award "estimates" that were a copy of the awarded value, emptied now (0 once applied). */
  awardEstimates: number;
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
      core.ted_lot_winners, core.ted_lot_results, core.ted_notices,
      core.entity_sicap_ids, core.entity_name_suggestions, core.entities,
      core.quarantine
    restart identity cascade
  `;
  await sql`truncate core.normalize_watermarks`;
}

export async function runNormalize(
  db: Db,
  sql: DbSql,
  opts: { rebuild?: boolean; only?: string; log?: (m: string) => void; maxRawId?: bigint } = {},
): Promise<NormalizeReport> {
  const log = opts.log ?? (() => {});
  if (opts.rebuild) {
    await rebuildReset(sql);
    log("rebuild: derived tables truncated, watermarks reset");
  }

  const cpvCatalog = await loadCpvCatalog(db);
  const cpvByPrefix = await loadCpvPrefixMap(db);
  const units = await loadUnitMap(db);
  log(`loaded ${cpvCatalog.size} CPV codes, ${units.size} unit mappings`);

  // Before the retry below reads pending rows: historical failures whose cause
  // the resolver no longer has go back to the ordinary retry (audit F21).
  if (!opts.only || opts.only === "award-contracts:v1") {
    const reopened = await reopenFixedQuarantine(sql);
    if (reopened.length) log(`historical quarantine reopened for retry: ${reopened.length} raw documents`);
  }

  const perTransform: TransformReport[] = [];
  let totalProcessed = 0;
  let totalQuarantined = 0;

  for (const transform of TRANSFORM_ORDER) {
    if (opts.only && opts.only !== transform) continue;
    const parser = PARSERS[transform]!;
    let cursor = await getCursor(db, transform);
    let processed = 0;
    let quarantined = 0;

    // A failed row has already advanced the ordinary cursor. Retry unresolved
    // failures once per run, or tomorrow could publish while silently skipping
    // yesterday's quarantined documents. Preserve the original failure history.
    const pending=await sql`select r.id,r.payload from (select distinct raw_id from core.quarantine where retry_required and resolved_at is null) pending
      join raw.raw_documents r on r.id=pending.raw_id where r.endpoint_version=${transform}
      and (${opts.maxRawId?.toString()??null}::bigint is null or r.id<=${opts.maxRawId?.toString()??null}::bigint)
      order by r.id`;
    const pendingIds=new Set(pending.map(row=>String(row.id)));
    for(const row of pending.filter(row=>BigInt(row.id)<=cursor)){
      try{
        await db.transaction(async tx=>{
          await parser.load({tx,cpvCatalog,cpvByPrefix,units},BigInt(row.id),row.payload);
          await tx.update(quarantine).set({resolvedAt:new Date()}).where(and(eq(quarantine.rawId,BigInt(row.id)),eq(quarantine.retryRequired,true),isNull(quarantine.resolvedAt)));
        });
        processed++;
      }catch(err){
        await db.insert(quarantine).values({rawId:BigInt(row.id),endpointVersion:transform,zodError:errMessage(err),payloadExcerpt:excerpt(row.payload)});
        quarantined++;
      }
    }

    for (;;) {
      const rows = await db
        .select({ id: rawDocuments.id, payload: rawDocuments.payload })
        .from(rawDocuments)
        .where(
          and(
            eq(rawDocuments.endpointVersion, transform),
            gt(rawDocuments.id, cursor),
            opts.maxRawId !== undefined ? lte(rawDocuments.id, opts.maxRawId) : undefined,
          ),
        )
        .orderBy(asc(rawDocuments.id))
        .limit(BATCH);
      if (rows.length === 0) break;

      for (const row of rows) {
        const ctx: NormalizeCtx = { tx: db, cpvCatalog, cpvByPrefix, units };
        try {
          await db.transaction(async (tx) => {
            await parser.load({ ...ctx, tx }, row.id, row.payload);
            if(pendingIds.has(String(row.id)))await tx.update(quarantine).set({resolvedAt:new Date()}).where(and(eq(quarantine.rawId,row.id),eq(quarantine.retryRequired,true),isNull(quarantine.resolvedAt)));
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

  // After every transform, so the DAs of a foreign supplier created before the
  // list parser read its VAT number reach one entity before the marts (audit F18).
  const daSupplierVat = opts.only ? [] : await sql.begin((q) => applyDaSupplierVatIdentities(q));
  if (daSupplierVat.length) log(`DA suppliers redirected to their VAT-number entity: ${daSupplierVat.length}`);
  // After every transform, so an entity created or rebuilt from the source
  // registrations gets its reviewed name before the marts copy it.
  const reviewedNames = opts.only ? [] : await sql.begin((q) => applyReviewedEntityNames(q));
  if (reviewedNames.length) log(`reviewed entity names applied: ${reviewedNames.join(", ")}`);
  // Same placement: the marts and search copy core.entities.county (audit F13).
  const nutsCounties = opts.only ? [] : await sql.begin((q) => applyNutsCounties(q));
  if (nutsCounties.length) log(`county filled from NUTS-3 code: ${nutsCounties.length} entities`);
  // The award list's "estimate" is a copy of the awarded value (audit F22).
  const awardEstimates = opts.only ? 0 : await sql.begin((q) => clearCopiedAwardEstimates(q));
  if (awardEstimates) log(`award estimates copied from the awarded value cleared: ${awardEstimates}`);

  return {
    perTransform,
    processed: totalProcessed,
    quarantined: totalQuarantined,
    reviewedNames: reviewedNames.length,
    nutsCounties: nutsCounties.length,
    daSupplierVat: daSupplierVat.length,
    awardEstimates,
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
