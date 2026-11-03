import {describe,expect,it} from 'vitest';
import {documentLaneCap,NETWORK_LANES,PROCESSING_SLOTS} from './collection';

describe('document network lanes',()=>{
 it('use the configured lanes while twenty proxies stay with the data streams',()=>{
  expect(documentLaneCap(100,100,false)).toBe(80);
  expect(documentLaneCap(30,100,false)).toBe(30);
  expect(documentLaneCap(30,40,false)).toBe(20);
  expect(documentLaneCap(10,15,false)).toBe(0);
 });
 it('leave half the pool while the data streams collect',()=>{
  expect(documentLaneCap(100,94,true)).toBe(47);
  expect(documentLaneCap(30,94,true)).toBe(30);
 });
 it('never exceed the slot range, and processing slots do not overlap it',()=>{
  expect(documentLaneCap(500,500,false)).toBe(NETWORK_LANES);
  expect(PROCESSING_SLOTS.filter(s=>s>=1&&s<=NETWORK_LANES)).toEqual([]);
  expect(Math.max(...PROCESSING_SLOTS)).toBeLessThan(199);
 });
});
