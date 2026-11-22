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
  // A contract above 1 mld. lei seen for the first time by the last published processing run (owner, 19 November
  // 2026; contract-value-review.ts): it is counted by default, so an administrator looks at each one. The rows of the
  // first review are dated at the epoch and are never announced.
  const largeValues = await q`select vr.contract_nat_id::text nat, vr.value_ron::text value, vr.admitted, vr.guard,
      left(regexp_replace(coalesce(nullif(c.title,''),a.title,''),'\\s+',' ','g'),160) title, coalesce(e.name_display,'') authority
    from marts.contract_value_review vr join core.contracts c on c.ca_notice_contract_id=vr.contract_nat_id
    join core.awards a on a.ca_notice_id=c.ca_notice_id left join core.entities e on e.id=a.authority_entity_id
    where vr.first_seen_at>now()-make_interval(hours=>${LOOKBACK_HOURS})`;
  for (const r of largeValues) {
    const value = `${(Number(r.value) / 1e9).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} mld. lei`;
    const held = r.guard === 'lowest_offer' ? 'valoarea e de câteva ori peste oferta din anunț'
      : r.guard === 'notice_value_missing' ? 'anunțul nu are o valoare totală care s-o confirme'
      : r.guard === 'notice_sum' ? 'contractele anunțului adună mult peste valoarea lui' : 'a fost scos de un administrator';
    alerts.push({
      key: `contract-value:${r.nat}`, kind: 'contract-value',
      subject: r.admitted ? `Contract nou de ${value}, intrat în totaluri` : `Contract nou de ${value}, ținut în afara totalurilor`,
      body: `${r.title || `Contractul ${r.nat}`}\n${r.authority}\n${value}\n\n${r.admitted
        ? 'A intrat în totaluri din oficiu: anunțul lui nu îi contrazice valoarea. Dacă valoarea e greșită, scoate-l.'
        : `Nu a intrat în totaluri: ${held}. Dacă valoarea e reală, include-l.`}\n\nContractul: ${origin}/contracte/${r.nat}\nLista și deciziile: ${admin}/procesare\n\nO decizie se aplică la următoarea procesare.`,
    });
  }
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

// Effect, not cause (19 October 2026): a single blocked mail went unnoticed for 30 hours. Only a stopped collector
// (owner, 22 November 2026: the hourly "nothing new" mails did not help): no request at all, to any source and with any
// outcome, for a day. TED polls hourly even when caught up, so a quiet day means the collector is not running. A pause
// is the owner's own and a block has its own mail.
export const COLLECTOR_SILENT_HOURS = 24;

async function idleCollectionAlerts(q: DbSql, admin: string): Promise<OperationalAlert[]> {
  // Silence counts from the last reopening, so a publication's maintenance never counts.
  const [c] = await q`select paused,maintenance,blocked_reason,clock_timestamp() now,
      (select max(completed_at) from app.processing_runs where status='ready') reopened,
      (select max(started_at) from app.collection_requests) seen
    from app.collection_control where id=1`;
  // Maintenance is covered by the processing alerts.
  if (!c || c.maintenance) return [];
  const times = [c.seen, c.reopened].filter(Boolean).map(t => new Date(t).getTime());
  const since = times.length ? Math.max(...times) : null;
  const hours = since === null ? 0 : (new Date(c.now).getTime() - since) / 3_600_000;
  if (since === null || hours < COLLECTOR_SILENT_HOURS || c.paused || c.blocked_reason) {
    await q`update app.operational_alerts set resolved_at=clock_timestamp() where kind='collection-idle' and resolved_at is null`;
    return [];
  }
  const reminder = Math.floor((hours - COLLECTOR_SILENT_HOURS) / COLLECTOR_SILENT_HOURS);
  const seen = new Date(since).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return [{
    key: `collection-idle:collector:${new Date(since).toISOString()}:${reminder}`, kind: 'collection-idle',
    subject: `${reminder ? 'Reamintire: c' : 'C'}olectorul nu a mai făcut nicio cerere de ${Math.floor(hours)} ore`,
    body: `Ultima cerere: ${seen} (ora României).\n\nNu există nicio pauză sau blocaj în setări: probabil colectorul nu rulează (container oprit).\n\nMesajul se repetă la ${COLLECTOR_SILENT_HOURS} de ore cât timp colectorul tace. Verifică ${admin}.`,
  }];
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
