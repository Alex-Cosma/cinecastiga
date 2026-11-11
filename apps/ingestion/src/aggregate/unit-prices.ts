import {classifyPriceLine,type DbSql} from '@seap/db';

/**
 * Unit prices (owner, 10 November 2026): every item line of an accepted direct award (marts.da_transactions) whose
 * name places it in a product family, with the price per kilogram, litre, piece… (packages/db/src/unit-prices.ts).
 * Lines without a readable measure are kept with their status, so a page can say what it could not compare.
 * Offline, public data only; atomic: a failure keeps the previous table.
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
  // Each buyer's price per product, pack and year: everything it bought of it, so one odd line does not make a lead.
  await q`insert into marts.unit_price_buyers (family,pack,year,authority_id,county,lines,awards,quantity,paid,price,supplier_ids)
   select l.family,l.pack,l.year,l.authority_id,max(p.county),count(*)::int,count(distinct l.sicap_da_id)::int,
    sum(l.quantity*l.measure),sum(l.quantity*l.unit_price),sum(l.quantity*l.unit_price)/sum(l.quantity*l.measure),
    coalesce(array_agg(distinct l.supplier_id) filter (where l.supplier_id is not null),'{}')
   from marts.unit_price_lines l
   left join marts.entity_profile p on p.entity_id=l.authority_id and p.role='authority'
   where l.status='ok' and l.quantity>0 and l.measure>0
   group by l.family,l.pack,l.year,l.authority_id`;
  // A product is compared only with at least five buyers in the year (owner, 10 November 2026); a lead is a buyer at
  // twice the median or more.
  await q`insert into marts.unit_price_groups (family,pack,year,buyers,median,p10,p25,p75,p90,leads,excess,max_ratio)
   select family,pack,year,count(*)::int,percentile_cont(0.5) within group (order by price),
    percentile_cont(0.1) within group (order by price),percentile_cont(0.25) within group (order by price),
    percentile_cont(0.75) within group (order by price),percentile_cont(0.9) within group (order by price),0,0,null
   from marts.unit_price_buyers group by family,pack,year having count(*)>=5`;
  await q`update marts.unit_price_buyers b set median=g.median,ratio=b.price/g.median,excess=greatest(b.paid-g.median*b.quantity,0)
   from marts.unit_price_groups g where g.family=b.family and g.pack=b.pack and g.year=b.year`;
  await q`update marts.unit_price_groups g set leads=s.leads,excess=s.excess,max_ratio=s.max_ratio
   from (select family,pack,year,count(*) filter (where ratio>=2)::int leads,coalesce(sum(excess) filter (where ratio>=2),0) excess,
     max(ratio) max_ratio from marts.unit_price_buyers where ratio is not null group by family,pack,year) s
   where s.family=g.family and s.pack=g.pack and s.year=g.year`;
  await q`analyze marts.unit_price_buyers`;
  await q`analyze marts.unit_price_groups`;
  const [ok]=await q`select count(*)::int n from marts.unit_price_lines where status='ok'`;
  log(`Unit prices: ${scanned} item lines, ${placed} in a product family, ${ok!.n} compared, in ${Math.round((Date.now()-started)/1000)}s`);
  return {lines:scanned,placed,compared:ok!.n as number};
 });
}
