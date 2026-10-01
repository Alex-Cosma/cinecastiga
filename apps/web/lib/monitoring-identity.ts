import type { DbSql } from "@seap/db";
import type { AskSpec } from "./ask/spec";
import type { Grounding } from "./ask/ground";
import type { CaptureOptions } from "./evidence-captures-shared";
import { MonitoringError } from "./monitoring-input";

export interface MonitoringEntityBinding {id:string;cui:string|null;foreign:string|null;sicap:string[];fallback:string}
export type MonitoringGrounding=Grounding&{monitoringEntities:MonitoringEntityBinding[]};
export function monitoredEntityIds(spec:AskSpec,grounding:Grounding,options:CaptureOptions):string[]{
  const ids=new Set<string>();
  for(const id of [spec.filters.authorityId,spec.filters.supplierId,spec.filters.compareWithId,grounding.authority?.entityId,grounding.supplier?.entityId,grounding.compare?.entityId,
    ...grounding.admin?.supplierIds??[],...options.scope?.entityIds??[],...options.scope?.excludeEntityIds??[]])if(id)ids.add(String(id));
  for(const group of spec.population?.groups??[])for(const condition of group.conditions)if(condition.field==="authority"||condition.field==="supplier")for(const id of condition.values)ids.add(id);
  return [...ids].sort();
}
export async function readMonitoringBindings(q:DbSql,ids:string[]):Promise<MonitoringEntityBinding[]>{
  if(!ids.length)return [];
  const rows=await q`select e.id::text id,case when e.cui_valid then e.cui_canonical else null end cui,
    case when e.foreign_id_norm is not null and e.country_code is not null then e.country_code||':'||e.foreign_id_norm else null end "foreign",
    coalesce((select jsonb_agg(s.namespace||':'||s.sicap_id::text order by s.namespace,s.sicap_id) from core.entity_sicap_ids s where s.entity_id=e.id),'[]'::jsonb) sicap,
    md5(concat_ws('|',e.name_normalized,e.country_code,e.county)) fallback from core.entities e where e.id=any(${ids}::bigint[]) order by e.id`;
  if(rows.length!==ids.length)throw new MonitoringError("Una dintre entitățile urmărite nu mai poate fi identificată. Revizuiește selecția înainte de a crea urmărirea.",422);
  return rows as unknown as MonitoringEntityBinding[];
}
export function sameMonitoringEntity(before:MonitoringEntityBinding,after:MonitoringEntityBinding):boolean{
  if(before.id!==after.id)return false;
  if(before.cui)return before.cui===after.cui;
  if(before.foreign)return before.foreign===after.foreign;
  if(before.sicap.length)return before.sicap.some(id=>after.sicap.includes(id));
  return before.fallback===after.fallback;
}
export async function assertMonitoringBindings(q:DbSql,spec:AskSpec,grounding:Grounding,options:CaptureOptions){
  const expected=(grounding as Partial<MonitoringGrounding>).monitoringEntities;
  const ids=monitoredEntityIds(spec,grounding,options);
  if(!expected||expected.length!==ids.length||ids.some(id=>!expected.some(e=>e.id===id)))throw new MonitoringError("Identitățile acestei urmăriri nu sunt fixate în siguranță. Creează o urmărire nouă după verificarea entităților.",422);
  const current=await readMonitoringBindings(q,ids);
  const aliases=await q`select old_id::text,canonical_id::text,evidence from core.entity_redirects where old_id=any(${ids}::bigint[])`;
  const targets=[...new Set(aliases.map(row=>String(row.canonical_id)))];
  const canonical=targets.length?await readMonitoringBindings(q,targets):[];
  const valid=(before:MonitoringEntityBinding)=>{
    const alias=aliases.find(row=>String(row.old_id)===before.id);
    if(!alias)return current.some(after=>sameMonitoringEntity(before,after));
    const proof=alias.evidence as {previousIdentity?:MonitoringEntityBinding;canonicalIdentity?:MonitoringEntityBinding}|null;
    return !!proof?.previousIdentity&&!!proof.canonicalIdentity
      && sameMonitoringEntity(before,proof.previousIdentity)
      && canonical.some(after=>after.id===String(alias.canonical_id)&&sameMonitoringEntity(proof.canonicalIdentity!,after));
  };
  if(expected.some(before=>!valid(before)))throw new MonitoringError("Identitatea unei entități s-a schimbat după reconstruirea datelor. Ultima verificare este păstrată; verifică instituția sau firma și creează o urmărire nouă.",422);
}
