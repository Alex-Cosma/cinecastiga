import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {contractNotice} from './store';
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
});
