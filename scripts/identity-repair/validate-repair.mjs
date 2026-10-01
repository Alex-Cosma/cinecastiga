/** Post-refresh identity checks. No source HTTP; rejects partially rebuilt marts. */
export async function validateIdentityRepair(sql) {
 const [rows]=await sql`select
  (select count(*)::text from identity_repair.plan) planned,
  (select count(*)::text from identity_repair.applied) applied,
  (select count(*)::text from identity_repair.alias_plan) aliases,
  (select count(*)::text from identity_repair.plan p left join core.direct_acquisitions d on d.id=p.da_id
    where d.id is null or d.authority_entity_id is distinct from p.new_id
       or (to_jsonb(d)-'authority_entity_id') is distinct from p.original_record) changed,
  (select count(*)::text from identity_repair.plan p join marts.da_transactions d on d.sicap_da_id=p.sicap_da_id
    where d.authority_id is distinct from p.new_id) wrong_transactions,
  (select count(*)::text from identity_repair.alias_plan p join marts.entity_profile e on e.entity_id=p.old_id) stale_profiles,
  (select count(*)::text from identity_repair.alias_plan p join marts.topic_acquisitions t on t.authority_id=p.old_id) stale_titles,
  (select count(*)::text from identity_repair.alias_plan p left join core.entity_redirects r on r.old_id=p.old_id
    where r.canonical_id is distinct from p.canonical_id) wrong_redirects`;
 if(rows.planned!==rows.applied||['changed','wrong_transactions','stale_profiles','stale_titles','wrong_redirects'].some(k=>rows[k]!=='0'))
  throw Error('Identity correction does not reconcile with the rebuilt projections');
 const examples=await sql`select e.id::text,e.cui_canonical,coalesce(ep.n_das,0)::text n_das,
   (select count(*)::text from marts.da_transactions d where d.authority_id=e.id and d.closing_value>0 and d.closing_value<=2000000) transaction_count,
   ep.total_ron_full::text from core.entities e left join marts.entity_profile ep on ep.entity_id=e.id and ep.role='authority'
   where e.id in (2146445,2165580,2144364,2145657,2146114,2146647,2130379,1986102) order by e.id`;
 if(examples.length!==8||examples.some(e=>e.n_das!==e.transaction_count))throw Error('Representative public profiles do not reconcile');
 const [museum]=await sql`select count(*)::int n from core.entity_sicap_ids where entity_id=2130379 and namespace='authority' and sicap_id=201802`;
 const [distinct]=await sql`select count(*)::int n from core.entity_redirects where old_id in (2130379,2165580)`;
 if(museum.n!==1||distinct.n!==0)throw Error('A real distinct institution was incorrectly aliased');
 return {rows,examples};
}
