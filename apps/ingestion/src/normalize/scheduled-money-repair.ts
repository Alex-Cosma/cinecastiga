import { processingStage, type DbSql } from '@seap/db';
import { replayContractMoney } from './contract-money-replay.js';
import { runContractMoneyQuality } from './contract-money-quality.js';
export const MONEY_REPAIR_ID='contract-money-v1';

/** Only the scheduled host runner calls this, after a verified full backup. */
export async function runScheduledMoneyRepair(q:DbSql,runId:string,log:(message:string)=>void=()=>{}) {
  try {
    return await q.begin(async tx=>{
      const sql=tx as unknown as DbSql;
      const [repair]=await sql`select * from app.data_repairs where id=${MONEY_REPAIR_ID} for update`;
      if(!repair||repair.status==='completed')return null;
      const [r]=await sql`select r.*,c.maintenance,c.paused from app.processing_runs r cross join app.collection_control c
        where r.id=${runId}::uuid and c.id=1`;
      if(!r||!r.maintenance||!r.paused||r.status!=='running')throw Error('Repair requires active maintenance');
      if(repair.scheduled_day>r.scheduled_day)return null;
      if(repair.status!=='scheduled')throw Error('Unfinished currency repair requires operator recovery');
      if(repair.scheduled_day!==r.scheduled_day||r.scope!=='full'||!r.raw_boundary||!r.stages?.backup?.completedAt||r.stage!=='backup-verified')
        throw Error('Currency repair requires its scheduled full run, frozen boundary and verified backup');
      await processingStage(sql,runId,'currency-repair');
      await sql`set local work_mem='8MB'`;
      await sql`set local max_parallel_workers_per_gather=0`;
      await sql`set local jit=off`;
      await sql`set local statement_timeout='180s'`;
      const report=await replayContractMoney(sql,String(r.raw_boundary),log);
      const quality=await runContractMoneyQuality(sql);
      await sql`update app.data_repairs set status='applied',processing_run_id=${runId}::uuid,
        applied_at=clock_timestamp(),report=${JSON.stringify({...report,quality})}::jsonb,error=null where id=${MONEY_REPAIR_ID}`;
      return report;
    });
  } catch(error) {
    log(`currency repair failed: ${error instanceof Error ? error.message : "unknown error"}`);
    // No partial monetary updates survive. Failure is persistent, never retried
    // merely because another Sunday arrives. Do not store arbitrary payloads.
    await q`update app.data_repairs set status='failed',processing_run_id=${runId}::uuid,
      error='Reparația monetară s-a oprit; modificările tranzacției au fost anulate. Verifică jurnalul înainte de recuperare.'
      where id=${MONEY_REPAIR_ID} and status='scheduled'`;
    throw error;
  }
}
