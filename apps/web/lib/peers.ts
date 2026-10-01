import { canonicalConnectionSelection } from "./canonical-connections";
import { createDb, withMonitoringSnapshot, MonitoringRefreshUnavailableError, type DbSql } from "@seap/db";
import { DA_PLAFOND_RON } from "./ask/compile";
import { readConnectionEntity, readConnectionEntities, assertConnectionIdentity } from "./connections";
import { peerSourceSpec, peerScopeDescriptions, type PeerInput, type PeerFilters, type PeersResult, type PeerMember, type PeerPopulation, type PeerCandidatesResult, type PeerYear } from "./peers-shared";
import type { ConnectionEntity, ConnectionsResult } from "./connections-shared";
import { parsePeerInput as parseLegacyInput, getLegacyPeersInSnapshot, authorityPeerKind } from "./peers-legacy";
import { PeerError } from "./peer-errors";
import { POPULATION_VERSION, governmentLevel, nearestPopulationMembers, readPopulationMappings, populationFold, populationSearchVariants, peerRolePredicate } from "./peer-population";
export { PeerError, getLegacyPeersInSnapshot, authorityPeerKind };
export const PEER_PAGE_SIZE = 20, PEER_MINIMUM_COUNT = 5, PEER_CAPTURE_LIMIT = 499, PEER_MANUAL_LIMIT = 50;
const database = globalThis as typeof globalThis & { __peerSql?: DbSql };
const peerDatabase = () => database.__peerSql ??= createDb().sql;
const idValid = (id: unknown): id is string => typeof id === "string" && /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
const identityValid = (identity: unknown): identity is string => typeof identity === "string" && /^[a-f0-9]{64}$/.test(identity);

