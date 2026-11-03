import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {contractFileKeys,contractNotice,getContractFiles} from './store';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('durable contract to notice association',()=>{
 it('survives missing raw data, rejects ambiguity and never matches another authority',async()=>{
  const q=await connection!.sql.reserve();await q`begin`;
  try{
   const [a]=await q`insert into core.entities(name_display,name_normalized) values('Association fixture','association fixture') returning id`;
   const [b]=await q`insert into core.entities(name_display,name_normalized) values('Other fixture','other fixture') returning id`;
   await q`insert into core.awards(raw_id,ca_notice_id,authority_entity_id,procedure_id) values(-99,99999101,${a!.id},'887766')`;
   await q`insert into core.notices(raw_id,c_notice_id,notice_no,authority_entity_id,procedure_id,sys_notice_type_id,title) values(-98,99999102,'SCN_TEST',${a!.id},'887766',17,'Source title'),(-97,99999103,'SCN_OTHER',${b!.id},'887766',17,'Source title')`;
   await q`insert into core.contracts(raw_id,ca_notice_contract_id,ca_notice_id,title) values(-96,99999104,99999101,'Source title')`;
   expect(await contractNotice('99999104',q)).toMatchObject({noticeId:'99999102',title:'Source title'});
   await q`insert into core.notices(raw_id,c_notice_id,notice_no,authority_entity_id,procedure_id,sys_notice_type_id) values(-95,99999105,'SCN_AMBIGUOUS',${a!.id},'887766',17)`;
   expect(await contractNotice('99999104',q)).toBeNull();
   await q`update core.awards set procedure_id=null where ca_notice_id=99999101`;
   expect(await contractNotice('99999104',q)).toBeNull();
   await q`insert into core.notice_award_sources(ca_notice_id,c_notice_id,notice_namespace,source_url,source_hash,evidence,fetched_at) values(99999101,99999102,'rfq','https://www.e-licitatie.ro/api-pub/fixture','fixture','{"caNoticeId":99999101}',now())`;
   expect(await contractNotice('99999104',q)).toMatchObject({noticeId:'99999102'});
   await q`update core.notices set authority_entity_id=${b!.id} where c_notice_id=99999102`;
   expect(await contractNotice('99999104',q)).toBeNull();
  }finally{await q`rollback`;q.release();}
 });
 it('says what SEAP holds: no participation notice by law, an award\'s own attachments, an open tender\'s notice',async()=>{
  const q=await connection!.sql.reserve();await q`begin`;
  try{
   const [a]=await q`insert into core.entities(name_display,name_normalized) values('State fixture','state fixture') returning id`;
   await q`insert into core.awards(raw_id,ca_notice_id,notice_no,authority_entity_id,procedure_type) values(-90,99999201,'CAN99999201',${a!.id},'Negociere fara publicare prealabila'),(-89,99999202,null,${a!.id},'Licitatie deschisa')`;
   await q`insert into core.awards(raw_id,ca_notice_id,authority_entity_id,procedure_id,procedure_type) values(-88,99999203,${a!.id},'556677','Licitatie deschisa')`;
   await q`insert into core.notices(raw_id,c_notice_id,notice_no,authority_entity_id,procedure_id,sys_notice_type_id,title) values(-87,99999204,'CN_TEST',${a!.id},'556677',2,'Open tender')`;
   await q`insert into core.contracts(raw_id,ca_notice_contract_id,ca_notice_id,title) values(-86,99999211,99999201,'NFPP'),(-85,99999212,99999202,'Unlinked'),(-84,99999213,99999203,'Linked')`;
   const detail=(id:number,count:number)=>q`insert into raw.raw_documents(source,external_id,endpoint_version,content_hash,payload) values('elicitatie',${'award:'+id},'award-detail-root:v2',${'state-fixture-'+id+'-'+count},${JSON.stringify({data:{ackDocsCount:count,cNoticeId:null}})}::jsonb)`;
   await detail(99999201,0);
   expect(await getContractFiles('99999211',q)).toMatchObject({notice:null,participation:'none',award:{caNoticeId:'99999201',count:0}});
   await detail(99999201,3);
   expect((await getContractFiles('99999211',q)).award?.count).toBe(3);
   expect(await getContractFiles('99999212',q)).toMatchObject({notice:null,participation:'unlinked',award:null});
   expect(await getContractFiles('99999213',q)).toMatchObject({participation:'linked',notice:{key:'2:99999204',noticeType:2,url:'https://www.e-licitatie.ro/pub/notices/c-notice/v2/view/99999204'}});
   // The award's own documents, once listed, are in the library and counted from the list.
   await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url,checked_at,total,inventory) values('ack:99999201','99999201',3,'CAN99999201','NFPP','https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/99999201',now(),1,2)`;
   await q`insert into app.procurement_documents(notice_key,source_id,code,filename,section,source_type) values('ack:99999201','ack:5','AD5','Doc constatator.pdf','award','Derulare Contract')`;
   const listed=await getContractFiles('99999211',q);
   expect(listed).toMatchObject({participation:'none',award:{caNoticeId:'99999201',count:1,listed:true}});
   expect(listed.files.map(f=>[f.section,f.filename,f.classification?.categories])).toEqual([['award','Doc constatator.pdf',['acknowledgements']]]);
   expect(await contractFileKeys('99999211',q)).toEqual(['ack:99999201']);
  }finally{await q`rollback`;q.release();}
 });
});
