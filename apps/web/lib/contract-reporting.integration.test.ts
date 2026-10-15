import {afterAll,describe,it,expect} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {getContractDetail,getAwardNoticeDetail} from './marts';

// Read-only regression against the separately restored three-case public cohort.
// Ordinary unit runs never connect to the developer's real database.
const url=new URL(process.env.DATABASE_URL??'postgres://invalid/');
const enabled=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  &&url.pathname==='/seap_test_currency_reporting_20261011';
const sql=enabled?createDb().sql:null;
afterAll(async()=>{await sql?.end();});
describe.skipIf(!enabled)('public source detail retains amounts and separates non-additive records',()=>{
 it('shows original addendum amount, framework ceiling and distinct fuel orders without inflating the notice subtotal',async()=>{
  await sql!.begin('read only',async tx=>{
   const globals=globalThis as unknown as {__seapSql?:DbSql};const previous=globals.__seapSql;
   globals.__seapSql=tx as unknown as DbSql;
   try{
    const addendum=await getContractDetail('108186120');
    expect(addendum).toMatchObject({financialKind:'amendment',nonAdditive:true,contractValueExact:'75900253.44'});
    const framework=await getContractDetail('108186763');
    expect(framework).toMatchObject({financialKind:'framework',nonAdditive:true,contractValueExact:'666265420'});
    const latest=await getAwardNoticeDetail('100660187');
    expect(latest).toMatchObject({nLots:4,totalContractValue:61945000,frameworkValue:666265420});
    expect(latest!.lots.filter(l=>l.financialKind==='calloff')).toHaveLength(3);
    const original=await getAwardNoticeDetail('100639950');
    expect(original).toMatchObject({totalContractValue:null,frameworkValue:630763834.1});
    const standalone=await getContractDetail('106055409');
    expect(standalone).toMatchObject({financialKind:'framework',nonAdditive:true,contractValueExact:'72208562.72'});
    expect(await getAwardNoticeDetail('100532825')).toMatchObject({totalContractValue:null,frameworkValue:72208562.72});
    expect(await getContractDetail('missing')).toBeNull();
   }finally{if(previous)globals.__seapSql=previous;else delete globals.__seapSql;}
  });
 });
});
