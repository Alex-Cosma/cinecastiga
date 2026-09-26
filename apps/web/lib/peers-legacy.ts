import { createDb, withMonitoringSnapshot, MonitoringRefreshUnavailableError, type DbSql } from "@seap/db";
import { DA_PLAFOND_RON, KIND_PATTERNS } from "./ask/compile";
import { AUTHORITY_KINDS, type AuthorityKind } from "./ask/spec";
import { ConnectionError, readConnectionEntity, readConnectionEntities, assertConnectionIdentity } from "./connections";
import { peerSourceSpec, peerScopeDescriptions, type PeerInput, type PeerFilters, type PeersResult, type PeerMember, type PeerYear } from "./peers-shared";
import type { ConnectionEntity, ConnectionsResult } from "./connections-shared";

import { PeerError } from "./peer-errors";
export const PEER_PAGE_SIZE = 20;
export const PEER_MINIMUM_COUNT = 5;
export const PEER_CAPTURE_LIMIT = 499;
const database = globalThis as typeof globalThis & { __peerSql?: DbSql };
const peerDatabase = () => database.__peerSql ??= createDb().sql;
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function authorityPeerKind(name: string): AuthorityKind | null {
  const matches = AUTHORITY_KINDS.filter(kind => KIND_PATTERNS[kind].some(pattern => new RegExp(`^${fold(pattern).split("%").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "u").test(fold(name))));
  // A name matching two existing categories is not a reliable classification.
  return matches.length === 1 ? matches[0]! : null;
}
export function parsePeerInput(params: URLSearchParams): PeerInput {
  const allowed = new Set(["entityId", "role", "dataset", "year", "cpv", "county", "page", "identity", "checkpointId"]);
  for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length > 1) throw new PeerError("Filtru necunoscut sau repetat. Comparația nu a fost extinsă.");
  const entityId = params.get("entityId") ?? "", role = params.get("role"), dataset = params.get("dataset") ?? "all", page = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,15}$/.test(entityId) || !Number.isSafeInteger(Number(entityId))) throw new PeerError("Alege o instituție sau o firmă validă.");
  if (role !== "authority" && role !== "supplier") throw new PeerError("Alege rolul instituției sau al firmei.");
  if (!["all", "da", "contracts"].includes(dataset)) throw new PeerError("Canal de achiziții invalid.");
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new PeerError("Pagină invalidă.");
  const year = params.get("year"), cpv = params.get("cpv"), county = params.get("county")?.trim(), identity = params.get("identity"), checkpointId = params.get("checkpointId");
  if (year !== null && year !== "all" && !/^20\d{2}$/.test(year)) throw new PeerError("Alege „Toți anii” sau un an între 2000 și 2099.");
  if (cpv !== null && cpv !== "all" && !/^\d{2}$/.test(cpv)) throw new PeerError("Alege „Toate domeniile” sau o diviziune CPV de două cifre.");
  if (county !== undefined && (!county || county.length > 100)) throw new PeerError("Județul grupului nu este valid.");
  if (identity !== null && !/^[a-f0-9]{64}$/.test(identity)) throw new PeerError("Identitate invalidă. Redeschide entitatea.");
  if (checkpointId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(checkpointId)) throw new PeerError("Versiune de date invalidă.");
  return { entityId, role, dataset: dataset as PeerInput["dataset"], page: Number(page), ...(year === null ? {} : { year: year === "all" ? "all" as const : Number(year) }),
    ...(cpv === null ? {} : { cpv }), ...(county === undefined ? {} : { county }), ...(identity === null ? {} : { identity }), ...(checkpointId === null ? {} : { checkpointId }) };
}
function source(q: DbSql, input: PeerInput, focalOnly: boolean, year?: PeerYear, cpv?: string) {
  const id = q(input.role === "authority" ? "authority_id" : "supplier_id");
  const conditions = q`${focalOnly ? q`${id}=${input.entityId}` : q`true`} and ${year === undefined || year === "all" ? q`true` : q`finalization_date>=${`${year}-01-01`} and finalization_date<${`${year + 1}-01-01`}`}
    and ${cpv === undefined || cpv === "all" ? q`true` : q`cpv_code like ${`${cpv}%`}`}`;
  const da = q`select ${id} entity_id,closing_value,nullif(finalization_date,'') finalization_date,cpv_code,'da'::text src,null::bigint contract_id
    from marts.da_transactions where closing_value>0 and closing_value<=${DA_PLAFOND_RON} and ${conditions}`;
  const contracts = q`select ${id} entity_id,closing_value,nullif(finalization_date,'') finalization_date,cpv_code,'contracts'::text src,contract_id
    from marts.contract_transactions where closing_value>0 and ${conditions}`;
  return input.dataset === "da" ? da : input.dataset === "contracts" ? contracts : q`${da} union all ${contracts}`;
}
function member(row: Record<string, unknown>, entity: ConnectionEntity, filters: PeerFilters): PeerMember {
  return { entity, recordCount: Number(row.record_count), totalExact: String(row.total_exact), meanRounded: String(row.mean_rounded),
    daRows: Number(row.da_rows), contractRows: Number(row.contract_rows), distinctContracts: Number(row.distinct_contracts),
    firstDate: row.first_date == null ? null : String(row.first_date).slice(0,10), lastDate: row.last_date == null ? null : String(row.last_date).slice(0,10), spec: peerSourceSpec(entity,filters) };
}
function kindPredicate(q: DbSql, kind: AuthorityKind) {
  return KIND_PATTERNS[kind].map(pattern => q`lower(unaccent(e.name_display)) like ${fold(pattern)}`).reduce((a,b) => q`${a} or ${b}`);
}
function kindExpression(q: DbSql) {
  const matchCount = AUTHORITY_KINDS.map(kind => q`case when (${kindPredicate(q,kind)}) then 1 else 0 end`).reduce((a,b) => q`${a}+${b}`);
  const cases = AUTHORITY_KINDS.map(kind => q`when (${kindPredicate(q,kind)}) then ${kind}`).reduce((a,b) => q`${a} ${b}`);
  return q`case when (${matchCount})=1 then case ${cases} else null end else null end`;
}
const methodology: PeersResult["methodology"] = { version: "peers-1", descriptions: [
  "Același an calendaristic, canal de achiziții și diviziune CPV. Grupul include între jumătate și dublul numărului de înregistrări eligibile al entității analizate.",
  "Numărul de înregistrări este un reper de activitate observată, nu de populație, buget, angajați sau capacitate. Tipul instituției este estimat din nume folosind regulile existente; clasificările necunoscute sau ambigue sunt excluse.",
  "Județul restrânge sediul înregistrat al celorlalți membri, nu locul lucrărilor ori al livrării. Entitatea analizată rămâne reperul chiar dacă are sediul în alt județ.",
  "Mediana folosește toți ceilalți membri, indiferent de pagina afișată. Entitatea analizată este exclusă. Sub cinci alți membri, grupul este prea mic pentru interpretare comparativă.",
  "Valorile reprezintă valori înregistrate, nu plăți. Contractele cu mai mulți câștigători sunt alocări pe furnizor; numărul de înregistrări nu este numărul de contracte distincte. Media pe înregistrare este rotunjită la două zecimale și nu este un preț unitar comparabil.",
  "Sunt incluse valori pozitive; achizițiile directe peste plafonul tehnic de 2 milioane lei sunt excluse. Înregistrările fără an sau CPV utilizabil nu intră în grup. Un an încheiat nu garantează colectare completă. Diferențele nu stabilesc o neregulă.",
] };

/** Called only within the analytic shared gate and a repeatable-read transaction. */
export async function getLegacyPeersInSnapshot(q: DbSql, input: PeerInput, checkpoint: ConnectionsResult["checkpoint"], options: { allMembers?: boolean; memberId?: string } = {}): Promise<PeersResult> {
  input = parsePeerInput(new URLSearchParams(Object.entries(input).filter(([,value]) => value !== undefined).map(([key,value]) => [key,String(value)])));
  await q`set local statement_timeout='20s'`;
  const entity = await readConnectionEntity(q,input.entityId,input.role); assertConnectionIdentity(entity,input.identity);
  if (input.checkpointId && input.checkpointId !== checkpoint.id) throw new PeerError("Datele s-au schimbat. Reia comparația înainte de a continua.",409);
  const focalSource = source(q,input,true);
  const yearRows = await q`with s as (${focalSource}) select distinct substr(finalization_date,1,4)::int as year from s where finalization_date ~ '^20[0-9]{2}-' order by year desc`;
  const years = yearRows.map(row => Number(row.year)); const currentYear = new Date().getUTCFullYear();
  const year = input.year ?? years.find(candidate => candidate < currentYear) ?? years[0] ?? null;
  const yearSource = source(q,input,true,year ?? undefined);
  const divisions = year === null ? [] : await q`with s as (${yearSource}), grouped as (
    select left(cpv_code,2) code,count(*)::int row_count,sum(closing_value) total from s where cpv_code ~ '^[0-9]{2}' group by left(cpv_code,2)
  ) select g.code,coalesce((select c.name_ro from core.cpv_codes c where c.code like g.code||'000000-%' limit 1),'CPV '||g.code) label,
    g.row_count,trim_scale(g.total)::text total_exact from grouped g order by g.total desc,g.code`;
  const cpv = input.cpv ?? (divisions[0] ? String(divisions[0].code) : null);
  const filters: PeerFilters = { dataset: input.dataset,year,cpv,page:input.page,...(input.county ? {county:input.county} : {}) };
  const [coverageRow] = await q`with s as (${focalSource}) select count(*) filter(where finalization_date is null or finalization_date !~ '^20[0-9]{2}-')::int undated,
    count(*) filter(where ${year === null ? q`false` : year === "all" ? q`true` : q`finalization_date>=${`${year}-01-01`} and finalization_date<${`${year + 1}-01-01`}`} and (cpv_code is null or cpv_code !~ '^[0-9]{2}'))::int missing_cpv from s`;
  const kind = input.role === "authority" ? authorityPeerKind(entity.name) : null;
  const base: PeersResult = { entity,focal:null,filters,suggested:{year:input.year===undefined,cpv:input.cpv===undefined},
    options:{years,divisions:divisions.map(row => ({code:String(row.code),label:String(row.label),rowCount:Number(row.row_count),totalExact:String(row.total_exact)})),counties:[]},
    cohort:{count:0,minimumRecords:0,maximumRecords:0,authorityKind:kind,medianTotalExact:null,medianMeanRounded:null,enoughPeers:false,status:"no_focal_records",excludedUnknownType:0,excludedUnknownCounty:0},
    coverage:{focalUndatedRows:Number(coverageRow?.undated ?? 0),focalYearMissingCpvRows:Number(coverageRow?.missing_cpv ?? 0),unresolvedEntityRows:0},members:[],
    pagination:{page:input.page,pageSize:PEER_PAGE_SIZE,totalPages:0,hasNext:false},checkpoint,methodology: year === "all" || cpv === "all" ? { ...methodology, descriptions: peerScopeDescriptions(methodology.descriptions,year,cpv) } : methodology };
  if (year === null || cpv === null) return base;
  const selectedFocal = source(q,input,true,year,cpv);
  const aggregate = q`count(*)::int record_count,trim_scale(sum(closing_value))::text total_exact,round(avg(closing_value),2)::text mean_rounded,
    count(*) filter(where src='da')::int da_rows,count(*) filter(where src='contracts')::int contract_rows,count(distinct contract_id)::int distinct_contracts,
    min(finalization_date) first_date,max(finalization_date) last_date`;
  const [focal] = await q`with s as (${selectedFocal}) select ${aggregate} from s`;
  if (!focal || Number(focal.record_count) === 0) return base;
  base.focal = member(focal,entity,filters);
  const minimum = Math.ceil(base.focal.recordCount/2), maximum = base.focal.recordCount*2;
  base.cohort.minimumRecords=minimum; base.cohort.maximumRecords=maximum;
  if (input.role === "authority" && kind === null) { base.cohort.status="unknown_authority_type"; return base; }
  const selected = source(q,input,false,year,cpv);
  const population = q`with sources as (${selected}), stats as (
    select entity_id,${aggregate},sum(closing_value) total_numeric,avg(closing_value) mean_numeric from sources group by entity_id
  ), classified as (
    select s.*,e.county,${input.role === "authority" ? kindExpression(q) : q`null::text`} authority_kind
    from stats s join core.entities e on e.id=s.entity_id and e.id<=9007199254740991 where e.id<>${input.entityId}
      and s.record_count between ${minimum} and ${maximum}
  ), type_eligible as (select * from classified where ${kind ? q`authority_kind=${kind}` : q`true`}),
  cohort as (select * from type_eligible where ${input.county ? q`lower(unaccent(county))=${fold(input.county)}` : q`true`})`;
  const [summary] = await q`${population}, ranked as (
    select *,row_number() over(order by total_numeric,entity_id) total_rank,row_number() over(order by mean_numeric,entity_id) mean_rank,count(*) over() n from cohort
  ) select count(*)::int n,
    (select trim_scale(avg(total_numeric))::text from ranked where total_rank in ((n+1)/2,(n+2)/2)) median_total,
    (select round(avg(mean_numeric),2)::text from ranked where mean_rank in ((n+1)/2,(n+2)/2)) median_mean,
    (select count(*)::int from classified where authority_kind is null) unknown_type,
    (select count(*)::int from type_eligible where county is null or county='') unknown_county,
    (select coalesce(jsonb_agg(distinct county order by county) filter(where county is not null and county<>''),'[]'::jsonb) from type_eligible) counties,
    (select coalesce(sum(record_count),0)::int from stats s left join core.entities e on e.id=s.entity_id and e.id<=9007199254740991 where e.id is null) unresolved_rows
    ,(select coalesce(jsonb_agg(p),'[]'::jsonb) from (
      select * from cohort where ${options.memberId ? q`entity_id=${options.memberId}` : q`true`}
      order by total_numeric desc,entity_id asc limit ${options.allMembers ? PEER_CAPTURE_LIMIT : PEER_PAGE_SIZE}
      offset ${options.allMembers || options.memberId ? 0 : (input.page-1)*PEER_PAGE_SIZE}
    ) p) member_rows from cohort`;
  const count = Number(summary?.n ?? 0);
  if (options.allMembers && count>PEER_CAPTURE_LIMIT) throw new PeerError(`Grupul are ${count} membri. Restrânge județul pentru a salva cel mult ${PEER_CAPTURE_LIMIT} alte entități și sursele lor împreună. Comparația afișată folosește în continuare întregul grup.`,413);
  const rows = (summary?.member_rows ?? []) as Record<string,unknown>[];
  const entities = await readConnectionEntities(q,rows.map(row => String(row.entity_id)),input.role);
  base.members = rows.map(row => member(row,entities.find(candidate => candidate.id===String(row.entity_id))!,filters));
  base.options.counties = (summary?.counties ?? []) as string[];
  base.cohort = { ...base.cohort,count,medianTotalExact:summary?.median_total == null ? null : String(summary.median_total),
    medianMeanRounded:summary?.median_mean == null ? null : String(summary.median_mean),enoughPeers:count>=PEER_MINIMUM_COUNT,status:count>=PEER_MINIMUM_COUNT ? "ready" : "small_sample",
    excludedUnknownType:input.role === "authority" ? Number(summary?.unknown_type ?? 0) : 0,excludedUnknownCounty:input.county ? Number(summary?.unknown_county ?? 0) : 0 };
  base.coverage.unresolvedEntityRows=Number(summary?.unresolved_rows ?? 0);
  base.pagination={page:input.page,pageSize:PEER_PAGE_SIZE,totalPages:Math.ceil(count/PEER_PAGE_SIZE),hasNext:input.page*PEER_PAGE_SIZE<count};
  return base;
}
export async function getLegacyPeers(input: PeerInput,sql=peerDatabase()): Promise<PeersResult> {
  try { return await withMonitoringSnapshot(sql,(q,checkpoint) => getLegacyPeersInSnapshot(q,input,{id:checkpoint.id,version:checkpoint.version,validatedAt:checkpoint.completedAt,sourceCoverage:checkpoint.sourceCoverage}),input.checkpointId); }
  catch(error) { if (error instanceof MonitoringRefreshUnavailableError) throw new PeerError(error.reason === "superseded" ? "Datele s-au schimbat. Reia comparația pe versiunea actuală." : "Datele sunt în curs de verificare. Reîncearcă după finalizarea actualizării.",error.reason === "superseded" ? 409 : 503); throw error; }
}
