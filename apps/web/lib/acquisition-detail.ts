import { createDb, type DbSql } from "@seap/db";
import { getPairContexts, inSlicingWindow } from "./record-context";
import { daState } from "./record-labels";
import type { AcquisitionContext, RecordFlag } from "./record-types";

export interface AcquisitionDetail {
  id: string;
  code: string | null;
  title: string | null;
  cpvCode: string | null;
  cpvName: string | null;
  state: string | null;
  acquisitionType: string | null;
  publishedAt: string | null;
  finalizedAt: string | null;
  value: string | null;
  estimate: string | null;
  authorityId: string | null;
  authority: string | null;
  supplierId: string | null;
  supplier: string | null;
}

const globalSql = globalThis as unknown as { acquisitionSql?: DbSql };

/** Public fields stay readable without a raw title. Retain exact decimals and Romanian calendar dates. */
export async function getAcquisitionDetail(id: string, database?: DbSql): Promise<AcquisitionDetail | null> {
  if (!/^[1-9]\d{0,17}$/.test(id)) return null;
  const q = database ?? (globalSql.acquisitionSql ??= createDb().sql);
  const [row] = await q<AcquisitionDetail[]>`
    select d.sicap_da_id::text id, d.da_code code,
      nullif(btrim(r.payload->>'directAcquisitionName'), '') title,
      coalesce(d.cpv_code, nullif(btrim(d.cpv_raw), '')) "cpvCode", k.name_ro "cpvName",
      d.state, d.acquisition_type "acquisitionType",
      to_char(d.publication_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI') "publishedAt",
      to_char(d.finalization_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI') "finalizedAt",
      d.closing_value::text value, d.estimated_value_ron::text estimate,
      d.authority_entity_id::text "authorityId", a.name_display authority,
      d.supplier_entity_id::text "supplierId", s.name_display supplier
    from core.direct_acquisitions d
    left join raw.raw_documents r on r.id = d.raw_id
    left join core.cpv_codes k on k.code = d.cpv_code
    left join core.entities a on a.id = d.authority_entity_id
    left join core.entities s on s.id = d.supplier_entity_id
    where d.sicap_da_id = ${id}`;
  return row ?? null;
}

/** The site's plausibility limit for one direct acquisition, as in every total. */
const DA_LIMIT_RON = 2_000_000;

/**
 * What the page adds to the source fields (owner, 7 November 2026), in two parallel round trips: this acquisition's
 * mart row, flags, items and slicing window in one keyed query, and the firm–institution pair (getPairContexts).
 * Refused or expired offers are not in marts.da_transactions: inMart/counted false, no slicing, but their flags,
 * items and pair still show.
 */
export async function getAcquisitionContext(id: string, detail: AcquisitionDetail, database?: DbSql): Promise<AcquisitionContext> {
  const q = database ?? (globalSql.acquisitionSql ??= createDb().sql);
  const authorityId = detail.authorityId, supplierId = detail.supplierId;
  const supplierIsAuthority = supplierId != null && supplierId === authorityId;
  const year = Number((detail.finalizedAt ?? detail.publishedAt ?? "").slice(0, 4)) || null;
  type Row = {
    cpv_code: string | null; acquisition_type: string | null; county: string | null; minutes: number | null;
    in_mart: boolean; value_suspect: boolean | null; mart_value: string | null; fin_day: string | null;
    items: AcquisitionContext["items"]; flags: RecordFlag[];
    s_n: number | null; s_sum: string | null; s_ceiling: string | null; s_from: string | null; s_to: string | null;
    s_class: string | null; s_name: string | null; s_type: string | null;
  };
  const [rows, pairs] = await Promise.all([
    /^[1-9]\d{0,17}$/.test(id) ? q<Row[]>`
      select d.cpv_code, d.acquisition_type, a.county,
        case when d.finalization_date >= d.publication_date
          then floor(extract(epoch from (d.finalization_date - d.publication_date)) / 60)::int end minutes,
        dt.sicap_da_id is not null in_mart, dt.value_suspect, dt.closing_value::text mart_value,
        left(dt.finalization_date, 10) fin_day,
        coalesce((select json_agg(json_build_object(
            'itemId', i.id::text, 'name', nullif(btrim(i.catalog_item_name), ''), 'cpvCode', i.cpv_code, 'quantity', i.quantity::text,
            'unit', nullif(btrim(i.unit_raw), ''), 'unitPriceRon', i.closing_price::text, 'catalogPriceRon', i.unit_price::text)
            order by i.sicap_item_id)
          from core.da_items i where i.da_id = d.id), '[]'::json) items,
        coalesce((select json_agg(json_build_object('code', f.flag_code, 'severity', f.severity, 'evidence', f.evidence)
            order by f.severity desc nulls last, f.flag_code, f.period)
          from core.flags f
          where f.triggered and (
            (f.subject_type = 'da' and f.subject_id = d.id)
            or (f.subject_type = 'pair' and f.flag_code = 'da_split' and f.subject_id = d.authority_entity_id
                and f.partner_id = d.supplier_entity_id and f.evidence->'source_ids' ? d.sicap_da_id::text))), '[]'::json) flags,
        s.n::int s_n, s.sum_window::text s_sum, s.ceiling::text s_ceiling, s.d0::text s_from, s.d1::text s_to,
        s.cpv_class s_class, s.cpv_name s_name, s.acquisition_type s_type
      from core.direct_acquisitions d
      left join core.entities a on a.id = d.authority_entity_id
      left join marts.da_transactions dt on dt.sicap_da_id = d.sicap_da_id
      left join marts.da_slicing s on s.authority_id = dt.authority_id and s.supplier_id = dt.supplier_id
      where d.sicap_da_id = ${id}` : Promise.resolve([] as Row[]),
    authorityId && supplierId && !supplierIsAuthority
      ? getPairContexts(authorityId, [supplierId], year, { daId: id }, q).catch((error) => {
          console.error("acquisition-detail: pair", error);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const r = rows[0];
  const value = r?.mart_value == null ? null : Number(r.mart_value);
  const inMart = r?.in_mart === true;
  const pair = pairs[0] ?? null;
  const member = r != null && r.s_n != null && inSlicingWindow(
    { cpvCode: r.cpv_code, acquisitionType: r.acquisition_type, day: r.fin_day, value, valueSuspect: r.value_suspect },
    { cpvClass: r.s_class, acquisitionType: r.s_type, from: r.s_from, to: r.s_to, ceiling: r.s_ceiling == null ? null : Number(r.s_ceiling) },
  );
  return {
    inMart,
    counted: inMart && value != null && value > 0 && value <= DA_LIMIT_RON,
    stateKind: daState(detail.state).kind,
    durationMinutes: r?.minutes == null ? null : Number(r.minutes),
    flags: (r?.flags ?? []).map((f) => ({ code: String(f.code), severity: f.severity == null ? null : Number(f.severity), evidence: f.evidence ?? null })),
    valueSuspect: inMart ? r?.value_suspect === true : null,
    items: r?.items ?? [],
    pairHistory: pair?.history ?? null,
    slicing: member && r ? {
      n: Number(r.s_n), sumRon: String(r.s_sum ?? "0"), ceilingRon: r.s_ceiling, from: r.s_from, to: r.s_to,
      cpvClass: r.s_class, cpvName: r.s_name,
    } : null,
    authorityCounty: r?.county ?? null,
    supplierIsAuthority,
    pair,
  };
}
