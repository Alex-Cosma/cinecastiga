import {describe,it,expect} from 'vitest';
import {proxyAuditText} from './proxy-audit';
describe('proxy audit rendering',()=>{
 const policy={enabled:true,activeIds:['proxy-1','proxy-2'],min_seconds:40,max_seconds:60,requests_per_minute:15};
 it('renders API and operational snapshots identically',()=>{
  expect(proxyAuditText({proxies:policy})).toBe(proxyAuditText(policy));
  expect(proxyAuditText(policy)).toContain('2 proxy-uri selectate; 40–60 sec/IP; plafon 15/min.');
 });
 it.each([undefined,null,{}, {proxies:{}},{proxies:{enabled:true}},{proxies:{...policy,activeIds:null}},{proxies:{...policy,enabled:'true'}}])('tolerates incomplete historical entries: %j',value=>{
  expect(proxyAuditText(value)).toBe('Configurația conexiunii SEAP a fost modificată.');
 });
});
