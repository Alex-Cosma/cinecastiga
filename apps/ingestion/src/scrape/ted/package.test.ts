import {gzipSync} from 'node:zlib';
import {describe,expect,it} from 'vitest';
import {readTarGz,readTedDailyPackage,safeTarPath,TED_PACKAGE_LIMITS} from './package.js';
import {tar,tarGz,tarHeader,tedDailyPackage,tedNoticeXml} from '../../test/ted-package-fixture.js';
import {tedChallenge,tedPackageRejected,tedRequestParameters} from './collection-client.js';

const read=async(gz:Buffer,limits=TED_PACKAGE_LIMITS)=>{const seen:Record<string,string>={};const files=await readTarGz(gz,n=>n.endsWith('.xml'),(n,d)=>{seen[n]=d.toString('utf8');},limits);return {files,seen};};

describe('strict tar.gz reader',()=>{
 it('reads regular files under directories, skips unwanted ones, accepts POSIX, GNU and pax names',async()=>{
  const long=`deep/${'x'.repeat(120)}.xml`;
  const gz=tarGz([{name:'day/',type:'5'},{name:'day/a.xml',data:'<a/>'},{name:'./day/b.txt',data:'skip me'},{name:'c.xml',data:'<c/>',magic:'gnu'},{name:'p.xml',prefix:'pre/fix',data:'<p/>'},
   {name:'././@LongLink',type:'L',data:`${long}\0`,magic:'gnu'},{name:'trunc',data:'<long/>',magic:'gnu'},
   {name:'PaxHeader',type:'x',data:`${(' path=pax/name.xml\n'.length+2)} path=pax/name.xml\n`},{name:'ignored',data:'<pax/>'}]);
  const {files,seen}=await read(gz);
  expect(files).toBe(6);
  expect(seen).toEqual({'day/a.xml':'<a/>','c.xml':'<c/>','pre/fix/p.xml':'<p/>',[long]:'<long/>','pax/name.xml':'<pax/>'});
 });

 it('refuses path traversal, absolute paths and links',async()=>{
  for(const name of ['../evil.xml','day/../../evil.xml','/etc/passwd','a\\b.xml','C:/x.xml'])
   await expect(read(tarGz([{name,data:'x'}]))).rejects.toThrow(/cale nepermisă/);
  await expect(read(tarGz([{name:'link.xml',type:'2'}]))).rejects.toThrow(/intrare nepermisă/);
  await expect(read(tarGz([{name:'hard.xml',type:'1'}]))).rejects.toThrow(/intrare nepermisă/);
  expect(safeTarPath('./day/a.xml')).toBe('day/a.xml');
 });

 it('refuses truncated archives, corrupt headers and trailing data',async()=>{
  const whole=tarGz([{name:'a.xml',data:'<a/>'.repeat(500)}]);
  await expect(read(whole.subarray(0,whole.length-20) as Buffer)).rejects.toThrow(/decomprimat|trunchiat/);
  await expect(read(tarGz([{name:'a.xml',data:'<a/>'}],{end:false}))).rejects.toThrow(/trunchiată/);
  const cut=tar([{name:'a.xml',data:'<a/>'.repeat(500)}],{end:false});
  await expect(read(gzipSync(cut.subarray(0,1024)))).rejects.toThrow(/trunchiată/);
  const bad=tarHeader({name:'a.xml',data:'x'});bad[0]=0x62;
  await expect(read(gzipSync(Buffer.concat([bad,Buffer.alloc(512),Buffer.alloc(1024)])))).rejects.toThrow(/checksum/);
  await expect(read(gzipSync(Buffer.concat([tar([{name:'a.xml',data:'x'}]),Buffer.from('junk')])))).rejects.toThrow(/după marcajul/);
  await expect(read(gzipSync(Buffer.from('not a tar at all'.padEnd(600,'!'))))).rejects.toThrow(/checksum|ustar/);
 });

 it('refuses oversize members, totals and member counts',async()=>{
  const limits={maxMembers:3,maxFileBytes:1000,maxTotalBytes:64*1024};
  await expect(read(tarGz([{name:'big.xml',data:'x'.repeat(1001)}]),limits)).rejects.toThrow(/dimensiunea maximă/);
  // The declared size alone is enough to refuse, before any body is read.
  await expect(read(tarGz([{name:'big.xml',size:10_000_000}],{end:false}),limits)).rejects.toThrow(/dimensiunea maximă/);
  await expect(read(tarGz(Array.from({length:4},(_,i)=>({name:`${i}.xml`,data:'x'}))),limits)).rejects.toThrow(/prea multe/);
  await expect(read(tarGz(Array.from({length:3},(_,i)=>({name:`${i}.xml`,data:'x'.repeat(999)})).concat([{name:'pad',data:'y'.repeat(60_000)}])),{...limits,maxMembers:10,maxFileBytes:100_000})).rejects.toThrow(/decompresie/);
 });
});

