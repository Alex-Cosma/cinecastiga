import { canonicalEntityId, contractKind, createDb, type DbSql } from "@seap/db";
import { NO_SIGNAL, SINGLE_BIDDER, txColumns } from "./entity-tx-columns";
import type { DaTx, Role } from "./marts";
import { facetOf, normalizedPattern, unionOf, type Binding, type Channel, type FacetRequest, type FilterSource } from "./table-filters/server/query";
import type { Facet, FilterState } from "./table-filters/types";

type Fragment = ReturnType<DbSql>;

/*
 * The entity page's records table: an entity's direct acquisitions and contracts in one list, filtered by its
 * column funnels (owner decision of 4 November 2026). Three channels:
 *   directe    direct acquisitions in the total (value above 0 and at most 2 million lei)
 *   excluse    the other direct acquisitions, read only when the type funnel chooses them
 *   contracte  contracts awarded through procedures (one row per consortium member, the value an equal share)
 * Every filter, every funnel's counts and the page's rows come from the same channels (lib/table-filters).
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
const db = (): DbSql => (g.__seapSql ??= createDb().sql);

const VALUE_CAP = 2_000_000;

interface EntitySide {
  /** The entity's own column, its partner's id and name. */
  own: Fragment;
  partnerId: Fragment;
  partnerName: Fragment;
}

function side(sql: DbSql, role: Role): EntitySide {
  return role === "authority"
    ? { own: sql`t.authority_id`, partnerId: sql`t.supplier_id`, partnerName: sql`t.supplier_name` }
    : { own: sql`t.supplier_id`, partnerId: sql`t.authority_id`, partnerName: sql`t.authority_name` };
}

/** The bindings every channel shares: date, partner, CPV, value. */
function common(sql: DbSql, s: EntitySide): Record<string, Binding> {
  return {
    data: { kind: "dates", date: sql`t.finalization_date` },
    partener: {
      kind: "list", value: s.partnerId,
      match: (ids) => sql`${s.partnerId} = any(${sql.array(ids)}::bigint[])`,
      names: {
        lookup: (ids) => sql`select id::text v, name_display l from core.entities where id = any(${sql.array(ids.filter((v) => /^\d+$/.test(v)))}::bigint[])`,
        search: (term) => sql`${s.partnerId} in (select id from core.entities where name_normalized like ${normalizedPattern(term)})`,
      },
    },
    cpv: {
      kind: "list", value: sql`t.cpv_code`,
      names: {
        lookup: (codes) => sql`select code v, name_ro l from core.cpv_codes where code = any(${sql.array(codes)}::text[])`,
        search: (term) => /^\d/.test(term)
          ? sql`t.cpv_code like ${`${term.replace(/[^\d-]/g, "")}%`}`
          : sql`t.cpv_code in (select code from core.cpv_codes where lower(unaccent(name_ro)) like ${normalizedPattern(term)})`,
      },
    },
    valoare: { kind: "range", value: sql`t.closing_value` },
  };
}

/** A direct acquisition's signals: the codes on it, or „fără semnal”. */
function daSignals(sql: DbSql): Binding {
  return {
    kind: "list",
    value: sql`unnest(case when cardinality(t.da_flags) = 0 then array[${NO_SIGNAL}]::text[] else t.da_flags end)`,
    match: (codes) => {
      const flags = codes.filter((c) => c !== NO_SIGNAL && c !== SINGLE_BIDDER);
      const parts: Fragment[] = [];
      if (flags.length > 0) parts.push(sql`t.da_flags && ${sql.array(flags)}::text[]`);
      if (codes.includes(NO_SIGNAL)) parts.push(sql`cardinality(t.da_flags) = 0`);
      return parts.length === 0 ? sql`false` : parts.length === 1 ? parts[0]! : sql`(${parts[0]!} or ${parts[1]!})`;
    },
  };
}

