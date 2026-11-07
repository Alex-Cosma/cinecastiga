// Browser check of the administration (structure of 7 November 2026): every page at 1280 light, 1280 dark and 390,
// the old addresses' redirects and the collector's rare states. Read-only towards the app: the status is rewritten in
// the browser for the rare states and every non-GET request is aborted, so no command reaches the server. It writes
// only a temporary admin and its session in the LOCAL database (removed at the end). Never point it at production.
//
//   cd apps/web && node scripts/admin/check-admin.mjs            # against `next dev` on http://localhost:3000
//   ADMIN_CHECK_BASE=http://localhost:3100 ADMIN_CHECK_OUT=/tmp/admin-check node scripts/admin/check-admin.mjs
import {readFile, mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac, randomUUID, randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createDb} from '@seap/db';

const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const base = process.env.ADMIN_CHECK_BASE ?? 'http://localhost:3000';
if (!loopback(new URL(base).hostname)) throw Error('Local app only (ADMIN_CHECK_BASE must be localhost).');
const env = parseEnv(await readFile('.env.local', 'utf8'));
const dbUrl = process.env.ADMIN_CHECK_DATABASE_URL ?? env.DATABASE_URL;
if (!dbUrl || !loopback(new URL(dbUrl).hostname)) throw Error('Local database only (the app\'s DATABASE_URL must be on localhost).');
const secret = env.BETTER_AUTH_SECRET;
if (!secret) throw Error('BETTER_AUTH_SECRET missing in .env.local.');
const out = process.env.ADMIN_CHECK_OUT ?? path.join(tmpdir(), 'admin-check');
await mkdir(out, {recursive: true});

const PAGES = [
  {name: 'acum', url: '/admin', h1: 'Acum', tab: '/admin'},
  {name: 'fluxuri', url: '/admin/trafic', h1: 'Trafic SEAP', tab: '/admin/trafic', sub: '/admin/trafic'},
  {name: 'conexiune', url: '/admin/trafic/conexiune', h1: 'Trafic SEAP', tab: '/admin/trafic', sub: '/admin/trafic/conexiune'},
  {name: 'jurnal', url: '/admin/trafic/jurnal', h1: 'Trafic SEAP', tab: '/admin/trafic', sub: '/admin/trafic/jurnal'},
  {name: 'procesare', url: '/admin/procesare', h1: 'Procesare', tab: '/admin/procesare'},
  {name: 'fisiere', url: '/admin/fisiere', h1: 'Fișiere', tab: '/admin/fisiere'},
  {name: 'oameni', url: '/admin/oameni', h1: 'Oameni', tab: '/admin/oameni'},
];
const VARIANTS = [
  {tag: '1280', width: 1280, height: 900, scheme: 'light'},
  {tag: '1280-dark', width: 1280, height: 900, scheme: 'dark'},
  {tag: '390', width: 390, height: 844, scheme: 'light', phone: true},
];
const REDIRECTS = [['/admin/conexiune', '/admin/trafic/conexiune'], ['/admin/jurnal', '/admin/trafic/jurnal'], ['/admin/feedback', '/admin/oameni'], ['/admin/conturi?rol=admin', '/admin/oameni?rol=admin']];
// The collector's states the local data rarely has, written into the status JSON in the browser only.
const STATES = {
  blocked: (d, now) => { d.control.blocked_reason = 'SEAP a răspuns 403 la cererea de listă (verificare de test).'; d.control.blocked_until = new Date(now + 58 * 60000).toISOString(); d.control.paused = false; },
  maintenance: d => { d.control.maintenance = true; d.control.collection_during_maintenance = false; d.control.paused = false; },
  retry: (d, now) => { d.control.paused = false; d.timeoutRetry = {task_id: '1', last_request_id: '2', timeouts: 1, retry_at: new Date(now + 239000).toISOString(), stream: 'da'}; d.workers = [{id: 'w', kind: 'ingestion', state: 'idle', heartbeat_at: new Date(now).toISOString(), alive: true}]; },
  live: (d, now) => { d.control.paused = false; d.control.maintenance = false; d.control.blocked_reason = null; d.control.next_allowed_at = new Date(now + 42000).toISOString(); d.workers = [{id: 'w', kind: 'ingestion', state: 'idle', heartbeat_at: new Date(now).toISOString(), alive: true}]; },
};

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

