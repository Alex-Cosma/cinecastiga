import {describe,it,expect} from 'vitest';
import {safeFileUrl,textMatches,validQuote} from './shared';
import {parseList} from './seap';
import {validateOriginal} from './process';
import {sourceRequestDelay} from './rate-limit';
describe('document provenance and search',()=>{
 it('does not archive a successful HTTP error body as an original document',async()=>{for(const text of ['{\"message\":\"Access denied\"}','<html>Failure</html>',''])await expect(validateOriginal(Buffer.from(text),new AbortController().signal)).rejects.toThrow('SEAP');});
 it('matches Romanian diacritics and case without changing the saved quote',()=>{expect(textMatches('Garanție și experiență similară','GARANTIE')).toBe(true);expect(validQuote('Garanție și experiență','Garantie')).toBe(false);expect(validQuote('Garanție și experiență','Garanție')).toBe(true);});
 it('rejects unsafe and stale-looking non-file routes',()=>{for(const url of ['https://evil.test/api-pub/files/noticedoc/'+'a'.repeat(32),'http://www.e-licitatie.ro/api-pub/files/noticedoc/'+'a'.repeat(32),'https://www.e-licitatie.ro@evil.test/x','/api-pub/files/noticedoc/a','/api-pub/files/noticedoc/'+'a'.repeat(32)+'?token=x'])expect(()=>safeFileUrl(url)).toThrow();expect(safeFileUrl('/api-pub/files/noticedoc/'+'a'.repeat(32))).toMatch(/^https:\/\/www.e-licitatie.ro/);});
 it('rejects a different notice and unsupported response shapes',()=>{const d={noticeDocumentId:10,noticeDocumentCode:'SCN10/001',documentName:'Original.pdf',noticeDocumentUrl:'/api-pub/files/noticedoc/'+'a'.repeat(32)};expect(parseList({items:[d],total:1},'SCN10').items).toHaveLength(1);expect(()=>parseList({items:[d],total:1},'SCN11')).toThrow();expect(()=>parseList({message:'refused'},'SCN10')).toThrow();expect(()=>parseList({items:[],total:201},'SCN10')).toThrow();});
});

describe('global source pacing',()=>{
 it('spaces file downloads by at least60seconds across jobs and accounts',()=>{expect(sourceRequestDelay(30_000,10_000,0,true)).toBe(30_000);expect(sourceRequestDelay(59_999,0,0,true)).toBe(1);expect(sourceRequestDelay(60_000,0,0,true)).toBe(0);});
 it('keeps the15second HTTP spacing even when the file limit has expired',()=>{expect(sourceRequestDelay(65_000,60_000,0,true)).toBe(10_000);});
 it('does not delay metadata by the file limit and allows the first request',()=>{expect(sourceRequestDelay(30_000,10_000,0,false)).toBe(0);expect(sourceRequestDelay(0,null,null,true)).toBe(0);});
});