export function parsePeerInput(params: URLSearchParams): PeerInput {
  const extra = ["method","members","populationVersion"], original = new URLSearchParams(params);
  for (const key of extra) { if (params.getAll(key).length>1) throw new PeerError("Filtru necunoscut sau repetat. Comparația nu a fost extinsă."); original.delete(key); }
  const input = parseLegacyInput(original), method = params.get("method"), version = params.get("populationVersion"), membersText = params.get("members");
  if (method !== null && !["population","activity","manual"].includes(method)) throw new PeerError("Metodă de comparație necunoscută.");
  if (version !== null && (!version || version.length>100 || !/^[a-zA-Z0-9.-]+$/.test(version))) throw new PeerError("Versiunea populației nu este validă.");
  if (method !== null) input.method=method as PeerInput["method"] & string;
  if (version !== null) input.populationVersion=version;
  if (membersText !== null) {
    if (method !== "manual" || membersText.length>7000) throw new PeerError("Membrii aleși trebuie folosiți într-o comparație personalizată.");
    let members: unknown; try { members=JSON.parse(membersText); } catch { throw new PeerError("Lista administrațiilor alese nu este validă."); }
    if (!Array.isArray(members) || members.length>PEER_MANUAL_LIMIT) throw new PeerError(`Poți alege cel mult ${PEER_MANUAL_LIMIT} alte entități într-o comparație.`);
    if (members.some(item => !item || typeof item!=="object" || Object.keys(item).some(key=>key!=="id"&&key!=="identity") || !idValid(item.id) || !identityValid(item.identity) || item.id===input.entityId)
      || new Set(members.map(item=>item.id)).size!==members.length) throw new PeerError("Lista conține membri invalizi, repetați sau entitatea analizată.");
    input.members=members.map(item=>({id:item.id as string,identity:item.identity as string}));
  }
  if (method === "manual" && membersText===null) throw new PeerError("Lista membrilor aleși lipsește. Reia comparația.");
  if (method === "manual" && input.county) throw new PeerError("Selecția personalizată stabilește membrii exact. Elimină filtrul județului.");
  return input;
}
function normalize(input: PeerInput): PeerInput {
  return parsePeerInput(new URLSearchParams(Object.entries(input).filter(([,value])=>value!==undefined).map(([key,value])=>[key,key==="members"?JSON.stringify(value):String(value)])));
}
function source(q: DbSql,input: PeerInput,ids: string[],year?: PeerYear,cpv?: string) {
  const column=q(input.role==="authority"?"authority_id":"supplier_id");
  const condition=q`${column}=any(${ids}::bigint[]) and ${year===undefined||year==="all"?q`true`:q`finalization_date>=${`${year}-01-01`} and finalization_date<${`${year+1}-01-01`}`}
    and ${cpv===undefined||cpv==="all"?q`true`:q`cpv_code like ${`${cpv}%`}`}`;
  const da=q`select ${column} entity_id,closing_value,nullif(finalization_date,'') finalization_date,cpv_code,'da'::text src,null::bigint contract_id from marts.da_transactions
    where closing_value>0 and closing_value<=${DA_PLAFOND_RON} and ${condition}`;
  const contracts=q`select ${column} entity_id,closing_value,nullif(finalization_date,'') finalization_date,cpv_code,'contracts'::text src,contract_id from marts.contract_transactions
    where closing_value>0 and ${condition}`;
  return input.dataset==="da"?da:input.dataset==="contracts"?contracts:q`${da} union all ${contracts}`;
}
async function assertRoles(q: DbSql,ids: string[],role: PeerInput["role"]) {
  if (!ids.length) return;
  const valid=await q`select e.id::text id from core.entities e where e.id=any(${ids}::bigint[]) and ${peerRolePredicate(q,role)}`;
  if (valid.length!==ids.length) throw new PeerError("Una dintre entitățile alese nu este disponibilă în rolul cerut. Reia selecția.",409);
}
function makeMember(row: Record<string,unknown>|undefined,entity:ConnectionEntity,filters:PeerFilters,population?:PeerPopulation):PeerMember {
  return {entity,recordCount:Number(row?.record_count??0),totalExact:String(row?.total_exact??"0"),meanRounded:String(row?.mean_rounded??"0"),
    daRows:Number(row?.da_rows??0),contractRows:Number(row?.contract_rows??0),distinctContracts:Number(row?.distinct_contracts??0),
    firstDate:row?.first_date==null?null:String(row.first_date).slice(0,10),lastDate:row?.last_date==null?null:String(row.last_date).slice(0,10),
    spec:peerSourceSpec(entity,filters),...(population?{population}:{}),selectionReason:filters.method==="manual"?"manual":"population"};
}
const populationDescriptions=[
  "Populația rezidentă este cea din recensământul INS la 1 decembrie 2021; nu este o estimare pentru anul achizițiilor ales. Sursa oficială și rândul tabelului sunt păstrate pentru fiecare administrație.",
  "Grupul automat include cele mai apropiate 10 administrații identificate sigur în aplicație, după diferența absolută de populație; egalitățile se ordonează după identificator. Comunele, orașele și municipiile formează același grup. Consiliile județene se compară separat, după populația județului deservit. Sectoarele nu intră în grupul automat.",
  "Legătura dintre instituție și teritoriul deservit cere CUI valid, denumire de administrație principală și identificare unică a localității și județului. Legăturile ambigue și instituțiile subordonate sunt excluse; grupul nu acoperă administrațiile care nu pot fi identificate sigur în datele aplicației.",
  "Anul, canalul de achiziții și diviziunea CPV schimbă măsurătorile, nu admiterea în grupul bazat pe populație. Filtrul județului restrânge teritoriul deservit al grupului automat.",
  "Membrii fără înregistrări eligibile rămân în listă cu date lipsă; nu presupunem cheltuieli zero. Mediana exclude entitatea analizată și membrii fără înregistrări. Sub cinci alți membri cu date, grupul este prea mic pentru interpretare comparativă.",
  "Valorile sunt valori înregistrate, nu plăți. Contractele cu mai mulți câștigători sunt alocări pe furnizor; numărul de înregistrări nu este numărul contractelor distincte. Media pe înregistrare nu este un preț unitar. Un an încheiat nu garantează colectare completă. Diferențele nu stabilesc o neregulă.",
  "Sunt incluse valori pozitive; achizițiile directe peste plafonul tehnic de 2 milioane lei sunt excluse. Înregistrările fără an sau CPV utilizabil nu intră în măsurători.",
];
/** Analytic shared gate and repeatable-read snapshot are required. Legacy receipts call the separate unchanged getter. */
export async function getPeersInSnapshot(q:DbSql,raw:PeerInput,checkpoint:ConnectionsResult["checkpoint"],options:{allMembers?:boolean;memberId?:string}={}):Promise<PeersResult> {
  let input=normalize(raw);await q`set local statement_timeout='20s'`;
  input=await canonicalConnectionSelection(q,input);
  const entity=await readConnectionEntity(q,input.entityId,input.role);assertConnectionIdentity(entity,input.identity);
  if(input.checkpointId&&input.checkpointId!==checkpoint.id)throw new PeerError("Datele s-au schimbat. Reia comparația înainte de a continua.",409);
  // Existing copied URLs were pinned before a method parameter existed. Keep their meaning.
  const defaultMethod=input.role==="authority"&&governmentLevel(entity.name)?"population":"activity";
  const method=input.method??(input.checkpointId?"activity":defaultMethod);
  if(method==="activity"){
    const {method:_method,populationVersion:_version,members:_members,...legacyInput}=input;
    const result=await getLegacyPeersInSnapshot(q,legacyInput,checkpoint,options);
    return {...result,filters:{...result.filters,method,populationVersion:POPULATION_VERSION},methodology:{...result.methodology,method,defaultMethod},cohort:{...result.cohort,observedMemberCount:result.cohort.count}};
  }
  if(input.populationVersion&&input.populationVersion!==POPULATION_VERSION)throw new PeerError("Sursa populației s-a schimbat. Reia comparația înainte de a continua.",409);
  if(method==="population"&&input.role!=="authority")throw new PeerError("Comparația după populație este disponibilă pentru administrațiile locale și județene.");
  await assertRoles(q,[input.entityId,...(input.members??[]).map(item=>item.id)],input.role);
  const populationIndex=input.role==="authority"?await readPopulationMappings(q):new Map<string,PeerPopulation>();
  const focalPopulation=populationIndex.get(input.entityId);
  const selectedIds=method==="manual"?(input.members??[]).map(item=>item.id):nearestPopulationMembers(populationIndex,input.entityId,input.county).map(([id])=>id);
  const selectedEntities=await readConnectionEntities(q,selectedIds,input.role);
  for(const selected of input.members??[]){const item=selectedEntities.find(item=>item.id===selected.id);if(!item)throw new PeerError("O entitate aleasă nu mai este disponibilă.",409);assertConnectionIdentity(item,selected.identity);}
  const focalSource=source(q,input,[input.entityId]);
  const yearRows=await q`with s as (${focalSource}) select distinct substr(finalization_date,1,4)::int as year from s where finalization_date ~ '^20[0-9]{2}-' order by year desc`;
  const years=yearRows.map(row=>Number(row.year)),currentYear=new Date().getUTCFullYear(),year=input.year??years.find(candidate=>candidate<currentYear)??years[0]??null;
  const yearSource=source(q,input,[input.entityId],year??undefined);
  const divisions=year===null?[]:await q`with s as (${yearSource}),g as(select left(cpv_code,2) code,count(*)::int row_count,sum(closing_value) total from s where cpv_code ~ '^[0-9]{2}' group by left(cpv_code,2))
    select g.code,coalesce((select c.name_ro from core.cpv_codes c where c.code like g.code||'000000-%' limit 1),'CPV '||g.code) label,g.row_count,trim_scale(g.total)::text total_exact from g order by total desc,code`;
  const cpv=input.cpv??(divisions[0]?String(divisions[0].code):null);
  const filters:PeerFilters={dataset:input.dataset,year,cpv,page:method==="manual"?1:input.page,method,populationVersion:POPULATION_VERSION,...(input.county?{county:input.county}:{}),...(method==="manual"?{members:input.members??[]}: {})};
  const [coverage]=await q`with s as (${focalSource}) select count(*) filter(where finalization_date is null or finalization_date !~ '^20[0-9]{2}-')::int undated,
    count(*) filter(where ${year===null?q`false`:year==="all"?q`true`:q`finalization_date>=${`${year}-01-01`} and finalization_date<${`${year+1}-01-01`}`} and (cpv_code is null or cpv_code !~ '^[0-9]{2}'))::int missing_cpv from s`;
  const descriptions=method==="manual"?[
    "Grup personalizat: membrii sunt aleși explicit de utilizator.",...populationDescriptions.filter((_,index)=>index!==1&&index!==3),
  ]:populationDescriptions;
  if(method==="manual")descriptions[0]="Grup personalizat: membrii sunt aleși explicit de utilizator, fără un criteriu automat de populație, tip sau județ. Populația se afișează numai pentru administrațiile identificate sigur. Maximum 50 de alte entități.";
  const result:PeersResult={entity,focal:null,filters,suggested:{year:input.year===undefined,cpv:input.cpv===undefined},options:{years,divisions:divisions.map(row=>({code:String(row.code),label:String(row.label),rowCount:Number(row.row_count),totalExact:String(row.total_exact)})),
    counties:[...new Set([...populationIndex.values()].filter(item=>item.level===focalPopulation?.level).map(item=>item.county))].sort((a,b)=>a.localeCompare(b,"ro"))},
    cohort:{count:selectedIds.length,minimumRecords:0,maximumRecords:0,authorityKind:input.role==="authority"?authorityPeerKind(entity.name):null,medianTotalExact:null,medianMeanRounded:null,enoughPeers:false,
      status:method==="population"&&!focalPopulation?"unknown_population":selectedIds.length?"small_sample":"no_selection",excludedUnknownType:0,excludedUnknownCounty:0,observedMemberCount:0,missingPopulationCount:selectedIds.filter(id=>!populationIndex.has(id)).length},
    coverage:{focalUndatedRows:Number(coverage?.undated??0),focalYearMissingCpvRows:Number(coverage?.missing_cpv??0),unresolvedEntityRows:0},members:[],
    pagination:method==="manual"?{page:1,pageSize:PEER_MANUAL_LIMIT,totalPages:selectedIds.length?1:0,hasNext:false}:{page:input.page,pageSize:PEER_PAGE_SIZE,totalPages:Math.ceil(selectedIds.length/PEER_PAGE_SIZE),hasNext:input.page*PEER_PAGE_SIZE<selectedIds.length},checkpoint,
    methodology:{version:"peers-2",method,defaultMethod,populationVersion:POPULATION_VERSION,descriptions:peerScopeDescriptions(descriptions,year,cpv)}};
  if(year===null||cpv===null){result.cohort.status="no_focal_records";return result;}
  const selectedSource=source(q,input,[input.entityId,...selectedIds],year,cpv);
  const [summary]=await q`with s as (${selectedSource}),stats as(
    select entity_id,count(*)::int record_count,trim_scale(sum(closing_value))::text total_exact,round(avg(closing_value),2)::text mean_rounded,
      count(*) filter(where src='da')::int da_rows,count(*) filter(where src='contracts')::int contract_rows,count(distinct contract_id)::int distinct_contracts,
      min(finalization_date) first_date,max(finalization_date) last_date,sum(closing_value) total_numeric,avg(closing_value) mean_numeric from s group by entity_id
    ),ranked as(select *,row_number() over(order by total_numeric,entity_id) total_rank,row_number() over(order by mean_numeric,entity_id) mean_rank,count(*) over() n from stats where entity_id<>${input.entityId})
    select (select count(*)::int from ranked) observed,
      (select trim_scale(avg(total_numeric))::text from ranked where total_rank in ((n+1)/2,(n+2)/2)) median_total,
      (select round(avg(mean_numeric),2)::text from ranked where mean_rank in ((n+1)/2,(n+2)/2)) median_mean,
      (select coalesce(jsonb_agg(to_jsonb(stats)||jsonb_build_object('entity_id',entity_id::text)),'[]'::jsonb) from stats) member_rows`;
  const rows=(summary?.member_rows??[]) as Record<string,unknown>[];
  result.focal=makeMember(rows.find(row=>row.entity_id===input.entityId),entity,filters,focalPopulation?{...focalPopulation,differencePercent:0}:undefined);
  const observed=Number(summary?.observed??0);result.cohort.observedMemberCount=observed;
  result.cohort.medianTotalExact=summary?.median_total==null?null:String(summary.median_total);result.cohort.medianMeanRounded=summary?.median_mean==null?null:String(summary.median_mean);
  result.cohort.enoughPeers=observed>=PEER_MINIMUM_COUNT;
  if(result.cohort.status!=="unknown_population"&&result.cohort.status!=="no_selection")result.cohort.status=observed>=PEER_MINIMUM_COUNT?"ready":"small_sample";
  const visibleIds=options.memberId?selectedIds.filter(id=>id===options.memberId):options.allMembers||method==="manual"?selectedIds:selectedIds.slice((input.page-1)*PEER_PAGE_SIZE,input.page*PEER_PAGE_SIZE);
  result.members=visibleIds.map(id=>{
    const population=populationIndex.get(id),relative=population?{...population,differencePercent:focalPopulation&&population.level===focalPopulation.level?Math.round((population.value-focalPopulation.value)/focalPopulation.value*10000)/100:null}:undefined;
    return makeMember(rows.find(row=>row.entity_id===id),selectedEntities.find(item=>item.id===id)!,filters,relative);
  });
  return result;
}
function refreshError(error:unknown):never {
  if(error instanceof MonitoringRefreshUnavailableError)throw new PeerError(error.reason==="superseded"?"Datele s-au schimbat. Reia comparația pe versiunea actuală.":"Datele sunt în curs de verificare. Reîncearcă după finalizarea actualizării.",error.reason==="superseded"?409:503);
  throw error;
}
export async function getPeers(input:PeerInput,sql=peerDatabase()):Promise<PeersResult>{
  try{return await withMonitoringSnapshot(sql,(q,checkpoint)=>getPeersInSnapshot(q,input,{id:checkpoint.id,version:checkpoint.version,validatedAt:checkpoint.completedAt,sourceCoverage:checkpoint.sourceCoverage}),input.checkpointId);}catch(error){refreshError(error);}
}
export interface PeerCandidatesInput {entityId:string;role:PeerInput["role"];search:string;identity?:string;checkpointId?:string;populationVersion?:string}
export function parsePeerCandidatesInput(params:URLSearchParams):PeerCandidatesInput {
  const allowed=new Set(["entityId","role","search","identity","checkpointId","populationVersion"]);
  for(const [key]of params)if(!allowed.has(key)||params.getAll(key).length>1)throw new PeerError("Filtru de căutare necunoscut sau repetat.");
  const search=(params.get("search")??"").trim();if(search.length<2||search.length>100)throw new PeerError("Scrie între 2 și 100 de caractere din nume sau CUI.");
  const remaining=new URLSearchParams(params);remaining.delete("search");const input=parsePeerInput(remaining);
  return {entityId:input.entityId,role:input.role,search,...(input.identity?{identity:input.identity}:{}),...(input.checkpointId?{checkpointId:input.checkpointId}:{}),...(input.populationVersion?{populationVersion:input.populationVersion}:{})};
}
export async function getPeerCandidates(input:PeerCandidatesInput,sql=peerDatabase()):Promise<PeerCandidatesResult> {
  try{return await withMonitoringSnapshot(sql,async(q,checkpoint)=>{
    await q`set local statement_timeout='10s'`;
    input=await canonicalConnectionSelection(q,input);
    const focal=await readConnectionEntity(q,input.entityId,input.role);assertConnectionIdentity(focal,input.identity);
    if(input.populationVersion&&input.populationVersion!==POPULATION_VERSION)throw new PeerError("Sursa populației s-a schimbat. Reia comparația.",409);
    const index=input.role==="authority"?await readPopulationMappings(q):new Map<string,PeerPopulation>();
    const search=populationFold(input.search),cui=search.replace(/^ro\s*/,""),patterns=populationSearchVariants(input.search).map(value=>`%${value.replace(/[\\%_]/g,"\\$&")}%`);
    const rows=await q`select e.id::text id from core.entities e where not exists(select 1 from core.entity_redirects r where r.old_id=e.id) and e.id<>${input.entityId} and e.id<=9007199254740991
      and (e.name_normalized like any(${patterns}::text[]) or e.cui_canonical=${cui}) and ${peerRolePredicate(q,input.role)}
      order by case when e.cui_canonical=${cui} then 0 else 1 end,
        case when e.id=any(${[...index.keys()]}::bigint[]) then 0 else 1 end,
        case when e.cui_valid then 0 else 1 end,e.name_display,e.id limit 21`;
    const entities=await readConnectionEntities(q,rows.slice(0,20).map(row=>String(row.id)),input.role);
    const focalPopulation=index.get(input.entityId);
    return {items:rows.slice(0,20).map(row=>{const entity=entities.find(item=>item.id===String(row.id))!,population=index.get(entity.id);return {entity,...(population?{population:{...population,differencePercent:focalPopulation&&focalPopulation.level===population.level?Math.round((population.value-focalPopulation.value)/focalPopulation.value*10000)/100:null}}:{})};}),
      checkpoint:{id:checkpoint.id,version:checkpoint.version,validatedAt:checkpoint.completedAt,sourceCoverage:checkpoint.sourceCoverage},populationVersion:POPULATION_VERSION,hasMore:rows.length>20};
  },input.checkpointId);}catch(error){refreshError(error);}
}
