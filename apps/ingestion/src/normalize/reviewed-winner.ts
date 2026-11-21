import {ACCEPTED_AUTHORITY_CUI} from '@seap/db';
import {canonicalCui} from './cui.js';
import {normalizeName} from './name.js';

/** Reviewed-accepted historical conflicts (audit F27, owner decision 21 October 2026): the
 * contracting authority typed its own CUI in the winner's fiscal-code field. The SICAP winner ID
 * names the supplier, so the record keeps that attribution and is identified by the supplier's own
 * CUI instead of being quarantined as a conflict. Exact (winner SICAP ID, source CUI, supplier CUI)
 * triples only, not a rule about authorities. Raw records before 26 September 2026 were not
 * retained, so the record name is unknown and is not part of the key. `resolveEntity()` still
 * fails if the SICAP ID maps to a profile with another valid CUI. The buyer counts come from the
 * read-only production scan of 21 October 2026 (core contracts where that CUI's owner is the
 * authority of the award); ONRC links neither firm to the buyer. Evidence and exposure:
 * docs/handover/20261011/data-and-calculations.md. */
export { ACCEPTED_AUTHORITY_CUI };
export const REVIEWED_WINNER_RULE='reviewed-winner-20261008';
export const ACCEPTED_AUTHORITY_CUI_RULE='accepted-authority-cui-20261021';
function acceptedAuthorityCui(sicapId:number|null,cui:string) {
 return ACCEPTED_AUTHORITY_CUI.find(a=>a.sicapId===sicapId&&a.sourceCui===cui)??null;
}
/** Which reviewed list changed a source winner (for the proof of a contract identity). */
export function reviewedWinnerRule(input:{sicapId:number|null;cuiRaw:string|null}) {
 const cui=canonicalCui(input.cuiRaw);
 return cui.valid&&acceptedAuthorityCui(input.sicapId,cui.cui)?ACCEPTED_AUTHORITY_CUI_RULE:REVIEWED_WINNER_RULE;
}

/** Reviewed source-specific contradictions, not fuzzy/global entity merges.
 * Full evidence and public corroboration: docs/implementation/recovery-20261008.
 * Each rule needs the exact incoming SICAP ID, fiscal identifier and normalized name, in any
 * contract: SEAP republishes the same contracts under new notices and contract IDs (17 October
 * 2026: notice 100661676). Raw source records and existing SICAP mappings remain unchanged. */
export function reviewedWinnerIdentity(_contractId:number,input:{sicapId:number|null;cuiRaw:string|null;nameDisplay:string}){
 const cui=canonicalCui(input.cuiRaw),name=normalizeName(input.nameDisplay).normalized;
 if(!cui.valid)return input;
 if(input.sicapId===54428&&cui.cui==='13068733'&&name==='habau pps pipeline systems'){
  return {...input,cuiRaw:'13092995'};
 }
 if(input.sicapId===64188&&cui.cui==='5394305'&&name==='theotop'){
  return {...input,cuiRaw:'391391'};
 }
 if(input.sicapId===14779&&cui.cui==='5394305'&&name==='uti grup'){
  // The source reuses CAR TOP's SICAP id for UTI. Do not repoint its mapping.
  return {...input,sicapId:null};
 }
 const accepted=acceptedAuthorityCui(input.sicapId,cui.cui);
 if(accepted)return {...input,cuiRaw:accepted.supplierCui};
 return input;
}
