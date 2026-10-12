import {describe,it,expect} from 'vitest';
import {assessContractIdentity,assessContractPublicationGroup,assessContractVersions,contractIdentitySignature,versionChangeKind,type IdentityContract,type ArchivedAward} from './contract-identity.js';
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
 it('accepts a source-verified foreign-currency equivalent without inventing an exchange rate',()=>{
  const a=archives();for(const source of a.filter(x=>x.endpoint==='award-contracts:v1'))Object.assign(source.payload.items[0],{contractValue:'20',defaultCurrencyContractValue:'100',currencyRate:'5',currency:{text:'EUR'}});
  const r=assessContractIdentity([base,other],a);
  expect(r.status).toBe('source_verified');
  expect(r.proofs[0]!.money).toEqual({originalCurrency:'EUR',originalValue:'20',valueRon:'100',currencyRate:'5'});
  delete a[3]!.payload.items[0].currencyRate;
  expect(assessContractIdentity([base,other],a).reasons).toContain('archive_disagrees_with_core');
  a[3]!.payload.items[0].currencyRate='4';
  expect(assessContractIdentity([base,other],a).reasons).toContain('archive_disagrees_with_core');
 });
 it('does not equate different original currencies or amounts just because their RON equivalents match',()=>{
  const a=archives();Object.assign(a[3]!.payload.items[0],{contractValue:'20',currencyRate:'5',currency:{text:'EUR'}});
  expect(assessContractIdentity([base,other],a).reasons).toContain('different_source_currency');
  Object.assign(a[1]!.payload.items[0],{contractValue:'25',currencyRate:'4',currency:{text:'EUR'}});
  expect(assessContractIdentity([base,other],a).reasons).toContain('different_source_money');
 });
 it('verifies foreign participants against country and registration id in every archived publication',()=>{
  const members=[base,other].map(c=>({...c,winnerCuis:[null],winnerForeignIds:[{entityId:'20',country:'NL',id:'NL817417813B01'}]}));
  const a=archives();for(const source of a.filter(x=>x.endpoint==='award-contracts:v1'))source.payload.items[0].winner={fiscalNumber:'NL 817417813B01',address:{countryItem:{localeKey:'NL'}}};
  const verified=assessContractIdentity(members,a);
  expect(verified.status).toBe('source_verified');expect(verified.proofs[0]!.winnerKeys).toEqual(['foreign:NL:NL817417813B01']);
  a[3]!.payload.items[0].winner.address.countryItem.localeKey='BE';
  expect(assessContractIdentity(members,a).reasons).toContain('archive_disagrees_with_core');
  delete a[3]!.payload.items[0].winner.address;
  expect(assessContractIdentity(members,a).reasons).toContain('archive_disagrees_with_core');
 });
 it.each(['RO','', 'ZZZ'])('does not manufacture a foreign identity from country %s',country=>{
  const members=[base,other].map(c=>({...c,winnerCuis:[null],winnerForeignIds:[{entityId:'20',country,id:'NL817417813B01'}]}));
  expect(assessContractIdentity(members,archives()).reasons).toContain('incomplete_identity');
 });
 it('requires a foreign reference to belong to the actual core participant and rejects placeholder registration IDs',()=>{
  for(const ref of [{entityId:'21',country:'NL',id:'NL817417813B01'},{entityId:'20',country:'NL',id:'NULL'}]){
   const members=[base,other].map(c=>({...c,winnerCuis:[null],winnerForeignIds:[ref]}));
   expect(assessContractIdentity(members,archives()).reasons).toContain('incomplete_identity');
  }
 });
 it('reuses only the narrowly reviewed source correction and records it in the proof',()=>{
  const changed={...other,publicId:'108105778',winnerCuis:['391391']};
  const first={...base,winnerCuis:['391391']};const a=[...sources(first),...sources(changed)];
  a[1]!.payload.items[0].winner={entityId:123,fiscalNumber:'391391',name:'THEOTOP'};
  a[3]!.payload.items[0].winner={entityId:64188,fiscalNumber:'5394305',name:'THEOTOP'};
  const r=assessContractIdentity([first,changed],a);
  expect(r.status).toBe('source_verified');expect(r.proofs[1]!.reviewedWinners).toHaveLength(1);
  a[3]!.payload.items[0].winner.name='ANOTHER COMPANY';
  expect(assessContractIdentity([first,changed],a).reasons).toContain('archive_disagrees_with_core');
 });
 it('keeps malformed fiscal identifiers under review instead of throwing from a reviewed correction',()=>{
  const a=archives();a[3]!.payload.items[0].winner={fiscalNumber:123456,name:42};
  expect(assessContractIdentity([base,other],a).reasons).toContain('archive_disagrees_with_core');
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

describe('latest verified contract version',()=>{
 const latest={...base,id:'3',publicId:'99',noticeId:'12',value:'80'};
 function versionSources(){
  const all=[...sources(base),...sources(other),...sources(latest)];
  for(let i=0;i<3;i++)all[i*2]!.payload.noticeStateDate=`2026-10-0${i+1}T10:00:00+03:00`;
  Object.assign(all[5]!.payload.items[0],{contractValue:80,defaultCurrencyContractValue:80,hasModifiedVersions:true,modifiedCount:1});
  return all;
 }
 it('selects a source-dated decrease even with a lower source ID; keeps all versions',()=>{
  const result=assessContractVersions([base,other,latest],versionSources());
  expect(result.status).toBe('source_verified');expect(result.latestPublicId).toBe('99');expect(result.members).toHaveLength(3);
 });
 it('counts an unflagged amount change at the latest value and records it (owner decision 2026-10-12)',()=>{
  const all=versionSources();all[5]!.payload.items[0].hasModifiedVersions=false;
  const r=assessContractVersions([base,other,latest],all);
  expect(r.status).toBe('source_verified');expect(r.latestPublicId).toBe('99');
  expect(r.versionChanges).toEqual([{from:'102',to:'99',kind:'value_changed_without_amendment'}]);
 });
 it('still requires amendment evidence when the amount and the title change without amendment wording',()=>{
  const all=versionSources();all[5]!.payload.items[0].hasModifiedVersions=false;all[5]!.payload.items[0].contractTitle='Contract nr. 9';
  expect(assessContractVersions([base,other,{...latest,title:'Contract nr. 9'}],all).reasons).toContain('missing_amendment_evidence');
 });
 it('refuses ambiguous or missing publication dates',()=>{
  const all=versionSources();all[4]!.payload.noticeStateDate=all[2]!.payload.noticeStateDate;
  expect(assessContractVersions([base,other,latest],all).reasons).toContain('ambiguous_version_order');
  delete all[4]!.payload.noticeStateDate;
  expect(assessContractVersions([base,other,latest],all).reasons).toContain('unverified_publication_order');
 });
 it('verifies a supplier amendment against the actual archived fiscal IDs',()=>{
  const changed={...latest,winners:['21'],winnerCuis:['391391']},all=versionSources();
  all[5]!.payload.items[0].winner.fiscalNumber='391391';
  expect(assessContractVersions([base,other,changed],all).status).toBe('source_verified');
  all[5]!.payload.items[0].winner.fiscalNumber='15219174';
  expect(assessContractVersions([base,other,changed],all).status).toBe('conflict');
 });
 it('does not merge different dates/lots/procedures or two records in one publication',()=>{
  expect(assessContractVersions([base,other,{...latest,date:'2026-07-07'}],versionSources()).status).toBe('conflict');
  expect(assessContractVersions([base,other,{...latest,noticeId:other.noticeId}],versionSources()).reasons).toContain('ambiguous_multiplicity');
 });
});

describe('unflagged republications accepted by owner decision 2026-10-12',()=>{
 const next={...base,id:'2',publicId:'102',noticeId:'11'};
 function pair(edit:(item:any)=>void=()=>{}){
  const all=[...sources(base),...sources(next)];
  all[0]!.payload.noticeStateDate='2026-10-01T10:00:00+03:00';all[2]!.payload.noticeStateDate='2026-10-02T10:00:00+03:00';
  edit(all[3]!.payload.items[0]);return all;
 }
 it('keeps an identical republication free of extra evidence (approved fingerprints unchanged)',()=>{
  const r=assessContractVersions([base,next],pair());expect(r.status).toBe('source_verified');expect(r).not.toHaveProperty('versionChanges');
 });
 it('accepts a later value set to a placeholder (0,01 lei) as the latest value',()=>{
  const r=assessContractVersions([base,{...next,value:'0.01'}],pair(i=>Object.assign(i,{contractValue:'0.01',defaultCurrencyContractValue:'0.01'})));
  expect(r.status).toBe('source_verified');expect(r.latestPublicId).toBe('102');expect(r.versionChanges?.[0]?.kind).toBe('value_changed_without_amendment');
 });
 it('accepts consortium members added later with the same value and title, but not replaced members',()=>{
  const added={...next,winners:['20','21'],winnerCuis:['15219174','391391']};
  const archive=pair(i=>{delete i.winner;i.winners=[{fiscalNumber:'RO15219174'},{fiscalNumber:'391391'}];});
  const r=assessContractVersions([base,added],archive);
  expect(r.status).toBe('source_verified');expect(r.versionChanges).toEqual([{from:'101',to:'102',kind:'winners_completed'}]);
  const replaced={...next,winners:['21'],winnerCuis:['391391']};
  expect(assessContractVersions([base,replaced],pair(i=>{i.winner={fiscalNumber:'391391'};})).reasons).toContain('missing_amendment_evidence');
  expect(versionChangeKind(base,{...added,value:'90'},true)).toBeNull();
 });
 it('accepts an amendment named in the later title; a renumbered title stays excluded',()=>{
  for(const title of ['Contract, ad diminuare nr 23295/09.07.2026','Contract+act aditional','lot 108, Suplim AC lot 108']){
   const r=assessContractVersions([base,{...next,title,value:'80'}],pair(i=>Object.assign(i,{contractTitle:title,contractValue:80,defaultCurrencyContractValue:80})));
   expect(r.status).toBe('source_verified');expect(r.versionChanges?.[0]?.kind).toBe('addendum_in_title');
  }
  const renumbered='Contract nr. 11';
  expect(assessContractVersions([base,{...next,title:renumbered}],pair(i=>{i.contractTitle=renumbered;})).reasons).toContain('missing_amendment_evidence');
 });
 it('keeps the legacy "valoare modificata prin AA" acceptance without new evidence',()=>{
  const title='Contract valoare modificata prin AA 1';
  const r=assessContractVersions([base,{...next,title,value:'80'}],pair(i=>Object.assign(i,{contractTitle:title,contractValue:80,defaultCurrencyContractValue:80})));
  expect(r.status).toBe('source_verified');expect(r).not.toHaveProperty('versionChanges');
 });
});

describe('identification rules approved 2026-10-12',()=>{
 const nego={...base,procedure:'Negociere fara publicare prealabila',lots:''},nego2={...other,procedure:'Negociere fara publicare prealabila',lots:''};
 function noProcedure(...cs:IdentityContract[]){
  return cs.flatMap(c=>{const s=sources(c);delete s[0]!.payload.procedureId;s[0]!.payload.sysProcedureType.text=c.procedure;s[1]!.payload.items[0].lotsCaption=null;return s;});
 }
 it('anchors procedure types published without a procedure ID on the award notice, empty lot allowed',()=>{
  const r=assessContractIdentity([nego,nego2],noProcedure(nego,nego2));
  expect(r.status).toBe('source_verified');expect(r.proofs[0]!.procedure).toBe('notice:CAN123');
 });
 it('still requires a procedure ID and a lot for open tenders',()=>{
  const open={...base,lots:''},open2={...other,lots:''};
  const r=assessContractIdentity([open,open2],noProcedure(open,open2));
  expect(r.reasons).toContain('missing_procedure');expect(r.reasons).toContain('incomplete_identity');
 });
 it('treats a Spanish CIF with and without its entity letter as the same registration, stored as published',()=>{
  const es={...base,winnerCuis:[null],winnerForeignIds:[{entityId:'20',country:'ES',id:'84840685'}]},es2={...other,winnerCuis:[null],winnerForeignIds:[{entityId:'20',country:'ES',id:'84840685'}]};
  const a=archives();
  a[1]!.payload.items[0].winner={fiscalNumber:'84840685',address:{countryItem:{localeKey:'ES'}}};
  a[3]!.payload.items[0].winner={fiscalNumber:'B84840685',address:{countryItem:{localeKey:'ES'}}};
  const r=assessContractIdentity([es,es2],a);
  expect(r.status).toBe('source_verified');
  expect(r.proofs.map(p=>p.winnerKeys)).toEqual([['foreign:ES:84840685'],['foreign:ES:B84840685']]);
  a[3]!.payload.items[0].winner={fiscalNumber:'B84840686',address:{countryItem:{localeKey:'ES'}}};
  expect(assessContractIdentity([es,es2],a).status).toBe('conflict');
  a[3]!.payload.items[0].winner={fiscalNumber:'B84840685',address:{countryItem:{localeKey:'PT'}}};
  expect(assessContractIdentity([es,es2],a).status).toBe('conflict');
 });
});