const {sql} = createDb(dbUrl);
const userId = `admin-check-${randomUUID()}`, token = randomBytes(24).toString('base64url');
await sql`insert into auth.users(id,name,email,email_verified,role) values(${userId},'Verificare admin (temporar)',${userId + '@example.test'},true,'admin')`;
await sql`insert into auth.sessions(id,token,user_id,expires_at,created_at,updated_at) values(${randomUUID()},${token},${userId},now()+interval '1 hour',now(),now())`;
const cookie = {name: 'better-auth.session_token', value: encodeURIComponent(`${token}.${createHmac('sha256', secret).update(token).digest('base64')}`), url: base};
const browser = await chromium.launch({channel: 'chrome', headless: true});

/** A context that can read but never command: every non-GET request is aborted. */
async function open(v, rewrite) {
  const ctx = await browser.newContext({viewport: {width: v.width, height: v.height}, colorScheme: v.scheme, deviceScaleFactor: v.phone ? 2 : 1, isMobile: !!v.phone, hasTouch: !!v.phone});
  await ctx.addCookies([cookie]);
  await ctx.route('**/*', route => route.request().method() === 'GET' ? route.fallback() : route.abort());
  if (rewrite) await ctx.route('**/api/admin/collection', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const res = await route.fetch(), data = await res.json();
    rewrite(data, Date.parse(data.control.server_now));
    return route.fulfill({response: res, json: data});
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return {ctx, page, errors};
}
async function load(page, url) {
  const res = await page.goto(base + url, {waitUntil: 'domcontentloaded'});
  await page.addStyleTag({content: 'nextjs-portal{display:none!important}'});
  await page.waitForFunction(() => !document.querySelector('[data-g="admin"]') && !!document.querySelector('.admin-head h1'), null, {timeout: 30000}).catch(() => {});
  await page.waitForTimeout(1200);
  return res;
}

try {
  // 1. Every page, every variant.
  const titles = new Map();
  for (const v of VARIANTS) {
    const {ctx, page, errors} = await open(v);
    for (const p of PAGES) {
      const where = `${p.name} ${v.tag}`;
      errors.length = 0;
      const res = await load(page, p.url);
      if (res?.status() !== 200) fail(where, `HTTP ${res?.status()}`);
      const m = await page.evaluate(({phone}) => {
        const root = document.querySelector('.collection-admin');
        const visible = e => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
        const own = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        return {
          h1: document.querySelector('.admin-head h1')?.childNodes[0]?.textContent?.trim(),
          tab: document.querySelector('.admin-tabs [aria-current]')?.getAttribute('href'),
          sub: document.querySelector('.admin-subnav [aria-current]')?.getAttribute('href') ?? null,
          title: document.title,
          error: !!document.querySelector('.admin-error'),
          overflow: document.documentElement.scrollWidth > innerWidth,
          wide: root ? [...root.querySelectorAll('*')].filter(e => visible(e) && getComputedStyle(e).position !== 'fixed' && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('[hidden]')).slice(0, 3).map(e => e.className || e.tagName) : [],
          small: phone && root ? [...root.querySelectorAll('*')].filter(e => visible(e) && own(e) && parseFloat(getComputedStyle(e).fontSize) < 12 && getComputedStyle(e).textTransform !== 'uppercase' && !e.closest('.sr-only,.g-sr')).slice(0, 3).map(e => `${e.className || e.tagName}:${getComputedStyle(e).fontSize}`) : [],
        };
      }, {phone: !!v.phone});
      if (m.h1 !== p.h1) fail(where, `h1 "${m.h1}"`);
      if (m.tab !== p.tab) fail(where, `active tab ${m.tab}`);
      if ((p.sub ?? null) !== m.sub) fail(where, `active view ${m.sub}`);
      if (m.error) fail(where, 'status not readable');
      if (m.overflow || m.wide.length) fail(where, `horizontal overflow ${m.wide.join(', ')}`);
      if (m.small.length) fail(where, `text under 12px: ${m.small.join(', ')}`);
      if (errors.length) fail(where, `console: ${errors[0]}`);
      if (v.tag === '1280') { if ([...titles.values()].includes(m.title)) fail(where, `title "${m.title}" not unique`); titles.set(p.name, m.title); }
      await page.screenshot({path: path.join(out, `${p.name}-${v.tag}.png`), fullPage: true});
    }
    await ctx.close();
  }

  // 2. The old addresses answer with a temporary redirect that keeps the query.
  for (const [from, to] of REDIRECTS) {
    const res = await fetch(base + from, {redirect: 'manual', headers: {cookie: `${cookie.name}=${cookie.value}`}});
    const location = res.headers.get('location') ?? '';
    if (res.status !== 307 || !location.endsWith(to)) fail(`redirect ${from}`, `${res.status} → ${location}`);
  }

  // 3. The collector's rare states on Acum (desktop and phone).
  for (const v of [VARIANTS[0], VARIANTS[2]]) {
    for (const [state, rewrite] of Object.entries(STATES)) {
      const where = `state ${state} ${v.tag}`;
      const {ctx, page, errors} = await open(v, rewrite);
      await load(page, '/admin');
      const band = await page.evaluate(() => ({tone: document.querySelector('.live-band')?.dataset.state, disabled: document.querySelector('#pause')?.disabled, next: document.querySelector('.next-request strong')?.textContent}));
      const tone = {blocked: 'blocked', maintenance: 'maintenance', retry: 'waiting', live: 'live'}[state];
      if (band.tone !== tone) fail(where, `band tone ${band.tone}`);
      if (state === 'maintenance' && !band.disabled) fail(where, 'pause enabled during maintenance');
      if (state === 'retry' && !/\d+ (min|s)/.test(band.next ?? '')) fail(where, `countdown "${band.next}"`);
      if (state === 'blocked') {
        await page.click('#pause');
        await page.waitForTimeout(300);
        const panel = await page.evaluate(() => ({expanded: document.querySelector('#pause')?.getAttribute('aria-expanded'), focus: document.activeElement?.textContent, resume: [...document.querySelectorAll('#unblock button')].find(b => b.textContent === 'Reia colectarea')?.disabled, hint: document.querySelector('#unblock .hint')?.textContent}));
        if (panel.expanded !== 'true' || panel.focus !== 'Înainte de reluare') fail(where, `unblock panel ${JSON.stringify(panel)}`);
        if (panel.resume !== true || !panel.hint) fail(where, 'resume not held until the deadline');
      }
      if (errors.length) fail(where, `console: ${errors[0]}`);
      await page.screenshot({path: path.join(out, `state-${state}-${v.tag}.png`)});
      await ctx.close();
    }
  }

  // 4. A status that cannot be read on the first load shows its error and a retry, not an empty page.
  {
    const {ctx, page} = await open(VARIANTS[0]);
    await ctx.route('**/api/admin/collection', route => route.request().method() === 'GET' ? route.fulfill({status: 500, json: {error: 'test'}}) : route.abort());
    await page.goto(base + '/admin', {waitUntil: 'domcontentloaded'});
    const shown = await page.waitForSelector('.admin-error button', {timeout: 40000}).then(() => true).catch(() => false);
    if (!shown) fail('status unreadable', 'no error with "Reîncearcă"');
    await ctx.close();
  }
} finally {
  await browser.close();
  await sql`delete from auth.sessions where user_id=${userId}`;
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
}

console.log(`${PAGES.length} pages × ${VARIANTS.length} variants, ${REDIRECTS.length} redirects, ${Object.keys(STATES).length} states × 2 widths; screenshots in ${out}`);
if (failures.length) { console.log(`${failures.length} problems:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('All checks passed.');
