import { randomUUID } from "node:crypto";
import { createDb, getMonitoringRefreshStatus, withMonitoringSnapshot, MonitoringRefreshUnavailableError, type DbSql, type MonitoringCheckpoint } from "@seap/db";
import { runRows, runSpec, useSnapshotCoverage } from "./ask/compile";
import type { AskSpec } from "./ask/spec";
import type { Grounding } from "./ask/ground";
import { isHistoricalProfile } from "./ask/population";
import { captureTransaction, CAPTURE_METHODOLOGY } from "./evidence-captures";
import { MonitoringError,monitoringHasLocalSelection,MONITORING_LOCAL_SCOPE_NOTE } from "./monitoring-input";
import { MONITORING_MAX_ROWS, type MonitoringPreferences } from "./monitoring-shared";
import { assertMonitoringBindings } from "./monitoring-identity";

const globalDb=globalThis as unknown as {__monitoringSql?:DbSql};
export const monitoringDatabase=()=>globalDb.__monitoringSql??=createDb().sql;
const json=(value:unknown)=>JSON.stringify(value??null);
export const MONITORING_METHODOLOGY={version:"monitoring-1",sources:CAPTURE_METHODOLOGY,
  identity:"DA: identificatorul SEAP; contract: identificatorul SEAP al contractului și identitatea fiscală sau SEAP a furnizorului. Pentru un furnizor fără identificator natural folosim explicit o identitate provizorie; nu presupunem identități comune numai din nume. Entitățile fixate în selecție sunt reverificate după reconstruiri.",
  discovery:"Prima observare în această selecție nu dovedește data importului. Ieșirea din selecție nu dovedește ștergerea din SEAP.",
  classification:"Data achiziției este comparată cu ziua precedentei verificări: o dată ulterioară este recentă; o dată anterioară este istorică, observată acum. Datele lipsă sau viitoare rămân neclasificate.",
};
export function refreshError(error:unknown):MonitoringError {
  if(error instanceof MonitoringError)return error;
  if(error instanceof MonitoringRefreshUnavailableError)return new MonitoringError("Datele nu au încă o actualizare completă și verificată. Urmărirea va putea fi verificată după încheierea actualizării; ultimul rezultat bun este păstrat.",409);
  if((error as {code?:string})?.code==="40001")return new MonitoringError("Urmărirea a fost modificată în timpul verificării. Nu am publicat rezultate parțiale; reîncearcă.",409);
  return new MonitoringError("Verificarea nu a putut fi încheiată. Ultimul rezultat complet este păstrat; această eroare nu înseamnă că nu s-a schimbat nimic.",503);
}

