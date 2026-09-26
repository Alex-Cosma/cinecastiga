import {describe,it,expect} from 'vitest';
import {safeFileUrl,textMatches,validQuote} from './shared';
import {parseList} from './seap';
import {validateOriginal} from './process';
describe('document provenance and search',()=>{
 it('does not archive a successful HTTP error body as an original document',async()=>{for(const text of ['{\"message\":\"Access denied\"}','<html>Failure</html>',''])await expect(validateOriginal(Buffer.from(text),new AbortController().signal)).rejects.toThrow('SEAP');});
 it('matches Romanian diacritics and case without changing the saved quote',()=>{expect(textMatches('Garanție și experiență similară','GARANTIE')).toBe(true);expect(validQuote('Garanție și experiență','Garantie')).toBe(false);expect(validQuote('Garanție și experiență','Garanție')).toBe(true);});
 it('rejects unsafe and stale-looking non-file routes',()=>{for(const url of ['https://evil.test/api-pub/files/noticedoc/'+'a'.repeat(32),'http://www.e-licitatie.ro/api-pub/files/noticedoc/'+'a'.repeat(32),'https://www.e-licitatie.ro@evil.test/x','/api-pub/files/noticedoc/a','/api-pub/files/noticedoc/'+'a'.repeat(32)+'?token=x'])expect(()=>safeFileUrl(url)).toThrow();expect(safeFileUrl('/api-pub/files/noticedoc/'+'a'.repeat(32))).toMatch(/^https:\/\/www.e-licitatie.ro/);});
 it('rejects a different notice and unsupported response shapes',()=>{const d={noticeDocumentId:10,noticeDocumentCode:'SCN10/001',documentName:'Original.pdf',noticeDocumentUrl:'/api-pub/files/noticedoc/'+'a'.repeat(32)};expect(parseList({items:[d],total:1},'SCN10').items).toHaveLength(1);expect(()=>parseList({items:[d],total:1},'SCN11')).toThrow();expect(()=>parseList({message:'refused'},'SCN10')).toThrow();expect(()=>parseList({items:[],total:201},'SCN10')).toThrow();});
});
