import {sql} from 'drizzle-orm';
import {bigint,check,numeric,text} from 'drizzle-orm/pg-core';
import {martsSchema} from './marts.js';

/** Publications without a source type that the last processing run reads as frameworks (src/contract-reporting.ts
 * buildNoticeFrameworks, migration 0120): by their notice's own total, or by a title the title rule misses. */
export const contractNoticeFrameworks=martsSchema.table('contract_notice_frameworks',{
 contractId:bigint('contract_id',{mode:'bigint'}).primaryKey(),
 rule:text('rule').notNull(),valueRon:numeric('value_ron'),
 calloffSum:numeric('calloff_sum'),noticeTotal:numeric('notice_total'),
},t=>[check('contract_notice_frameworks_rule',sql`${t.rule} in ('notice_total','title')`)]);
