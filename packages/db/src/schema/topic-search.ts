import {sql} from 'drizzle-orm';
import {text,bigint,integer,numeric,index,customType,timestamp} from 'drizzle-orm/pg-core';
import {martsSchema} from './marts.js';
const tsvector=customType<{data:string}>({dataType:()=> 'tsvector'});
/** One procurement, irrespective of consortium size. Rebuilt atomically from public marts. */
export const topicAcquisitions=martsSchema.table('topic_acquisitions',{
 id:text('id').primaryKey(),kind:text('kind').notNull(),refId:bigint('ref_id',{mode:'bigint'}).notNull(),
 title:text('title').notNull(),search:tsvector('search').notNull(),
 authorityId:bigint('authority_id',{mode:'bigint'}),supplierIds:bigint('supplier_ids',{mode:'bigint'}).array().notNull(),
 county:text('county'),uatSiruta:integer('uat_siruta'),year:integer('year'),date:text('date'),
 value:numeric('value'),procedureId:text('procedure_id'),
},t=>[index('topic_search_idx').using('gin',t.search),index('topic_authority_idx').on(t.authorityId),
 index('topic_suppliers_idx').using('gin',t.supplierIds),index('topic_place_idx').on(t.uatSiruta),
 index('topic_county_year_idx').on(t.county,t.year),index('topic_procedure_idx').on(t.procedureId,t.authorityId)]);
export const topicSearchState=martsSchema.table('topic_search_state',{
 id:integer('id').primaryKey(),builtAt:timestamp('built_at',{withTimezone:true}).notNull().default(sql`now()`),records:bigint('records',{mode:'bigint'}).notNull(),titledRecords:bigint('titled_records',{mode:'bigint'}).notNull().default(sql`0`),
});
