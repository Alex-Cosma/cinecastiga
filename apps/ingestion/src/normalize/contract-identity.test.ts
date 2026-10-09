import {describe,it,expect} from 'vitest';
import {assessContractIdentity,assessContractPublicationGroup,contractIdentitySignature,type IdentityContract,type ArchivedAward} from './contract-identity.js';
const base:IdentityContract={id:'1',publicId:'101',noticeId:'10',noticeNo:'CAN123',authority:'7',authorityCui:'4278337',number:'C/1',date:'2026-07-06',value:'100',currency:'RON',title:'Contract',lots:'Lot 1',cpv:'45000000-7',procedure:'Licitatie',acquisition:'Lucrari',winners:['20'],winnerCuis:['15219174']};
const other={...base,id:'2',publicId:'102',noticeId:'11'};
function sources(c:IdentityContract):ArchivedAward[]{return [
 {source:'fixture',rawId:c.noticeId,hash:'notice-'+c.noticeId,endpoint:'award-list:v1',payload:{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,procedureId:55,cpvCodeAndName:'45000000-7 - Lucrari',sysProcedureType:{text:'Licitatie'},sysAcquisitionContractType:{text:'Lucrari'},sysNoticeState:{text:'Publicat'},contractingAuthorityNameAndFN:'4278337 - Autoritate'}},
 {source:'fixture',rawId:c.publicId,hash:'contract-'+c.publicId,endpoint:'award-contracts:v1',payload:{caNoticeId:Number(c.noticeId),items:[{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,caNoticeContractId:Number(c.publicId),contractNo:c.number,contractDate:'2026-07-06T00:00:00+03:00',contractValue:100,defaultCurrencyContractValue:100,currency:{text:'RON'},contractTitle:c.title,lotsCaption:c.lots,winner:{fiscalNumber:'RO15219174'},contractType:3,conditions:{hasCompetitionResumeSection:true}}]}}
];}
const archives=()=>[...sources(base),...sources(other)];
describe('contract publication identity evidence (never an implicit merge)',()=>{
 it('requires both source sides and the same procedure, retaining all source IDs',()=>{
  const r=assessContractIdentity([base,other],archives());expect(r.status).toBe('source_verified');expect(r.decision).toBe('unreviewed');expect(r.proofs).toHaveLength(2);
  expect(r.members.map(c=>c.publicId)).toEqual(['101','102']);
 });
 it('does not confirm a pair from just equal core values',()=>expect(assessContractIdentity([base,other],sources(other)).status).toBe('needs_evidence'));
 it.each(['number','date','value','currency','title','lots','cpv','procedure','acquisition','authority','noticeNo'] as const)('rejects different %s',key=>{
  const changed={...other,[key]:key==='value'?'101':'DIFFERENT'};
  expect(contractIdentitySignature(base)).not.toBe(contractIdentitySignature(changed));
  expect(assessContractIdentity([base,changed],archives()).status).toBe('conflict');
 });
 it('keeps different consortium members distinct',()=>expect(assessContractIdentity([base,{...other,winners:['20','21']}],archives()).status).toBe('conflict'));
 it('does not collapse identical contracts repeated inside the same publication',()=>expect(assessContractIdentity([base,other,{...other,id:'3',publicId:'103'}],archives()).reasons).toContain('ambiguous_multiplicity'));
 it('does not trust cancelled or differently classified source notices',()=>{const a=archives();a[2]!.payload.sysNoticeState.text='Anulat';expect(assessContractIdentity([base,other],a).reasons).toContain('archive_notice_disagrees_with_core');});
 it('treats NULL strings and foreign identifiers as insufficient CUI evidence',()=>{for(const value of ['NULL','DE4278337',''])expect(assessContractIdentity([{...base,winnerCuis:[value]},{...other,winnerCuis:[value]}],archives()).reasons).toContain('incomplete_identity');});
 it('separates fiscal code from the appended trade-register number',()=>{const a=archives();a[0]!.payload.contractingAuthorityNameAndFN='RO4278337 / J13/60/1991 - Autoritate';expect(assessContractIdentity([base,other],a).status).toBe('source_verified');});
 it('normalizes an explicit RO fiscal prefix without comparing institutions by name',()=>{const a=archives();a[0]!.payload.contractingAuthorityNameAndFN='R4278337 - Autoritate';expect(assessContractIdentity([base,other],a).status).toBe('source_verified');a[0]!.payload.contractingAuthorityNameAndFN='15219174 - Autoritate';expect(assessContractIdentity([base,other],a).status).toBe('conflict');});
 it('rejects a different underlying procedure',()=>{
  const a=archives();a[2]!.payload.procedureId=56;expect(assessContractIdentity([base,other],a).reasons).toContain('different_procedures');
 });
 it('rejects source values or winners that disagree with the normalized row',()=>{
  const a=archives();a[3]!.payload.items[0].winner.fiscalNumber='RO9999';expect(assessContractIdentity([base,other],a).reasons).toContain('archive_disagrees_with_core');
 });
 it('requires complete identifiers rather than treating missing lots as equality evidence',()=>expect(assessContractIdentity([{...base,lots:null},{...other,lots:null}],archives()).status).toBe('conflict'));
 it('preserves conflicting revisions for review',()=>{
  const a=archives(),v=structuredClone(a[3]!);v.payload.items[0].contractValue=90;a.push(v);
  expect(assessContractIdentity([base,other],a).reasons).toContain('conflicting_archived_versions');
 });
 it('tolerates repeated identical archives and decimal scale without converting twice',()=>{
  const a=archives();a.push(structuredClone(a[3]!));expect(assessContractIdentity([base,{...other,value:'100.00'}],a).status).toBe('source_verified');
 });
 it('produces the same fingerprint regardless of member/archive ordering',()=>{expect(assessContractIdentity([other,base],archives().reverse()).fingerprint).toBe(assessContractIdentity([base,other],archives()).fingerprint);});
 it('survives JSONB object-key ordering without changing the approval fingerprint',()=>{
  const reordered=Object.fromEntries(Object.entries(base).reverse()) as unknown as IdentityContract;
  expect(assessContractIdentity([reordered,other],archives()).fingerprint).toBe(assessContractIdentity([base,other],archives()).fingerprint);
 });
 it('changes the fingerprint when evidence changes; previous decisions cannot be silently reused',()=>{
  const a=archives(),before=assessContractIdentity([base,other],a);a[3]!.hash='new-hash';expect(assessContractIdentity([base,other],a).fingerprint).not.toBe(before.fingerprint);
 });
});

