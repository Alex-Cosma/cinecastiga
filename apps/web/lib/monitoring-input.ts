import { validateSpec, type AskSpec } from "./ask/spec";
import { evidenceOptions } from "./ask/evidence-request";
import { DEFAULT_MONITORING_PREFERENCES, MONITORING_CHANGE_TYPES, type MonitoringPreferences, type MonitoringScope } from "./monitoring-shared";
import { isWorkspaceId } from "./investigation-access";
import type { CaptureOptions } from "./evidence-captures-shared";

export function monitoringHasLocalSelection(options:CaptureOptions):boolean {
  return Boolean(options.scope&&Object.keys(options.scope).length||options.search?.trim()||options.state?.trim()||options.stream);
}
export const MONITORING_LOCAL_SCOPE_NOTE="Urmărim numai înregistrările din selecția și filtrele listei de surse. Rezultatul întrebării generale rămâne context; schimbările din afara acestei liste nu declanșează alerte. Modificările de metodologie sunt urmărite separat.";

export class MonitoringError extends Error { constructor(message:string, public status=400) { super(message); } }
export const monitoringObject=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new MonitoringError("Datele urmăririi nu sunt valide.");
  return value as Record<string,unknown>;
};
export function monitoringPreferences(value:unknown):MonitoringPreferences {
  if(value===undefined)return structuredClone(DEFAULT_MONITORING_PREFERENCES);
  const input=monitoringObject(value);
  if(Object.keys(input).some(k=>!["types","minimumValueExact","digest"].includes(k)))throw new MonitoringError("Preferință necunoscută.");
  const types=input.types??DEFAULT_MONITORING_PREFERENCES.types;
  if(!Array.isArray(types)||!types.length||types.some(t=>!MONITORING_CHANGE_TYPES.includes(t)))throw new MonitoringError("Alege cel puțin un tip de schimbare.");
  const amount=input.minimumValueExact??"0";
  if(typeof amount!=="string"||!/^\d{1,16}(\.\d{1,12})?$/.test(amount))throw new MonitoringError("Pragul în lei trebuie să fie o valoare zecimală pozitivă sau zero.");
  if(input.digest!==undefined&&typeof input.digest!=="boolean")throw new MonitoringError("Preferința de email nu este validă.");
  return {types:[...new Set(types)] as MonitoringPreferences["types"],minimumValueExact:amount,digest:input.digest===true};
}
export function monitoringTitle(value:unknown,fallback?:string):string {
  const title=value===undefined?fallback:value;
  if(typeof title!=="string"||!title.trim()||title.trim().length>200)throw new MonitoringError("Dă urmăririi un nume de cel mult 200 de caractere.");
  return title.trim();
}
export function monitoringScope(value:unknown):MonitoringScope {
  const body=monitoringObject(value),spec=validateSpec(body.spec);
  if("error"in spec)throw new MonitoringError(spec.error,422);
  const raw=body.options===undefined?{}:monitoringObject(body.options);
  if(Object.keys(raw).some(k=>!["scope","search","state","stream"].includes(k)))throw new MonitoringError("Selecția de surse conține o opțiune necunoscută.");
  const options=evidenceOptions(raw);if("error"in options)throw new MonitoringError(options.error,422);
  return {spec:spec as AskSpec,options};
}
export function monitoringRecipe(value:Record<string,unknown>){
  if(value.recipeId===undefined&&value.recipeVersion===undefined)return {recipeId:null,recipeVersion:null};
  if(!isWorkspaceId(value.recipeId)||!Number.isSafeInteger(value.recipeVersion)||Number(value.recipeVersion)<1)throw new MonitoringError("Alege versiunea exactă a rețetei.");
  return {recipeId:value.recipeId,recipeVersion:Number(value.recipeVersion)};
}
export function monitoringCursor(value:unknown):number {
  if(value===undefined||value===null||value==="")return 0;
  const cursor=Number(value);
  if(!Number.isSafeInteger(cursor)||cursor<0)throw new MonitoringError("Poziția din listă nu este validă.");
  return cursor;
}
