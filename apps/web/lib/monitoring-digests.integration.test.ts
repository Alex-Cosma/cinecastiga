import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@seap/db";
import { getMonitoringDigestStatus, runMonitoringDigests, type DigestMessage } from "./monitoring-digests";

const testUrl = process.env["TEST_DATABASE_URL"];
if (testUrl && !/^seap_test_[a-z0-9_]+$/.test(new URL(testUrl).pathname.slice(1))) throw new Error("Digest fixtures require a dedicated seap_test_* database");
const connection = testUrl ? createDb(testUrl) : null;
const period = "2025-04-15";
const users: string[] = [], checkpoints: string[] = [];
beforeEach(() => {
  vi.stubEnv("SMTP_HOST","smtp.example.invalid"); vi.stubEnv("SMTP_FROM","alerts@example.invalid");
  vi.stubEnv("MONITORING_SITE_URL","https://cinecastiga.example");
});
afterEach(async () => {
  if (connection && users.length) {
    await connection.sql`delete from auth.users where id in ${connection.sql(users)}`;
    await connection.sql`delete from app.monitoring_refreshes where id in ${connection.sql(checkpoints)}`;
    users.length = 0; checkpoints.length = 0;
  }
  vi.unstubAllEnvs();
});
afterAll(async () => { await connection?.sql.end(); });

async function fixture(options: { verified?:boolean; paused?:boolean; digest?:boolean; reviewed?:boolean; baseline?:boolean } = {}) {
  const sql = connection!.sql;
  const owner = `digest_fixture_${randomUUID()}`, email = `${owner}@example.invalid`; users.push(owner);
  await sql`insert into auth.users (id,name,email,email_verified) values (${owner},'Synthetic digest recipient',${email},${options.verified ?? true})`;
  const [checkpoint] = await sql`insert into app.monitoring_refreshes (kind,status,completed_at) values ('baseline','ready',now()) returning id`;
  const checkpointId = String(checkpoint!.id); checkpoints.push(checkpointId);
  const preferences = { types:["added","changed","removed"],minimumValueExact:"0",digest:options.digest ?? true };
  const [watch] = await sql`insert into app.monitoring_watches (owner_user_id,title,spec,options,grounding,preferences,paused)
    values (${owner},'Synthetic watch <script>not markup</script>','{}','{}','{}',${JSON.stringify(preferences)}::jsonb,${options.paused ?? false}) returning id`;
  const watchId = String(watch!.id);
  const [run] = await sql`insert into app.monitoring_runs (watch_id,checkpoint_id,kind,checked_at,row_count,total_exact,known_value_exact,counts,relevant_counts,preferences,has_alert,result,methodology,checkpoint,notes)
    values (${watchId},${checkpointId},${options.baseline ? "baseline" : "update"},${`${period}T12:00:00Z`},2,200,200,'{"added":2,"changed":0,"removed":0}','{"added":2,"changed":0,"removed":0}',${JSON.stringify(preferences)}::jsonb,${!options.baseline},'{}','{}','{}','[]') returning id`;
  const runId = String(run!.id);
  if (options.reviewed) await sql`insert into app.monitoring_reviews (run_id) values (${runId})`;
  return { owner,email,watchId,runId };
}
async function queued(f: Awaited<ReturnType<typeof fixture>>, status = "queued") {
  const sql = connection!.sql;
  const [row] = await sql`insert into app.monitoring_digest_deliveries (owner_user_id,recipient_email,period,status,run_ids,update_count,started_at)
    values (${f.owner},${f.email},${period},${status},${JSON.stringify([f.runId])}::jsonb,1,now()-interval '15 minutes') returning id`;
  return String(row!.id);
}
const deliver = (messages: DigestMessage[]) => async (message: DigestMessage) => { messages.push(message); return { accepted:[message.to] }; };

