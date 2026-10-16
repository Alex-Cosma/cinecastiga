import {describe,it,expect} from 'vitest';
import {validateCollectionSettings,safeCollectionEndpoint,safeCollectionParameters,retryAfterSeconds,isTedCollectionUrl,tedNoticeXmlUrl,TED_SEARCH_URL} from './collection-policy.js';
const valid={revision:1,minSeconds:50,maxSeconds:70,dailyLimit:null,processingTime:'05:00'};
describe('shared SEAP collection policy',()=>{
 it('validates pacing, time and finite daily budgets',()=>{expect(validateCollectionSettings(valid)).toEqual(valid);for(const patch of [{minSeconds:0},{minSeconds:71},{maxSeconds:3601},{minSeconds:1.2},{dailyLimit:0},{dailyLimit:'100'},{processingTime:'25:00'},{revision:0}])expect(()=>validateCollectionSettings({...valid,...patch})).toThrow();});
 it('never logs credentials, contact/free text or temporary file IDs',()=>{expect(safeCollectionEndpoint('https://www.e-licitatie.ro/api-pub/files/noticedoc/secret?token=x')).toBe('/api-pub/files/noticedoc/{fișier}');expect(safeCollectionParameters({pageIndex:0,pageSize:2000,startPublicationDate:'2026-01-01',sysNoticeTypeIds:[3,13],Cookie:'secret',Authorization:'secret',title:'contact',caNoticeId:'secret'})).toEqual({pageIndex:0,pageSize:2000,startPublicationDate:'2026-01-01',sysNoticeTypeIds:[3,13]});});
 it('honours numeric/date Retry-After without shortening a future deadline',()=>{expect(retryAfterSeconds('120')).toBe(120);expect(retryAfterSeconds('Thu, 01 Jan 2026 00:02:00 GMT',Date.parse('2026-01-01T00:00:00Z'))).toBe(120);expect(retryAfterSeconds('nonsense')).toBeNull();});
});
it('logs safe eForms/section IDs and only public notice discovery modules',()=>{
 expect(safeCollectionParameters({noticeId:123,dfNoticeId:456,noticeLotId:789,isNoticeChange:false,token:'secret'})).toEqual({noticeId:123,dfNoticeId:456,noticeLotId:789,isNoticeChange:false});
 expect(safeCollectionEndpoint('/views/pub/notices/ca-notice/service.min.js')).toBe('/views/pub/notices/ca-notice/service.min.js');
 expect(()=>safeCollectionEndpoint('/views/private/notices/service.min.js')).toThrow();
});

it('admits exactly the two TED resources and never another host',()=>{
 expect(safeCollectionEndpoint('https://api.ted.europa.eu/v3/notices/search')).toBe('api.ted.europa.eu/v3/notices/search');
 expect(safeCollectionEndpoint('https://ted.europa.eu/en/notice/506645-2026/xml')).toBe('ted.europa.eu/en/notice/506645-2026/xml');
 for(const url of ['https://ted.europa.eu/en/notice/506645-2026/pdf','https://ted.europa.eu/packages/monthly/2026-1','https://api.ted.europa.eu/v3/notices/search?x=1','http://api.ted.europa.eu/v3/notices/search','https://evil.ted.europa.eu/v3/notices/search','https://ted.europa.eu.example/en/notice/1-2026/xml','https://example.org/api-pub/x'])expect(()=>safeCollectionEndpoint(url)).toThrow();
 expect(safeCollectionEndpoint('https://e-licitatie.ro/api-pub/x')).toBe('/api-pub/x');
 expect(isTedCollectionUrl(tedNoticeXmlUrl('1-2026'))).toBe(true);expect(isTedCollectionUrl(TED_SEARCH_URL)).toBe(true);
 expect(()=>tedNoticeXmlUrl('../x')).toThrow();
 expect(safeCollectionParameters({publicationDate:'2026-10-15',page:2,limit:100,query:'buyer-country="ROU"',publicationNumber:'506645-2026'})).toEqual({publicationDate:'2026-10-15',page:2,limit:100,publicationNumber:'506645-2026'});
 expect(safeCollectionParameters({publicationNumber:'x; drop'})).toEqual({});
});
