import { createDb, type DbSql } from "@seap/db";

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
