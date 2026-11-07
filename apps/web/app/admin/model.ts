import type {CollectionStatus} from '@/lib/admin/collection';

/*
 * The administration's map and the collection's state, shared by its pages (owner, 7 November 2026: "Acum" first,
 * then four sections; Trafic SEAP keeps its three views as sub-pages so each stays one task long).
 */
export type AdminView = 'acum' | 'trafic' | 'conexiune' | 'jurnal' | 'procesare' | 'fisiere' | 'oameni';
export const ADMIN_TABS = [
  {href: '/admin', label: 'Acum', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'},
  {href: '/admin/trafic', label: 'Trafic SEAP', icon: 'M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3-3m-3 3 3 3'},
  {href: '/admin/procesare', label: 'Procesare', icon: 'm9 5 10 7-10 7V5ZM4 5v14'},
  {href: '/admin/fisiere', label: 'Fișiere', icon: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8M8 17h6'},
  {href: '/admin/oameni', label: 'Oameni', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm7 .13a4 4 0 0 1 0 7.75'},
] as const;
export const TRAFFIC_VIEWS = [
  {href: '/admin/trafic', label: 'Fluxuri'},
  {href: '/admin/trafic/conexiune', label: 'Conexiune'},
  {href: '/admin/trafic/jurnal', label: 'Jurnal'},
] as const;
const VIEWS: Record<string, AdminView> = {
  '/admin': 'acum', '/admin/trafic': 'trafic', '/admin/trafic/conexiune': 'conexiune', '/admin/trafic/jurnal': 'jurnal',
  '/admin/procesare': 'procesare', '/admin/fisiere': 'fisiere', '/admin/oameni': 'oameni',
};
export const viewOf = (path: string): AdminView => VIEWS[path.replace(/\/$/, '') || '/admin'] ?? 'acum';
export const TITLES: Record<AdminView, string> = {
  acum: 'Acum', trafic: 'Trafic SEAP', conexiune: 'Trafic SEAP', jurnal: 'Trafic SEAP', procesare: 'Procesare', fisiere: 'Fișiere', oameni: 'Oameni',
};
export const tabOf = (view: AdminView) => view === 'conexiune' || view === 'jurnal' ? '/admin/trafic' : view === 'acum' ? '/admin' : `/admin/${view}`;

const zone = 'Europe/Bucharest';
export const fmt = (n: unknown) => new Intl.NumberFormat('ro-RO').format(Number(n ?? 0));
export const time = (s: unknown) => s ? new Date(String(s)).toLocaleTimeString('ro-RO', {hour: '2-digit', minute: '2-digit', timeZone: zone}) : '—';
export const seconds = (s: unknown) => s ? new Date(String(s)).toLocaleTimeString('ro-RO', {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: zone}) : '—';
export const date = (s: unknown) => s ? new Date(String(s)).toLocaleDateString('ro-RO', {day: 'numeric', month: 'short', year: 'numeric', timeZone: zone}) : '—';
/** Date and time with the year: "2 oct. 2026, 06:01" (one format for every dated line of the admin). */
export const when = (s: unknown) => s ? new Date(String(s)).toLocaleString('ro-RO', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone}) : '—';
export const stamp = (s: unknown) => s ? new Date(String(s)).toLocaleString('ro-RO', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone}) : '—';
/** "3 min 59 s" from seconds; under a minute "42 s". */
export const wait = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}` : `${sec} s`;
export const STREAM_LABELS: Record<string, string> = {
  da: 'Achiziții directe', tenders: 'Anunțuri de participare', awards: 'Anunțuri de atribuire', documents: 'Documente',
  catalogue: 'Catalogul instituțiilor', ted: 'Atribuiri TED (UE)',
};
export const WEEKDAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];

/** The band's tones: a healthy run is the only green one; maintenance and waits never look like it. */
export type Tone = 'live' | 'waiting' | 'paused' | 'blocked' | 'maintenance' | 'offline';
export interface CollectionState {
  tone: Tone; title: string; description: string; short: string;
  running: boolean; active: number; next: number; retry: CollectionStatus['timeoutRetry']; quiet: boolean;
  paused: boolean; blocked: boolean; maintenance: boolean; rawOnly: boolean; dailyReached: boolean; alive: boolean;
}

/** One reading of the collector for the band, the tabs and the summary; the same words everywhere. */
export function collectionState(data: CollectionStatus, stale: boolean, now: number): CollectionState {
  const c = data.control!;
  const dailyReached = c.daily_limit !== null && Number(data.today.attempts) >= Number(c.daily_limit);
  const workers = data.workers.filter(w => w.alive);
  const active = data.requests.filter(r => r.outcome === 'running').length;
  const paused = !!c.paused, maintenance = !!c.maintenance, blocked = !!c.blocked_reason;
  const alive = workers.some(w => ['documents', 'ingestion'].includes(w.kind));
  const quiet = !!data.quietWindow?.active, retry = data.timeoutRetry;
  const rawOnly = maintenance && !!c.collection_during_maintenance;
  const running = !quiet && !stale && !paused && (!maintenance || rawOnly) && !blocked && !dailyReached && alive;
  const next = Math.max(0, Math.ceil((Math.max(new Date(c.next_allowed_at ?? 0).getTime(), new Date(retry?.retry_at ?? 0).getTime()) - now) / 1000));
  const base = {running, active, next, retry, quiet, paused, blocked, maintenance, rawOnly, dailyReached, alive};
  if (stale) return {...base, tone: 'offline', short: 'status neactualizat', title: 'Nu mai primim statusul serverului.', description: 'Valorile sunt ultima stare cunoscută. Colectarea poate continua pe server.'};
  if (maintenance && !rawOnly) return {...base, tone: 'maintenance', short: 'mentenanță', title: 'Site-ul este în mentenanță.', description: 'Cererile noi către SEAP așteaptă încheierea mentenanței.'};
  if (blocked) return {...base, tone: 'blocked', short: 'oprită la eroare', title: 'Colectarea s-a oprit la un refuz SEAP.', description: String(c.blocked_reason)};
  if (paused) return {...base, tone: 'paused', short: 'pe pauză', title: 'Colectarea este pe pauză.', description: 'Datele și fișierele așteaptă. Progresul se păstrează.'};
  if (dailyReached) return {...base, tone: 'waiting', short: 'limită zilnică', title: 'Limita zilnică a fost atinsă.', description: `${fmt(c.daily_limit)} încercări azi. Cererile se reiau la 00:00.`};
  if (quiet) return {...base, tone: 'waiting', short: 'pauză programată', title: `Pauză SEAP până la ${time(data.quietWindow.resumes_at)}.`, description: 'Coada se reia singură după pauză.'};
  if (retry) {
    const attempt = `Încercarea ${Number(retry.timeouts) + 1}/3`;
    return {...base, tone: 'waiting', short: 'reîncercare programată', title: active ? 'Reîncercăm cererea după timeout.' : 'Timeout SEAP: reîncercare programată.',
      description: active ? `${attempt} e în curs. Restul traficului SEAP așteaptă.` : `${attempt}, cel mai devreme la ${time(retry.retry_at)}. Restul traficului SEAP așteaptă.`};
  }
  const lead = rawOnly ? 'Colectăm doar în arhivă: site-ul rămâne în mentenanță până la publicarea de noapte.' : '';
  if (active) return {...base, tone: 'live', short: 'activă', title: active > 1 ? `Preluăm ${active} răspunsuri din SEAP.` : 'Preluăm un răspuns din SEAP.', description: lead};
  if (alive) return {...base, tone: 'live', short: 'activă', title: 'Coada SEAP e pregătită.', description: lead};
  return {...base, tone: 'offline', short: 'fără semnal', title: 'Colectorul nu raportează.', description: 'Niciun serviciu n-a trimis semnal în ultimele 30 de secunde. Setările sunt salvate.'};
}

/** What the tab and the summary say about the recovery: progress, with gaps as information, never as an alarm. */
export function recoveryLine(data: CollectionStatus): string {
  const f = data.forecast;
  if (!f) return 'fără lot de recuperare';
  if (f.state === 'complete') return 'lot încheiat';
  const percent = f.percent ?? f.knownPercent;
  return percent === null ? 'în evaluare' : `≈ ${percent}% ${f.percent === null ? 'din pașii cunoscuți' : 'din munca estimată'}`;
}
