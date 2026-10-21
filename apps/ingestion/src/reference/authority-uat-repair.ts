import { processingStage, type DbSql } from '@seap/db';

/**
 * Owner-authorized correction (audit F15, 21 October 2026) of the legacy
 * `reference.authority_uat` rows that tie a town hall to a same-named UAT in
 * another county. The table has no loader in the repository: it was matched by
 * name without a county, so five Vânători communes from five counties shared
 * Mehedinți's code and Sfântu Gheorghe (Covasna) pointed to an Ialomița commune.
 *
 * Each row is pinned by authority id, CUI and county, the wrong code and the
 * only same-named UAT of the authority's own county (read-only check on the
 * 1 October snapshot: every target is unique in its county and had no other
 * authority). A row changes only when it still holds the wrong code; anything
 * else is reported and left untouched, so the repair is idempotent and never
 * guesses. It runs once, inside the backed-up processing window, before
 * normalization; finishProcessing marks it completed with the verified publication.
 */
export const AUTHORITY_UAT_REPAIR_ID='authority-uat-county-20261021';
export type AuthorityUatCorrection={entityId:string;name:string;cui:string;county:string;from:number;to:number};
export const AUTHORITY_UAT_CORRECTIONS:readonly AuthorityUatCorrection[]=[
 {entityId:'2142023',name:'COMUNA VANATORI (PRIMARIA VANATORI)',cui:'4393212',county:'Galati',from:113849,to:75150},
 {entityId:'2140064',name:'COMUNA VANATORI',cui:'4541424',county:'Iasi',from:113849,to:100086},
 {entityId:'2143042',name:'COMUNA VANATORI',cui:'5902721',county:'Mures',from:113849,to:120254},
 {entityId:'2144406',name:'Comuna Vânători (Primaria Vinatori)',cui:'4297975',county:'Vrancea',from:113849,to:178607},
 {entityId:'2146546',name:'Municipiul Sfantu Gheorghe',cui:'4404605',county:'Covasna',from:94456,to:63394},
 {entityId:'2139931',name:'Comuna Corabia (Primaria Cobia)',cui:'4449429',county:'Dambovita',from:125542,to:66580},
 {entityId:'2145835',name:'COMUNA SANTIMBRU',cui:'4562095',county:'Alba',from:86519,to:7384},
 {entityId:'2144866',name:'COMUNA CIRTA',cui:'4246122',county:'Harghita',from:144508,to:84102},
 {entityId:'2141946',name:'COMUNA SCANTEIA',cui:'4540313',county:'Iasi',from:94429,to:98916},
 {entityId:'2139141',name:'COMUNA CIOCARLIA',cui:'4514608',county:'Constanta',from:100709,to:61283},
 {entityId:'2140717',name:'COMUNA CANDESTI',cui:'4402663',county:'Dambovita',from:39967,to:66526},
];

/** What the database holds for one pinned row, read inside the repair transaction. */
export type AuthorityUatObservation={
 entity:{cui:string|null;county:string|null}|null;
 mapping:{siruta:number|null;population:number|null}|null;
 target:{county:string|null;population:number|null}|null;
};
export type AuthorityUatOutcome={
 entityId:string;from:number;to:number;
 outcome:'corrected'|'already-corrected'|'skipped';
 reason?:'entity-changed'|'target-missing'|'county-mismatch'|'mapping-missing'|'mapping-changed';
 before:{siruta:number|null;population:number|null}|null;
 after?:{siruta:number;population:number|null};
};

// reference.uat writes "bistrita nasaud", core.entities "Bistrita-Nasaud".
export const countyKey=(value:string|null|undefined)=>(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[\s-]+/g,' ').trim();

/** Pure decision for one pinned row; the caller writes only a `corrected` outcome. */
export function planAuthorityUatCorrection(c:AuthorityUatCorrection,o:AuthorityUatObservation):AuthorityUatOutcome {
 const base={entityId:c.entityId,from:c.from,to:c.to,before:o.mapping?{siruta:o.mapping.siruta,population:o.mapping.population}:null};
 const county=countyKey(c.county);
 if(!o.entity||o.entity.cui!==c.cui||countyKey(o.entity.county)!==county)return {...base,outcome:'skipped',reason:'entity-changed'};
 if(!o.target)return {...base,outcome:'skipped',reason:'target-missing'};
 if(countyKey(o.target.county)!==county)return {...base,outcome:'skipped',reason:'county-mismatch'};
 if(!o.mapping)return {...base,outcome:'skipped',reason:'mapping-missing'};
 if(o.mapping.siruta===c.to)return {...base,outcome:'already-corrected'};
 if(o.mapping.siruta!==c.from)return {...base,outcome:'skipped',reason:'mapping-changed'};
 // The legacy population column mirrors reference.uat for every other row.
 return {...base,outcome:'corrected',after:{siruta:c.to,population:o.target.population}};
}

