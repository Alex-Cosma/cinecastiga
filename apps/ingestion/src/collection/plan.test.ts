import {describe,it,expect} from 'vitest';
import {planResponse,task} from './plan.js';
const end='2026-09-25';
const da=task('fixture','da','da',{from:'2026-07-01',to:end,authorityId:7848,page:0});
describe('durable recovery plans (no network)',()=>{
 it('archives valid DA only within the selected finalization window',()=>{
  const r=planResponse(da,{total:1,items:[{directAcquisitionId:123,finalizationDate:'2026-07-01T12:00:00+03:00'}]},[],end);
  expect(r.docs[0]?.externalId).toBe('da:123');expect(r.status).toBe('complete');
  expect(()=>planResponse(da,{total:1,items:[{directAcquisitionId:123,finalizationDate:'2026-06-30T12:00:00+03:00'}]},[],end)).toThrow('Filtrul');
 });
 it('splits overflowing DA windows without falsely marking the parent complete',()=>{
  const r=planResponse(da,{total:2001,items:[],searchTooLong:true},[],end);
  expect(r.status).toBe('split');expect(r.docs).toHaveLength(0);expect(r.children).toHaveLength(2);
  expect(r.children[0]?.params.from).toBe('2026-07-01');expect(r.children[1]?.params.to).toBe(end);
  expect(()=>planResponse({...da,params:{...da.params,to:'2026-07-01'}},{total:2001,items:[],searchTooLong:true},[],end)).toThrow('O singură');
 });
 it('rejects truncated and duplicate lists',()=>{
  expect(()=>planResponse(da,{total:3,items:[{directAcquisitionId:1},{directAcquisitionId:1}]},[],end)).toThrow('repetat');
  expect(()=>planResponse(da,{total:2,items:[{directAcquisitionId:1}]},[],end)).toThrow('Numărul');
 });
 it('requires prior pages and stable totals before continuing',()=>{
  const t=task('fixture','awards','contracts',{noticeId:2,page:1});
  expect(()=>planResponse(t,{total:201,items:[]},[],end)).toThrow('Lipsește');
  expect(()=>planResponse(t,{total:201,items:[]},[{total:202,ids:[]}],end)).toThrow('Totalul');
 });
 it('persists eForms detail gaps independently of award contract work',()=>{
  const t=task('fixture','awards','list',{from:end,to:end,page:0});
  const r=planResponse(t,{total:1,items:[{caNoticeId:2,sysNoticeTypeId:18,sysNoticeVersionId:2,noticeStateDate:end+'T12:00:00+03:00'}]},[],end);
  expect(r.children.find(t=>t.kind==='detail')?.status).toBe('deferred');expect(r.children.find(t=>t.kind==='contracts')?.params.noticeId).toBe(2);expect(r.docs[0]?.endpointVersion).toBe('award-list:v1');
 });
 it('only archives the combined contracts envelope after every page reconciles',()=>{
  const first=task('fixture','awards','contracts',{noticeId:2,page:0});
  const items=Array.from({length:200},(_,i)=>({caNoticeContractId:i+1,contactEmail:'private@example.test'}));
  const a=planResponse(first,{total:201,items},[],end);expect(a.docs).toHaveLength(0);expect(a.children).toHaveLength(1);
  const b=planResponse(a.children[0]!,{total:201,items:[{caNoticeContractId:201}]},[a.result as any],end);
  expect((b.docs[0]?.payload as any).items).toHaveLength(201);expect(JSON.stringify(b.docs)).not.toContain('private@example.test');
 });
 it('expands the authority inventory into window-bound DA tasks',()=>{
  const r=planResponse(task('fixture','catalogue','catalogue',{page:0}),{total:1,items:[{id:7848}]},[],end);
  expect(r.children[0]?.key).toBe(da.key);expect(r.docs).toHaveLength(0);
 });
});