/** A contract's lead: a single reported offer, or none. */
function contractSignals(sql: DbSql): Binding {
  return {
    kind: "list",
    value: sql`case when t.is_single_bidder then ${SINGLE_BIDDER}::text else ${NO_SIGNAL}::text end`,
    match: (codes) => {
      const single = codes.includes(SINGLE_BIDDER);
      const none = codes.includes(NO_SIGNAL);
      return single && none ? sql`true` : single ? sql`t.is_single_bidder is true` : none ? sql`t.is_single_bidder is not true` : sql`false`;
    },
  };
}

/** The table's channels for one entity on one side. */
export function entityTxSource(sql: DbSql, id: string, role: Role): FilterSource {
  const s = side(sql, role);
  const shared = common(sql, s);
  const channels: Channel[] = [
    {
      name: "directe",
      from: sql`marts.da_transactions t`,
      where: sql`${s.own} = ${id} and t.closing_value > 0 and t.closing_value <= ${VALUE_CAP}`,
      bindings: { ...shared, tip: { kind: "constant", value: "directe" }, semnale: daSignals(sql) },
    },
    {
      name: "excluse",
      from: sql`marts.da_transactions t`,
      where: sql`${s.own} = ${id} and (t.closing_value is null or t.closing_value <= 0 or t.closing_value > ${VALUE_CAP})`,
      bindings: { ...shared, tip: { kind: "constant", value: "excluse" }, semnale: daSignals(sql) },
      optIn: "tip",
    },
    {
      name: "contracte",
      from: sql`marts.contract_transactions t left join core.contracts cc on cc.id = t.contract_id`,
      where: sql`${s.own} = ${id} and t.closing_value > 0`,
      bindings: { ...shared, tip: { kind: "constant", value: "contracte" }, semnale: contractSignals(sql) },
    },
  ];
  return { columns: txColumns(role === "authority"), channels };
}

/** The columns of one row, the same in every channel (channel-specific ones null-padded). */
function projection(sql: DbSql, role: Role, channel: Channel): Fragment {
  const s = side(sql, role);
  if (channel.name === "contracte") {
    return sql`'contract' src, t.contract_id::text rid, t.contract_no code, ${s.partnerName} cp_name, ${s.partnerId} cp_id,
      t.county, t.cpv_code, t.cpv_name, null::numeric estimated_value_ron, t.closing_value,
      t.finalization_date, array[]::text[] da_flags,
      t.procedure_type, t.ca_notice_id, t.is_single_bidder single_bidder,
      cc.ca_notice_contract_id nat_id, false value_suspect,
      t.n_winners, t.contract_value_full, ${contractKind(sql, "cc")} financial_kind`;
  }
  return sql`'da' src, t.sicap_da_id::text rid, t.da_code code, ${s.partnerName} cp_name, ${s.partnerId} cp_id,
    t.county, t.cpv_code, t.cpv_name, t.estimated_value_ron, t.closing_value,
    t.finalization_date, t.da_flags,
    null::text procedure_type, null::bigint ca_notice_id, null::boolean single_bidder,
    null::bigint nat_id, t.value_suspect,
    null::int n_winners, null::numeric contract_value_full, null::text financial_kind`;
}

