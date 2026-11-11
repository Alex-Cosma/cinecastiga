import type { Db, DbSql } from "@seap/db";
import { streamBson } from "./bson-stream.js";
import { loadCpvCatalog, loadUnitMap } from "../normalize/context.js";
import { parseCpvObject, resolveCpv } from "../normalize/cpv.js";
import { resolveUnit } from "../normalize/unit.js";

/**
 * Item lines of the 2020 dump's direct awards (`directAcquisitionContractDetails.bson`, mongodump of 4 October 2020)
 * into core.da_items, for awards already in core.direct_acquisitions (owner, 11 November 2026: unit prices).
 *
 * Same mapping as the live detail parser (`loadDaDetail`): item CPV against the catalogue, the unit kept as typed
 * plus core.unit_map. Award headers are not touched. A line the live detail already loaded wins
 * (`on conflict do nothing` on sicap_item_id), so the run is idempotent and never overwrites newer source data.
 * Offline: reads a local file, no source traffic. A normalize `--rebuild` truncates core.da_items, as it does the
 * dump's awards (import-das): run this again after import-das.
 */
type Item = {
  directAcquisitionItemID?: number;
  catalogItemName?: string | null;
  itemQuantity?: number | null;
  itemMeasureUnit?: string | null;
  catalogItemPrice?: number | null;
  itemClosingPrice?: number | null;
  cpvCode?: { text?: string | null; localeKey?: string | null } | null;
};
type Doc = { _id?: unknown; directAcquisitionID?: unknown; year?: unknown; directAcquisitionItems?: Item[] | null };

export type DaItemsReport = {
  documents: number;
  documentsByYear: Record<string, number>;
  withItems: number;
  itemsRead: number;
  awardsInCore: number;
  awardsNotInCore: number;
  itemsInserted: number;
  itemsAlreadyPresent: number;
};

const BATCH_AWARDS = 2_000;

export async function loadDaItems(db: Db, sql: DbSql, file: string, log: (m: string) => void): Promise<DaItemsReport> {
  const cpvCatalog = await loadCpvCatalog(db);
  const units = await loadUnitMap(db);
  const report: DaItemsReport = {
    documents: 0, documentsByYear: {}, withItems: 0, itemsRead: 0,
    awardsInCore: 0, awardsNotInCore: 0, itemsInserted: 0, itemsAlreadyPresent: 0,
  };
  let batch: { sicapDaId: string; items: Item[] }[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map((b) => b.sicapDaId);
    const found = (await sql`select id::text, sicap_da_id::text from core.direct_acquisitions
      where sicap_da_id = any(string_to_array(${ids.join(",")}, ',')::bigint[])`) as unknown as { id: string; sicap_da_id: string }[];
    const daId = new Map(found.map((r) => [r.sicap_da_id, r.id]));
    const rows: Record<string, string | null>[] = [];
    for (const b of batch) {
      const id = daId.get(b.sicapDaId);
      if (!id) { report.awardsNotInCore++; continue; }
      report.awardsInCore++;
      for (const it of b.items) {
        if (it.directAcquisitionItemID == null) continue;
        const cpv = resolveCpv(parseCpvObject(it.cpvCode), cpvCatalog);
        const unit = resolveUnit(it.itemMeasureUnit, units);
        rows.push({
          da_id: id,
          cpv_code: cpv.cpvCode,
          catalog_item_name: it.catalogItemName ?? null,
          quantity: it.itemQuantity == null ? null : String(it.itemQuantity),
          unit_raw: unit.unitRaw,
          unit_canonical: unit.unitCanonical,
          unit_factor: unit.unitFactor,
          unit_price: it.catalogItemPrice == null ? null : String(it.catalogItemPrice),
          closing_price: it.itemClosingPrice == null ? null : String(it.itemClosingPrice),
          sicap_item_id: String(it.directAcquisitionItemID),
        });
      }
    }
    for (let i = 0; i < rows.length; i += 5_000) {
      const chunk = rows.slice(i, i + 5_000);
      const inserted = await sql`insert into core.da_items ${sql(chunk)} on conflict (sicap_item_id) do nothing returning 1`;
      report.itemsInserted += inserted.length;
      report.itemsAlreadyPresent += chunk.length - inserted.length;
    }
    batch = [];
  };

  for (const raw of streamBson(file)) {
    const doc = raw as Doc;
    report.documents++;
    const year = String(doc.year ?? "?");
    report.documentsByYear[year] = (report.documentsByYear[year] ?? 0) + 1;
    const items = doc.directAcquisitionItems ?? [];
    const sicapDaId = doc.directAcquisitionID ?? doc._id;
    if (items.length && sicapDaId != null) {
      report.withItems++;
      report.itemsRead += items.length;
      batch.push({ sicapDaId: String(sicapDaId), items });
      if (batch.length >= BATCH_AWARDS) await flush();
    }
    if (report.documents % 250_000 === 0) {
      log(`${report.documents} awards read, ${report.itemsInserted} item lines added, ${report.awardsNotInCore} awards not in core`);
    }
  }
  await flush();
  return report;
}