async function persistPopulation(q:DbSql,runId:string,source:ReturnType<DbSql>){
  // The extra row is an explicit overflow detector, never a published sample.
  await q`insert into app.monitoring_run_rows(run_id,source_key,row_no,record,value_exact)
    select ${runId},src_key,row_number() over(order by src_key),record,value from (
      select case when r.src='da' then 'da:'||r.ref_id::text
        else 'contract:'||c.ca_notice_contract_id::text||':supplier:'||identity.supplier_key end src_key,
      jsonb_build_object('src',r.src,'refId',case when r.src='contracts' then c.ca_notice_contract_id::text else r.ref_id::text end,
        'daCode',r.da_code,'date',left(r.finalization_date,10),'authorityId',r.authority_id::text,'authority',r.authority_name,
        'supplierId',r.supplier_id::text,'supplier',r.supplier_name,'supplierIdentity',identity.supplier_key,'authorityIdentity',identity.authority_key,'county',r.county,'cpvCode',r.cpv_code,'cpvName',r.cpv_name,
        'valueExact',trim_scale(r.closing_value::numeric)::text,'caNoticeId',r.ca_notice_id::text,'tedPubnum',r.ted_pubnum,
        'state',r.state,'nWinners',r.n_winners,'contractValueFull',trim_scale(r.contract_value_full::numeric)::text,
        'valueSuspect',coalesce(r.value_suspect,false),
        'sourceUrl',case when r.src='da' then 'https://e-licitatie.ro/pub/direct-acquisition/view/'||r.ref_id::text
          when r.ca_notice_id is not null then 'https://e-licitatie.ro/pub/notices/ca-notices/view-c/'||r.ca_notice_id::text else null end,
        'tedUrl',case when r.ted_pubnum ~ '^[0-9-]+$' then 'https://ted.europa.eu/en/notice/-/detail/'||r.ted_pubnum else null end) record,
      r.closing_value::numeric value from (${source}) r left join core.contracts c on r.src='contracts' and c.id=r.ref_id
      left join core.entities supplier on supplier.id=r.supplier_id left join core.entities authority on authority.id=r.authority_id
      cross join lateral(select coalesce(
        case when supplier.cui_valid then 'cui:'||supplier.cui_canonical end,
        case when supplier.foreign_id_norm is not null and supplier.country_code is not null then 'foreign:'||supplier.country_code||':'||supplier.foreign_id_norm end,
        (select 'sicap:'||s.namespace||':'||s.sicap_id::text from core.entity_sicap_ids s where s.entity_id=r.supplier_id order by s.namespace,s.sicap_id limit 1),
        case when r.supplier_id is not null then 'unverified:'||r.supplier_id::text||':'||md5(concat_ws('|',supplier.name_normalized,supplier.country_code,supplier.county)) else 'unknown' end) supplier_key,
      coalesce(case when authority.cui_valid then 'cui:'||authority.cui_canonical end,
        case when authority.foreign_id_norm is not null and authority.country_code is not null then 'foreign:'||authority.country_code||':'||authority.foreign_id_norm end,
        (select 'sicap:'||s.namespace||':'||s.sicap_id::text from core.entity_sicap_ids s where s.entity_id=r.authority_id order by s.namespace,s.sicap_id limit 1),
        case when r.authority_id is not null then 'unverified:'||r.authority_id::text||':'||md5(concat_ws('|',authority.name_normalized,authority.country_code,authority.county)) else 'unknown' end) authority_key) identity
      limit ${MONITORING_MAX_ROWS+1}
    ) frozen`;
}

async function persistDeltas(q:DbSql,runId:string,previousId:string,previousAt:string,observedAt:string,prefs:MonitoringPreferences){
  await q`insert into app.monitoring_deltas(run_id,row_no,source_key,type,classification,before_record,after_record,changed_fields,amount_difference_exact,relevant)
    select ${runId},row_number() over(order by source_key),source_key,type,
      case when type='removed' then 'left_selection' when type='changed' then 'source_changed'
        when source_date is null or source_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or source_date>left(${observedAt}::text,10) then 'date_unknown'
        when source_date>left(${previousAt}::text,10) then 'new_dated_record' else 'historical_first_observed' end,
      before_record,after_record,
      coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(coalesce(before_record,'{}'::jsonb)||coalesce(after_record,'{}'::jsonb)) k
        where k not in ('authorityId','supplierId') and before_record->k is distinct from after_record->k),'[]'::jsonb),
      case when (before_record is not null and before_value is null) or (after_record is not null and after_value is null) then null
        else coalesce(after_value,0)-coalesce(before_value,0) end,
      type=any(${prefs.types}::text[]) and ((${prefs.minimumValueExact}::numeric=0) or coalesce(greatest(abs(before_value),abs(after_value))>=${prefs.minimumValueExact}::numeric,false))
    from (select coalesce(a.source_key,b.source_key) source_key,b.record before_record,a.record after_record,b.value_exact before_value,a.value_exact after_value,
      case when b.source_key is null then 'added' when a.source_key is null then 'removed' else 'changed' end type,
      a.record->>'date' source_date
      from (select * from app.monitoring_run_rows where run_id=${runId}) a
      full outer join (select * from app.monitoring_run_rows where run_id=${previousId}) b using(source_key)
      where (a.record-array['authorityId','supplierId']) is distinct from (b.record-array['authorityId','supplierId'])) differences`;
}

