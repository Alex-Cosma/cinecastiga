import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {compareNoticeInventory} from './inventory.js';
import {task} from './plan.js';
import type {NoticeListItem} from '@seap/scraper-clients';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Isolated test database required');
const conn=url?createDb(url):null;
afterAll(async()=>{await conn?.sql.end();});
describe.skipIf(!conn)('source inventory comparison',()=>{
 it('compares exact namespaces and notice numbers, without claiming unknown identities match',async()=>{
  const rollback=new Error('rollback fixture');
  await expect(conn!.sql.begin(async tx=>{
   const q=tx as unknown as DbSql;
   await q`insert into core.notices(raw_id,c_notice_id,sys_notice_type_id,notice_no,internal_notice_id) values(-1,99988441,17,'SCN-test',111),(-1,99988442,2,null,null)`;
   const t=task('fixture','tenders','list',{from:'2020-01-01',to:'2020-01-01',page:0,inventoryOnly:true});
   const item=(id:number,type:number,no:string,internal?:number)=>({cNoticeId:id,sysNoticeTypeId:type,noticeNo:no,noticeId:internal}) as NoticeListItem;
   const result=await compareNoticeInventory(q,t,[item(99988441,2,'CN-test'),item(99988441,17,'SCN-test',111),item(99988442,2,'CN-old')]);
   expect(result).toEqual({checked:3,matched:1,missing:[{key:'cn:99988441',noticeNo:'CN-test'}],unverified:[{key:'cn:99988442',noticeNo:'CN-old'}]});
   await expect(compareNoticeInventory(q,t,[item(99988441,17,'SCN-wrong',111)])).rejects.toThrow('contrazice');
   await expect(compareNoticeInventory(q,t,[item(99988441,17,'SCN-test',112)])).rejects.toThrow('contrazice');
   await q`insert into core.awards(raw_id,ca_notice_id,notice_no) values(-1,99988443,'CAN-test')`;
   const a=task('fixture','awards','list',{from:'2020-01-01',to:'2020-01-01',page:0,inventoryOnly:true});
   expect(await compareNoticeInventory(q,a,[{caNoticeId:99988443,noticeNo:'CAN-test'} as NoticeListItem])).toMatchObject({checked:1,matched:1,missing:[]});
   await expect(compareNoticeInventory(q,a,[{caNoticeId:99988443,noticeNo:'CAN-wrong'} as NoticeListItem])).rejects.toThrow('contrazice');
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
