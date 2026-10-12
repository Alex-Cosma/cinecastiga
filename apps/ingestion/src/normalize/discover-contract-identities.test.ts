import {describe,it,expect} from 'vitest';
import {discoverPublicationGroups} from './discover-contract-identities.js';
import type {IdentityContract,ArchivedAward} from './contract-identity.js';
const base:IdentityContract={id:'1',publicId:'101',noticeId:'10',noticeNo:'CAN123',authority:'7',authorityCui:'4278337',number:'207',date:'2026-08-04',value:'21351060',currency:'RON',title:'Contract carburant',lots:'1. Default lot',cpv:'09134200-9',procedure:'Licitatie',acquisition:'Furnizare',winners:['20'],winnerCuis:['15219174']};
const copy={...base,id:'2',publicId:'102',noticeId:'11'};
function sources(c:IdentityContract):ArchivedAward[] {return [
 {source:'fixture',rawId:c.noticeId,hash:'notice-'+c.noticeId,endpoint:'award-list:v1',payload:{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,procedureId:55,cpvCodeAndName:c.cpv+' - Carburant',sysProcedureType:{text:c.procedure},sysAcquisitionContractType:{text:c.acquisition},sysNoticeState:{text:'Publicat'},contractingAuthorityNameAndFN:'4278337 - Autoritate',noticeStateDate:c.noticeId==='10'?'2026-08-05T10:00:00+03:00':'2026-10-08T10:00:00+03:00'}},
 {source:'fixture',rawId:c.publicId,hash:'contract-'+c.publicId,endpoint:'award-contracts:v1',payload:{caNoticeId:Number(c.noticeId),items:[{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,caNoticeContractId:Number(c.publicId),contractNo:c.number,contractDate:c.date+'T00:00:00+03:00',contractValue:c.value,defaultCurrencyContractValue:c.value,currency:{text:'RON'},contractTitle:c.title,lotsCaption:c.lots,winner:{fiscalNumber:'RO15219174'},contractType:3,conditions:{hasCompetitionResumeSection:false}}]}},
];}
describe('new economic identity discovery',()=>{
 it('detects a previously unregistered duplicate and preserves distinct later orders',()=>{
  const later={...copy,id:'3',publicId:'103',number:'270',date:'2026-10-08',value:'20469580'};
  const rows=[base,copy,later],groups=discoverPublicationGroups(rows,rows.flatMap(sources));
  expect(groups).toHaveLength(1);expect(groups[0]!.status).toBe('source_verified');
  expect(groups[0]!.members.map(m=>m.publicId)).toEqual(['101','102']);
 });
 it.each(['lots','authority','noticeNo','number','date'] as const)('does not group a different %s',field=>{
  const changed={...copy,[field]:'different'};
  expect(discoverPublicationGroups([base,changed],[...sources(base),...sources(changed)])).toHaveLength(0);
 });
 it('does not approve matches without both original archives',()=>{
  const [g]=discoverPublicationGroups([base,copy],sources(copy));
  expect(g!.status).toBe('needs_evidence');expect(g!.reasons).toContain('missing_archive');
 });
 it('counts an unflagged changed amount once at the latest value, recording the change (owner decision 2026-10-12)',()=>{
  const changed={...copy,value:'22000000'};
  const [g]=discoverPublicationGroups([base,changed],[...sources(base),...sources(changed)]);
  expect(g!.status).toBe('source_verified');expect(g!.latestPublicId).toBe('102');
  expect(g!.versionChanges).toEqual([{from:'101',to:'102',kind:'value_changed_without_amendment'}]);
 });
 it('does not trust a changed amount when the title also changes without amendment wording',()=>{
  const changed={...copy,value:'22000000',title:'Contract carburant nr. 2'};
  const [g]=discoverPublicationGroups([base,changed],[...sources(base),...sources(changed)]);
  expect(g!.reasons).toContain('missing_amendment_evidence');
 });
 it('selects the latest verified revised amount exactly once',()=>{
  const changed={...copy,value:'22000000'},a=sources(changed);
  a[1]!.payload.items[0].hasModifiedVersions=true;a[1]!.payload.items[0].modifiedCount=1;
  const [g]=discoverPublicationGroups([base,changed],[...sources(base),...a]);
  expect(g!.status).toBe('source_verified');expect(g!.latestPublicId).toBe('102');
 });
 it('leaves approved identities to revalidation without hiding unapproved coexisting orders',()=>{
  const sibling={...base,id:'3',publicId:'103',value:'999'},siblingCopy={...copy,id:'4',publicId:'104',value:'999'};
  const rows=[base,copy,sibling,siblingCopy];
  const groups=discoverPublicationGroups(rows,rows.flatMap(sources),new Set(['1','2']));
  expect(groups).toHaveLength(1);
  expect(groups[0]!.members.map(m=>m.publicId)).toEqual(['103','104']);
  expect(groups[0]!.status).toBe('source_verified');
 });
 it('rejects ambiguous multiplicity inside one publication',()=>{
  const twin={...base,id:'3',publicId:'103'},rows=[base,copy,twin];
  const [g]=discoverPublicationGroups(rows,rows.flatMap(sources));
  expect(g!.status).toBe('conflict');expect(g!.reasons).toContain('ambiguous_multiplicity');
 });
});
