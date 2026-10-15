import {describe,it,expect} from 'vitest';
import {noticeDetailRequest} from '../src/elicitatie/notice-detail.js';
describe('official public notice routes',()=>{
 it.each([[3,'C'],[8,'DC'],[13,'RFQ'],[16,'PC'],[18,'RFQ'],[20,'RFQ']])('routes award type %s to %s', (type,api)=>{
  expect(noticeDetailRequest({noticeId:100,noticeType:Number(type),page:0}).path).toBe(`/api-pub/${api}_PUBLIC_CANotice/get/100`);
 });
 it.each([[2,'PUBLICCNotice'],[6,'PUBLICDCNotice'],[7,'PublicPcNotice'],[12,'PublicRFQInvitation'],[17,'PublicRFQInvitation'],[19,'PublicRFQInvitation']])('routes tender type %s to %s',(type,api)=>{
  expect(noticeDetailRequest({noticeId:100,noticeType:Number(type),page:0}).path).toContain(`/api-pub/${api}/`);
 });
 it('uses the internal ID only for eForms, and public IDs/explicit DF for sections',()=>{
  const p={noticeId:100,internalNoticeId:200,noticeType:2,page:0,dfNoticeId:300};
  expect(noticeDetailRequest({...p,part:'eform'}).body).toEqual({noticeId:200,isNoticeChange:false});
  expect(noticeDetailRequest({...p,part:'section21'}).path).toContain('initNoticeId=100&sysNoticeTypeId=2&dfNoticeId=300');
  expect(()=>noticeDetailRequest({...p,part:'eform',internalNoticeId:undefined})).toThrow();
  expect(()=>noticeDetailRequest({...p,part:'lot'})).toThrow();
 });
 it('pages award lots using BaseList pageIndex/pageSize, not contract skip/take',()=>{
  expect(noticeDetailRequest({noticeId:100,noticeType:18,part:'lots',page:2}).body).toEqual({caNoticeId:100,pageIndex:2,pageSize:100});
 });
});
