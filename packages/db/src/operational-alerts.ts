import type { DbSql } from './client.js';

/** Incidents that leave the public site or collection stopped until an operator
 * acts. Detection only records them; delivery is separate and at most once per key. */
export interface OperationalAlert { key: string; kind: string; subject: string; body: string }

const STALLED_MINUTES = 15;
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
  // Isolated problems (18 October 2026): publication continued without them.
  const revoked = await q`select id::text,after->>'candidateId' candidate,after->>'reason' reason,jsonb_array_length(after->'contracts') publications,
      to_char(created_at at time zone 'Europe/Bucharest','DD.MM.YYYY HH24:MI') seen
    from app.collection_audit where action='identity-revoked' and created_at>now()-make_interval(hours=>${LOOKBACK_HOURS})`;
  for (const r of revoked) alerts.push({
    key: `identity-revoked:${r.id}`, kind: 'identity-revoked',
    subject: 'Un grup de publicări a fost exclus din totaluri — de verificat',
    body: `La ${r.seen} (ora României), reverificarea a găsit un grup aprobat de publicări ale aceluiași contract care nu mai trece verificarea. Publicarea a continuat fără el: cele ${r.publications} publicări sunt excluse din totaluri până la verificare.\n\nGrup: ${r.candidate}\nMotiv: ${r.reason}\n\nDetalii în ${admin}/procesare.`,
  });
  const quarantined = await q`select raw_id::text,max(endpoint_version) endpoint,
      to_char(min(created_at) at time zone 'Europe/Bucharest','DD.MM.YYYY HH24:MI') seen
    from core.quarantine where retry_required and resolved_at is null group by raw_id
    having min(created_at)>now()-make_interval(hours=>${LOOKBACK_HOURS})`;
  for (const r of quarantined) alerts.push({
    key: `quarantine:${r.raw_id}`, kind: 'quarantine',
    subject: 'O înregistrare nouă nu a putut fi procesată — de verificat',
    body: `La ${r.seen} (ora României), înregistrarea brută ${r.raw_id} (${r.endpoint}) nu a putut fi procesată și a fost pusă în carantină. Publicarea a continuat: rămâne ultima versiune bună, iar înregistrarea se reîncearcă la fiecare rulare.\n\nDetalii în ${admin}/procesare.`,
  });
  alerts.push(...await idleCollectionAlerts(q, admin));
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

// Effect, not cause (19 October 2026): a single blocked mail went unnoticed for 30 hours.
// SEAP counts successful requests; TED counts any request, since a caught-up TED polls
// hourly and an unpublished issue answers 404.
export const COLLECTION_IDLE_HOURS = { seap: 3, ted: 24 } as const;
export const COLLECTION_IDLE_REMIND_HOURS = 12;

async function idleCollectionAlerts(q: DbSql, admin: string): Promise<OperationalAlert[]> {
  // Idle time counts from the last reopening, so a publication's maintenance never counts.
  const [c] = await q`select paused,maintenance,paused_streams,blocked_reason,clock_timestamp() now,
      (select max(completed_at) from app.processing_runs where status='ready') reopened,
      (select started_at from app.collection_requests where outcome='success' and stream not in ('documents','ted') order by started_at desc limit 1) seap,
      (select started_at from app.collection_requests where stream='ted' order by started_at desc limit 1) ted
    from app.collection_control where id=1`;
  // Maintenance is covered by the processing alerts.
  if (!c || c.maintenance) return [];
  const alerts: OperationalAlert[] = [];
  for (const [group, label] of [['seap', 'SEAP'], ['ted', 'TED']] as const) {
    const times = [c[group], c.reopened].filter(Boolean).map(t => new Date(t).getTime());
    const threshold = COLLECTION_IDLE_HOURS[group];
    const since = times.length ? Math.max(...times) : null;
    const hours = since === null ? 0 : (new Date(c.now).getTime() - since) / 3_600_000;
    if (since === null || hours < threshold) {
      await q`update app.operational_alerts set resolved_at=clock_timestamp() where kind='collection-idle' and key like ${`collection-idle:${group}:%`} and resolved_at is null`;
      continue;
    }
    const reminder = Math.floor((hours - threshold) / COLLECTION_IDLE_REMIND_HOURS);
    const cause = c.blocked_reason ? `Colectarea este blocată: ${c.blocked_reason}`
      : c.paused ? 'Colectarea este pusă pe pauză.'
      : (c.paused_streams as string[]).includes(group) ? `Fluxul ${label} este pus pe pauză.`
      : 'Nu există nicio pauză sau blocaj în setări: probabil colectorul nu rulează (container oprit) sau toate cererile eșuează.';
    const seen = new Date(since).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    alerts.push({
      key: `collection-idle:${group}:${new Date(since).toISOString()}:${reminder}`, kind: 'collection-idle',
      subject: `${reminder ? 'Reamintire: c' : 'C'}olectarea ${label} nu a mai adus nimic de ${Math.floor(hours)} ore`,
      body: `Ultima activitate ${label}: ${seen} (ora României).\n\n${cause}\n\nMesajul se repetă la ${COLLECTION_IDLE_REMIND_HOURS} ore cât timp colectarea stă. Verifică ${admin}.`,
    });
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