const PRE_REFRESH=new Set(['backup-verified','currency-repair','reference-repair','authority-uat-repair']);

/** Called by the processing runner after the verified backup, before the refresh. */
export async function runAuthorityUatRepair(q:DbSql,runId:string,log:(message:string)=>void=()=>{}) {
 return q.begin(async tx=>{
  const sql=tx as unknown as DbSql;
  const [repair]=await sql`select status,processing_run_id::text run_id,report from app.data_repairs where id=${AUTHORITY_UAT_REPAIR_ID} for update`;
  if(repair?.status==='completed')return null;
  if(repair?.status==='applied'&&repair.run_id===runId)return repair.report;
  const [run]=await sql`select r.status,r.scheduled_day::text run_day,r.stage,r.stages,r.raw_boundary,r.control_revision,c.maintenance,c.paused,c.revision
    from app.processing_runs r cross join app.collection_control c where r.id=${runId}::uuid and c.id=1 for update of r`;
  if(!run||run.status!=='running'||!run.maintenance||!run.paused||run.revision!==run.control_revision||!run.raw_boundary
   ||!run.stages?.backup?.completedAt||!PRE_REFRESH.has(String(run.stage)))
   throw Error('Authority UAT repair requires a backed-up publication before normalization');
  await processingStage(sql,runId,'authority-uat-repair');
  await sql`set local statement_timeout='60s'`;
  await sql`lock table reference.authority_uat in share row exclusive mode`;
  const rows:AuthorityUatOutcome[]=[];
  for(const c of AUTHORITY_UAT_CORRECTIONS){
   const [entity]=await sql`select cui_canonical cui,county from core.entities where id=${c.entityId}::bigint`;
   const [mapping]=await sql`select uat_siruta siruta,population from reference.authority_uat where entity_id=${c.entityId}::bigint`;
   const [target]=await sql`select county,population from reference.uat where siruta=${c.to}`;
   const outcome=planAuthorityUatCorrection(c,{
    entity:entity?{cui:entity.cui??null,county:entity.county??null}:null,
    mapping:mapping?{siruta:mapping.siruta??null,population:mapping.population??null}:null,
    target:target?{county:target.county??null,population:target.population??null}:null,
   });
   if(outcome.outcome==='corrected'){
    const updated=await sql`update reference.authority_uat set uat_siruta=${c.to},population=${outcome.after!.population}
      where entity_id=${c.entityId}::bigint and uat_siruta=${c.from} returning entity_id`;
    if(updated.length!==1)throw Error('Authority UAT row changed during the repair');
   }
   rows.push(outcome);
  }
  const count=(kind:AuthorityUatOutcome['outcome'])=>rows.filter(r=>r.outcome===kind).length;
  const report={decision:'audit F15, owner authorization 21 October 2026',corrected:count('corrected'),alreadyCorrected:count('already-corrected'),
   skipped:count('skipped'),rows,
   // A publication that failed after applying keeps its evidence; the retry finds the rows corrected.
   ...(repair?.status==='applied'?{previous:{runId:repair.run_id,report:repair.report}}:{})};
  await sql`insert into app.data_repairs(id,scheduled_day,status,processing_run_id,applied_at,report)
    values(${AUTHORITY_UAT_REPAIR_ID},${run.run_day}::date,'applied',${runId}::uuid,clock_timestamp(),${JSON.stringify(report)}::jsonb)
    on conflict(id) do update set status='applied',processing_run_id=excluded.processing_run_id,applied_at=excluded.applied_at,report=excluded.report,error=null`;
  await sql`insert into app.collection_audit(actor_id,actor_name,action,before,after)
    values('system:processor','Corectarea legăturilor autoritate–localitate','authority-uat-repair','{}'::jsonb,${JSON.stringify({runId,...report})}::jsonb)`;
  log(`Authority UAT repair: ${report.corrected} corrected, ${report.alreadyCorrected} already correct, ${report.skipped} skipped`);
  return report;
 });
}
