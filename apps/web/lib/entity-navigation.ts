import { createDb, canonicalEntityId, type DbSql } from '@seap/db';
import { redirect } from 'next/navigation';
const state=globalThis as typeof globalThis & {__entityIdentitySql?:DbSql};
export async function redirectCanonicalEntity(id:string,suffix='',params:Record<string,string|string[]|undefined>={}){
  if(!/^[1-9]\d{0,15}$/.test(id)||!Number.isSafeInteger(Number(id)))return;
  const canonical=await canonicalEntityId(state.__entityIdentitySql??=createDb().sql,id);
  if(canonical===id)return;
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(params))for(const v of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,v);
  redirect(`/entitati/${canonical}${suffix}${query.size?'?'+query.toString():''}`);
}
