import {describe,it,expect} from 'vitest';
import {planResponse,task,type Task,type PageResult} from './plan.js';
const end='2026-10-07';
const root=(stream:'awards'|'tenders',type:number)=>task('fixture',stream,'detail',{noticeId:100,internalNoticeId:200,noticeType:type,noticeVersion:2,noticeNo:stream==='awards'?'CAN100':'CN100',page:0});
const plan=(t:Task,v:unknown,prior:PageResult[]=[])=>planResponse(t,v,prior,end);
describe('complete notice detail graph',()=>{
 it('uses the source flag, not version 2, to select an actual eForm',()=>{
  const t=root('awards',3),data={caNoticeID:100,noticeID:200,noticeNumber:'CAN100',sysNoticeType:{id:3},conditions:{hasEformsDocument:true}};
  const r=plan(t,data);expect(r.children.map(t=>t.params.part)).toEqual(['eform']);
  const e=r.children[0]!;expect(e.params.internalNoticeId).toBe(200);
  const html={headerModel:{noticeId:200,noticeNumber:'CAN100',sysNoticeType:{id:3}},changeNoticeHtml:'<p>'+('Public form '.repeat(20))+'</p>'};
  expect(plan(e,html).docs[0]?.endpointVersion).toBe('award-detail-eform:v2');
  expect(()=>plan(e,{...html,headerModel:{...html.headerModel,noticeId:100}})).toThrow('identitatea');
  expect(()=>plan(e,{...html,changeNoticeHtml:''})).toThrow('gol');
  expect(()=>plan(t,{...data,noticeID:201})).toThrow('identitatea');
 });
 it('keeps the parts of a background backfill notice in the background',()=>{
  const t={...root('awards',3),params:{...root('awards',3).params,metadataRawId:7,backfill:true},priority:60};
  const [lots]=plan(t,{caNoticeID:100,noticeID:200,conditions:{hasEformsDocument:false},caNoticeEdit_New:{section1:{}}}).children;
  expect(lots).toMatchObject({priority:60,params:{part:'lots',backfill:true,metadataRawId:7}});
  const [eform]=plan(t,{caNoticeID:100,noticeID:200,conditions:{hasEformsDocument:true}}).children;
  expect(eform).toMatchObject({priority:60,params:{part:'eform',backfill:true}});
  const page=plan(lots!,{total:101,items:Array.from({length:100},(_,i)=>({noticeLotID:400+i}))});
  expect(page.children.map(c=>[c.params.part,c.priority])).toEqual([['lots',60]]);
  expect(plan(root('awards',3),{caNoticeID:100,noticeID:200,conditions:{hasEformsDocument:true}}).children[0]!.priority).toBe(1);
 });
 it('does not confuse the parent participation ID with the current award ID',()=>{
  const r=plan(root('awards',18),{caNoticeID:100,cNoticeId:999,noticeID:200,conditions:{hasEformsDocument:false},caNoticeEdit_New:{section1:{}}});
  expect(r.children[0]!.params.part).toBe('lots');
 });
 it('schedules every ordinary tender section and its lot details durably',()=>{
  const a=plan(root('tenders',2),{cNoticeId:100,noticeId:200,hasEformsDocuments:false});
  const b=plan(a.children[0]!,{noticeId:200,dfNoticeId:300});
  expect(b.children.map(t=>t.params.part)).toEqual(['section1','section21','section3','section4','section6','lots']);
  expect(new Set(b.children.map(t=>t.key)).size).toBe(6);
  const lots=b.children.find(t=>t.params.part==='lots')!;
  const page=plan(lots,{total:101,items:Array.from({length:100},(_,i)=>({noticeLotId:400+i}))});
  expect(page.children).toHaveLength(101);
  expect(new Set(page.children.map(t=>t.key)).size).toBe(101);
  const next=page.children.at(-1)!;
  const last=plan(next,{total:101,items:[{noticeLotId:500}]},[page.result as PageResult]);
  expect(last.children[0]!.params.dfNoticeId).toBe(300);
  expect(last.docs[0]?.externalId).toBe('tender:cn:100:lots:1');
  expect(()=>plan(next,{total:101,items:[{noticeLotId:400}]},[page.result as PageResult])).toThrow('paginarea');
  expect(()=>plan(next,{total:102,items:[{noticeLotId:500}]},[page.result as PageResult])).toThrow('paginarea');
 });
 it('rejects source error envelopes and missing format flags rather than creating false completion',()=>{
  const t=root('tenders',17);
  for(const response of [null,[],{}, {hasError:true}, {rfqInvitationId:100,noticeId:200}, {rfqInvitationId:100,noticeId:200,hasEformsDocuments:false,hasErrors:true}])expect(()=>plan(t,response)).toThrow();
 });
 it('rejects mismatched section identities and unknown shapes',()=>{
  const t={...root('tenders',2),params:{...root('tenders',2).params,part:'section21' as const}};
  expect(()=>plan(t,{mainCpvCode:{},noticeNo:'CN999'})).toThrow('identitatea');
  expect(()=>plan(t,{message:'Access denied'})).toThrow('structura');
 });
});
it('collects the full SAD invitation using its own identity rather than generic empty general info',()=>{
 const t=root('tenders',19),a=plan(t,{rfqInvitationId:100,noticeId:200,hasEformsDocuments:false});
 expect(a.children.map(t=>t.params.part)).toEqual(['sad']);
 const data={noticeId:200,initNoticeId:100,sysNoticeTypeId:19,noticeAddress:{},noticeInformation:{}};
 expect(plan(a.children[0]!,data).docs[0]!.endpointVersion).toBe('tender-detail-sad:v2');
 expect(()=>plan(a.children[0]!,{...data,initNoticeId:999})).toThrow('identitatea');
});
it('accepts an exact full award-lot inventory when SEAP ignores pageSize, without accepting partial surplus',()=>{
 const t={...root('awards',3),params:{...root('awards',3).params,part:'lots' as const}};
 const items=Array.from({length:297},(_,i)=>({noticeLotID:1000+i}));
 const result=plan(t,{total:297,items});expect(result.children).toHaveLength(0);expect((result.result as PageResult).ids).toHaveLength(297);
 expect(()=>plan(t,{total:300,items})).toThrow('paginarea');
 expect(()=>plan(t,{total:297,items:[...items.slice(1),items[1]]})).toThrow('repetați');
});
it('archives legacy v1 award forms, which echo no internal ID, and collects their lots by public ID',()=>{
 const t={...root('awards',18),params:{...root('awards',18).params,noticeVersion:1}};
 const view={publicationDetailsModel:{},section1_V1:{}};
 const data={caNoticeId:100,cNoticeId:null,noticeNumber:'CAN100',sysNoticeType:{id:18},conditions:{hasEformsDocument:false},caNoticeView_V1:view,caNoticeView_V1_U:null};
 const r=plan(t,data);
 expect(r.children.map(c=>c.params.part)).toEqual(['lots']);
 expect(r.docs[0]).toMatchObject({externalId:'award:100',endpointVersion:'award-detail-root:v2'});
 expect(plan(t,{...data,caNoticeView_V1:null,caNoticeView_V1_U:view}).children[0]!.params.part).toBe('lots');
 expect(()=>plan(t,{...data,caNoticeView_V1:null})).toThrow('secțiunile');
 expect(()=>plan(t,{...data,caNoticeId:101})).toThrow('identitatea');
 expect(()=>plan(t,{...data,noticeNumber:'CAN999'})).toThrow('identitatea');
 expect(()=>plan(t,{...data,conditions:{hasEformsDocument:true}})).toThrow('v1');
 // Version 2 still requires the internal ID.
 expect(()=>plan(root('awards',18),{...data,caNoticeEdit_New:{}})).toThrow('identificatorul intern');
});
it('reports a SEAP rendering error inside an eForm as a source gap naming the TED twin',()=>{
 const e={...root('awards',8),params:{...root('awards',8).params,part:'eform' as const}};
 const v={headerModel:{noticeId:200,noticeNumber:'CAN100',sysNoticeType:{id:8}},changeNoticeHtml:'400 Missing Authorization header in request',tedNoticeNo:'579218-2025'};
 expect(()=>plan(e,v)).toThrow('SEAP nu redă formularul eForms (400 Missing Authorization header in request); anunțul are corespondent TED 579218-2025.');
});
