import {canonicalCui} from './cui.js';
import {normalizeName} from './name.js';

/** Reviewed source-specific contradictions, not fuzzy/global entity merges.
 * Full evidence and public corroboration: docs/implementation/recovery-20261008.
 * Raw source records and existing SICAP mappings remain unchanged. */
export function reviewedWinnerIdentity(contractId:number,input:{sicapId:number|null;cuiRaw:string|null;nameDisplay:string}){
 const cui=canonicalCui(input.cuiRaw),name=normalizeName(input.nameDisplay).normalized;
 if(!cui.valid)return input;
 if([107982497,108090948].includes(contractId)&&input.sicapId===54428&&cui.cui==='13068733'&&name==='habau pps pipeline systems'){
  return {...input,cuiRaw:'13092995'};
 }
 if(contractId===108105778&&input.sicapId===64188&&cui.cui==='5394305'&&name==='theotop'){
  return {...input,cuiRaw:'391391'};
 }
 if([108105777,108105782,108105798].includes(contractId)&&input.sicapId===14779&&cui.cui==='5394305'&&name==='uti grup'){
  // The source reuses CAR TOP's SICAP id for UTI. Do not repoint its mapping.
  return {...input,sicapId:null};
 }
 return input;
}
