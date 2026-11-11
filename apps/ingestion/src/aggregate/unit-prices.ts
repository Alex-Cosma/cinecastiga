import {classifyPriceLine,LEAD_MIN_AWARDS,LEAD_MIN_BUYERS,LEAD_MIN_EXCESS,LEAD_MIN_RATIO,type DbSql} from '@seap/db';

/**
 * Unit prices (owner, 10 November 2026): every item line of an accepted direct award (marts.da_transactions) whose
 * name places it in a product family, with the price per kilogram, litre, piece… (packages/db/src/unit-prices.ts).
 * Lines without a readable measure are kept with their status, so a page can say what it could not compare.
 *
 * Two kinds of lines are no purchase prices and get the status „budget” (audit of 11 November 2026), never compared:
 *  - a blended price: the same buyer, supplier and day with three or more different products at the identical unit
 *    price (bananas, oranges, chicken legs and butter all at 7,34 lei);
 *  - a yearly ceiling contract: the same buyer, supplier and day with ten or more one-line awards, at least four in
 *    five of them with a price in whole or half lei and a quantity of 100 or more (a kindergarten's 25 awards of one
 *    day: „Paste făinoase” 2 510 kg at 35 lei). The quantities are estimates and the prices ceilings.
 * Offline, public data only; one transaction: a failure leaves the tables as they were. In a shadow build they start
 * empty, so a failure leaves them empty and the pages show their empty state; processing.ts catches it and publishes.
 */
