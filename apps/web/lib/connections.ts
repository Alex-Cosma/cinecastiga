import { canonicalConnectionSelection } from "./canonical-connections";
import { createHash } from "node:crypto";
import { createDb, withMonitoringSnapshot, MonitoringRefreshUnavailableError, type DbSql } from "@seap/db";
import { DA_PLAFOND_RON } from "./ask/compile";
import { connectionPairSpec, type ConnectionEntity, type ConnectionInput, type ConnectionRole, type ConnectionTotals, type ConnectionsResult } from "./connections-shared";

export class ConnectionError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "ConnectionError"; }
}
const database = globalThis as typeof globalThis & { __connectionSql?: DbSql };
const connectionDatabase = () => database.__connectionSql ??= createDb().sql;
export const CONNECTION_PAGE_SIZE = 20;
const idIsValid = (value: string) => /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
export function parseConnectionInput(params: URLSearchParams): ConnectionInput {
  const allowed = new Set(["entityId", "role", "dataset", "yearFrom", "yearTo", "search", "page", "identity", "checkpointId", "excludeEntityId", "partnerId"]);
  for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length > 1) throw new ConnectionError("Filtru necunoscut sau repetat. Selecția nu a fost extinsă.");
  const entityId = params.get("entityId") ?? "", role = params.get("role"), dataset = params.get("dataset") ?? "all";
  if (!idIsValid(entityId)) throw new ConnectionError("Alege o instituție sau o firmă validă.");
  if (role !== "authority" && role !== "supplier") throw new ConnectionError("Alege rolul instituției sau al firmei.");
  if (dataset !== "all" && dataset !== "da" && dataset !== "contracts") throw new ConnectionError("Canal de achiziții invalid.");
  const year = (key: string) => {
    const value = params.get(key); if (value === null || value === "") return undefined;
    if (!/^20\d{2}$/.test(value)) throw new ConnectionError("Alege un an între 2000 și 2099.");
    return Number(value);
  };
  const yearFrom = year("yearFrom"), yearTo = year("yearTo");
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) throw new ConnectionError("Anul de început trebuie să fie înaintea anului de sfârșit.");
  const search = (params.get("search") ?? "").trim();
  if (search.length > 150) throw new ConnectionError("Caută după un nume sau un CUI de cel mult 150 de caractere.");
  const pageText = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new ConnectionError("Pagină invalidă.");
  const identity = params.get("identity") ?? undefined, checkpointId = params.get("checkpointId") ?? undefined,
    excludeEntityId = params.get("excludeEntityId") ?? undefined, partnerId = params.get("partnerId") ?? undefined;
  if (identity !== undefined && !/^[a-f0-9]{64}$/.test(identity)) throw new ConnectionError("Identitate invalidă. Redeschide entitatea.");
  if (checkpointId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(checkpointId)) throw new ConnectionError("Versiune de date invalidă.");
  if (excludeEntityId !== undefined && !idIsValid(excludeEntityId)) throw new ConnectionError("Entitate exclusă invalidă.");
  if (partnerId !== undefined && !idIsValid(partnerId)) throw new ConnectionError("Partener invalid.");
  return { entityId, role, dataset, search, page: Number(pageText),
    ...(yearFrom !== undefined ? { yearFrom } : {}), ...(yearTo !== undefined ? { yearTo } : {}),
    ...(identity !== undefined ? { identity } : {}), ...(checkpointId !== undefined ? { checkpointId } : {}),
    ...(excludeEntityId !== undefined ? { excludeEntityId } : {}), ...(partnerId !== undefined ? { partnerId } : {}) };
}

interface EntityRow { id: string; name: string; cui: string | null; county: string | null; countryCode: string | null;
  foreign: string | null; sicap: string[]; fallback: string }
