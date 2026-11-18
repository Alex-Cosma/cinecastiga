import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createDb,type DbSql} from '@seap/db';
import {decideWithheld,withheldDocuments} from './privacy-hold-admin';
import {isWithheld} from './privacy-hold';

// Owner, 18 November 2026 (legal audit; migration 0112): a prepared document whose text holds a CNP or an identity
// card is held back until an administrator decides. Every number here is made up; the CNPs only satisfy the rule.
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw new Error('Privacy-hold fixtures require a dedicated seap_test_* database');
const connection=url?createDb(url,{max:2}):null;
const KEY='privacy-hold-fixture';
// Valid by the rule (sex/century, date, county, control digit).
const CNP_1980='1800101221144',CNP_1995='2951231400120',CNP_2002='5020305123451';

describe.skipIf(!connection)('documents with personal identifiers are held back (PostgreSQL, migration 0112)',()=>{
 let q:DbSql;
 const found=async(text:string|null)=>(await q`select app.document_page_personal_id(${text}) r`)[0]!.r as string|null;
 const clean=async()=>{
  await q`delete from app.document_pages where document_id in (select id from app.procurement_documents where notice_key=${KEY})`;
  await q`delete from app.procurement_documents where notice_key=${KEY}`;
  await q`delete from app.document_notices where key=${KEY}`;
 };
 const document=async(name:string)=>(await q`insert into app.procurement_documents(notice_key,source_id,code,filename) values(${KEY},${name},${name},${name+'.pdf'}) returning id`)[0]!.id as string;
 const page=(id:string,n:number,text:string)=>q`insert into app.document_pages(document_id,page,text,method) values(${id},${n},${text},'text')`;
 const hold=async(id:string)=>(await q`select privacy_hold,privacy_reason,privacy_page from app.procurement_documents where id=${id}`)[0]!;
 beforeAll(()=>{q=connection!.sql;});
 beforeEach(async()=>{
  await clean();
  await q`insert into app.document_notices(key,notice_id,notice_type,notice_no,title,url) values(${KEY},'1',2,'CN0000001','Anunț de test','https://www.e-licitatie.ro/pub/notices/c-notice/v2/view/1')`;
 });
 afterAll(async()=>{if(connection){await clean();await connection.sql.end();}});

 it('recognises a CNP after its label, even one mistyped, and a valid one wherever it stands',async()=>{
  expect(await found(`Subsemnatul, CNP ${CNP_1980}, declar`)).toBe('cnp');
  expect(await found(`C.N.P.: ${CNP_1995}`)).toBe('cnp');
  expect(await found('cod numeric personal 1234567890123')).toBe('cnp');
  expect(await found(`reprezentant legal ${CNP_2002} domiciliat`)).toBe('cnp');
  expect(await found(`nr.\n${CNP_1980}\n`)).toBe('cnp');
 });

 it('leaves other long numbers alone: barcodes, accounts, wrong control digits, longer numbers',async()=>{
  // A Romanian barcode (594…): "born in 2094" is not a CNP, whatever its last digit.
  expect(await found('Cod EAN 5941234567899 lapte UHT')).toBeNull();
  expect(await found('1800101221145')).toBeNull();
  expect(await found(`cont ${CNP_1980}7`)).toBeNull();
  expect(await found(`9${CNP_1980}`)).toBeNull();
  expect(await found('IBAN RO49AAAA1B31007593840000, tel. 0721234567, CUI 12345678')).toBeNull();
  expect(await found('3800101221148 4800101221149')).toBeNull();
  expect(await found('')).toBeNull();
  expect(await found(null)).toBeNull();
 });

 it('recognises an identity card by its series and number, not an invoice series',async()=>{
  expect(await found('legitimat cu CI seria RX nr. 123456')).toBe('act_identitate');
  expect(await found('C.I. seria AB, nr 654321, eliberată de SPCLEP')).toBe('act_identitate');
  expect(await found('carte de identitate seria XZ nr.112233')).toBe('act_identitate');
  expect(await found('B.I. seria GT nr. 445566')).toBe('act_identitate');
  expect(await found('factura seria ABC nr 123456')).toBeNull();
  expect(await found('seria RX nr. 123456')).toBeNull();
  expect(await found('CI seria RX nr. 1234567')).toBeNull();
 });

 it('holds the document at the first page that has one, and only that document',async()=>{
  const caught=await document('declaratie'),plain=await document('caiet');
  await page(caught,1,'Formularul 1');
  expect(await hold(caught)).toMatchObject({privacy_hold:null});
  await page(caught,2,`Subsemnatul, CNP ${CNP_1980}`);
  await page(caught,3,'CI seria RX nr. 123456');
  await page(plain,1,'Caiet de sarcini: 500 buc., cod 5941234567899');
  expect(await hold(caught)).toMatchObject({privacy_hold:'held',privacy_reason:'cnp',privacy_page:2});
  expect(await hold(plain)).toMatchObject({privacy_hold:null,privacy_reason:null});
  expect(isWithheld((await hold(caught)).privacy_hold)).toBe(true);
  expect(isWithheld((await hold(plain)).privacy_hold)).toBe(false);
 });

 it('catches a page whose text is corrected later',async()=>{
  const id=await document('ocr');
  await page(id,1,'text necitit');
  await q`update app.document_pages set text=${'B.I. seria GT nr. 445566'} where document_id=${id} and page=1`;
  expect(await hold(id)).toMatchObject({privacy_hold:'held',privacy_reason:'act_identitate',privacy_page:1});
 });

 it('lists what waits for the administrator, and a released document is never caught again',async()=>{
  const first=await document('prima'),second=await document('a-doua');
  await page(first,1,`CNP ${CNP_1980}`);
  await page(second,4,`CNP ${CNP_1995}`);
  let list=await withheldDocuments(q);
  const mine=()=>list.documents.filter(d=>d.id===first||d.id===second);
  expect(mine().map(d=>[d.hold,d.reason,d.page,d.noticeNo]).sort()).toEqual([['held','cnp',1,'CN0000001'],['held','cnp',4,'CN0000001']]);

  expect(await decideWithheld(first,'release','Admin de test',q)).toBe(true);
  expect(await decideWithheld(second,'keep','Admin de test',q)).toBe(true);
  list=await withheldDocuments(q);
  expect(mine().map(d=>[d.id,d.hold,d.decidedBy])).toEqual([[second,'kept','Admin de test']]);
  expect(isWithheld((await hold(first)).privacy_hold)).toBe(false);
  expect(isWithheld((await hold(second)).privacy_hold)).toBe(true);

  // Another page with a CNP in the released document: it stays published.
  await page(first,2,`CNP ${CNP_2002}`);
  expect(await hold(first)).toMatchObject({privacy_hold:'released'});
  // A kept document can still be published later; a document never caught cannot be decided.
  expect(await decideWithheld(second,'release','Admin de test',q)).toBe(true);
  expect(await decideWithheld(await document('neatins'),'keep','Admin de test',q)).toBe(false);
 });
});
