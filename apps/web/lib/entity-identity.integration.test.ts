import {describe,it,expect} from 'vitest';
import {createDb,canonicalEntityId,type DbSql} from '@seap/db';
import {canonicalAskIdentities} from './ask/canonical-identities';
import {assertMonitoringBindings,readMonitoringBindings} from './monitoring-identity';
import {canonicalConnectionSelection} from './canonical-connections';
import {readConnectionEntity} from './connections';
const url=process.env.IDENTITY_TEST_DATABASE_URL;
if(url&&!/^seap_test_identity_/.test(new URL(url).pathname.slice(1)))throw new Error('Isolated identity DB required');
const rollback=new Error('rollback verified fixture');
describe.skipIf(!url)('identity repair compatibility',()=>{
 it('keeps saved questions, exclusions, connections and monitored identity receipts usable',async()=>{
  const {sql}=createDb(url!);
  try{
   await sql.begin(async tx=>{
    const q=tx as unknown as DbSql;
    const [old]=await q`insert into core.entities(name_display,name_normalized) values('Municipiul Cluj-Napoca','municipiul cluj napoca') returning id::text`;
    const [target]=await q`insert into core.entities(name_display,name_normalized,cui_canonical,cui_valid) values('Municipiul Cluj-Napoca','municipiul cluj napoca','4305857',true) returning id::text`;
    const oldId=String(old!.id),newId=String(target!.id);
    await q`insert into core.entity_sicap_ids values(${oldId},'authority',4305857),(${newId},'authority',1226)`;
    const previousIdentity=(await readMonitoringBindings(q,[oldId]))[0]!;
    const canonicalIdentity=(await readMonitoringBindings(q,[newId]))[0]!;
    const oldConnection=await readConnectionEntity(q,oldId,'authority');
    await q`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${oldId},${newId},'legacy-authority-cui-as-sicap',${JSON.stringify({previousIdentity,canonicalIdentity})}::jsonb)`;
    await q`delete from core.entity_sicap_ids where entity_id=${oldId}`;
    expect(await canonicalEntityId(q,oldId)).toBe(newId);
    const spec={block:'stat' as const,measure:'value' as const,filters:{authorityId:Number(oldId)}};
    const grounding={authority:{query:'Cluj',entityId:oldId,nameDisplay:'Cluj',county:null,alternatives:[]},monitoringEntities:[previousIdentity]};
    const resolved=await canonicalAskIdentities(q,spec,grounding,{excludeEntityIds:[oldId]});
    expect(resolved.spec.filters.authorityId).toBe(Number(newId));
    expect(resolved.scope?.excludeEntityIds).toEqual([newId]);
    await expect(assertMonitoringBindings(q,spec,grounding,{})).resolves.toBeUndefined();
    const connection=await canonicalConnectionSelection(q,{entityId:oldId,role:'authority' as const,identity:oldConnection.identity});
    expect(connection.entityId).toBe(newId);
    const canonicalConnection=await readConnectionEntity(q,newId,'authority');
    const comparison=await canonicalConnectionSelection(q,{entityId:oldId,role:'authority' as const,identity:oldConnection.identity,members:[{id:newId,identity:canonicalConnection.identity}]});
    expect(comparison.members).toEqual([]); // two former profiles are now the same institution
    await expect(canonicalConnectionSelection(q,{entityId:oldId,role:'authority' as const,identity:'0'.repeat(64)})).rejects.toThrow('Identitatea salvată');
    expect(spec.filters.authorityId).toBe(Number(oldId));
    expect(grounding.monitoringEntities[0]?.id).toBe(oldId);
    // A changed target identity is not excused by the presence of a redirect.
    await q`update core.entities set cui_canonical='14920794' where id=${newId}`;
    await expect(assertMonitoringBindings(q,spec,grounding,{})).rejects.toThrow('Identitatea unei entități');
    await expect(canonicalConnectionSelection(q,{entityId:oldId,role:'authority' as const,identity:oldConnection.identity})).rejects.toThrow('Identitatea salvată');
    throw rollback;
   }).catch(e=>{if(e!==rollback)throw e;});
  }finally{await sql.end({timeout:5});}
 });
 it('rejects chains/cycles instead of interpreting them recursively',async()=>{
  const {sql}=createDb(url!);
  try{await sql.begin(async tx=>{
   const [a]=await tx`insert into core.entities(name_display,name_normalized) values('Alias a','alias a') returning id`;
   const [b]=await tx`insert into core.entities(name_display,name_normalized) values('Alias b','alias b') returning id`;
   const [c]=await tx`insert into core.entities(name_display,name_normalized) values('Alias c','alias c') returning id`;
   await tx`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${a!.id},${b!.id},'test','{}')`;
   await expect(tx.savepoint(async sp=>{await sp`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${b!.id},${c!.id},'test','{}')`;})).rejects.toThrow('direct and acyclic');
   await expect(tx.savepoint(async sp=>{await sp`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${b!.id},${a!.id},'test','{}')`;})).rejects.toThrow('direct and acyclic');
   throw rollback;
  }).catch(e=>{if(e!==rollback)throw e;});}finally{await sql.end({timeout:5});}
 });
});
