import { sql } from 'drizzle-orm';
import { check, index, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { appSchema } from './app.js';

/** One row per operator incident. The key makes delivery at most once per
 * incident; an open state-based incident is closed when the condition clears. */
export const operationalAlerts = appSchema.table('operational_alerts', {
  key: text('key').primaryKey(),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  recipients: integer('recipients'),
  error: text('error'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, t => [
  index('operational_alerts_kind_open').on(t.kind).where(sql`${t.resolvedAt} is null`),
  check('operational_alert_status', sql`${t.status} in ('pending','sent','failed')`),
]);
