import { createDb, type DbSql } from "@seap/db";
import nodemailer from "nodemailer";

export type MonitoringDigestState = "queued" | "sending" | "sent" | "failed" | "uncertain" | "cancelled";
export interface MonitoringDigestStatus {
  available: boolean;
  reason: string | null;
  optedInWatches: number;
  latest: { period: string; status: MonitoringDigestState; updateCount: number; sentAt: string | null; error: string | null } | null;
}
export interface DigestMessage { to: string; from: string; subject: string; text: string; html: string; messageId: string }
export type DigestDeliverer = (message: DigestMessage) => Promise<{ accepted: unknown[] }>;
interface DigestUpdate { id: string; watchId: string; title: string; count: number }
interface DigestConfig { origin: string | null; from: string; available: boolean; reason: string | null }
interface ClaimedDigest { id: string; email: string; ownerId: string; period: string; updates: DigestUpdate[] }
const UNCERTAIN_MESSAGE = "Trimiterea nu poate fi confirmată. Nu retrimitem automat, pentru a evita un e-mail duplicat. Actualizările sunt disponibile în aplicație.";

/** SMTP links come only from deployment configuration, never request headers. */
export function monitoringDigestConfig(env: Readonly<Record<string, string | undefined>> = process.env): DigestConfig {
  let origin: string | null = null;
  try {
    const url = new URL(env["MONITORING_SITE_URL"] ?? env["BETTER_AUTH_URL"] ?? "");
    if (!url.username && !url.password && !url.search && !url.hash && url.pathname === "/" &&
        (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) origin = url.origin;
  } catch { /* Invalid or absent deployment origin. */ }
  const from = (env["SMTP_FROM"] ?? env["SMTP_USER"] ?? "").trim();
  const smtpConfigured = Boolean(env["SMTP_HOST"]?.trim() && from && !/[\r\n]/.test(from));
  const reason = !smtpConfigured ? "Trimiterea rezumatelor prin e-mail nu este configurată pe acest server. Actualizările rămân disponibile aici."
    : !origin?.startsWith("https:") ? "Rezumatele prin e-mail cer adresa HTTPS a aplicației, configurată pe server."
    : null;
  return { origin, from, available: reason === null, reason };
}

/** Completed UTC days make retries and schedules independent of DST changes. */
export function monitoringDigestPeriod(value?: string, now = new Date()): { period: string; start: Date; end: Date } {
  const period = value ?? new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()) - 86_400_000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error("Ziua trebuie scrisă AAAA-LL-ZZ.");
  const start = new Date(`${period}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0,10) !== period) throw new Error("Zi calendaristică invalidă.");
  const end = new Date(start.getTime() + 86_400_000);
  if (end > now) throw new Error("Rezumatul poate include doar o zi UTC încheiată.");
  return { period, start, end };
}

async function usingDb<T>(database: DbSql | undefined, run: (sql: DbSql) => Promise<T>): Promise<T> {
  const owned = database ? null : createDb();
  try { return await run(database ?? owned!.sql); }
  finally { await owned?.sql.end(); }
}
const iso = (value: unknown): string | null => value == null ? null : new Date(String(value)).toISOString();
const day = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);

export async function getMonitoringDigestStatus(userId: string, database?: DbSql): Promise<MonitoringDigestStatus> {
  return usingDb(database,async sql => {
    const [user] = await sql`select email_verified,banned from auth.users where id=${userId}`;
    const [count] = await sql`select count(*)::int count from app.monitoring_watches where owner_user_id=${userId} and not paused and preferences->>'digest'='true'`;
    const [latest] = await sql`select period,status,update_count,sent_at,error,started_at from app.monitoring_digest_deliveries where owner_user_id=${userId} order by period desc,created_at desc limit 1`;
    const config = monitoringDigestConfig();
    const verified = Boolean(user?.email_verified && !user.banned);
    // If a process disappeared after starting SMTP, the UI must not imply that
    // delivery is still progressing indefinitely, even before the next worker.
    const stale = latest?.status === "sending" && new Date(String(latest.started_at)).getTime() < Date.now() - 10 * 60_000;
    return { available: config.available && verified,
      reason: !verified ? "Confirmă adresa contului cu un cod primit prin e-mail înainte de a activa rezumatul." : config.reason,
      optedInWatches: Number(count?.count ?? 0),
      latest: latest ? { period:day(latest.period),status:stale ? "uncertain" : latest.status as MonitoringDigestState,
        updateCount:Number(latest.update_count),sentAt:iso(latest.sent_at),error:stale ? UNCERTAIN_MESSAGE : latest.error == null ? null : String(latest.error) } : null };
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[char]!);
}
/** No contract amounts, findings, people, or source content are copied into mail. */
export function renderMonitoringDigest(digest: ClaimedDigest, config: Pick<DigestConfig,"origin"|"from">): DigestMessage {
  if (!config.origin?.startsWith("https://")) throw new Error("Origine HTTPS necesară pentru trimitere.");
  const subject = `${digest.updates.length} ${digest.updates.length === 1 ? "actualizare nouă" : "actualizări noi"} în urmăririle tale`;
  const settings = `${config.origin}/urmariri`;
  const inbox = `${config.origin}/urmariri`;
  const shown = digest.updates.slice(0,20);
  const intro = `Rezumatul tău zilnic cinecâștigă, pentru ${digest.period.split("-").reverse().join(".")} (UTC). Deschide actualizările pentru explicații și sursele exacte; accesul cere autentificare.`;
  const rows = shown.map(update => {
    const title = update.title.replace(/[\r\n\u0000-\u001f]/g," ").slice(0,200);
    const href = `${config.origin}/urmariri/${encodeURIComponent(update.watchId)}/actualizari/${encodeURIComponent(update.id)}`;
    const count = update.count > 0
      ? `${update.count} ${update.count === 1 ? "înregistrare de verificat" : "înregistrări de verificat"}`
      : "Vezi ce s-a schimbat";
    return { title,href,count };
  });
  const extra = digest.updates.length > shown.length ? `Încă ${digest.updates.length - shown.length} actualizări sunt disponibile în aplicație.` : "";
  const footer = "Primești acest mesaj deoarece ai ales rezumatul zilnic pentru cel puțin o urmărire. Îl poți opri din setările urmăririi. Unele actualizări privesc înregistrări istorice observate ulterior sau date corectate; nu implică o achiziție nouă ori o neregulă.";
  return { to:digest.email,from:config.from,subject,
    messageId:`<monitoring-${digest.id}@${new URL(config.origin).hostname}>`,
    text:[intro,"",...rows.map(row => `${row.title} — ${row.count}\n${row.href}`),extra,"",`${footer}\nPreferințe: ${settings}`].filter(Boolean).join("\n\n"),
    html:`<!doctype html><html lang="ro"><body><p>${escapeHtml(intro)}</p><ul>${rows.map(row => `<li><a href="${escapeHtml(row.href)}">${escapeHtml(row.title)}</a> — ${escapeHtml(row.count)}</li>`).join("")}</ul>${extra ? `<p>${escapeHtml(extra)} <a href="${escapeHtml(inbox)}">Vezi toate actualizările</a></p>` : ""}<p>${escapeHtml(footer)}</p><p><a href="${escapeHtml(settings)}">Schimbă preferințele de e-mail</a></p></body></html>` };
}

async function eligibleRecipients(sql: DbSql, start: Date, end: Date) {
  return sql`select u.id owner_id,u.email,jsonb_agg(r.id order by r.checked_at,r.id) run_ids,count(*)::int update_count
    from auth.users u join app.monitoring_watches w on w.owner_user_id=u.id
    join app.monitoring_runs r on r.watch_id=w.id
    left join app.monitoring_reviews review on review.run_id=r.id
    where u.email_verified and not coalesce(u.banned,false) and not w.paused and w.preferences->>'digest'='true'
      and r.kind='update' and r.has_alert and review.run_id is null and r.checked_at>=${start.toISOString()}::timestamptz and r.checked_at<${end.toISOString()}::timestamptz
    group by u.id,u.email order by u.id`;
}

async function claimDigest(sql: DbSql, id: string, origin: string): Promise<ClaimedDigest | null> {
  return await sql.begin(async tx => {
    const q = tx as unknown as DbSql;
    const [delivery] = await q`select * from app.monitoring_digest_deliveries where id=${id} and status in ('queued','failed') for update skip locked`;
    if (!delivery) return null;
    const [user] = await q`select email,email_verified,banned from auth.users where id=${delivery.owner_user_id}`;
    const ids = Array.isArray(delivery.run_ids) ? delivery.run_ids.map(String) : [];
    const updates = user?.email_verified && !user.banned && user.email === delivery.recipient_email && ids.length
      ? await q`select r.id,r.watch_id,w.title,r.relevant_counts from app.monitoring_runs r join app.monitoring_watches w on w.id=r.watch_id
          left join app.monitoring_reviews review on review.run_id=r.id
          where r.id in ${q(ids)} and w.owner_user_id=${delivery.owner_user_id} and not w.paused and w.preferences->>'digest'='true'
          and r.has_alert and review.run_id is null order by r.checked_at,r.id`
      : [];
    if (!updates.length) {
      await q`update app.monitoring_digest_deliveries set status='cancelled',update_count=0,updated_at=now(),error='Preferințele, adresa contului sau starea actualizărilor s-au schimbat. Nu am trimis rezumatul.' where id=${id}`;
      return null;
    }
    const result: ClaimedDigest = { id,email:String(user!.email),ownerId:String(delivery.owner_user_id),period:day(delivery.period),
      updates:updates.map(row => { const counts = row.relevant_counts as Record<string,unknown>;
        return { id:String(row.id),watchId:String(row.watch_id),title:String(row.title),count:["added","changed","removed"].reduce((sum,key) => sum + Math.max(0,Number(counts?.[key]) || 0),0) }; }) };
    const messageId = `<monitoring-${id}@${new URL(origin).hostname}>`;
    await q`update app.monitoring_digest_deliveries set status='sending',started_at=now(),updated_at=now(),error=null,message_id=${messageId},update_count=${result.updates.length},run_ids=${JSON.stringify(result.updates.map(row => row.id))}::jsonb where id=${id}`;
    return result;
  }) as ClaimedDigest | null;
}

function smtpDeliverer(): DigestDeliverer {
  const transport = nodemailer.createTransport({ host:process.env["SMTP_HOST"],port:Number(process.env["SMTP_PORT"] ?? 587),secure:process.env["SMTP_SECURE"] === "true",
    ...(process.env["SMTP_USER"] ? { auth:{ user:process.env["SMTP_USER"],pass:process.env["SMTP_PASS"] ?? "" } } : {}),
    connectionTimeout:15_000,greetingTimeout:15_000,socketTimeout:30_000 });
  return async message => { const result = await transport.sendMail(message); return { accepted:result.accepted ?? [] }; };
}

export interface MonitoringDigestReport { period: string; mode: "preview" | "send"; eligibleRecipients: number; updates: number; queued: number; sent: number; failed: number; uncertain: number; cancelled: number }
export async function runMonitoringDigests(options: { period?: string; send?: boolean; database?: DbSql; deliver?: DigestDeliverer; now?: Date } = {}): Promise<MonitoringDigestReport> {
  const period = monitoringDigestPeriod(options.period,options.now);
  const config = monitoringDigestConfig();
  if (options.send && !config.available) throw new Error(config.reason!);
  return usingDb(options.database,async sql => {
    const eligible = await eligibleRecipients(sql,period.start,period.end);
    const report: MonitoringDigestReport = { period:period.period,mode:options.send ? "send" : "preview",eligibleRecipients:eligible.length,
      updates:eligible.reduce((sum,row) => sum + Number(row.update_count),0),queued:0,sent:0,failed:0,uncertain:0,cancelled:0 };
    if (!options.send) return report;
    // A stale sending state might already have reached SMTP. Never put it back
    // in the queue: there is no exactly-once delivery guarantee with SMTP.
    const uncertain = await sql`update app.monitoring_digest_deliveries set status='uncertain',updated_at=now(),error=${UNCERTAIN_MESSAGE}
      where status='sending' and started_at<now()-interval '10 minutes' returning id`;
    report.uncertain = uncertain.length;
    for (const recipient of eligible) {
      const inserted = await sql`insert into app.monitoring_digest_deliveries (owner_user_id,recipient_email,period,run_ids,update_count)
        values (${recipient.owner_id},${recipient.email},${period.period},${JSON.stringify(recipient.run_ids)}::jsonb,${recipient.update_count})
        on conflict (owner_user_id,period) do nothing returning id`;
      report.queued += inserted.length;
    }
    const pending = await sql`select id from app.monitoring_digest_deliveries where period=${period.period} and status in ('queued','failed') order by created_at,id`;
    const deliver = options.deliver ?? smtpDeliverer();
    for (const row of pending) {
      const digest = await claimDigest(sql,String(row.id),config.origin!);
      if (!digest) continue;
      const message = renderMonitoringDigest(digest,config);
      try {
        const delivered = await deliver(message);
        const accepted = delivered.accepted.some(address => (typeof address === "string" ? address : (address as { address?: unknown })?.address) === digest.email);
        if (!accepted) {
          await sql`update app.monitoring_digest_deliveries set status='failed',updated_at=now(),error='Serverul de e-mail a respins destinatarul. Actualizările sunt disponibile în aplicație.' where id=${digest.id} and status='sending'`;
          report.failed++;
        } else {
          await sql`update app.monitoring_digest_deliveries set status='sent',sent_at=now(),updated_at=now(),message_id=${message.messageId},error=null where id=${digest.id} and status='sending'`;
          report.sent++;
        }
      } catch {
        // An exception may occur after SMTP accepted the message or after the
        // send succeeded but DB acknowledgement failed. Do not guess/retry.
        await sql`update app.monitoring_digest_deliveries set status='uncertain',updated_at=now(),error=${UNCERTAIN_MESSAGE} where id=${digest.id} and status='sending'`;
        report.uncertain++;
      }
    }
    const [cancelled] = await sql`select count(*)::int count from app.monitoring_digest_deliveries where period=${period.period} and status='cancelled'`;
    report.cancelled = Number(cancelled?.count ?? 0);
    return report;
  });
}
