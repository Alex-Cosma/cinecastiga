import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';

/** One scheduled attempt per Romanian day; explicit operator repairs have separate runs. */
export const processingRuns = appSchema.table('processing_runs', {
 id: uuid('id').primaryKey().defaultRandom(),
 scheduledDay: date('scheduled_day').notNull(),
 trigger: text('trigger').notNull().default('scheduled'),
 scope: text('scope').notNull(), status: text('status').notNull().default('running'),
 stage: text('stage').notNull().default('drain'),
 startedAt: timestamp('started_at',{withTimezone:true}).notNull().defaultNow(),
 stageStartedAt: timestamp('stage_started_at',{withTimezone:true}).notNull().defaultNow(),
 heartbeatAt: timestamp('heartbeat_at',{withTimezone:true}).notNull().defaultNow(),
 completedAt: timestamp('completed_at',{withTimezone:true}),
 controlRevision: integer('control_revision').notNull(),
 beforeControl: jsonb('before_control').notNull(),
 stages: jsonb('stages').notNull().default({}),
 rawBoundary: text('raw_boundary'), checkpointId: uuid('checkpoint_id'),
 searchVerified: jsonb('search_verified'), error: text('error'),
}, t=>[
 uniqueIndex('processing_runs_day').on(t.scheduledDay).where(sql`${t.trigger} = 'scheduled'`),
 index('processing_runs_started').on(t.startedAt),
 check('processing_scope',sql`${t.scope} in ('daily','full')`),
 check('processing_trigger',sql`${t.trigger} in ('scheduled','manual')`),
 check('processing_status',sql`${t.status} in ('running','ready','failed')`),
 check('processing_completion',sql`(${t.status}='running' and ${t.completedAt} is null) or (${t.status}<>'running' and ${t.completedAt} is not null)`),
]);
