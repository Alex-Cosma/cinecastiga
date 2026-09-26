import { randomUUID } from "node:crypto";
import type { DbSql } from "@seap/db";
import { isWorkspaceId, withInvestigationAccess } from "./investigation-access";
import { monitoringDatabase, MONITORING_METHODOLOGY } from "./monitoring-engine";
import { MonitoringError } from "./monitoring-input";
import type { MonitoringCaseResult } from "./monitoring-shared";

const json=(v:unknown)=>JSON.stringify(v??null);
/** Copy ORIGINAL saved observations, never recompute their present-day scope. */
export async function addMonitoringRunToCase(userId:string,watchId:string,runId:string,investigationId:string,createTask=false,sql=monitoringDatabase()):Promise<MonitoringCaseResult|null>{
  if(![watchId,runId,investigationId].every(isWorkspaceId))return null;
  return withInvestigationAccess(userId,investigationId,"edit",async q=>{
    const [run]=await q`select r.*,w.title watch_title,w.spec,w.options,w.grounding from app.monitoring_runs r join app.monitoring_watches w on w.id=r.watch_id
      where r.id=${runId} and w.id=${watchId} and w.owner_user_id=${userId}`;
    if(!run)return null;
    if(run.kind!=="update"||!run.previous_run_id)throw new MonitoringError("Alege o actualizare cu o verificare anterioară pentru a păstra diferența în anchetă.",422);
    const [existing]=await q`select * from app.monitoring_case_links where run_id=${runId} and investigation_id=${investigationId}`;
    if(existing){
      let taskId=existing.task_id;
      if(createTask&&!taskId){taskId=await verificationTask(q,userId,investigationId,run,existing.clip_id);await q`update app.monitoring_case_links set task_id=${taskId} where run_id=${runId} and investigation_id=${investigationId}`;}
      return {investigationId,clipId:String(existing.clip_id),beforeCaptureId:String(existing.before_capture_id),afterCaptureId:String(existing.after_capture_id),taskId:taskId?String(taskId):null};
    }
    const [previous]=await q`select * from app.monitoring_runs where id=${run.previous_run_id} and watch_id=${watchId}`;
    if(!previous)throw new MonitoringError("Verificarea anterioară nu este disponibilă. Nu am înlocuit-o cu date actuale.",409);
    const clipId=randomUUID(),beforeCaptureId=randomUUID(),afterCaptureId=randomUUID();
    const [deltaCount]=await q`select count(*)::int n from app.monitoring_deltas where run_id=${runId}`;
    const context={watchId,runId,previousRunId:String(previous.id),watchTitle:run.watch_title,spec:run.spec,options:run.options,grounding:run.grounding,
      checkpoint:run.checkpoint,previousCheckpoint:previous.checkpoint,counts:run.counts,relevantCounts:run.relevant_counts,
      beforeTotalExact:previous.total_exact,afterTotalExact:run.total_exact,totalDifferenceExact:run.total_difference_exact,
      resultChanged:run.result_changed,methodologyChanged:run.methodology_changed,
      sourceSelection:deltaCount!.n?"changed_records_only":"complete_unchanged_populations_for_recalculation",
      notes:run.notes,deltaMetadata:"Fiecare rând modificat păstrează în monitoringChange clasificarea, câmpurile schimbate și identitatea comună ambelor versiuni."};
    await q`insert into app.clips(id,investigation_id,kind,ref_id,spec,snapshot,created_by,note)
      values(${clipId},${investigationId},'monitoring',${runId},${json(run.spec)}::jsonb,${json({title:"Actualizare · "+run.watch_title,verification:"server-verified",monitoring:context})}::jsonb,${userId},${"Actualizare urmărită: "+run.watch_title})`;
    for(const [side,captureId,original,version] of [["before",beforeCaptureId,previous,1],["after",afterCaptureId,run,2]] as const){
      const column=side==="before"?q`before_record`:q`after_record`;
      await q`insert into app.evidence_captures(id,investigation_id,clip_id,version,created_by,status,request,summary,result,coverage,methodology,row_count,total_exact,started_at,completed_at)
        values(${captureId},${investigationId},${clipId},${version},${userId},'complete',${json({kind:"monitoring",refId:runId,spec:run.spec,options:run.options})}::jsonb,
        '{}',${json({...context,monitoringSide:side,originalResult:original.result,previousResult:previous.result,currentResult:run.result})}::jsonb,
        ${json(original.checkpoint)}::jsonb,${json(original.methodology??MONITORING_METHODOLOGY)}::jsonb,0,0,now(),now())`;
      if(deltaCount!.n){
        await q`insert into app.evidence_capture_rows(capture_id,row_no,record,value_exact)
          select ${captureId},row_number() over(order by row_no),${column}||jsonb_build_object('monitoringChange',jsonb_build_object('sourceKey',source_key,'type',type,'classification',classification,'changedFields',changed_fields,'amountDifferenceExact',amount_difference_exact::text,'relevant',relevant)),
            (${column}->>'valueExact')::numeric from app.monitoring_deltas where run_id=${runId} and ${column} is not null`;
      }else{
        await q`insert into app.evidence_capture_rows(capture_id,row_no,record,value_exact)
          select ${captureId},row_no,record,value_exact from app.monitoring_run_rows where run_id=${original.id}`;
      }
      const [totals]=await q`select count(*)::int n,coalesce(sum(value_exact),0)::text known,count(*) filter(where value_exact is null)::int unknown from app.evidence_capture_rows where capture_id=${captureId}`;
      const exact=totals!.unknown?null:String(totals!.known);
      const summary={...context,title:`${side==="before"?"Înainte":"După"} · ${run.watch_title}`,monitoringSide:side,capturedAt:original.checked_at,originalRunId:original.id,
        verification:"server-verified",complete:true,rowCount:totals!.n,totalExact:exact,knownValueExact:totals!.known,unknownValues:totals!.unknown,valueRon:exact,sourceTotals:{count:totals!.n,value:exact},
        warnings:["Copie a observației originale din Urmăriri. Datele nu au fost recalculate la adăugarea în anchetă.",deltaCount!.n?"Lista conține numai rândurile schimbate, pe această parte a comparației. Totalurile selecției integrale rămân în context.":"Sursele nu s-au schimbat; cele două populații complete permit verificarea recalculării rezultatului sau metodologiei."]};
      await q`update app.evidence_captures set summary=${json(summary)}::jsonb,row_count=${totals!.n},total_exact=${exact} where id=${captureId}`;
    }
    const taskId=createTask?await verificationTask(q,userId,investigationId,run,clipId):null;
    await q`insert into app.monitoring_case_links(run_id,investigation_id,clip_id,before_capture_id,after_capture_id,task_id) values(${runId},${investigationId},${clipId},${beforeCaptureId},${afterCaptureId},${taskId})`;
    await q`update app.investigations set updated_at=now() where id=${investigationId}`;
    return {investigationId,clipId,beforeCaptureId,afterCaptureId,taskId};
  },sql);
}
async function verificationTask(q:DbSql,userId:string,investigationId:string,run:Record<string,unknown>,clipId:string){
  const taskId=randomUUID(),title=`Verifică actualizarea: ${String(run.watch_title).slice(0,250)}`;
  const body=`Compară probele înainte/după din dovada ${clipId}.\nUrmărire: /urmariri/${run.watch_id}/actualizari/${run.id}\nVerifică sursele SEAP și posibile explicații alternative înainte de a formula o concluzie. O schimbare a selecției nu dovedește o neregulă.`;
  await q`insert into app.workspace_entries(id,investigation_id,kind,title,body,alternative,status,created_by,updated_by)
    values(${taskId},${investigationId},'task',${title},${body},'','open',${userId},${userId})`;
  await q`insert into app.workspace_revisions(entry_id,revision,content,actor_id)
    values(${taskId},1,${json({kind:"task",title,body,alternative:"",status:"open",occurredOn:null,deleted:false})}::jsonb,${userId})`;
  await q`update app.investigations set updated_at=now() where id=${investigationId}`;
  return taskId;
}