export async function buildUnitPrices(sql:DbSql,log:(message:string)=>void=()=>{}) {
 const started=Date.now();
 return sql.begin(async q=>{
  await q`select pg_advisory_xact_lock(729118,2)`;
  await q`set local statement_timeout = '0'`;
  await q`truncate marts.unit_price_lines`;
  await q`truncate marts.unit_price_buyers`;
  await q`truncate marts.unit_price_groups`;
  type Row={item_id:string;name:string|null;cpv:string|null;unit_raw:string|null;quantity:string|null;price:string|null;
   sicap_da_id:string;authority_id:string;supplier_id:string|null;fin:string|null;year:number};
  // Millions of lines (the 2020 dump's items, 11 November 2026): read fixed ranges of item ids and insert each range's
  // placed lines before the next, so memory stays bounded and one transaction still swaps the whole table.
  const [bounds]=await q`select coalesce(min(id),0)::text lo,coalesce(max(id),0)::text hi from core.da_items`;
  const STEP=50_000n;
  let scanned=0,placed=0;
  for(let from=BigInt(bounds!.lo)-1n;from<BigInt(bounds!.hi);from+=STEP){
   // The award's own population and canonical parties; a suspect value is not a price to compare.
   const page=await q`select i.id::text item_id,i.catalog_item_name name,i.cpv_code cpv,i.unit_raw,i.quantity::text quantity,
     i.closing_price::text price,t.sicap_da_id::text,t.authority_id::text,t.supplier_id::text,
     (d.finalization_date at time zone 'Europe/Bucharest')::date::text as fin,
     extract(year from d.finalization_date at time zone 'Europe/Bucharest')::int as year
    from core.da_items i
    join core.direct_acquisitions d on d.id=i.da_id
    join marts.da_transactions t on t.sicap_da_id=d.sicap_da_id
    where i.id>${String(from)}::bigint and i.id<=${String(from+STEP)}::bigint
     and t.authority_id is not null and d.finalization_date is not null and not coalesce(t.value_suspect,false)` as unknown as Row[];
   const rows:Record<string,unknown>[]=[];
   for(const r of page){
    scanned++;
    const c=classifyPriceLine(r.name,r.cpv,r.unit_raw,r.price==null?null:Number(r.price));
    if(!c)continue;
    rows.push({item_id:r.item_id,family:c.family,pack:c.pack,status:c.status,year:r.year,finalization_date:r.fin,
     sicap_da_id:r.sicap_da_id,authority_id:r.authority_id,supplier_id:r.supplier_id,item_name:r.name,unit_raw:r.unit_raw,
     quantity:r.quantity,unit_price:r.price,measure:c.measure==null?null:String(c.measure),measure_source:c.measureSource,
     price_per_unit:c.pricePerUnit==null?null:c.pricePerUnit.toFixed(6)});
   }
   for(let i=0;i<rows.length;i+=2_000)await q`insert into marts.unit_price_lines ${q(rows.slice(i,i+2_000))}`;
   placed+=rows.length;
  }
  await q`analyze marts.unit_price_lines`;
  // Blended prices: three or more different products at one unit price, same buyer, supplier and day.
  const blended=await q`update marts.unit_price_lines l set status='budget'
   from (select authority_id,supplier_id,finalization_date,unit_price from marts.unit_price_lines
     where status='ok' group by 1,2,3,4 having count(distinct family)>=3) b
   where l.status='ok' and l.authority_id=b.authority_id and l.supplier_id is not distinct from b.supplier_id
    and l.finalization_date=b.finalization_date and l.unit_price=b.unit_price`;
  // Yearly ceiling contracts: ten or more one-line awards of one buyer, supplier and day, round prices, large quantities.
  const ceilings=await q`with da as (select distinct sicap_da_id from marts.unit_price_lines where status='ok'),
    days as (select distinct d.authority_entity_id a,d.supplier_entity_id s,(d.finalization_date at time zone 'Europe/Bucharest')::date dt
     from da join core.direct_acquisitions d using (sicap_da_id)),
    per_da as (select d.id,d.sicap_da_id,y.a,y.s,y.dt,count(*) items,max(i.quantity) quantity,max(i.closing_price) price
     from days y join core.direct_acquisitions d on d.authority_entity_id=y.a and d.supplier_entity_id is not distinct from y.s
       and d.finalization_date>=(y.dt::timestamp at time zone 'Europe/Bucharest') and d.finalization_date<((y.dt+1)::timestamp at time zone 'Europe/Bucharest')
      join core.da_items i on i.da_id=d.id group by 1,2,3,4,5),
    batch as (select a,s,dt from per_da group by 1,2,3 having count(*)>=10 and count(*) filter (where items=1)=count(*)
      and count(*) filter (where price*2=floor(price*2))>=0.8*count(*) and count(*) filter (where quantity>=100)>=0.8*count(*))
   update marts.unit_price_lines l set status='budget' from per_da p join batch b on b.a=p.a and b.s is not distinct from p.s and b.dt=p.dt
   where l.status='ok' and l.sicap_da_id=p.sicap_da_id`;
  log(`Unit prices: ${blended.count} lines at a blended price and ${ceilings.count} lines of yearly ceiling contracts kept out`);
  // Each buyer's price per product, pack and year: everything it bought of it, so one odd line does not make a lead.
  await q`insert into marts.unit_price_buyers (family,pack,year,authority_id,county,lines,awards,quantity,paid,price,supplier_ids)
   select l.family,l.pack,l.year,l.authority_id,max(p.county),count(*)::int,count(distinct l.sicap_da_id)::int,
    sum(l.quantity*l.measure),sum(l.quantity*l.unit_price),sum(l.quantity*l.unit_price)/sum(l.quantity*l.measure),
    coalesce(array_agg(distinct l.supplier_id) filter (where l.supplier_id is not null),'{}')
   from marts.unit_price_lines l
   left join marts.entity_profile p on p.entity_id=l.authority_id and p.role='authority'
   where l.status='ok' and l.quantity>0 and l.measure>0
   group by l.family,l.pack,l.year,l.authority_id`;
  // A product is compared only with at least five buyers in the year (owner, 10 November 2026).
  await q`insert into marts.unit_price_groups (family,pack,year,buyers,median,p10,p25,p75,p90,leads,excess,excess_all,max_ratio)
   select family,pack,year,count(*)::int,percentile_cont(0.5) within group (order by price),
    percentile_cont(0.1) within group (order by price),percentile_cont(0.25) within group (order by price),
    percentile_cont(0.75) within group (order by price),percentile_cont(0.9) within group (order by price),0,0,0,null
   from marts.unit_price_buyers group by family,pack,year having count(*)>=5`;
  // A lead (owner, 11 November 2026): twice the median or more, in at least two awards, at least 500 lei above the
  // median, in a group of at least twenty buyers. Smaller groups keep their median and band and name no one.
  await q`update marts.unit_price_buyers b set median=g.median,ratio=b.price/g.median,excess=greatest(b.paid-g.median*b.quantity,0),
    lead=(b.price/g.median>=${LEAD_MIN_RATIO} and b.awards>=${LEAD_MIN_AWARDS} and greatest(b.paid-g.median*b.quantity,0)>=${LEAD_MIN_EXCESS} and g.buyers>=${LEAD_MIN_BUYERS})
   from marts.unit_price_groups g where g.family=b.family and g.pack=b.pack and g.year=b.year`;
  await q`update marts.unit_price_groups g set leads=s.leads,excess=s.excess,excess_all=s.excess_all,max_ratio=s.max_ratio
   from (select family,pack,year,count(*) filter (where lead)::int leads,coalesce(sum(excess) filter (where lead),0) excess,
     coalesce(sum(excess) filter (where ratio>=${LEAD_MIN_RATIO}),0) excess_all,max(ratio) filter (where lead) max_ratio
     from marts.unit_price_buyers where ratio is not null group by family,pack,year) s
   where s.family=g.family and s.pack=g.pack and s.year=g.year`;
  await q`analyze marts.unit_price_buyers`;
  await q`analyze marts.unit_price_groups`;
  const [ok]=await q`select count(*)::int n from marts.unit_price_lines where status='ok'`;
  log(`Unit prices: ${scanned} item lines, ${placed} in a product family, ${ok!.n} compared, in ${Math.round((Date.now()-started)/1000)}s`);
  return {lines:scanned,placed,compared:ok!.n as number};
 });
}
