import { sql } from 'drizzle-orm';
import { pgTable, text, integer, jsonb, timestamp, uuid, bigint, bigserial, uniqueIndex, index, check, customType, primaryKey } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';
const bytea = customType<{ data: Buffer }>({dataType: () => 'bytea'});
// Archived source and derivative bytes are immutable, content-addressed, and shared.
export const documentBlobs = appSchema.table('document_blobs', {
  hash: text('hash').primaryKey(), bytes: bytea('bytes').notNull(), mime: text('mime').notNull(),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(),
}, t=>[check('document_blob_size',sql`octet_length(${t.bytes}) <= 52428800`)]);
export const documentNotices = appSchema.table('document_notices', {
  key: text('key').primaryKey(), noticeId: text('notice_id').notNull(), noticeType: integer('notice_type').notNull(),
  noticeNo: text('notice_no').notNull(), title: text('title').notNull(), url: text('url').notNull(),
  checkedAt: timestamp('checked_at',{withTimezone:true}), total: integer('total'),
});
export const procurementDocuments = appSchema.table('procurement_documents', {
  id: uuid('id').primaryKey().defaultRandom(), noticeKey: text('notice_key').notNull().references(()=>documentNotices.key),
  sourceId: text('source_id').notNull(), code: text('code').notNull(), filename: text('filename').notNull(),
  publishedAt: text('published_at'), originalHash: text('original_hash').references(()=>documentBlobs.hash),
  pdfHash: text('pdf_hash').references(()=>documentBlobs.hash), downloadedAt: timestamp('downloaded_at',{withTimezone:true}),
  processedAt: timestamp('processed_at',{withTimezone:true}), pageCount: integer('page_count'),
  signature: text('signature'), processor: text('processor'),
},t=>[uniqueIndex('procurement_document_source_uq').on(t.noticeKey,t.sourceId)]);
export const documentPages = appSchema.table('document_pages', {
  documentId: uuid('document_id').notNull().references(()=>procurementDocuments.id),
  page: integer('page').notNull(), text: text('text').notNull(), method: text('method').notNull(),
},t=>[primaryKey({columns:[t.documentId,t.page]}),check('document_page_positive',sql`${t.page}>0`)]);
// Explicit, bounded operator pilots; ordinary on-demand jobs retain their serial policy.
export const documentBatches = appSchema.table('document_batches', {
 id: text('id').primaryKey(), status:text('status').notNull().default('running'),
 maxRequests:integer('max_requests').notNull(),requestsStarted:integer('requests_started').notNull().default(0),
 maxFiles:integer('max_files').notNull(),concurrency:integer('concurrency').notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
 finishedAt:timestamp('finished_at',{withTimezone:true}),
},t=>[check('document_batch_limits',sql`${t.maxRequests} between 1 and 300 and ${t.requestsStarted} between 0 and ${t.maxRequests} and ${t.maxFiles} between 1 and 50 and ${t.concurrency} between 1 and 10`),check('document_batch_status',sql`${t.status} in ('running','complete','stopped')`)]);
export const documentJobs = appSchema.table('document_jobs', {
  id: uuid('id').primaryKey().defaultRandom(), noticeKey: text('notice_key').notNull().references(()=>documentNotices.key),
  batchId:text('batch_id').references(()=>documentBatches.id), slot:integer('slot').notNull().default(0),
  documentId: uuid('document_id').references(()=>procurementDocuments.id), kind: text('kind').notNull(),
  dedupKey: text('dedup_key').notNull(), status: text('status').notNull().default('queued'), stage: text('stage').notNull().default('queued'),
  pagesDone: integer('pages_done').default(0).notNull(), pagesTotal: integer('pages_total'), error: text('error'),
  requestedBy: text('requested_by').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  startedAt: timestamp('started_at',{withTimezone:true}), finishedAt: timestamp('finished_at',{withTimezone:true}),
},t=>[uniqueIndex('document_jobs_active_key').on(t.dedupKey).where(sql`${t.status} in ('queued','running')`),
  uniqueIndex('document_jobs_running_slot').on(t.slot).where(sql`${t.status} = 'running'`),index('document_jobs_queue').on(t.status,t.createdAt),
  check('document_job_slot',sql`${t.slot} between 0 and 13 and (${t.batchId} is not null or ${t.slot}=0)`),
  check('document_job_status',sql`${t.status} in ('queued','running','complete','failed')`),check('document_job_kind',sql`${t.kind} in ('list','file')`)]);
export const documentRequests = appSchema.table('document_requests', {
  id: bigserial('id',{mode:'number'}).primaryKey(), jobId: uuid('job_id').notNull().references(()=>documentJobs.id),
  method: text('method').notNull(), endpoint: text('endpoint').notNull(), status: integer('status'), bytes: integer('bytes'),
  startedAt: timestamp('started_at',{withTimezone:true}).defaultNow().notNull(), finishedAt: timestamp('finished_at',{withTimezone:true}),
});
