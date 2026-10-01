import { entityRedirectMap, type DbSql } from '@seap/db';
import { connectionIdentity, readConnectionEntity, ConnectionError } from './connections';

interface Selection {
 entityId:string; role:'authority'|'supplier'; identity?:string;
 excludeEntityId?:string; partnerId?:string;
 members?:{id:string;identity:string}[];
}
/** Live navigation only. Frozen receipts retain their checkpoint checks. */
export async function canonicalConnectionSelection<T extends Selection>(q:DbSql,input:T):Promise<T>{
 const ids=[input.entityId,...input.members?.map(m=>m.id)??[]];
 if(input.excludeEntityId)ids.push(input.excludeEntityId);if(input.partnerId)ids.push(input.partnerId);
 const redirects=await entityRedirectMap(q,ids);if(!redirects.size)return input;
 const next={...input};
 async function receipt(oldId:string,expected:string|undefined){
  const target=redirects.get(oldId);if(!target)return expected;
  const current=await readConnectionEntity(q,target,input.role);
  if(expected!==undefined&&expected!==current.identity){
   const [row]=await q`select evidence->'previousIdentity' previous,evidence->'canonicalIdentity' canonical from core.entity_redirects where old_id=${oldId}`;
   const previous=row?.previous, canonical=row?.canonical;
   if(!previous||previous.id!==oldId||!Array.isArray(previous.sicap)||connectionIdentity(previous)!==expected
      ||!canonical||canonical.id!==target||!Array.isArray(canonical.sicap)||connectionIdentity(canonical)!==current.identity)
    throw new ConnectionError('Identitatea salvată nu corespunde corecției verificate. Redeschide instituția.',409);
  }
  return current.identity;
 }
 if(redirects.has(input.entityId)){
  const identity=await receipt(input.entityId,input.identity);
  next.entityId=redirects.get(input.entityId)!;if(identity!==undefined)next.identity=identity;
 }
 if(next.excludeEntityId)next.excludeEntityId=redirects.get(next.excludeEntityId)??next.excludeEntityId;
 if(next.partnerId)next.partnerId=redirects.get(next.partnerId)??next.partnerId;
 if(input.members){
  const members=await Promise.all(input.members.map(async m=>({id:redirects.get(m.id)??m.id,identity:(await receipt(m.id,m.identity))!})));
  next.members=[...new Map(members.map(m=>[m.id,m])).values()].filter(m=>m.id!==next.entityId);
 }
 return next;
}
