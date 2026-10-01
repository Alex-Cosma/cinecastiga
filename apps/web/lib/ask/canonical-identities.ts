import { entityRedirectMap, type DbSql } from '@seap/db';
import type { AskSpec } from './spec';
import type { Grounding } from './ground';
import type { EvidenceScope } from './evidence';

/** Resolve a LIVE execution, never rewrite a saved question or frozen capture.
 * Includes exclusions: leaving an old excluded ID untouched would broaden data. */
export function mapAskIdentities(spec:AskSpec, grounding:Grounding, scope:EvidenceScope|undefined, redirects:ReadonlyMap<string,string>) {
  if(!redirects.size)return {spec,grounding,scope};
  const id=(value:string)=>redirects.get(value)??value;
  const filters={...spec.filters};
  for(const key of ['authorityId','supplierId','compareWithId'] as const)if(filters[key]!==undefined)filters[key]=Number(id(String(filters[key])));
  const mappedSpec:AskSpec={...spec,filters};
  if(spec.population)mappedSpec.population={...spec.population,groups:spec.population.groups.map(g=>({...g,conditions:g.conditions.map(c=>(c.field==='authority'||c.field==='supplier')?{...c,values:[...new Set(c.values.map(id))]}:c)}))};
  const mappedGrounding={...grounding};
  for(const key of ['authority','supplier','compare'] as const){const entity=grounding[key];if(entity?.entityId)mappedGrounding[key]={...entity,entityId:id(entity.entityId)};}
  if(grounding.admin)mappedGrounding.admin={...grounding.admin,supplierIds:[...new Set(grounding.admin.supplierIds.map(id))]};
  const mappedScope=scope?{...scope}:undefined;
  if(mappedScope?.entityIds)mappedScope.entityIds=[...new Set(mappedScope.entityIds.map(id))];
  if(mappedScope?.excludeEntityIds)mappedScope.excludeEntityIds=[...new Set(mappedScope.excludeEntityIds.map(id))];
  return {spec:mappedSpec,grounding:mappedGrounding,scope:mappedScope};
}
export async function canonicalAskIdentities(sql:DbSql,spec:AskSpec,grounding:Grounding,scope?:EvidenceScope){
  const ids:string[]=[];
  for(const key of ['authorityId','supplierId','compareWithId'] as const)if(spec.filters[key]!==undefined)ids.push(String(spec.filters[key]));
  for(const key of ['authority','supplier','compare'] as const)if(grounding[key]?.entityId)ids.push(grounding[key]!.entityId!);
  ids.push(...grounding.admin?.supplierIds??[],...scope?.entityIds??[],...scope?.excludeEntityIds??[]);
  for(const g of spec.population?.groups??[])for(const c of g.conditions)if(c.field==='authority'||c.field==='supplier')ids.push(...c.values);
  return mapAskIdentities(spec,grounding,scope,await entityRedirectMap(sql,ids));
}
