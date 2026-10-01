/** COPY ONLY. Existing processor image, normal full pipeline; never source traffic.
 * Mount beside apps/ingestion/dist/scripts so relative imports use that image.
 * DO NOT repurpose this wrapper to run against the live database. */
const target = process.env.IDENTITY_REPAIR_DATABASE;
if (!/^seap_test_identity_[a-z0-9_]+$/.test(target ?? '')) throw Error('Explicit isolated identity database required');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + target;
url.searchParams.set('max_lifetime', '0');
process.env.DATABASE_URL = url.toString();
delete process.env.MEILISEARCH_URL;
delete process.env.MEILISEARCH_KEY;
const { createDb } = await import('@seap/db');
const { runMonitoringRefresh } = await import('../monitoring/refresh.js');
const { db, sql } = createDb();
try {
  const [identity] = await sql`select current_database() name`;
  if (identity.name !== target) throw Error('Wrong database');
  const [boundary] = await sql`select max(id)::text id from raw.raw_documents`;
  console.log(JSON.stringify({database: target, startedAt: new Date().toISOString(), rawBoundary: boundary.id}));
  const checkpoint = await runMonitoringRefresh(db, sql, {
    mode:'coordinated',scope:'full',log:console.log,
    ...(boundary.id ? {maxRawId: BigInt(boundary.id)} : {}),
  });
  console.log(JSON.stringify({database:target,checkpointId:checkpoint.id,status:checkpoint.status,completedAt:new Date().toISOString()}));
} finally { await sql.end({timeout:10}); }
