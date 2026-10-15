import {describe,it,expect} from 'vitest';
import {validateCollectionSettings,safeCollectionEndpoint,safeCollectionParameters,retryAfterSeconds} from './collection-policy.js';
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
