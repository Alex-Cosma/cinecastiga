import { canonicalEntityId, createDb, type DbSql } from "@seap/db";
import { SPLIT_TYPES, splitColumns } from "./entity-splits-columns";
import type { Role } from "./marts";
import { channelWhere, facetOf, type Channel, type FacetRequest, type FilterSource, type Fragment } from "./table-filters/server/query";
import type { Facet, FilterState } from "./table-filters/types";

/*
 * The repeated-purchases groups (da_split) of an entity: in flag_instances the subject is the authority and the
 * partner the supplier. Filtered by the table's column funnels (owner decision of 4 November 2026).
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
const db = (): DbSql => (g.__seapSql ??= createDb().sql);

export interface SplitPair {
  flagId: string;
  cpvClass: string | null;
  purchaseType: string | null;
  partnerId: string | null;
  partnerName: string | null;
  year: string | null;
  count: number;
  totalRon: number;
  ceiling: number;
}

/** The groups as one channel of the column filters. */
export function splitSource(sql: DbSql, id: string, role: Role): FilterSource {
  // Annotated, so each template takes the fragment type from its context (postgres.js infers it).
  const own: Fragment = role === "authority" ? sql`fi.entity_id` : sql`fi.partner_id`;
  const partnerId: Fragment = role === "authority" ? sql`fi.partner_id` : sql`fi.entity_id`;
  const partnerName: Fragment = role === "authority" ? sql`fi.partner_name` : sql`fi.entity_name`;
  const channel: Channel = {
    name: "grupuri",
    from: sql`marts.flag_instances fi`,
    where: sql`fi.flag_code = 'da_split' and ${own} = ${id}`,
    bindings: {
      partener: { kind: "list", value: partnerId, label: partnerName, match: (ids) => sql`${partnerId} = any(${sql.array(ids)}::bigint[])` },
      an: { kind: "list", value: sql`fi.period` },
      tip: { kind: "list", value: sql`fi.evidence->>'type'` },
      achizitii: { kind: "range", value: sql`(fi.evidence->>'count')::int` },
      total: { kind: "range", value: sql`(fi.evidence->>'total')::numeric` },
    },
  };
  return { columns: splitColumns(role === "authority"), channels: [channel] };
}

const canonical = (sql: DbSql, entityId: string) => canonicalEntityId(sql, /^\d+$/.test(entityId) ? entityId : "0");

/** One page of the groups under the filters, largest total first. */
export async function getSplitPairsPaged(entityId: string, role: Role, filters: FilterState, requestedPage = 1): Promise<{ rows: SplitPair[]; total: number; page: number }> {
  const sql = db();
  const id = await canonical(sql, entityId);
  const [channel] = splitSource(sql, id, role).channels;
  // A filter no group can meet leaves the table empty, not unfiltered.
  const none: Fragment = sql`false`;
  const where = channelWhere(sql, channel!, filters) ?? none;
  const partnerId: Fragment = role === "authority" ? sql`fi.partner_id` : sql`fi.entity_id`;
  const partnerName: Fragment = role === "authority" ? sql`fi.partner_name` : sql`fi.entity_name`;
  const [count] = await sql`select count(*)::int total from marts.flag_instances fi where ${where}`;
  const total = Number(count?.total ?? 0);
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), Math.max(1, Math.ceil(total / 10)));
  const rows = (await sql`
    select fi.id::text flag_id, fi.evidence->>'cpv_class' cpv_class, fi.evidence->>'type' purchase_type, ${partnerId} pid, ${partnerName} pname, fi.period,
      (fi.evidence->>'count')::int cnt, (fi.evidence->>'total')::numeric total, (fi.evidence->>'ceiling')::numeric ceiling
    from marts.flag_instances fi
    where ${where}
    order by (fi.evidence->>'total')::numeric desc nulls last, fi.id
    limit 10 offset ${(page - 1) * 10}
  `) as unknown as {
    flag_id: string; cpv_class: string | null; purchase_type: string | null; pid: string | null; pname: string | null;
    period: string | null; cnt: number; total: string | null; ceiling: string | null;
  }[];
  return { total, page, rows: rows.map((r) => ({
    flagId: r.flag_id, cpvClass: r.cpv_class,
    purchaseType: r.purchase_type && r.purchase_type in SPLIT_TYPES ? SPLIT_TYPES[r.purchase_type as keyof typeof SPLIT_TYPES] : null,
    partnerId: r.pid != null ? String(r.pid) : null,
    partnerName: r.pname,
    year: r.period,
    count: Number(r.cnt),
    totalRon: Number(r.total ?? 0),
    ceiling: Number(r.ceiling ?? 0),
  })) };
}

/** One funnel of the groups' table. */
export async function getSplitFacet(entityId: string, role: Role, key: string, filters: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const sql = db();
  const id = await canonical(sql, entityId);
  return facetOf(sql, splitSource(sql, id, role), key, filters, request);
}
