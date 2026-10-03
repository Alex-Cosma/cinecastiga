import { sql } from 'drizzle-orm';
import { check, date, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';

/** Explicit operator opt-in; a deploy never schedules a historical rewrite. */
export const dataRepairs = appSchema.table('data_repairs', {
  id: text('id').primaryKey(),
  scheduledDay: date('scheduled_day').notNull(),
  status: text('status').notNull().default('scheduled'),
  processingRunId: uuid('processing_run_id'),
  report: jsonb('report'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [check('data_repair_status', sql`${t.status} in ('scheduled','applied','completed','failed')`)]);
