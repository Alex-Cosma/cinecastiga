import {afterAll,describe,it,expect} from 'vitest';
import {createDb} from '@seap/db';
import {sql as query} from 'drizzle-orm';
import {PARSERS} from './parsers.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('notice identity normalization',()=>{
 it('persists exact procedure IDs and titles for future imports and replay',async()=>{
  const rollback=new Error('rollback fixture');
  await expect(connection!.db.transaction(async tx=>{
   const ctx={tx,cpvCatalog:new Set<string>(),cpvByPrefix:new Map<string,string>(),units:new Map()};
   const notice={cNoticeId:99977101,procedureId:123456,contractTitle:'Source title',sysNoticeTypeId:17};
   const award={caNoticeId:99977102,procedureId:123456,contractTitle:'Award title'};
   for(const raw of [-100n,-101n]){
    const p=PARSERS['tender-list:v1']!;await p.load(ctx,raw,p.schema.parse(notice));
    const a=PARSERS['award-list:v1']!;await a.load(ctx,raw,a.schema.parse(award));
   }
   expect((await tx.execute(query`select procedure_id,title,raw_id::text from core.notices where c_notice_id=99977101`))[0]).toMatchObject({procedure_id:'123456',title:'Source title',raw_id:'-101'});
   expect((await tx.execute(query`select procedure_id,title from core.awards where ca_notice_id=99977102`))[0]).toMatchObject({procedure_id:'123456',title:'Award title'});
   for(const procedureId of [[123456],0,9007199254740992,'unknown']){
    const p=PARSERS['tender-list:v1']!;await p.load(ctx,-102n,p.schema.parse({...notice,procedureId}));
    expect((await tx.execute(query`select procedure_id from core.notices where c_notice_id=99977101`))[0]!.procedure_id).toBeNull();
   }
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
