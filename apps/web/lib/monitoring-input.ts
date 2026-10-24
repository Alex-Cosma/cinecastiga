import { IMPLEMENTED_KEYS, NETWORK_PARTNERS, NEWER_VERSION_QUESTION, TREND_CHANGES, unimplementedSpecKeys, validateSpec, type AskSpec } from "./ask/spec";
import { countWords } from "./ask/answer-text";
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
/** The fixed members of a trend or network group (plan §2.8, F2), separate from `scope`. */
export interface MonitoringMembers { kind:"trend-group"|"network-group"; role:"supplier"|"authority"|"county"; group:string; ids:string[]; frozenAt:string }
export const MONITORING_MEMBERS_MAX=5_000;
export function monitoringMembers(value:unknown):MonitoringMembers {
  const o=monitoringObject(value);
  if(Object.keys(o).some(k=>!["kind","role","group","ids","frozenAt"].includes(k)))throw new MonitoringError("Grupa urmărită conține un câmp necunoscut.");
  const trend=o.kind==="trend-group",groups:readonly unknown[]=trend?TREND_CHANGES.filter(c=>c!=="all"):NETWORK_PARTNERS;
  if(!trend&&o.kind!=="network-group"||!["supplier","authority",...(trend?["county"]:[])].includes(o.role as string)||!groups.includes(o.group)
    ||typeof o.frozenAt!=="string"||!Number.isFinite(Date.parse(o.frozenAt))||!Array.isArray(o.ids)||!o.ids.length)throw new MonitoringError("Grupa urmărită nu este validă.");
  const ids=[...new Set(o.ids)];
  if(ids.some(id=>typeof id!=="string"||(o.role==="county"?!id.trim()||id.length>100:!/^[1-9]\d{0,17}$/.test(id))))throw new MonitoringError("Grupa urmărită conține un identificator invalid.");
  if(ids.length>MONITORING_MEMBERS_MAX)throw new MonitoringError(`Grupa are ${o.role==="county"?countWords(ids.length,"județ","județe"):o.role==="authority"?countWords(ids.length,"instituție","instituții"):countWords(ids.length,"firmă","firme")}; restrânge perioada sau locul.`,422);
  return {kind:o.kind as MonitoringMembers["kind"],role:o.role as MonitoringMembers["role"],group:o.group as string,ids:ids as string[],frozenAt:o.frozenAt};
}
/** Read first, write later (plan F0a): what a newer release stored, this one refuses instead of running it without the condition. */
export function monitoringNewerError(spec:unknown,options:unknown):string|null {
  const members=options&&typeof options==="object"&&(options as Record<string,unknown>).members!==undefined;
  return unimplementedSpecKeys(spec).length||members&&!IMPLEMENTED_KEYS.has("options.members")?NEWER_VERSION_QUESTION:null;
}
export function monitoringScope(value:unknown):MonitoringScope {
  const body=monitoringObject(value),spec=validateSpec(body.spec,{refuseNewer:NEWER_VERSION_QUESTION});
  if("error"in spec)throw new MonitoringError(spec.error,422);
  const raw=body.options===undefined?{}:monitoringObject(body.options);
  if(Object.keys(raw).some(k=>!["scope","search","state","stream","members"].includes(k)))throw new MonitoringError("Selecția de surse conține o opțiune necunoscută.");
  // Parsed so that a malformed group says so. A valid one is refused: F2 replaces this with a watch on its members.
  if(raw.members!==undefined){monitoringMembers(raw.members);throw new MonitoringError(NEWER_VERSION_QUESTION,422);}
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
