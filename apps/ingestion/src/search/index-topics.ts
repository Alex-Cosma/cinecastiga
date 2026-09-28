import type {DbSql} from '@seap/db';

/** Offline, public-data-only search projection. Atomic replacement retains the last
 * usable version on failure. No SEAP calls and no flags/risk recalculation. */
export async function indexTopics(sql:DbSql,log:(message:string)=>void=()=>{}) {
 const started=Date.now();
 return sql.begin(async q=>{
  await q`select pg_advisory_xact_lock(729118,1)`;
  await q`set local statement_timeout = '0'`;
  await q`set local maintenance_work_mem = '256MB'`;
  await q`set local work_mem = '128MB'`;
  // Bulk-load before secondary indexes: maintaining millions of GIN entries
  // row by row is substantially slower. DDL rolls back with the data on failure.
  await q`alter table marts.topic_acquisitions drop constraint topic_acquisitions_pkey`;
  await q`drop index marts.topic_search_idx,marts.topic_authority_idx,marts.topic_suppliers_idx,marts.topic_place_idx,marts.topic_county_year_idx,marts.topic_procedure_idx`;
  log('Preparing acquisition title search from the local public archive…');
  await q`truncate marts.topic_acquisitions`;
  // Project only the title before joining: carrying entire JSON payloads through
  // the join spills many GB of irrelevant source data. OFFSET 0 preserves that boundary.
  // Direct acquisitions: use the accepted transaction population; no arbitrary
  // value cap or date window hides a title. Amounts are not aggregated as payments.
  await q`insert into marts.topic_acquisitions
   (id,kind,ref_id,title,search,authority_id,supplier_ids,county,uat_siruta,year,date,value)
   select 'da:'||d.sicap_da_id,'da',d.sicap_da_id,coalesce(r.title,''),
    to_tsvector('simple',unaccent(coalesce(r.title,''))),
    d.authority_id,array_remove(array[d.supplier_id],null),lower(unaccent(d.county)),u.uat_siruta,
    nullif(left(d.finalization_date,4),'')::int,d.finalization_date,d.closing_value
   from marts.da_transactions d join core.direct_acquisitions a on a.sicap_da_id=d.sicap_da_id
   left join (select id,payload->>'directAcquisitionName' title from raw.raw_documents offset 0) r on r.id=a.raw_id
   left join reference.authority_uat u on u.entity_id=d.authority_id`;
  log('Direct acquisition titles prepared. Preparing contracts…');
  await q`insert into marts.topic_acquisitions
   (id,kind,ref_id,title,search,authority_id,supplier_ids,county,uat_siruta,year,date,value,procedure_id)
   select 'contracts:'||d.contract_id,'contracts',d.contract_id,coalesce(c.title,''),
    to_tsvector('simple',unaccent(coalesce(c.title,''))),d.authority_id,d.supplier_ids,
    lower(unaccent(d.county)),u.uat_siruta,nullif(left(d.date,4),'')::int,d.date,d.value,r.payload->>'procedureId'
   from (select contract_id,max(authority_id) authority_id,array_agg(distinct supplier_id) supplier_ids,
    max(county) county,max(finalization_date) date,max(contract_value_full) value
    from marts.contract_transactions group by contract_id) d
   join core.contracts c on c.id=d.contract_id join core.awards a on a.ca_notice_id=c.ca_notice_id
   left join raw.raw_documents r on r.id=a.raw_id left join reference.authority_uat u on u.entity_id=d.authority_id`;
  log('Building lookup indexes…');
  await q`alter table marts.topic_acquisitions add primary key(id)`;
  await q`create index topic_search_idx on marts.topic_acquisitions using gin(search)`;
  await q`create index topic_authority_idx on marts.topic_acquisitions(authority_id)`;
  await q`create index topic_suppliers_idx on marts.topic_acquisitions using gin(supplier_ids)`;
  await q`create index topic_place_idx on marts.topic_acquisitions(uat_siruta)`;
  await q`create index topic_county_year_idx on marts.topic_acquisitions(county,year)`;
  await q`create index topic_procedure_idx on marts.topic_acquisitions(procedure_id,authority_id)`;
  await q`analyze marts.topic_acquisitions`;
  const [count]=await q`select count(*)::text n,count(*) filter(where title<>'')::text titled from marts.topic_acquisitions`;
  const [expected]=await q`select ((select count(*) from marts.da_transactions)+(select count(distinct contract_id) from marts.contract_transactions))::text n`;
  if(count!.n!==expected!.n)throw Error('Title search population differs from the transaction marts; keeping the preceding index.');
  await q`insert into marts.topic_search_state(id,built_at,records,titled_records) values(1,clock_timestamp(),${count!.n},${count!.titled})
   on conflict(id) do update set built_at=excluded.built_at,records=excluded.records,titled_records=excluded.titled_records`;
  log(`Title search ready: ${count!.n} acquisitions in ${Math.round((Date.now()-started)/1000)}s`);
  return {records:String(count!.n)};
 });
}
