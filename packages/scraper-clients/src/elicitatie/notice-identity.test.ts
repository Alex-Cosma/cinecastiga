import {describe,it,expect} from 'vitest';
import {participationKey,noticeArchiveKey} from './notice-identity.js';
describe('SEAP participation endpoint namespaces',()=>{
 it('keeps the confirmed colliding CN and SCN public counters separate',()=>{
  expect(participationKey(100004524,2)).toBe('cn:100004524');
  expect(participationKey(100004524,17)).toBe('rfq:100004524');
 });
 it('uses the shared RFQInvitation counter for RFQ, SCN and SAD',()=>{
  expect(new Set([12,17,19].map(t=>participationKey(100,t))).size).toBe(1);
 });
 it('rejects unknown namespace and invalid ID, retaining the award archive format',()=>{
  expect(()=>participationKey(100,3)).toThrow();expect(()=>participationKey(0,17)).toThrow();
  expect(noticeArchiveKey('awards',100,3)).toBe('award:100');
 });
});