describe('source verification of additional publications',()=>{
 const third={...base,id:'3',publicId:'103',noticeId:'12'};
 const fourth={...base,id:'4',publicId:'104',noticeId:'13'};
 it('verifies three or four independently evidenced publications',()=>{
  for(const members of [[base,other,third],[base,other,third,fourth]]){
   const result=assessContractPublicationGroup(members,members.flatMap(sources));
   expect(result.status).toBe('source_verified');expect(result.proofs).toHaveLength(members.length);
   expect(result.methodology).toBe('contract-identity-2');expect(result.decision).toBe('unreviewed');
  }
 });
 it('does not extend the legacy pair approval implicitly',()=>{
  expect(assessContractIdentity([base,other,third],[...archives(),...sources(third)]).status).toBe('conflict');
 });
 it('checks the third publication terms, not only the first two',()=>{
  const all=[...archives(),...sources(third)];all[5]!.payload.items[0].conditions={different:true};
  expect(assessContractPublicationGroup([base,other,third],all).reasons).toContain('different_source_conditions');
 });
 it('cannot treat a revised amount as an identical publication',()=>{
  const revised={...third,value:'110'};
  expect(assessContractPublicationGroup([base,other,revised],[...archives(),...sources(third)]).reasons).toContain('different_contract_fields');
 });
 it('rejects a missing source or repeated member within a publication',()=>{
  expect(assessContractPublicationGroup([base,other,third],archives()).status).toBe('needs_evidence');
  expect(assessContractPublicationGroup([base,other,other],archives()).reasons).toContain('ambiguous_multiplicity');
 });
});
