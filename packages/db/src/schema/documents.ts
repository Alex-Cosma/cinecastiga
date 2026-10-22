import { sql } from 'drizzle-orm';
import { pgTable, boolean, text, integer, jsonb, timestamp, uuid, bigint, bigserial, uniqueIndex, index, check, customType, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';
const bytea = customType<{ data: Buffer }>({dataType: () => 'bytea'});
// Archived source and derivative bytes are immutable, content-addressed, and shared.
export const documentBlobs = appSchema.table('document_blobs', {
  hash: text('hash').primaryKey(), bytes: bytea('bytes').notNull(), mime: text('mime').notNull(), size: bigint('size',{mode:'number'}),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(),
}, t=>[check('document_blob_size',sql`octet_length(${t.bytes}) <= 52428800`)]);
export const documentBlobChunks = appSchema.table('document_blob_chunks',{
 hash:text('hash').notNull().references(()=>documentBlobs.hash,{onDelete:'cascade'}), part:integer('part').notNull(), bytes:bytea('bytes').notNull(),
},t=>[primaryKey({columns:[t.hash,t.part]}),check('document_chunk_size',sql`octet_length(${t.bytes}) between 1 and 1048576`)]);
export const documentNotices = appSchema.table('document_notices', {
  key: text('key').primaryKey(), noticeId: text('notice_id').notNull(), noticeType: integer('notice_type').notNull(),
  noticeNo: text('notice_no').notNull(), title: text('title').notNull(), url: text('url').notNull(),
  automatic:boolean('automatic').notNull().default(false), sourceDate:timestamp('source_date',{withTimezone:true}),
  checkedAt: timestamp('checked_at',{withTimezone:true}), total: integer('total'),
});
export const procurementDocuments = appSchema.table('procurement_documents', {
  id: uuid('id').primaryKey().defaultRandom(), noticeKey: text('notice_key').notNull().references(()=>documentNotices.key),
  sourceId: text('source_id').notNull(), code: text('code').notNull(), filename: text('filename').notNull(),
  publishedAt: text('published_at'), originalHash: text('original_hash').references(()=>documentBlobs.hash),
  pdfHash: text('pdf_hash').references(()=>documentBlobs.hash), downloadedAt: timestamp('downloaded_at',{withTimezone:true}),
  processedAt: timestamp('processed_at',{withTimezone:true}), pageCount: integer('page_count'),
  signature: text('signature'), processor: text('processor'), preparation:jsonb('preparation'), contents:jsonb('contents'),
  classification:jsonb('classification'), classificationVersion:integer('classification_version').notNull().default(0),
  classificationPdfHash:text('classification_pdf_hash'), priority:integer('priority').notNull().default(100),
},t=>[uniqueIndex('procurement_document_source_uq').on(t.noticeKey,t.sourceId),index('procurement_document_priority').on(t.priority,t.noticeKey).where(sql`${t.processedAt} is null`)]);
export const documentPages = appSchema.table('document_pages', {
  documentId: uuid('document_id').notNull().references(()=>procurementDocuments.id),
  page: integer('page').notNull(), text: text('text').notNull(), method: text('method').notNull(),
},t=>[primaryKey({columns:[t.documentId,t.page]}),check('document_page_positive',sql`${t.page}>0`)]);
const tsvector = customType<{ data: string }>({dataType: () => 'tsvector'});
// Full-text index of page text, same expression as title search:
// to_tsvector('simple', unaccent(text)). A separate table, filled by a trigger on
// app.document_pages (migration 0079), so adding it never takes an exclusive lock
// on the page table that the reader and the running web use, and pages written
// by any worker version are indexed. A page without a row is readable, not searchable.
export const documentPageSearch = appSchema.table('document_page_search', {
  documentId: uuid('document_id').notNull(), page: integer('page').notNull(), search: tsvector('search').notNull(),
},t=>[primaryKey({columns:[t.documentId,t.page]}),
  foreignKey({name:'document_page_search_page_fk',columns:[t.documentId,t.page],foreignColumns:[documentPages.documentId,documentPages.page]}).onDelete('cascade'),
  index('document_page_search_idx').using('gin',t.search)]);
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
  automatic:boolean('automatic').notNull().default(false), attempts:integer('attempts').notNull().default(0), retryAt:timestamp('retry_at',{withTimezone:true}),
  batchId:text('batch_id').references(()=>documentBatches.id), slot:integer('slot').notNull().default(0),
  documentId: uuid('document_id').references(()=>procurementDocuments.id), kind: text('kind').notNull(),
  dedupKey: text('dedup_key').notNull(), status: text('status').notNull().default('queued'), stage: text('stage').notNull().default('queued'),
  pagesDone: integer('pages_done').default(0).notNull(), pagesTotal: integer('pages_total'), error: text('error'),
  requestedBy: text('requested_by').notNull(), createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  startedAt: timestamp('started_at',{withTimezone:true}), finishedAt: timestamp('finished_at',{withTimezone:true}),
},t=>[uniqueIndex('document_jobs_active_key').on(t.dedupKey).where(sql`${t.status} in ('queued','running')`),
  uniqueIndex('document_jobs_running_slot').on(t.slot).where(sql`${t.status} = 'running'`),index('document_jobs_queue').on(t.status,t.createdAt),
  check('document_job_slot',sql`${t.slot} between 0 and 13 and (${t.batchId} is not null or ${t.automatic} or ${t.slot}=0)`),
  check('document_job_status',sql`${t.status} in ('queued','running','complete','failed')`),check('document_job_kind',sql`${t.kind} in ('list','file')`)]);
export const documentRequests = appSchema.table('document_requests', {
  id: bigserial('id',{mode:'number'}).primaryKey(), jobId: uuid('job_id').notNull().references(()=>documentJobs.id),
  method: text('method').notNull(), endpoint: text('endpoint').notNull(), status: integer('status'), bytes: bigint('bytes',{mode:'number'}),
  startedAt: timestamp('started_at',{withTimezone:true}).defaultNow().notNull(), finishedAt: timestamp('finished_at',{withTimezone:true}),
});

export const documentCollectionControl=appSchema.table('document_collection_control',{
 id:integer('id').primaryKey().default(1),enabled:boolean('enabled').notNull().default(false),paused:boolean('paused').notNull().default(false),revision:integer('revision').notNull().default(0),
 downloadConcurrency:integer('download_concurrency').notNull().default(10),processingConcurrency:integer('processing_concurrency').notNull().default(4),
 startedAt:timestamp('started_at',{withTimezone:true}),heartbeatAt:timestamp('heartbeat_at',{withTimezone:true}),scannedAt:timestamp('scanned_at',{withTimezone:true}),error:text('error'),
},t=>[check('document_collection_singleton',sql`${t.id}=1`),check('document_collection_concurrency',sql`${t.downloadConcurrency} between 1 and 10 and ${t.processingConcurrency} between 1 and 4`)]);