describe.runIf(Boolean(connection))("durable opt-in monitoring email delivery", () => {
  it("previews without mutations, sends once, and deduplicates normal/concurrent retries", async () => {
    const f = await fixture(); const sql = connection!.sql; const messages: DigestMessage[] = [];
    const preview = await runMonitoringDigests({ period,database:sql,deliver:deliver(messages) });
    expect(preview).toMatchObject({ mode:"preview",eligibleRecipients:1,updates:1,sent:0 });
    expect((await sql`select id from app.monitoring_digest_deliveries where owner_user_id=${f.owner}`).length).toBe(0);
    expect(messages).toHaveLength(0);
    await Promise.all([1,2].map(() => runMonitoringDigests({ period,database:sql,send:true,deliver:deliver(messages) })));
    await runMonitoringDigests({ period,database:sql,send:true,deliver:deliver(messages) });
    expect(messages).toHaveLength(1);
    const status = await getMonitoringDigestStatus(f.owner,sql);
    expect(status).toMatchObject({ available:true,optedInWatches:1,latest:{ period,status:"sent",updateCount:1,error:null } });
    expect(status.latest!.sentAt).toBeTruthy();
  });

  it("excludes default opt-out, paused, unverified, reviewed and baseline records", async () => {
    const fixtures = await Promise.all([{ digest:false },{ paused:true },{ verified:false },{ reviewed:true },{ baseline:true }].map(options => fixture(options)));
    const messages: DigestMessage[] = [];
    const result = await runMonitoringDigests({ period,database:connection!.sql,send:true,deliver:deliver(messages) });
    expect(result.eligibleRecipients).toBe(0); expect(messages).toHaveLength(0);
    expect((await getMonitoringDigestStatus(fixtures[2]!.owner,connection!.sql)).available).toBe(false);
  });

  it("rechecks queued recipients and preferences immediately before delivery", async () => {
    const sql = connection!.sql; const changed = await fixture(), paused = await fixture(), optedOut = await fixture(), unverified = await fixture();
    for (const f of [changed,paused,optedOut,unverified]) await queued(f);
    await sql`update auth.users set email=${`changed_${changed.email}`} where id=${changed.owner}`;
    await sql`update app.monitoring_watches set paused=true where id=${paused.watchId}`;
    await sql`update app.monitoring_watches set preferences=jsonb_set(preferences,'{digest}','false') where id=${optedOut.watchId}`;
    await sql`update auth.users set email_verified=false where id=${unverified.owner}`;
    const messages: DigestMessage[] = [];
    await runMonitoringDigests({ period,database:sql,send:true,deliver:deliver(messages) });
    expect(messages).toHaveLength(0);
    for (const f of [changed,paused,optedOut,unverified]) expect((await getMonitoringDigestStatus(f.owner,sql)).latest!.status).toBe("cancelled");
  });

  it("removes a paused watch from a queued mixed digest and never includes another owner's update", async () => {
    const sql = connection!.sql; const kept = await fixture(), paused = await fixture(), outsider = await fixture({ digest:false });
    await sql`update app.monitoring_watches set owner_user_id=${kept.owner},title='Private paused watch',paused=true where id=${paused.watchId}`;
    await sql`update app.monitoring_watches set title='Other owner private watch' where id=${outsider.watchId}`;
    const deliveryId = await queued(kept);
    await sql`update app.monitoring_digest_deliveries set run_ids=${JSON.stringify([kept.runId,paused.runId,outsider.runId])}::jsonb,update_count=3 where id=${deliveryId}`;
    const messages: DigestMessage[] = [];
    await runMonitoringDigests({ period,database:sql,send:true,deliver:deliver(messages) });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.text).not.toContain("Private paused watch");
    expect(messages[0]!.text).not.toContain("Other owner private watch");
    expect((await getMonitoringDigestStatus(kept.owner,sql)).latest!.updateCount).toBe(1);
  });

  it("marks transport uncertainty and crash-after-send ambiguity without automatic resending", async () => {
    const sql = connection!.sql; const ambiguous = await fixture(), crashed = await fixture();
    await queued(crashed,"sending");
    let attempts = 0;
    await runMonitoringDigests({ period,database:sql,send:true,deliver:async () => { attempts++; throw new Error("Simulated lost SMTP acknowledgement; no actual connection"); } });
    expect(attempts).toBe(1);
    expect((await getMonitoringDigestStatus(ambiguous.owner,sql)).latest!.status).toBe("uncertain");
    expect((await getMonitoringDigestStatus(crashed.owner,sql)).latest!.status).toBe("uncertain");
    await runMonitoringDigests({ period,database:sql,send:true,deliver:async () => { attempts++; return { accepted:[] }; } });
    expect(attempts).toBe(1);
  });

  it("shows a definite rejection and allows retry only when SMTP accepted no recipient", async () => {
    const sql = connection!.sql; const f = await fixture();
    const rejected = await runMonitoringDigests({ period,database:sql,send:true,deliver:async () => ({ accepted:[] }) });
    expect(rejected.failed).toBe(1);
    expect((await getMonitoringDigestStatus(f.owner,sql)).latest).toMatchObject({ status:"failed",sentAt:null });
    const messages: DigestMessage[] = [];
    await runMonitoringDigests({ period,database:sql,send:true,deliver:deliver(messages) });
    expect(messages).toHaveLength(1);
    expect((await getMonitoringDigestStatus(f.owner,sql)).latest!.status).toBe("sent");
  });
});