export function connectionIdentity(row: Pick<EntityRow, "id" | "cui" | "foreign" | "sicap" | "fallback">): string {
  const identity = row.cui ? ["cui", row.cui] : row.foreign ? ["foreign", row.foreign]
    : row.sicap.length ? ["sicap", ...[...row.sicap].sort()] : ["fallback", row.fallback];
  return createHash("sha256").update(JSON.stringify([row.id, ...identity])).digest("hex");
}
function entityFromRow(row: EntityRow, role: ConnectionRole): ConnectionEntity {
  return { id: row.id, name: row.name, cui: row.cui, county: row.county, countryCode: row.countryCode, role, identity: connectionIdentity(row) };
}
export async function readConnectionEntities(q: DbSql, ids: string[], role: ConnectionRole): Promise<ConnectionEntity[]> {
  if (!ids.length) return [];
  const rows = await q`select e.id::text id, e.name_display name, case when e.cui_valid then e.cui_canonical else null end cui,
    e.county, e.country_code "countryCode",
    case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
    coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
    md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=any(${ids}::bigint[])`;
  return (rows as unknown as EntityRow[]).map(row => entityFromRow(row, role));
}
export async function readConnectionEntity(q: DbSql, id: string, role: ConnectionRole): Promise<ConnectionEntity> {
  if (!idIsValid(id) || (role !== "authority" && role !== "supplier")) throw new ConnectionError("Identitate invalidă.");
  const entity = (await readConnectionEntities(q, [id], role))[0];
  if (!entity) throw new ConnectionError("Entitatea nu mai este disponibilă. Caută din nou instituția sau firma.", 404);
  return entity;
}
export function assertConnectionIdentity(entity: ConnectionEntity, expected?: string): void {
  if (expected !== undefined && expected !== entity.identity) throw new ConnectionError("Identitatea acestei entități s-a schimbat după actualizarea datelor. Redeschide instituția sau firma înainte de a continua.", 409);
}

function totals(row: Record<string, unknown>): ConnectionTotals {
  return { totalExact: String(row.total_exact ?? "0"), daRows: Number(row.da_rows ?? 0), contractRows: Number(row.contract_rows ?? 0),
    distinctContracts: Number(row.distinct_contracts ?? 0), firstDate: row.first_date == null ? null : String(row.first_date).slice(0, 10),
    lastDate: row.last_date == null ? null : String(row.last_date).slice(0, 10), undatedRows: Number(row.undated_rows ?? 0) };
}
function aggregate(q: DbSql) {
  return q`trim_scale(coalesce(sum(closing_value),0))::text total_exact,
    count(*) filter(where src='da')::int da_rows, count(*) filter(where src='contracts')::int contract_rows,
    count(distinct contract_id)::int distinct_contracts,
    min(finalization_date) first_date, max(finalization_date) last_date,
    count(*) filter(where finalization_date is null)::int undated_rows`;
}

