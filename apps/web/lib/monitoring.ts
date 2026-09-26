import { randomUUID } from "node:crypto";
import { getMonitoringRefreshStatus, withMonitoringSnapshot, type DbSql } from "@seap/db";
import { ground } from "./ask/ground";
import { resolvedSpec } from "./ask/resolved-spec";
import { describeQuestion, questionKey, type QuestionSpec } from "./ask/question-ui";
import { runRows, runSpec, useSnapshotCoverage } from "./ask/compile";
import { captureTransaction } from "./evidence-captures";
import { isWorkspaceId } from "./investigation-access";
import { monitoringDatabase, refreshError } from "./monitoring-engine";
import { MonitoringError, monitoringObject, monitoringPreferences, monitoringTitle, monitoringScope, monitoringRecipe, monitoringCursor, monitoringHasLocalSelection, MONITORING_LOCAL_SCOPE_NOTE } from "./monitoring-input";
import { MONITORING_MAX_ROWS, type MonitoringWatch, type MonitoringRun, type MonitoringDelta, type MonitoringRunDetail, type MonitoringPage } from "./monitoring-shared";
import { monitoredEntityIds,readMonitoringBindings } from "./monitoring-identity";

const json=(v:unknown)=>JSON.stringify(v??null);
const date=(v:unknown)=>v instanceof Date?v.toISOString():v==null?null:String(v);
const decimal=(v:unknown)=>v==null?null:String(v);
async function requireDigestEmail(q:DbSql,userId:string,digest:boolean){
  if(!digest)return;
  const [user]=await q`select email_verified from auth.users where id=${userId}`;
  if(!user?.email_verified)throw new MonitoringError("Confirmă adresa de email înainte de a activa rezumatul prin email.",422);
}
function watchSummary(row:Record<string,unknown>):MonitoringWatch {
  return {id:String(row.id),title:String(row.title),spec:row.spec as MonitoringWatch["spec"],options:row.options as MonitoringWatch["options"],
    paused:!!row.paused,preferences:row.preferences as MonitoringWatch["preferences"],createdAt:date(row.created_at)!,updatedAt:date(row.updated_at)!,pinnedAt:date(row.pinned_at)!,
    recipeId:decimal(row.recipe_id),recipeVersion:row.recipe_version==null?null:Number(row.recipe_version),
    lastSuccessRunId:decimal(row.last_success_run_id),lastSuccessAt:date(row.last_success_at),lastAttemptAt:date(row.last_attempt_at),lastError:decimal(row.last_error),
    unreadCount:Number(row.unread_count??0),scopeNotes:(row.scope_notes??[]) as string[]};
}
export function monitoringRunSummary(row:Record<string,unknown>):MonitoringRun {
  return {id:String(row.id),watchId:String(row.watch_id),watchTitle:String(row.watch_title??""),checkpointId:String(row.checkpoint_id),previousRunId:decimal(row.previous_run_id),previousCheckedAt:date(row.previous_checked_at),
    status:"complete",kind:row.kind as MonitoringRun["kind"],checkedAt:date(row.checked_at)!,rowCount:Number(row.row_count),totalExact:decimal(row.total_exact),knownValueExact:decimal(row.known_value_exact),unknownValues:Number(row.unknown_values),
    previousTotalExact:decimal(row.previous_total_exact),totalDifferenceExact:decimal(row.total_difference_exact),counts:row.counts as MonitoringRun["counts"],relevantCounts:row.relevant_counts as MonitoringRun["relevantCounts"],
    hasAlert:!!row.has_alert,reviewedAt:date(row.reviewed_at),resultChanged:!!row.result_changed,methodologyChanged:!!row.methodology_changed,error:null,
    checkpoint:row.checkpoint as Record<string,unknown>,previousCheckpoint:(row.previous_checkpoint??null) as Record<string,unknown>|null,notes:(row.notes??[]) as string[]};
}
export async function createMonitoringWatch(userId:string,input:unknown,sql=monitoringDatabase()):Promise<MonitoringWatch>{
  const body=monitoringObject(input),scope=monitoringScope(body),prefs=monitoringPreferences(body.preferences),recipe=monitoringRecipe(body);
  if(Object.keys(body).some(k=>!["spec","options","title","preferences","recipeId","recipeVersion"].includes(k)))throw new MonitoringError("Câmp necunoscut în urmărire.");
  try{return await withMonitoringSnapshot(sql,async(q)=>{
    await requireDigestEmail(q,userId,prefs.digest);
    if(recipe.recipeId){
      const [saved]=await q`select v.spec from app.query_recipe_versions v join app.query_recipes r on r.id=v.recipe_id
        where r.id=${recipe.recipeId} and r.owner_user_id=${userId} and v.version=${recipe.recipeVersion}`;
      if(!saved)throw new MonitoringError("Rețeta sau versiunea nu îți este disponibilă.",404);
      if(questionKey(saved.spec as QuestionSpec)!==questionKey(scope.spec as unknown as QuestionSpec))throw new MonitoringError("Selecția diferă de versiunea rețetei. Salvează o versiune nouă sau urmărește întrebarea separat.",409);
    }
    const grounding=await ground(q,scope.spec.filters),spec=resolvedSpec(scope.spec,grounding),database=useSnapshotCoverage(captureTransaction(q));
    const boundGrounding={...grounding,monitoringEntities:await readMonitoringBindings(q,monitoredEntityIds(spec,grounding,scope.options))};
    const pinnedNotes:string[]=[];
    if(monitoringHasLocalSelection(scope.options))pinnedNotes.push(MONITORING_LOCAL_SCOPE_NOTE);
    for(const [label,entity] of [["Instituție",grounding.authority],["Firmă",grounding.supplier],["Entitatea comparată",grounding.compare]] as const){
      if(entity?.entityId)pinnedNotes.push(`${label} fixată la activare: ${entity.nameDisplay??entity.query} (ID ${entity.entityId}).`);
    }
    if(grounding.cpv)pinnedNotes.push(`Domenii CPV fixate la activare: ${grounding.cpv.prefixes.join(", ")}. Denumiri identificate: ${grounding.cpv.matchedNames.join("; ")}. Schimbarea ulterioară a sinonimelor nu modifică această urmărire.`);
    if(grounding.admin)pinnedNotes.push(`Reprezentant fixat: ${grounding.admin.display??grounding.admin.query}. Grupul de firme rămâne cel de la activare: ${grounding.admin.supplierIds.length} entități (ID-uri: ${grounding.admin.supplierIds.join(", ")||"niciuna"}). Modificările ulterioare ale relațiilor din registru nu adaugă automat firme în această selecție.`);
    const answer=await runSpec(database,spec,grounding);if("error"in answer)throw new MonitoringError(answer.error,422);
    const rows=await runRows(database,spec,grounding,0,{...scope.options,capture:{maxRows:MONITORING_MAX_ROWS,persist:async()=>{}}});if("error"in rows)throw new MonitoringError(rows.error,422);
    if(rows.total>MONITORING_MAX_ROWS)throw new MonitoringError(`Selecția are ${rows.total.toLocaleString("ro-RO")} de înregistrări. Restrânge perioada, instituția sau domeniul la cel mult 200.000 înainte de activare. Nicio selecție nu este trunchiată.`,422);
    const title=monitoringTitle(body.title,describeQuestion(spec).slice(0,200));
    const [watch]=await q`insert into app.monitoring_watches(id,owner_user_id,title,spec,options,grounding,scope_notes,preferences,recipe_id,recipe_version)
      values(${randomUUID()},${userId},${title},${json(spec)}::jsonb,${json(scope.options)}::jsonb,${json(boundGrounding)}::jsonb,${json([...pinnedNotes,...answer.caveats,...rows.scopeNotes])}::jsonb,${json(prefs)}::jsonb,${recipe.recipeId},${recipe.recipeVersion}) returning *`;
    return watchSummary(watch!);
  });}catch(error){throw refreshError(error);}
}
export async function getMonitoringWatch(userId:string,id:string,sql=monitoringDatabase()):Promise<MonitoringWatch|null>{
  if(!isWorkspaceId(id))return null;
  const [row]=await sql`select w.*,(select count(*) from app.monitoring_runs r left join app.monitoring_reviews v on v.run_id=r.id where r.watch_id=w.id and r.has_alert and v.run_id is null) unread_count
    from app.monitoring_watches w where w.id=${id} and w.owner_user_id=${userId}`;
  return row?watchSummary(row):null;
}
export async function listMonitoringWatches(userId:string,after?:string,sql=monitoringDatabase()){
  if(after&&!isWorkspaceId(after))throw new MonitoringError("Poziție invalidă.");
  const items=await sql`select w.*,(select count(*) from app.monitoring_runs r left join app.monitoring_reviews v on v.run_id=r.id where r.watch_id=w.id and r.has_alert and v.run_id is null) unread_count
    from app.monitoring_watches w where w.owner_user_id=${userId}
      and ${after?sql`(w.created_at,w.id)<(select created_at,id from app.monitoring_watches where id=${after} and owner_user_id=${userId})`:sql`true`}
    order by w.created_at desc,w.id desc limit 51`;
  const page=items.slice(0,50);
  return {items:page.map(watchSummary),nextCursor:items.length>50?String(page.at(-1)!.id):null,refresh:await getMonitoringRefreshStatus(sql),health:await monitoringHealth(userId,sql)};
}
export async function monitoringHealth(userId:string,sql=monitoringDatabase()){
  const [row]=await sql`with current_refresh as (select id,status from app.monitoring_refreshes order by version desc limit 1)
    select count(*) filter(where w.last_error is not null)::int failed,count(*) filter(where w.paused)::int paused,
      count(*) filter(where not w.paused and exists(select 1 from current_refresh c where c.status='ready'
        and not exists(select 1 from app.monitoring_runs r where r.watch_id=w.id and r.checkpoint_id=c.id)))::int pending
    from app.monitoring_watches w where w.owner_user_id=${userId}`;
  return {failed:Number(row?.failed??0),pending:Number(row?.pending??0),paused:Number(row?.paused??0)};
}
export async function updateMonitoringWatch(userId:string,id:string,input:unknown,sql=monitoringDatabase()):Promise<MonitoringWatch|null>{
  if(!isWorkspaceId(id))return null;
  const body=monitoringObject(input);
  if(!Object.keys(body).length||Object.keys(body).some(k=>!["title","paused","preferences"].includes(k)))throw new MonitoringError("Condițiile unei urmăriri sunt fixe. Creează o urmărire nouă pentru altă selecție.");
  const title=body.title===undefined?null:monitoringTitle(body.title),preferences=body.preferences===undefined?null:monitoringPreferences(body.preferences);
  if(body.paused!==undefined&&typeof body.paused!=="boolean")throw new MonitoringError("Starea urmăririi nu este validă.");
  await requireDigestEmail(sql,userId,preferences?.digest===true);
  const [row]=await sql`update app.monitoring_watches set title=coalesce(${title},title),paused=coalesce(${body.paused??null}::boolean,paused),preferences=coalesce(${preferences?json(preferences):null}::jsonb,preferences),updated_at=now()
    where id=${id} and owner_user_id=${userId} returning *`;
  return row?watchSummary(row):null;
}
export async function listMonitoringRuns(userId:string,opts:{watchId?:string;after?:string;unread?:boolean;inbox?:boolean}={},sql=monitoringDatabase()){
  if(opts.watchId&&!isWorkspaceId(opts.watchId)||opts.after&&!isWorkspaceId(opts.after))throw new MonitoringError("Identificator invalid.");
  const rows=await sql`select r.*,w.title watch_title,v.reviewed_at,p.checkpoint previous_checkpoint,p.checked_at previous_checked_at from app.monitoring_runs r join app.monitoring_watches w on w.id=r.watch_id
    left join app.monitoring_reviews v on v.run_id=r.id left join app.monitoring_runs p on p.id=r.previous_run_id
    where w.owner_user_id=${userId} and ${opts.watchId?sql`w.id=${opts.watchId}`:sql`true`}
      and ${opts.inbox?sql`r.has_alert`:sql`true`} and ${opts.unread?sql`v.run_id is null`:sql`true`}
      and ${opts.after?sql`(r.checked_at,r.id)<(select rr.checked_at,rr.id from app.monitoring_runs rr join app.monitoring_watches ww on ww.id=rr.watch_id where rr.id=${opts.after} and ww.owner_user_id=${userId})`:sql`true`}
    order by r.checked_at desc,r.id desc limit 51`;
  const items=rows.slice(0,50);
  return {items:items.map(monitoringRunSummary),nextCursor:rows.length>50?String(items.at(-1)!.id):null};
}
export async function getMonitoringRun(userId:string,watchId:string,runId:string,sql=monitoringDatabase()):Promise<MonitoringRunDetail|null>{
  if(!isWorkspaceId(watchId)||!isWorkspaceId(runId))return null;
  return sql.begin("isolation level repeatable read read only",async tx=>{
    const q=tx as unknown as DbSql,watch=await getMonitoringWatch(userId,watchId,q);if(!watch)return null;
    const [row]=await q`select r.*,v.reviewed_at,p.checkpoint previous_checkpoint,p.checked_at previous_checked_at,p.result previous_result,p.methodology previous_methodology from app.monitoring_runs r
      left join app.monitoring_reviews v on v.run_id=r.id left join app.monitoring_runs p on p.id=r.previous_run_id where r.id=${runId} and r.watch_id=${watchId}`;
    return row?{watch,run:monitoringRunSummary({...row,watch_title:watch.title}),result:row.result,previousResult:row.previous_result??null,methodology:row.methodology,previousMethodology:row.previous_methodology??null}:null;
  });
}
export async function reviewMonitoringRun(userId:string,watchId:string,runId:string,reviewed:boolean,sql=monitoringDatabase()){
  if(!isWorkspaceId(watchId)||!isWorkspaceId(runId))return null;
  return sql.begin(async tx=>{
    const q=tx as unknown as DbSql;
    const [row]=await q`select r.id from app.monitoring_runs r join app.monitoring_watches w on w.id=r.watch_id where r.id=${runId} and w.id=${watchId} and w.owner_user_id=${userId}`;
    if(!row)return null;
    if(reviewed)await q`insert into app.monitoring_reviews(run_id) values(${runId}) on conflict(run_id) do nothing`;
    else await q`delete from app.monitoring_reviews where run_id=${runId}`;
    return {id:runId,reviewed};
  });
}
export async function monitoringDeltaRows(userId:string,watchId:string,runId:string,opts:{after?:unknown;relevant?:boolean}={},sql=monitoringDatabase()):Promise<MonitoringPage<MonitoringDelta>|null>{
  const detail=await getMonitoringRun(userId,watchId,runId,sql);if(!detail)return null;
  const after=monitoringCursor(opts.after);
  const rows=await sql`select * from app.monitoring_deltas where run_id=${runId} and row_no>${after} and ${opts.relevant?sql`relevant`:sql`true`} order by row_no limit 101`;
  const items=rows.slice(0,100).map(r=>({cursor:String(r.row_no),sourceKey:String(r.source_key),type:r.type,classification:r.classification,relevant:!!r.relevant,
    before:r.before_record,after:r.after_record,changedFields:r.changed_fields,amountDifferenceExact:decimal(r.amount_difference_exact),observedAt:detail.run.checkedAt,previousObservedAt:detail.run.previousCheckedAt??""} as MonitoringDelta));
  return {items,nextCursor:rows.length>100?items.at(-1)!.cursor:null};
}
export async function monitoringSourceRows(userId:string,watchId:string,runId:string,after:unknown,sql=monitoringDatabase()){
  if(!await getMonitoringRun(userId,watchId,runId,sql))return null;
  const cursor=monitoringCursor(after),rows=await sql`select row_no::text cursor,record from app.monitoring_run_rows where run_id=${runId} and row_no>${cursor} order by row_no limit 101`;
  const items=rows.slice(0,100).map(r=>({cursor:String(r.cursor),record:r.record}));return {items,nextCursor:rows.length>100?items.at(-1)!.cursor:null};
}
