// Reviewed, dated two-profile repair. Call only under drained maintenance or on
// the isolated incident copy. Does not delete historical entities or evidence.
const plans=[{old:2276078,keep:2071542,cui:'33240921',sicap:120407,contracts:31,ted:83},{old:2276333,keep:2084714,cui:'27390673',sicap:100027395,contracts:5,ted:5}];
async function binding(q,id){
 const [r]=await q`select e.id::text id,case when cui_valid then cui_canonical else null end cui,
 case when foreign_id_norm is not null and country_code is not null then country_code||':'||foreign_id_norm else null end "foreign",
 coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]') sicap,
 md5(concat_ws('|',name_normalized,country_code,county)) fallback from core.entities e where id=${id}`;return r;
}
export async function repairIdentities(sql){return sql.begin(async q=>{
 await q`set local lock_timeout='5s'`;
 const reports=[];
 for(const p of plans){
  const rows=await q`select * from core.entities where id in (${p.old},${p.keep}) order by id for update`;
  const old=rows.find(r=>Number(r.id)===p.old),keep=rows.find(r=>Number(r.id)===p.keep);
  if(!old||!keep||old.cui_valid||old.cui_canonical||!keep.cui_valid||keep.cui_canonical!==p.cui||old.name_normalized!==keep.name_normalized||old.is_foreign||keep.is_foreign)throw Error('Identity proof changed');
  if((await q`select old_id from core.entity_redirects where old_id in(${p.old},${p.keep}) or canonical_id=${p.old}`).length)throw Error('Alias already applied or chained; inspect before replay');
  const mappings=await q`select * from core.entity_sicap_ids where entity_id=${p.old} for update`;
  if(mappings.length!==1||mappings[0].namespace!=='winner'||Number(mappings[0].sicap_id)!==p.sicap)throw Error('SICAP evidence changed');
  const [counts]=await q`select (select count(*)::int from core.contract_winners where entity_id=${p.old}) contracts,(select count(*)::int from core.ted_lot_winners where entity_id=${p.old}) ted,
  (select count(*) from core.direct_acquisitions where authority_entity_id=${p.old} or supplier_entity_id=${p.old})+(select count(*) from core.notices where authority_entity_id=${p.old})+(select count(*) from core.awards where authority_entity_id=${p.old})+(select count(*) from core.ted_notices where buyer_entity_id=${p.old}) other`;
  if(counts.contracts!==p.contracts||counts.ted!==p.ted||Number(counts.other))throw Error('Historical population differs from reviewed copy');
  const previousIdentity=await binding(q,p.old);
  const previousContracts=await q`select contract_id::text id from core.contract_winners where entity_id=${p.old} order by contract_id`;
  const previousLots=await q`select lot_result_id::text id from core.ted_lot_winners where entity_id=${p.old} order by lot_result_id`;
  await q`insert into core.contract_winners(contract_id,entity_id) select contract_id,${p.keep} from core.contract_winners where entity_id=${p.old} on conflict do nothing`;
  await q`delete from core.contract_winners where entity_id=${p.old}`;
  await q`insert into core.ted_lot_winners(lot_result_id,entity_id) select lot_result_id,${p.keep} from core.ted_lot_winners where entity_id=${p.old} on conflict do nothing`;
  await q`delete from core.ted_lot_winners where entity_id=${p.old}`;
  await q`update core.entity_sicap_ids set entity_id=${p.keep} where entity_id=${p.old}`;
  await q`update core.entities set first_seen=least(first_seen,${old.first_seen}),last_seen=greatest(last_seen,${old.last_seen}),cui_raw_variants=array(select distinct unnest(coalesce(cui_raw_variants,'{}')||${old.cui_raw_variants??[]}::text[])) where id=${p.keep}`;
  const evidence={incident:'20261007-normalization',rawIds:[17438578,17545919,17556115,17556311],oldEntity:old,previousIdentity,canonicalIdentity:await binding(q,p.keep),previousContracts,previousLots,counts};
  await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${p.old},${p.keep},'verified-sicap-cui-typo',${JSON.stringify(evidence)}::jsonb)`;
  reports.push({old:p.old,canonical:p.keep,contracts:counts.contracts,ted:counts.ted});
 }
 return reports;
});}