export async function getConnections(input: ConnectionInput, sql = connectionDatabase()): Promise<ConnectionsResult> {
  // Internal callers receive the same strict checks as the public endpoint.
  input = parseConnectionInput(new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])));
  try {
    return await withMonitoringSnapshot(sql, async (q, checkpoint) => {
      await q`set local statement_timeout = '20s'`;
      input=await canonicalConnectionSelection(q,input);
      const entity = await readConnectionEntity(q, input.entityId, input.role);
      assertConnectionIdentity(entity, input.identity);
      const partnerRole = input.role === "authority" ? "supplier" : "authority";
      const focalColumn = q(input.role === "authority" ? "authority_id" : "supplier_id");
      const partnerColumn = q(input.role === "authority" ? "supplier_id" : "authority_id");
      const bounds = q`${input.yearFrom !== undefined ? q`substr(finalization_date,1,4) >= ${String(input.yearFrom)}` : q`true`}
        and ${input.yearTo !== undefined ? q`substr(finalization_date,1,4) <= ${String(input.yearTo)}` : q`true`}`;
      const da = q`select ${partnerColumn} partner_id, closing_value, nullif(finalization_date,'') finalization_date,
          'da'::text src, null::bigint contract_id from marts.da_transactions
        where ${focalColumn}=${input.entityId} and closing_value>0 and closing_value<=${DA_PLAFOND_RON} and ${bounds}`;
      const contracts = q`select ${partnerColumn} partner_id, closing_value, nullif(finalization_date,'') finalization_date,
          'contracts'::text src, contract_id from marts.contract_transactions
        where ${focalColumn}=${input.entityId} and closing_value>0 and ${bounds}`;
      const source = input.dataset === "da" ? da : input.dataset === "contracts" ? contracts : q`${da} union all ${contracts}`;
      const search = input.search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const population = q`with sources as (${source}), eligible as (
        select s.* from sources s join core.entities e on e.id=s.partner_id and e.id<=9007199254740991
        where e.id<>${input.entityId} and ${input.excludeEntityId ? q`e.id<>${input.excludeEntityId}` : q`true`}
          and ${input.partnerId ? q`e.id=${input.partnerId}` : q`true`}
          and ${search ? q`(position(${search} in lower(unaccent(e.name_display)))>0 or position(${search} in lower(coalesce(e.cui_canonical,'')))>0)` : q`true`}
      )`;
      const [summaryRow] = await q`${population} select ${aggregate(q)},count(distinct partner_id)::int partner_count from eligible`;
      const [excludedRow] = await q`with sources as (${source}) select count(*)::int row_count,trim_scale(coalesce(sum(s.closing_value),0))::text total_exact,
          count(*) filter(where s.partner_id=${input.entityId})::int self_rows
        from sources s left join core.entities e on e.id=s.partner_id and e.id<=9007199254740991
        where e.id is null or s.partner_id=${input.entityId}`;
      const partners = await q`${population} select partner_id::text, ${aggregate(q)} from eligible group by partner_id
        order by sum(closing_value) desc, partner_id asc limit ${CONNECTION_PAGE_SIZE} offset ${(input.page-1)*CONNECTION_PAGE_SIZE}`;
      const identities = await readConnectionEntities(q, partners.map(row => String(row.partner_id)), partnerRole);
      const totalPartners = Number(summaryRow?.partner_count ?? 0);
      const { dataset, yearFrom, yearTo, search: searchText, page, excludeEntityId, partnerId } = input;
      const filters = { dataset, search: searchText, page, ...(yearFrom !== undefined ? { yearFrom } : {}),
        ...(yearTo !== undefined ? { yearTo } : {}), ...(excludeEntityId ? { excludeEntityId } : {}), ...(partnerId ? { partnerId } : {}) };
      return { entity, filters, summary: { ...totals(summaryRow ?? {}), partnerCount: totalPartners },
        excluded: { rowCount: Number(excludedRow?.row_count ?? 0), totalExact: String(excludedRow?.total_exact ?? "0"), selfRows: Number(excludedRow?.self_rows ?? 0) },
        items: partners.map(row => {
          const partner = identities.find(candidate => candidate.id === String(row.partner_id))!;
          return { entity: partner, ...totals(row), spec: connectionPairSpec(input.role === "authority" ? entity : partner,
            input.role === "authority" ? partner : entity, filters) };
        }),
        pagination: { page, pageSize: CONNECTION_PAGE_SIZE, totalPages: Math.ceil(totalPartners/CONNECTION_PAGE_SIZE), totalPartners,
          hasNext: page*CONNECTION_PAGE_SIZE<totalPartners },
        checkpoint: { id: checkpoint.id, version: checkpoint.version, validatedAt: checkpoint.completedAt, sourceCoverage: checkpoint.sourceCoverage } };
    }, input.checkpointId);
  } catch (error) {
    if (error instanceof MonitoringRefreshUnavailableError) throw new ConnectionError(error.reason === "superseded"
      ? "Datele s-au schimbat. Reia explorarea pentru a păstra toate legăturile pe aceeași versiune."
      : "Datele sunt în curs de verificare. Reîncearcă după finalizarea actualizării.", error.reason === "superseded" ? 409 : 503);
    throw error;
  }
}
