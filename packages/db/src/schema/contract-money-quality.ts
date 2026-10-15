import { integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { martsSchema } from './marts.js';

/** Last completed monetary inventory, also retained when publication fails. */
export const contractMoneyQuality = martsSchema.table('contract_money_quality', {
  id: integer('id').primaryKey(),
  observation: jsonb('observation').notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});
