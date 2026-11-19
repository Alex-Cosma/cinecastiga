import {sql} from 'drizzle-orm';
import {bigint,boolean,check,numeric,text,timestamp} from 'drizzle-orm/pg-core';
import {appSchema} from './app.js';
import {martsSchema} from './marts.js';

/** An administrator's decision on a contract above the value cap, by its public SEAP number (migration 0113). */
export const contractValueDecisions=appSchema.table('contract_value_decisions',{
 contractNatId:bigint('contract_nat_id',{mode:'bigint'}).primaryKey(),
 decision:text('decision').notNull(),reason:text('reason').notNull(),decidedBy:text('decided_by').notNull(),
 decidedAt:timestamp('decided_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('contract_value_decision',sql`${t.decision} in ('include','exclude')`)]);

/** Every otherwise counted contract above the cap, as the last processing run judged it (src/contract-value-review.ts). */
export const contractValueReview=martsSchema.table('contract_value_review',{
 contractNatId:bigint('contract_nat_id',{mode:'bigint'}).primaryKey(),
 valueRon:numeric('value_ron').notNull(),admitted:boolean('admitted').notNull(),
 guard:text('guard'),decision:text('decision'),
 firstSeenAt:timestamp('first_seen_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
 check('contract_value_review_guard',sql`${t.guard} in ('lowest_offer','notice_value_missing','notice_sum')`),
 check('contract_value_review_decision',sql`${t.decision} in ('include','exclude')`),
 check('contract_value_review_admitted',sql`${t.admitted} = coalesce(${t.decision} = 'include', ${t.guard} is null)`),
]);
