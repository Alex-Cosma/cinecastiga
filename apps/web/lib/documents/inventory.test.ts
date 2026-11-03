import {describe,it,expect} from 'vitest';
import {parseAwardList,parseDocumentation,parseList} from './seap';
import {awardRows,documentationRows,inventoryRows} from './inventory';
import {classifyDocument} from './classification';
import {documentVisitorKey} from './visitor';
import {noticeViewUrl,DOCUMENT_NOTICE_TYPES} from './shared';

const url=(n:number)=>`api-pub/files/noticedoc/${String(n).padStart(32,'0')}`;
// The documentation section as SEAP returned it in the pilot of 3 November 2026 (URLs replaced).
const section={isPubOrSu:true,dfNoticeDocs:[{noticeDocumentUrl:url(1),noticeDocumentName:'Caiet de sarcini remorca.pdf.p7s',noticeDocumentCode:'CN1018048/00003'},{noticeDocumentUrl:url(2),noticeDocumentName:'FisaDate_DF1073758.pdf',noticeDocumentCode:'CN1018048/00007'}],
 contractingStrategyDocs:[],duaeDocs:[{noticeDocumentUrl:url(3),noticeDocumentName:'DUAE_CERERE_50034.xml',noticeDocumentCode:'CN1018048/00001'}],decisionDocs:[],exAnteDocs:[]};
const listed={noticeDocumentId:105584584,noticeDocumentCode:'CN1018048/00014',documentName:'Raspuns consolidat.pdf',noticeDocumentUrl:url(4),noticeDocumentPostDate:'2022-01-21T13:50:00+02:00',sysNoticeDocumentType:'Raspuns consolidat la solicitarile de clarificare',sysNoticeDocumentTypeId:31};

