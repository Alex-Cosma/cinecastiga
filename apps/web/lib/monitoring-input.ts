import { NETWORK_PARTNERS, NEWER_VERSION_QUESTION, TREND_CHANGES, unimplementedSpecKeys, validateSpec, type AskSpec, type TrendChange } from "./ask/spec";
import { countWords } from "./ask/answer-text";
import { evidenceOptions } from "./ask/evidence-request";
import { trendGroupOf } from "./ask/predicates";
import { trendMemberPart } from "./ask/group-ids";
import { trendGroupLabel } from "./ask/filters/defs/trend";
import { isWholeYear, monthsLabel } from "./ask/months-window";
import { DEFAULT_MONITORING_PREFERENCES, MONITORING_CHANGE_TYPES, MONITORING_MEMBERS_MAX, membersTooManyWords, type MonitoringMembers, type MonitoringOptions, type MonitoringPreferences, type MonitoringScope } from "./monitoring-shared";
import { isWorkspaceId } from "./investigation-access";

/**
 * A drawer's selection makes the watch follow only that list (no result
 * alerts). A group's fixed members do not: the answer is computed on them
 * (plan §2.8), so `members` is not a local selection.
 */
export function monitoringHasLocalSelection(options:MonitoringOptions):boolean {
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
export type { MonitoringMembers } from "./monitoring-shared";
export { MONITORING_MEMBERS_MAX };
export function monitoringMembers(value:unknown):MonitoringMembers {
  const o=monitoringObject(value);
  if(Object.keys(o).some(k=>!["kind","role","group","ids","frozenAt"].includes(k)))throw new MonitoringError("Grupa urmărită conține un câmp necunoscut.");
  const trend=o.kind==="trend-group",groups:readonly unknown[]=trend?TREND_CHANGES.filter(c=>c!=="all"):NETWORK_PARTNERS;
  if(!trend&&o.kind!=="network-group"||!["supplier","authority",...(trend?["county"]:[])].includes(o.role as string)||!groups.includes(o.group)
    ||typeof o.frozenAt!=="string"||!Number.isFinite(Date.parse(o.frozenAt))||!Array.isArray(o.ids)||!o.ids.length)throw new MonitoringError("Grupa urmărită nu este validă.");
  const ids=[...new Set(o.ids)];
  if(ids.some(id=>typeof id!=="string"||(o.role==="county"?!id.trim()||id.length>100:!/^[1-9]\d{0,17}$/.test(id))))throw new MonitoringError("Grupa urmărită conține un identificator invalid.");
  if(ids.length>MONITORING_MEMBERS_MAX)throw membersTooMany(o.role as MonitoringMembers["role"],ids.length);
  return {kind:o.kind as MonitoringMembers["kind"],role:o.role as MonitoringMembers["role"],group:o.group as string,ids:ids as string[],frozenAt:o.frozenAt};
}
/** A group above MONITORING_MEMBERS_MAX: "Grupa are 17.633 de firme; restrânge perioada sau locul." */
export const membersTooMany=(role:MonitoringMembers["role"],n:number)=>new MonitoringError(membersTooManyWords(role,n),422);
/** The kinds of fixed group this release applies: a trend's (F2); a network's comes with F4 (read ahead, refused). */
export const IMPLEMENTED_MEMBER_KINDS:readonly MonitoringMembers["kind"][]=["trend-group"];
/** Read first, write later (plan F0a): what a newer release stored, this one refuses instead of running it without the condition. */
export function monitoringNewerError(spec:unknown,options:unknown):string|null {
  const members=options&&typeof options==="object"?(options as Record<string,unknown>).members:undefined;
  const kind=members&&typeof members==="object"?(members as Record<string,unknown>).kind:undefined;
  return unimplementedSpecKeys(spec).length||members!==undefined&&!IMPLEMENTED_MEMBER_KINDS.includes(kind as MonitoringMembers["kind"])?NEWER_VERSION_QUESTION:null;
}
/**
 * The group a trend watch fixes (plan §2.8, §4.7): a trend that lists one group
 * (Creșteri, Noi, Prima dată, Scăderi, Nu mai apar), by the role it ranks.
 * Null on every other question, and on "Toate", which stays a live answer.
 */
export function watchedTrendGroup(spec:AskSpec):{change:Exclude<TrendChange,"all">;role:MonitoringMembers["role"]}|null {
  if(spec.block!=="trend")return null;
  const group=trendGroupOf(spec);
  if(!trendMemberPart(group)||group.change==="all")return null;
  return {change:group.change,role:spec.dim==="county"?"county":spec.dim==="supplier"?"supplier":"authority"};
}
export const MEMBERS_MISMATCH="Grupa urmărită nu corespunde întrebării.";
export const MEMBERS_CHANGED="Grupa s-a schimbat de la răspunsul afișat. Reîncarcă răspunsul și urmărește din nou grupa.";

const memberNouns=(role:MonitoringMembers["role"]):[string,string]=>role==="county"?["județ","județe"]:role==="authority"?["instituție","instituții"]:["firmă","firme"];
/** "412 firme fixate", "1 firmă fixată", "1 județ fixat". */
function fixedMembers(role:MonitoringMembers["role"],n:number):string {
  const [one,many]=memberNouns(role);
  return `${countWords(n,one,many)} ${n!==1?"fixate":role==="county"?"fixat":"fixată"}`;
}
/** The group's name in the notes, with its year: „Noi față de 2024”, „Noi față de 2024 · prima dată în 2025”. */
export function watchedGroupLabel(spec:AskSpec):string {
  const t=spec.trend??{};
  return `„${trendGroupLabel(t.change??"all",spec.filters.yearFrom,spec.filters.yearTo)}${t.firstOnly&&spec.filters.yearTo?` · prima dată în ${spec.filters.yearTo}`:""}”`;
}
/** Pinned at activation (scope_notes): what the watch fixed, and that the live group is only a note. */
export function groupPinnedNote(spec:AskSpec,members:MonitoringMembers,day:string):string {
  return `Grupa ${watchedGroupLabel(spec)}: ${fixedMembers(members.role,members.ids.length)} la activare (${day}). Răspunsul și sursele urmăresc aceste ${members.role==="county"?"județe":members.role==="authority"?"instituții":"firme"}; cele care intră sau ies din grupă apar doar ca notă.`;
}
/**
 * The notes of a group's check (plan §2.8): the members no longer identified
 * or merged into another entity, and the movement of the live group ("3 firme
 * au intrat în grupă, 1 a ieșit"), which is never an alert.
 */
export function groupCheckNotes(members:MonitoringMembers,o:{day:string;missing:readonly string[];redirected:readonly {from:string;to:string}[];movement:{members:number;stayed:number;live:number}|null}):string[] {
  const [one,many]=memberNouns(members.role),notes:string[]=[];
  const n=(k:number)=>countWords(k,one,many);
  const female=members.role!=="county";
  if(o.missing.length){const k=o.missing.length;
    notes.push(`${n(k)} din grupă nu mai ${k===1?"poate":"pot"} fi ${k===1?(female?"identificată":"identificat"):"identificate"} în date; ${k===1?"iese":"ies"} din calcul (ID ${o.missing.slice(0,5).join(", ")}${k>5?" …":""}).`);}
  if(o.redirected.length){const k=o.redirected.length;
    notes.push(`${n(k)} din grupă ${k===1?"a fost unită":"au fost unite"} cu altă înregistrare a aceleiași entități; ${k===1?"o urmărim":"le urmărim"} sub identificatorul nou (${o.redirected.slice(0,5).map(r=>`${r.from} → ${r.to}`).join(", ")}${k>5?" …":""}).`);}
  if(o.movement){
    const entered=Math.max(0,o.movement.live-o.movement.stayed),left=Math.max(0,o.movement.members-o.movement.stayed);
    const moves=[...(entered?[`${n(entered)} ${entered===1?"a intrat":"au intrat"} în grupă`]:[]),...(left?[`${entered?String(left):n(left)} ${left===1?"a ieșit":"au ieșit"}${entered?"":" din grupă"}`]:[])];
    const k=o.movement.members;
    if(moves.length)notes.push(`${moves.join(", ")}. Urmărim în continuare ${k===1?"":"cele "}${fixedMembers(members.role,k)} la ${o.day}; mișcarea grupei nu produce alerte.`);
  }
  return notes;
}
/** A fixed group on its question: the kind this release applies, on the trend that lists that group by that role. */
export function membersOfQuestion(spec:AskSpec,members:MonitoringMembers):MonitoringError|null {
  if(!IMPLEMENTED_MEMBER_KINDS.includes(members.kind))return new MonitoringError(NEWER_VERSION_QUESTION,422);
  const watched=watchedTrendGroup(spec);
  return watched&&watched.change===members.group&&watched.role===members.role?null:new MonitoringError(MEMBERS_MISMATCH,422);
}
/** A trend whose `auto` window moved with the data since the previous check (plan §2.8): "Fereastra comparată: ian.–mai → ian.–iun." */
export function movedWindowNote(before:unknown,after:unknown):string|null {
  const months=(value:unknown)=>{
    const m=value&&typeof value==="object"?(value as {months?:{from?:unknown;to?:unknown}}).months:undefined;
    return m&&Number.isInteger(m.from)&&Number.isInteger(m.to)?{from:m.from as number,to:m.to as number}:null;
  };
  const a=months(before),b=months(after);
  if(!a||!b||a.from===b.from&&a.to===b.to)return null;
  const label=(w:{from:number;to:number})=>isWholeYear(w)?"ani întregi":monthsLabel(w);
  const text=`Fereastra comparată: ${label(a)} → ${label(b)}`;
  return text.endsWith(".")?text:`${text}.`;
}
export function monitoringScope(value:unknown):MonitoringScope {
  const body=monitoringObject(value),spec=validateSpec(body.spec,{refuseNewer:NEWER_VERSION_QUESTION});
  if("error"in spec)throw new MonitoringError(spec.error,422);
  const raw=body.options===undefined?{}:monitoringObject(body.options);
  if(Object.keys(raw).some(k=>!["scope","search","state","stream","members"].includes(k)))throw new MonitoringError("Selecția de surse conține o opțiune necunoscută.");
  // A group a caller sends is checked against its question here and against the group at activation (createMonitoringWatch).
  const {members:rawMembers,...rest}=raw;
  const members=rawMembers===undefined?undefined:monitoringMembers(rawMembers);
  const refused=members?membersOfQuestion(spec as AskSpec,members):null;if(refused)throw refused;
  const options=evidenceOptions(rest);if("error"in options)throw new MonitoringError(options.error,422);
  return {spec:spec as AskSpec,options:members?{...options,members}:options};
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
