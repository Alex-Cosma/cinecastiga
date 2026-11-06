import { createDb, canonicalEntityId, type DbSql } from '@seap/db';
import { headers } from 'next/headers';
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

/** The same redirect from a server layout (which receives neither the path below it nor the query): above a route
 *  ghost it answers 307 before anything streams, where a redirect inside the page could only become a meta refresh.
 *  The path and query come from proxy.ts; the part after /entitati/{id} is kept. */
export async function redirectCanonicalEntityInLayout(id:string){
  const h=await headers();
  const path=h.get('x-seap-path');
  if(path===null)return; // no proxy in front: the page's own redirect still runs
  const prefix=`/entitati/${id}`;
  const suffix=path.startsWith(prefix)?path.slice(prefix.length):'';
  const params:Record<string,string[]>={};
  for(const [key,value] of new URLSearchParams(h.get('x-seap-search')??''))(params[key]??=[]).push(value);
  await redirectCanonicalEntity(id,suffix,params);
}
