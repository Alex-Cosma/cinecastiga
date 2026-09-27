/** Isolated TED replay adapter: existing CLIs, no source requests, no live publication. */
const target = process.env.TED_REPAIR_DATABASE;
if (!/^seap_benchmark_\d{8}$/.test(target ?? '')) throw Error('An explicit isolated benchmark database is required');
const allowed = new Set(['replay-ted', 'reconcile', 'ted-mart', 'monitoring-refresh']);
const [command, ...args] = process.argv.slice(2);
if (!allowed.has(command)) throw Error('Unsupported repair command');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + target;
process.env.DATABASE_URL = url.toString();
process.argv = [process.argv[0], command, ...args];
await import(`./${command}.js`);
