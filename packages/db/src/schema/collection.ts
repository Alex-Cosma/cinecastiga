import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, index, integer, jsonb, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';

export const collectionControl = appSchema.table('collection_control', {
 id: integer('id').primaryKey().default(1), revision: integer('revision').notNull().default(1),
 minSeconds: integer('min_seconds').notNull().default(50), maxSeconds: integer('max_seconds').notNull().default(70),
 dailyLimit: integer('daily_limit'), processingTime: text('processing_time').notNull().default('05:00'),
 processingEnabled: boolean('processing_enabled').notNull().default(false),
 processingEnabledAt: timestamp('processing_enabled_at',{withTimezone:true}),
 riskWeekday: integer('risk_weekday').notNull().default(0),
 paused: boolean('paused').notNull().default(true),
 pausedStreams: jsonb('paused_streams').$type<string[]>().notNull().default([]),
 blockedReason: text('blocked_reason'), blockedUntil: timestamp('blocked_until',{withTimezone:true}),
 nextAllowedAt: timestamp('next_allowed_at',{withTimezone:true}), lastFileAt: timestamp('last_file_at',{withTimezone:true}),
 maintenance: boolean('maintenance').notNull().default(false),
 createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('collection_singleton',sql`${t.id}=1`),check('collection_risk_weekday',sql`${t.riskWeekday} between 0 and 6`),check('collection_processing_activation',sql`not ${t.processingEnabled} or ${t.processingEnabledAt} is not null`),check('collection_delay_bounds',sql`${t.minSeconds} between 1 and 3600 and ${t.maxSeconds} between ${t.minSeconds} and 3600`),check('collection_daily_limit',sql`${t.dailyLimit} is null or ${t.dailyLimit}>0`),check('collection_processing_time',sql`${t.processingTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`)]);
export const collectionRequests = appSchema.table('collection_requests', {
 id: bigserial('id',{mode:'number'}).primaryKey(), stream: text('stream').notNull(), worker: text('worker').notNull(),
 method: text('method').notNull(), endpoint: text('endpoint').notNull(), parameters: jsonb('parameters').notNull().default({}),
 diagnostics: jsonb('diagnostics'),
 status: integer('status'), outcome: text('outcome').notNull().default('running'), error: text('error'),
 records: integer('records'), bytes: bigint('bytes',{mode:'number'}),
 startedAt: timestamp('started_at',{withTimezone:true}).notNull().defaultNow(), finishedAt: timestamp('finished_at',{withTimezone:true}),
},t=>[index('collection_requests_started').on(t.startedAt),index('collection_requests_stream_started').on(t.stream,t.startedAt),check('collection_request_outcome',sql`${t.outcome} in ('running','success','failed','interrupted')`)]);
export const collectionAudit = appSchema.table('collection_audit', {
 id: bigserial('id',{mode:'number'}).primaryKey(), actorId:text('actor_id').notNull(), actorName:text('actor_name').notNull(),
 action:text('action').notNull(), before:jsonb('before').notNull(), after:jsonb('after').notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const collectionWorkers = appSchema.table('collection_workers', {
 id:text('id').primaryKey(), kind:text('kind').notNull(), state:text('state').notNull(),
 heartbeatAt:timestamp('heartbeat_at',{withTimezone:true}).notNull().defaultNow(),
});

// Recovery identity is independent of historical ingestion watermarks. A batch
// freezes its end date; its manifest grows only from validated source responses.
export const collectionBatches = appSchema.table('collection_batches', {
 id:text('id').primaryKey(), endDay:text('end_day').notNull(),
 status:text('status').notNull().default('collecting'), nextStream:integer('next_stream').notNull().default(3),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('collection_batch_status',sql`${t.status} in ('collecting','collected','incomplete')`)]);
export const collectionTasks = appSchema.table('collection_tasks', {
 id:bigserial('id',{mode:'number'}).primaryKey(),
 batchId:text('batch_id').notNull().references(()=>collectionBatches.id),
 key:text('key').notNull(), partition:text('partition').notNull(),
 stream:text('stream').notNull(), kind:text('kind').notNull(),
 params:jsonb('params').notNull(), status:text('status').notNull().default('pending'),
 priority:integer('priority').notNull().default(10),
 result:jsonb('result'), error:text('error'),
 startedAt:timestamp('started_at',{withTimezone:true}), finishedAt:timestamp('finished_at',{withTimezone:true}),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('collection_task_key').on(t.batchId,t.key),
 index('collection_task_queue').on(t.batchId,t.status,t.stream,t.priority,t.id),
 index('collection_task_partition').on(t.batchId,t.partition),
 check('collection_task_status',sql`${t.status} in ('pending','running','complete','split','deferred','failed')`)]);