export interface TxPage {
  filters: FilterState;
  sort?: "value" | "date";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const canonical = (sql: DbSql, entityId: string) => canonicalEntityId(sql, /^\d+$/.test(entityId) ? entityId : "0");

/** One page of an entity's records under the table's filters, and how many there are. */
export async function getEntityTransactions(entityId: string, role: Role, q: TxPage): Promise<{ rows: DaTx[]; total: number }> {
  const sql = db();
  const id = await canonical(sql, entityId);
  const source = entityTxSource(sql, id, role);
  const body = unionOf(sql, source.channels, q.filters, (channel) => projection(sql, role, channel));
  if (!body) return { rows: [], total: 0 };
  const pageSize = q.pageSize ?? 50;
  const offset = ((q.page ?? 1) - 1) * pageSize;
  const col = q.sort === "date" ? sql`finalization_date` : sql`closing_value`;
  const order = q.dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`;

  const rows = (await sql`
    select * from (${body}) u
    order by ${order}, src asc, rid::bigint asc, cp_id asc nulls last
    limit ${pageSize} offset ${offset}
  `) as unknown as Record<string, unknown>[];
  const totalRows = (await sql`select count(*)::int c from (${body}) u`) as unknown as { c: number }[];

  // Name the other members of each consortium on this page (one indexed lookup).
  const consortiumIds = [...new Set(rows
    .filter((r) => r["src"] === "contract" && Number(r["n_winners"] ?? 1) > 1)
    .map((r) => String(r["rid"])))];
  const members = new Map<string, { supplierId: string; name: string | null }[]>();
  if (consortiumIds.length > 0) {
    const memberRows = (await sql`
      select contract_id::text cid, supplier_id::text sid, supplier_name
      from marts.contract_transactions
      where contract_id = any(${sql.array(consortiumIds)}::bigint[])
      order by contract_id, supplier_id
    `) as unknown as { cid: string; sid: string; supplier_name: string | null }[];
    for (const m of memberRows) {
      const list = members.get(m.cid) ?? [];
      list.push({ supplierId: m.sid, name: m.supplier_name });
      members.set(m.cid, list);
    }
  }
  const winnerOf = (r: Record<string, unknown>) => (role === "authority" ? String(r["cp_id"]) : String(id));
  const othersOf = (r: Record<string, unknown>) => (members.get(String(r["rid"])) ?? [])
    .filter((m) => m.supplierId !== winnerOf(r))
    .slice(0, 4)
    .flatMap((m) => (m.name ?? "").length > 0 ? [{ id: m.supplierId, name: m.name! }] : []);

  return {
    total: Number(totalRows[0]?.c ?? 0),
    rows: rows.map((r) => ({
      src: r["src"] === "contract" ? ("contract" as const) : ("da" as const),
      sicapDaId: String(r["rid"]),
      daCode: (r["code"] as string | null) ?? null,
      partnerId: r["cp_id"] != null ? String(r["cp_id"]) : null,
      partnerName: (r["cp_name"] as string | null) ?? null,
      county: (r["county"] as string | null) ?? null,
      cpvCode: (r["cpv_code"] as string | null) ?? null,
      cpvName: (r["cpv_name"] as string | null) ?? null,
      estimatedValueRon: r["estimated_value_ron"] != null ? Number(r["estimated_value_ron"]) : null,
      closingValue: r["closing_value"] != null ? Number(r["closing_value"]) : null,
      closingValueExact: r["closing_value"] != null ? String(r["closing_value"]) : null,
      finalizationDate: (r["finalization_date"] as string | null) ?? null,
      daFlags: (r["da_flags"] as string[] | null) ?? [],
      procedureType: (r["procedure_type"] as string | null) ?? null,
      caNoticeId: r["ca_notice_id"] != null ? String(r["ca_notice_id"]) : null,
      singleBidder: (r["single_bidder"] as boolean | null) ?? null,
      natId: r["nat_id"] != null ? String(r["nat_id"]) : null,
      valueSuspect: Boolean(r["value_suspect"]),
      nWinners: r["n_winners"] != null ? Number(r["n_winners"]) : null,
      contractValueFull: r["contract_value_full"] != null ? Number(r["contract_value_full"]) : null,
      financialKind: (r["financial_kind"] as string | null) ?? null,
      consortiumOthers: othersOf(r).map((m) => m.name),
      consortiumMembers: othersOf(r),
    })),
  };
}

/** One funnel of an entity's table: the column's values in the rows the other filters keep. */
export async function getEntityTxFacet(entityId: string, role: Role, key: string, filters: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const sql = db();
  const id = await canonical(sql, entityId);
  return facetOf(sql, entityTxSource(sql, id, role), key, filters, request);
}
