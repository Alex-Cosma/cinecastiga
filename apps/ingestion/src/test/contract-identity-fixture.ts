import {readContractIdentityMembers,type DbSql} from '@seap/db';
import {assessContractIdentity,type ArchivedAward,type IdentityContract} from '../normalize/contract-identity.js';
import {approveContractIdentities} from '../normalize/approve-contract-identities.js';
/** Only call with isolated schema connections inside a rollback fixture. */
export async function seedVerifiedIdentity(q:DbSql,{framework=false,calloff=false}={}) {
 await q`create unique index on marts.contract_identity_decisions(candidate_id)`;
 await q`create unique index on marts.contract_identity_members(contract_id)`;
 await q`insert into core.entities(id,name_display,name_normalized,cui_canonical) values(1,'Autoritate','autoritate','4278337'),(10,'Furnizor','furnizor','15219174')`;
 await q`insert into core.awards(id,raw_id,ca_notice_id,notice_no,authority_entity_id,cpv_code,procedure_type,acquisition_type)
   values(1,1,100,'CAN-test',1,'45000000-7','Licitatie','Lucrari'),(2,2,200,'CAN-test',1,'45000000-7','Licitatie','Lucrari')`;
 const title=framework?'Acord-cadru lucrari':'Contract lucrari';
 await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_no,contract_date,contract_value,currency,title,lots_caption,cpv_code) values
  (1,3,101,100,'C/1','2026-07-06T00:00:00+03:00',100,'RON',${title},'Lot 1','45000000-7'),
  (2,4,102,200,'C/1','2026-07-06T00:00:00+03:00',100,'RON',${title},'Lot 1','45000000-7')`;
 await q`insert into core.contract_winners(contract_id,entity_id) values(1,10),(2,10)`;
 if(calloff)await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,title) values(3,5,103,100,'Contract subsecvent')`;
 const rows=await readContractIdentityMembers(q,['1','2']);
 const members=rows.map(r=>r.identity as IdentityContract);
 const archives:ArchivedAward[]=members.flatMap(c=>[
  {source:'fixture',rawId:c.noticeId,hash:'notice-'+c.noticeId,endpoint:'award-list:v1',payload:{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,procedureId:55,cpvCodeAndName:'45000000-7 - Lucrari',sysProcedureType:{text:'Licitatie'},sysAcquisitionContractType:{text:'Lucrari'},sysNoticeState:{text:'Publicat'},contractingAuthorityNameAndFN:'4278337 - Autoritate'}},
  {source:'fixture',rawId:c.publicId,hash:'contract-'+c.publicId,endpoint:'award-contracts:v1',payload:{caNoticeId:Number(c.noticeId),items:[{caNoticeId:Number(c.noticeId),noticeNo:c.noticeNo,caNoticeContractId:Number(c.publicId),contractNo:c.number,contractDate:'2026-07-06T00:00:00+03:00',contractValue:100,defaultCurrencyContractValue:100,currency:{text:'RON'},contractTitle:c.title,lotsCaption:c.lots,winner:{fiscalNumber:'RO15219174'},contractType:3,conditions:{hasCompetitionResumeSection:true}}]}}
 ]);
 const assessed=assessContractIdentity(members,archives);
 if(assessed.status!=='source_verified')throw Error('Invalid identity test fixture');
 await q`insert into marts.contract_identity_candidates(id,fingerprint,status,active,evidence)
   values(${assessed.id},${assessed.fingerprint},${assessed.status},true,${JSON.stringify(assessed)}::jsonb)`;
 await q`insert into marts.contract_identity_observations(candidate_id,fingerprint,evidence)
   values(${assessed.id},${assessed.fingerprint},${JSON.stringify(assessed)}::jsonb)`;
 await approveContractIdentities(q,[assessed],archives,'Integration test approval');
 return {assessed,archives};
}