describe('documents of every participation family',()=>{
 it('reads the documentation section by part, and rejects a file of another notice or a foreign URL',()=>{
  expect(parseDocumentation(section,'CN1018048').map(d=>[d.section,d.code])).toEqual([['documentation','CN1018048/00003'],['documentation','CN1018048/00007'],['espd','CN1018048/00001']]);
  expect(()=>parseDocumentation({dfNoticeDocs:[{...section.dfNoticeDocs[0],noticeDocumentCode:'CN9/00001'}]},'CN1018048')).toThrow('Identitatea');
  expect(()=>parseDocumentation({dfNoticeDocs:[{...section.dfNoticeDocs[0],noticeDocumentUrl:'https://example.org/x'}]},'CN1018048')).toThrow();
  expect(()=>parseDocumentation({dfNoticeDocs:'x'},'CN1018048')).toThrow('format');
  // Some families (dynamic purchasing, type 19) give no codes.
  expect(parseDocumentation({dfNoticeDocs:[{noticeDocumentUrl:url(5),noticeDocumentName:'Caiet.docx.p7s',noticeDocumentCode:null}]},'RFD002933')[0]).toMatchObject({code:null});
 });
 it('skips a listed notification without a file, counting it for paging, and still rejects a file of another notice',()=>{
  // CN1057084, 3 November 2026: a text-only "Notificare" (no name or code, an empty URL) among the decisions.
  const notification={noticeDocumentId:1,noticeDocumentCode:null,documentName:null,noticeDocumentUrl:'',sysNoticeDocumentType:'Notificare'};
  const page=parseList({items:[notification,{...notification,noticeDocumentUrl:null},{...listed,noticeDocumentCode:'CN1057084/00051'}],total:3},'CN1057084');
  expect(page).toMatchObject({total:3,received:3});expect(page.items.map(d=>d.noticeDocumentCode)).toEqual(['CN1057084/00051']);
  expect(()=>parseList({items:[{...listed,noticeDocumentCode:'CN9/00001'}],total:1},'CN1057084')).toThrow('Identitatea');
  expect(()=>parseList({items:[{...listed,noticeDocumentCode:null}],total:1},'CN1057084')).toThrow('Identitatea');
 });
 it('gives documentation files a stable identity and keeps a file both sources carry once',()=>{
  const docs=parseDocumentation({dfNoticeDocs:[...section.dfNoticeDocs,{noticeDocumentUrl:url(6),noticeDocumentName:'Anexa.pdf',noticeDocumentCode:null},{noticeDocumentUrl:url(7),noticeDocumentName:'Anexa.pdf',noticeDocumentCode:null},{noticeDocumentUrl:url(8),noticeDocumentName:'Raspuns consolidat.pdf',noticeDocumentCode:'CN1018048/00014'}]},'CN1018048');
  expect(documentationRows(docs).map(r=>r.sourceId)).toEqual(['df:CN1018048/00003','df:CN1018048/00007','df:documentation:Anexa.pdf','df:documentation:Anexa.pdf#2','df:CN1018048/00014']);
  const rows=inventoryRows(parseList({items:[listed],total:1},'CN1018048').items,docs);
  expect(rows.map(r=>[r.sourceId,r.section])).toEqual([['105584584','list'],['df:CN1018048/00003','documentation'],['df:CN1018048/00007','documentation'],['df:documentation:Anexa.pdf','documentation'],['df:documentation:Anexa.pdf#2','documentation']]);
  expect(rows[0]).toMatchObject({publishedAt:'2022-01-21T13:50:00+02:00',sourceType:'Raspuns consolidat la solicitarile de clarificare',sourceTypeId:31});
 });
 it("lists an award's own documents by its id and number, as constatator documents",()=>{
  // PUBLICAckDoc/getAll for CAN1176341 (batch document-family-pilot-20261103-h).
  const item={ackDocID:100319806,documentName:'Doc constatator ctr 147 din 20.11.2026.pdf',noticeNo:'AD1237666',publicationDate:'2026-10-23T10:05:53+03:00',caNoticeId:100663285,caNoticePublicationNumber:'CAN1176341',sysAckDocCategoryName:'Derulare Contract'};
  const page=parseAwardList({items:[item,{...item,ackDocID:2,documentName:null}],total:2},'100663285','CAN1176341');
  expect(page).toMatchObject({total:2,received:2});
  expect(awardRows(page.items)).toEqual([{sourceId:'ack:100319806',code:'AD1237666',filename:'Doc constatator ctr 147 din 20.11.2026.pdf',publishedAt:'2026-10-23T10:05:53+03:00',section:'award',sourceType:'Derulare Contract',sourceTypeId:null}]);
  expect(()=>parseAwardList({items:[{...item,caNoticeId:1}],total:1},'100663285','CAN1176341')).toThrow('Identitatea');
  expect(()=>parseAwardList({items:[{...item,caNoticePublicationNumber:'CAN1'}],total:1},'100663285','CAN1176341')).toThrow('Identitatea');
  // A republished award keeps its CAN number: a document of its other version belongs to it, another award's does not.
  expect(parseAwardList({items:[{...item,caNoticeId:100633730}],total:1},['100663285','100633730'],'CAN1176341').items).toHaveLength(1);
  expect(()=>parseAwardList({items:[{...item,caNoticeId:100633731}],total:1},['100663285','100633730'],'CAN1176341')).toThrow('Identitatea');
  expect(classifyDocument('Caiet de sarcini.pdf',undefined,{section:'award',sourceType:'Derulare Contract'})).toMatchObject({categories:['acknowledgements'],method:'source'});
 });
 it('gives complaints and CNSC decisions their own category, by name or SEAP type',()=>{
  expect(classifyDocument('Decizie CNSC 2153.pdf').categories).toEqual(['complaints']);
  expect(classifyDocument('Contestatie raspuns consolidat.pdf').categories).toEqual(['complaints']);
  expect(classifyDocument('scan 4.pdf',undefined,{sourceType:'Decizie CNSC'}).categories).toEqual(['complaints']);
  expect(classifyDocument('Raspuns consolidat.pdf').categories).toEqual(['clarifications']);
 });
 it('classifies by SEAP type or part only when the name says nothing',()=>{
  expect(classifyDocument('FisaDate_DF1073758.pdf').categories).toEqual(['participation']);
  expect(classifyDocument('DUAE_CERERE_50034.xml').categories).toEqual(['participation']);
  expect(classifyDocument('doc 4.pdf',undefined,{sourceType:'Raspuns consolidat la solicitarile de clarificare'})).toMatchObject({categories:['clarifications'],method:'source',evidence:[{source:'seap'}]});
  expect(classifyDocument('anexa.xml',undefined,{section:'espd'})).toMatchObject({categories:['participation'],method:'source'});
  expect(classifyDocument('Caiet de sarcini.pdf',undefined,{sourceType:'Raspuns consolidat'})).toMatchObject({categories:['specifications'],method:'filename'});
  expect(classifyDocument('scan.pdf',undefined,{sourceType:'Notificare'}).categories).toEqual(['unknown']);
 });
 it('opens each family on its public page',()=>{
  expect(DOCUMENT_NOTICE_TYPES.sort((a,b)=>a-b)).toEqual([2,6,7,12,17,19]);
  expect(noticeViewUrl(2,100085318)).toBe('https://www.e-licitatie.ro/pub/notices/c-notice/v2/view/100085318');
  expect(noticeViewUrl(19,100245159)).toBe('https://www.e-licitatie.ro/pub/notices/rfq-invitation/v2/view/100245159');
 });
 it('counts a visitor by an hourly key of the trusted address, never a caller-supplied one',()=>{
  const req=(trusted:string,forwarded:string)=>new Request('https://cinecastiga.ro/api/contracte/1/files',{headers:{'x-feedback-client-ip':trusted,'x-forwarded-for':forwarded}});
  const at=new Date('2026-11-03T10:15:00Z'),key=documentVisitorKey(req('192.0.2.1','198.51.100.1'),'secret',true,at);
  expect(key).toMatch(/^visitor:[0-9a-f]{32}$/);expect(key).not.toContain('192.0.2.1');
  expect(documentVisitorKey(req('192.0.2.1','203.0.113.9'),'secret',true,at)).toBe(key);
  expect(documentVisitorKey(req('192.0.2.2','198.51.100.1'),'secret',true,at)).not.toBe(key);
  expect(documentVisitorKey(req('192.0.2.1','198.51.100.1'),'secret',true,new Date('2026-11-03T11:15:00Z'))).not.toBe(key);
 });
});