describe('TED daily package reader',()=>{
 it('keeps only XML that passes the bulk pre-filter (Romanian address + can-standard)',async()=>{
  const pkg=tedDailyPackage('202600200','2026-10-15',['1-2026','2-2026']);
  const r=await readTedDailyPackage(pkg.bytes);
  expect(r).toMatchObject({files:5,xmlFiles:4});
  // The foreign-buyer notice with a Romanian winner is a candidate; the planner drops it structurally.
  expect(r.candidates.map(c=>c.name)).toEqual(['20261015_2026200/00000001_2026.xml','20261015_2026200/00000002_2026.xml','20261015_2026200/00900200_2026.xml']);
  expect(r.candidates[0]!.xml).toBe(tedNoticeXml({publication:'1-2026',ojs:'202600200',day:'2026-10-15'}));
 });
 it('refuses a body that is not gzip and duplicate members',async()=>{
  await expect(readTedDailyPackage(Buffer.from(''))).rejects.toThrow(/gzip/);
  await expect(readTedDailyPackage(Buffer.from('<html>challenge</html>'))).rejects.toThrow(/gzip/);
  await expect(readTedDailyPackage(tarGz([{name:'a.xml',data:'x'},{name:'a.xml',data:'y'}]))).rejects.toThrow(/de două ori/);
  const invalid=Buffer.concat([Buffer.from('eforms-country">ROU >can-standard< '),Buffer.from([0xff,0xfe])]);
  await expect(readTedDailyPackage(tarGz([{name:'a.xml',data:invalid}]))).rejects.toThrow(/UTF-8/);
 });
});

describe('TED transport classification',()=>{
 const h=(o:Record<string,string>={})=>new Headers(o);
 it('never treats a WAF challenge, a 202 or a non-gzip package as a success',()=>{
  expect(tedChallenge(202,h())).toBe(true);
  expect(tedChallenge(200,h({'x-amzn-waf-action':'challenge'}))).toBe(true);
  expect(tedChallenge(429,h({'x-amzn-waf-action':'challenge'}))).toBe(true);
  expect(tedChallenge(206,h())).toBe(true);
  expect(tedChallenge(200,h())).toBe(false);
  expect(tedChallenge(404,h())).toBe(false);
  expect(tedPackageRejected(200,h(),Buffer.from(''))).toBe(true);
  expect(tedPackageRejected(200,h(),Buffer.from('<html/>'))).toBe(true);
  expect(tedPackageRejected(200,h(),gzipSync('x'))).toBe(false);
  expect(tedPackageRejected(202,h(),gzipSync('x'))).toBe(true);
  expect(tedPackageRejected(404,h(),Buffer.from('not found'))).toBe(false);
 });
 it('records only the OJ S issue, or the search day and page, in the ledger',()=>{
  expect(tedRequestParameters('https://ted.europa.eu/packages/daily/202600200','GET',undefined)).toEqual({ojs:'202600200'});
  expect(()=>tedRequestParameters('https://ted.europa.eu/en/notice/506645-2026/xml','GET',undefined)).toThrow();
  const body=JSON.stringify({query:'buyer-country="ROU" AND notice-type="can-standard" AND publication-date>=20261015 AND publication-date<=20261015 SORT BY publication-date DESC',page:2,limit:100,fields:['x']});
  expect(tedRequestParameters('https://api.ted.europa.eu/v3/notices/search','POST',body)).toEqual({publicationDate:'2026-10-15',page:2,limit:100});
  expect(()=>tedRequestParameters('https://api.ted.europa.eu/v3/notices/search','GET',undefined)).toThrow();
 });
});
