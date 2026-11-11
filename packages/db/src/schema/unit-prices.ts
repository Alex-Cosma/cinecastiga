import {bigint,boolean,date,index,integer,numeric,primaryKey,smallint,text} from 'drizzle-orm/pg-core';
import {martsSchema} from './marts.js';
/**
 * Item lines of direct awards placed in a product family and pack (src/unit-prices.ts), with the price per family
 * unit. Rebuilt by every processing run from core.da_items and the accepted awards (marts.da_transactions).
 */
export const unitPriceLines=martsSchema.table('unit_price_lines',{
 itemId:bigint('item_id',{mode:'bigint'}).primaryKey(),
 family:text('family').notNull(),
 /** PricePack.slug; empty when the family does not split packs. */
 pack:text('pack').notNull().default(''),
 /** ok | out_of_range | no_pack | no_size | two_sizes | unit_kind | ambiguous (two plausible readings) | budget (a blended
  * price or a yearly ceiling contract, set by the builder) */
 status:text('status').notNull(),
 year:smallint('year').notNull(),
 finalizationDate:date('finalization_date'),
 sicapDaId:bigint('sicap_da_id',{mode:'bigint'}).notNull(),
 authorityId:bigint('authority_id',{mode:'bigint'}).notNull(),
 supplierId:bigint('supplier_id',{mode:'bigint'}),
 itemName:text('item_name'),
 unitRaw:text('unit_raw'),
 quantity:numeric('quantity'),
 /** The final unit price as written (core.da_items.closing_price), lei excl. VAT. */
 unitPrice:numeric('unit_price'),
 /** Family units in one unit as written. */
 measure:numeric('measure'),
 measureSource:text('measure_source'),
 pricePerUnit:numeric('price_per_unit'),
},t=>[index('unit_price_lines_family_idx').on(t.family,t.year,t.status),index('unit_price_lines_da_idx').on(t.sicapDaId),
 index('unit_price_lines_authority_idx').on(t.authorityId)]);

/** One buyer's compared lines of one product and pack in one year: total quantity, total paid, price = paid / quantity. */
export const unitPriceBuyers=martsSchema.table('unit_price_buyers',{
 family:text('family').notNull(),
 pack:text('pack').notNull(),
 year:smallint('year').notNull(),
 authorityId:bigint('authority_id',{mode:'bigint'}).notNull(),
 county:text('county'),
 lines:integer('lines').notNull(),
 awards:integer('awards').notNull(),
 /** In the family's unit (kg, l, pieces…). */
 quantity:numeric('quantity').notNull(),
 paid:numeric('paid').notNull(),
 price:numeric('price').notNull(),
 /** The product-pack-year median across buyers (null when fewer than five buyers). */
 median:numeric('median'),
 ratio:numeric('ratio'),
 /** Lei above the median: paid − median × quantity, never below zero. */
 excess:numeric('excess'),
 /** A lead (LEAD_MIN_* in src/unit-prices.ts): ratio ≥ 2, at least two awards, excess ≥ 500 lei, group of ≥ 20 buyers. */
 lead:boolean('lead').notNull().default(false),
 supplierIds:bigint('supplier_ids',{mode:'bigint'}).array().notNull().default([]),
},t=>[primaryKey({columns:[t.family,t.pack,t.year,t.authorityId]}),index('unit_price_buyers_ratio_idx').on(t.year,t.family,t.pack,t.ratio),
 index('unit_price_buyers_authority_idx').on(t.authorityId)]);

/** A product and pack in one year with at least five buyers: the spread of buyer prices and the leads. */
export const unitPriceGroups=martsSchema.table('unit_price_groups',{
 family:text('family').notNull(),
 pack:text('pack').notNull(),
 year:smallint('year').notNull(),
 buyers:integer('buyers').notNull(),
 median:numeric('median').notNull(),
 p10:numeric('p10').notNull(),
 p25:numeric('p25').notNull(),
 p75:numeric('p75').notNull(),
 p90:numeric('p90').notNull(),
 /** Lead rows (unit_price_buyers.lead), the lei above the median of those rows, and their largest multiple. */
 leads:integer('leads').notNull(),
 excess:numeric('excess').notNull(),
 /** Lei above the median of every buyer at twice the median or more, lead or not. */
 excessAll:numeric('excess_all').notNull().default('0'),
 maxRatio:numeric('max_ratio'),
},t=>[primaryKey({columns:[t.family,t.pack,t.year]})]);