/** All publication and source copying happens under the coordinated refresh gate. */
export async function evaluateMonitoringWatch(watchId:string,expectedCheckpointId?:string,sql=monitoringDatabase()):Promise<string|null>{
  const attemptAt=new Date().toISOString();
  try{return await withMonitoringSnapshot(sql,async(q,checkpoint)=>{
    const [lock]=await q`select pg_try_advisory_xact_lock(hashtextextended(${"monitoring:"+watchId},0)) locked`;
    if(!lock?.locked)return null;
    const [watch]=await q`select * from app.monitoring_watches where id=${watchId}`;
    if(!watch||watch.paused)return null;
    const [existing]=await q`select id::text from app.monitoring_runs where watch_id=${watchId} and checkpoint_id=${checkpoint.id}`;
    if(existing)return String(existing.id);
    const previous=watch.last_success_run_id?(await q`select *,to_char(checked_at at time zone 'Europe/Bucharest','YYYY-MM-DD"T"HH24:MI:SS') observed_at from app.monitoring_runs where id=${watch.last_success_run_id} and watch_id=${watchId}`)[0]:null;
    if(previous&&BigInt((previous.checkpoint as MonitoringCheckpoint).version)>=BigInt(checkpoint.version))throw new MonitoringError("Această actualizare a fost deja verificată.",409);
    const spec=watch.spec as AskSpec,grounding=watch.grounding as Grounding,prefs=watch.preferences as MonitoringPreferences;
    await assertMonitoringBindings(q,spec,grounding,watch.options);
    const database=useSnapshotCoverage(captureTransaction(q)),answer=await runSpec(database,spec,grounding);
    if("error"in answer)throw new MonitoringError(answer.error,422);
    const runId=randomUUID(),methodology={...MONITORING_METHODOLOGY,refresh:checkpoint.methodology};
    const [time]=await q`select to_char(transaction_timestamp() at time zone 'Europe/Bucharest','YYYY-MM-DD"T"HH24:MI:SS') observed_at`;
    const observedAt=String(time!.observed_at);
    await q`insert into app.monitoring_runs(id,watch_id,checkpoint_id,previous_run_id,kind,row_count,known_value_exact,counts,relevant_counts,preferences,result,methodology,checkpoint,notes)
      values(${runId},${watchId},${checkpoint.id},${previous?.id??null},'baseline',0,0,'{}','{}',${json(prefs)}::jsonb,${json(answer.data)}::jsonb,${json(methodology)}::jsonb,${json(checkpoint)}::jsonb,'[]')`;
    const sources=await runRows(database,spec,grounding,0,{...watch.options,capture:{maxRows:MONITORING_MAX_ROWS,persist:(database,query)=>persistPopulation(database,runId,query)}});
    if("error"in sources)throw new MonitoringError(sources.error,422);
    if(sources.total>MONITORING_MAX_ROWS)throw new MonitoringError(`Selecția are ${sources.total.toLocaleString("ro-RO")} de înregistrări; o urmărire poate include cel mult 200.000. Restrânge perioada, instituția sau domeniul. Nu am salvat un eșantion.`,422);
    const [totals]=await q`select count(*)::int n,trim_scale(coalesce(sum(value_exact),0))::text known,count(*) filter(where value_exact is null)::int unknown,
      coalesce(sum(value_exact),0)=${sources.value}::numeric reconciled from app.monitoring_run_rows where run_id=${runId}`;
    if(totals!.n!==sources.total||!totals!.reconciled)throw new MonitoringError("Lista surselor nu se reconciliază cu selecția. Verificarea nu a fost publicată.",422);
    if(previous)await persistDeltas(q,runId,String(previous.id),String(previous.observed_at),observedAt,prefs);
    const [counts]=await q`select count(*) filter(where type='added')::int added,count(*) filter(where type='removed')::int removed,count(*) filter(where type='changed')::int changed,
      count(*) filter(where type='added' and relevant)::int relevant_added,count(*) filter(where type='removed' and relevant)::int relevant_removed,count(*) filter(where type='changed' and relevant)::int relevant_changed
      from app.monitoring_deltas where run_id=${runId}`;
    const [comparisons]=await q`select ${previous?json(previous.result):null}::jsonb is distinct from ${json(answer.data)}::jsonb result_changed,
      ${previous?json(previous.methodology):null}::jsonb is distinct from ${json(methodology)}::jsonb methodology_changed,
      case when ${previous?.total_exact??null}::numeric is not null and ${totals!.unknown}=0 then ${totals!.known}::numeric-${previous?.total_exact??null}::numeric else null end::text difference`;
    // The parent result does not describe an optional drawer subgroup/search.
    // Retain it as context, but it cannot alert on changes outside that list.
    const localSelection=monitoringHasLocalSelection(watch.options);
    const resultChanged=!localSelection&&!!previous&&!!comparisons!.result_changed,methodologyChanged=!!previous&&!!comparisons!.methodology_changed;
    const all={added:counts!.added,removed:counts!.removed,changed:counts!.changed},relevant={added:counts!.relevant_added,removed:counts!.relevant_removed,changed:counts!.relevant_changed};
    const sourceChanges=all.added+all.removed+all.changed;
    // Ordinary aggregates naturally change with their rows. Historical profile
    // recalculations remain an independent event even when records also change.
    const recalculated=resultChanged&&(isHistoricalProfile(spec)||sourceChanges===0);
    const hasAlert=!!previous&&(relevant.added+relevant.removed+relevant.changed>0||recalculated&&prefs.types.includes("recalculated")||methodologyChanged&&prefs.types.includes("methodology"));
    const notes=[...answer.caveats,...sources.scopeNotes,...(localSelection?[MONITORING_LOCAL_SCOPE_NOTE]:[]),"Primele observații istorice nu sunt confirmări ale datei importului.",...(previous?[]:["Acesta este punctul de plecare. Înregistrările existente nu generează alerte."]),...(resultChanged?["Rezultatul calculat s-a schimbat; sursele și metodologia pot fi verificate separat."]:[])];
    // A pause/preference edit committed during the read aborts this RR
    // publication; it cannot publish under an outdated owner decision.
    await q`select id from app.monitoring_watches where id=${watchId} for update`;
    await q`update app.monitoring_runs set kind=${!previous?"baseline":sourceChanges||resultChanged||methodologyChanged?"update":"unchanged"},
      row_count=${totals!.n},total_exact=${totals!.unknown?null:totals!.known},known_value_exact=${totals!.known},unknown_values=${totals!.unknown},previous_total_exact=${previous?.total_exact??null},total_difference_exact=${comparisons!.difference},
      counts=${json(all)}::jsonb,relevant_counts=${json(relevant)}::jsonb,has_alert=${hasAlert},result_changed=${resultChanged},methodology_changed=${methodologyChanged},notes=${json(notes)}::jsonb where id=${runId}`;
    await q`update app.monitoring_watches set last_success_run_id=${runId},last_success_at=now(),last_attempt_at=now(),last_error=null where id=${watchId}`;
    return runId;
  },expectedCheckpointId);}catch(error){
    const failure=refreshError(error);
    await sql`update app.monitoring_watches set last_error=${failure.message},last_attempt_at=${attemptAt}::timestamptz
      where id=${watchId} and (last_attempt_at is null or last_attempt_at<=${attemptAt}::timestamptz)`;
    throw failure;
  }
}

export async function checkAllMonitoringWatches(opts:{checkpointId?:string;limit?:number}={},sql=monitoringDatabase()){
  const limit=opts.limit??100;
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new MonitoringError("Limita verificărilor trebuie să fie între 1 și 1.000.");
  const status=await getMonitoringRefreshStatus(sql);
  if(!status.available||!status.current||opts.checkpointId&&opts.checkpointId!==status.current.id)throw new MonitoringError("Nu există o actualizare completă și verificată potrivită. Nu am verificat urmăriri.",409);
  const checkpointId=status.current.id;
  const watches=await sql`select w.id::text from app.monitoring_watches w where not w.paused
    and not exists(select 1 from app.monitoring_runs r where r.watch_id=w.id and r.checkpoint_id=${checkpointId})
    order by w.last_attempt_at nulls first,w.created_at,w.id limit ${limit}`;
  let completed=0,failed=0,skipped=0;
  for(const watch of watches){try{const id=await evaluateMonitoringWatch(watch.id,checkpointId,sql);if(id)completed++;else skipped++;}catch{failed++;}}
  return {checkpointId,selected:watches.length,completed,failed,skipped,moreMayRemain:watches.length===limit};
}
