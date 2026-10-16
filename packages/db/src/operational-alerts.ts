import type { DbSql } from './client.js';

/** Incidents that leave the public site or collection stopped until an operator
 * acts. Detection only records them; delivery is separate and at most once per key. */
export interface OperationalAlert { key: string; kind: string; subject: string; body: string }

const STALLED_MINUTES = 15;
const TED_FAILED_RUNS = 3;
// Older incidents are not announced retroactively when alerting is first deployed.
const LOOKBACK_HOURS = 24;
export const ALERT_MAX_ATTEMPTS = 5;

export async function detectOperationalAlerts(q: DbSql, origin: string): Promise<OperationalAlert[]> {
  const admin = `${origin}/admin`;
  const alerts: OperationalAlert[] = [];
  const failed = await q`select id::text,scheduled_day::text run_day,stage,
      to_char(completed_at at time zone 'Europe/Bucharest','DD.MM.YYYY HH24:MI') seen
    from app.processing_runs where status='failed' and completed_at>now()-make_interval(hours=>${LOOKBACK_HOURS})`;
  for (const r of failed) alerts.push({
    key: `processing-failed:${r.id}`, kind: 'processing-failed',
    subject: `Procesarea din ${r.run_day} s-a oprit — site-ul rămâne în mentenanță`,
    body: `Procesarea programată pentru ${r.run_day} s-a oprit la etapa „${r.stage}”, la ${r.seen} (ora României).\n\nSite-ul public rămâne în mentenanță până la o recuperare verificată. Nu există reîncercare automată.\n\nVerifică jurnalul rulării pe server și starea din ${admin}/procesare.`,
  });
  const stalled = await q`select id::text,scheduled_day::text run_day,stage,
      to_char(heartbeat_at at time zone 'Europe/Bucharest','DD.MM.YYYY HH24:MI') seen
    from app.processing_runs where status='running' and heartbeat_at<now()-make_interval(mins=>${STALLED_MINUTES})`;
  for (const r of stalled) alerts.push({
    key: `processing-stalled:${r.id}`, kind: 'processing-stalled',
    subject: `Procesarea din ${r.run_day} nu mai trimite semnal`,
    body: `Procesarea pentru ${r.run_day} este la etapa „${r.stage}” și nu a mai trimis semnal din ${r.seen} (ora României).\n\nSite-ul rămâne în mentenanță. Verifică serverul înainte de orice recuperare: ${admin}/procesare.`,
  });
  const paused = await q`select id::text,after->>'stream' stream,after->>'reason' reason,
      to_char(created_at at time zone 'Europe/Bucharest','DD.MM.YYYY HH24:MI') seen
    from app.collection_audit where action='stream-auto-paused' and created_at>now()-make_interval(hours=>${LOOKBACK_HOURS})`;
  for (const r of paused) alerts.push({
    key: `stream-auto-paused:${r.id}`, kind: 'stream-auto-paused',
    subject: `Fluxul „${r.stream}” a fost pus automat pe pauză`,
    body: `La ${r.seen} (ora României), fluxul „${r.stream}” a fost pus automat pe pauză.${r.reason ? `\n\nMotiv: ${r.reason}` : ''}\n\nCelelalte fluxuri continuă. Verifică jurnalul și reia fluxul din ${admin}.`,
  });
  // Automatic TED import: one night without it is not an incident (a 429 or a
  // TED outage just defers it). Three unsuccessful runs in a row since the last
  // success are, while the job is still running. One mail per streak; publication
  // itself never waits for TED.
  const [ted] = await q`with last_ok as (select coalesce(max(id),0) id from core.scrape_runs
        where source='ted:incremental' and status='completed'),
      streak as (select r.id,r.started_at,r.error from core.scrape_runs r,last_ok
        where r.source='ted:incremental' and r.id>last_ok.id)
    select min(id)::text first_id,count(*)::int runs,coalesce(max(started_at)>now()-interval '48 hours',false) recent,
      (select error from streak order by id desc limit 1) last_error,
      (select cursor::jsonb->>'day' from core.ingestion_watermarks where source='ted:incremental') through
    from streak`;
  if (ted && ted.runs >= TED_FAILED_RUNS && ted.recent) alerts.push({
    key: `ted-import-failing:${ted.first_id}`, kind: 'ted-import-failing',
    subject: `Importul TED automat nu a reușit de ${ted.runs} ori la rând`,
    body: `Ultimele ${ted.runs} rulări ale importului TED automat nu s-au încheiat cu succes. Publicarea nocturnă continuă cu datele TED deja arhivate; site-ul nu este oprit.\n\nAnunțurile TED sunt importate până la data de publicare ${ted.through ?? 'încă nicio rulare reușită'}.${ted.last_error ? `\nUltima eroare: ${ted.last_error}` : ''}\n\nVerifică jurnalul rulării nocturne și core.scrape_runs (source='ted:incremental'). Oprire: TED_INCREMENTAL=off în infra/prod/.env.`,
  });
  // A global stop has no natural ID: one open incident until the block clears.
  const [control] = await q`select blocked_reason from app.collection_control where id=1`;
  if (control?.blocked_reason) {
    const [open] = await q`select key from app.operational_alerts where kind='collection-blocked' and resolved_at is null limit 1`;
    alerts.push(open ? { key: String(open.key), kind: 'collection-blocked', subject: '', body: '' } : {
      key: `collection-blocked:${new Date().toISOString()}`, kind: 'collection-blocked',
      subject: 'Colectarea SEAP este oprită și așteaptă verificare',
      body: `Colectarea s-a oprit global.\n\nMotiv: ${control.blocked_reason}\n\nNu se reia singură. Verifică jurnalul, apoi folosește „Verifică și reia” din ${admin}.`,
    });
  } else {
    await q`update app.operational_alerts set resolved_at=clock_timestamp() where kind='collection-blocked' and resolved_at is null`;
  }
  return alerts;
}

/** Records new incidents and returns those still owed to the operators. */
export async function pendingOperationalAlerts(q: DbSql, origin: string) {
  const found = (await detectOperationalAlerts(q, origin)).filter(a => a.subject);
  if (found.length) await q`insert into app.operational_alerts(key,kind,subject,body)
    select key,kind,subject,body from jsonb_to_recordset(${JSON.stringify(found)}::jsonb) x(key text,kind text,subject text,body text)
    on conflict(key) do nothing`;
  return q`select key,subject,body,attempts from app.operational_alerts
    where status='pending' and attempts<${ALERT_MAX_ATTEMPTS} order by detected_at,key`;
}

export async function operationalAlertRecipients(q: DbSql) {
  return (await q`select email from auth.users where role='admin' and email_verified and banned is not true order by email`).map(r => String(r.email));
}

export async function recordOperationalAlert(q: DbSql, key: string, outcome: { recipients: number } | { error: string }) {
  if ('recipients' in outcome) {
    await q`update app.operational_alerts set status='sent',sent_at=clock_timestamp(),recipients=${outcome.recipients},attempts=attempts+1,error=null where key=${key}`;
  } else {
    await q`update app.operational_alerts set attempts=attempts+1,error=${outcome.error.slice(0, 500)},
      status=case when attempts+1>=${ALERT_MAX_ATTEMPTS} then 'failed' else 'pending' end where key=${key}`;
  }
}
