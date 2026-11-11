import {describe,expect,it} from 'vitest';
import {parseSeapProxies,SEAP_PROXY_MAX,SeapProxyConfigurationError} from './proxy-config.js';
const pool=(n:number)=>JSON.stringify(Array.from({length:n},(_,i)=>({id:`proxy-${i+1}`,server:`http://198.51.${Math.floor(i/250)}.${i%250+1}:8080`,username:'user-fixture',password:'pass-fixture'})));
describe('proxy pool file',()=>{
 it('accepts a pool of 600 fixed endpoints and refuses a larger one',()=>{
  expect(SEAP_PROXY_MAX).toBe(600);
  const parsed=parseSeapProxies(pool(600));
  expect(parsed).toHaveLength(600);expect(parsed[599]).toMatchObject({id:'proxy-600',server:'http://198.51.2.100:8080'});
  expect(()=>parseSeapProxies(pool(601))).toThrow(SeapProxyConfigurationError);
 });
 it('refuses a repeated address or id, and never echoes the file in the error',()=>{
  const two=JSON.parse(pool(2));two[1].server=two[0].server;
  expect(()=>parseSeapProxies(JSON.stringify(two))).toThrow(SeapProxyConfigurationError);
  const same=JSON.parse(pool(2));same[1].id=same[0].id;
  try{parseSeapProxies(JSON.stringify(same));throw Error('accepted');}catch(e){expect(String(e)).not.toContain('pass-fixture');expect(e).toBeInstanceOf(SeapProxyConfigurationError);}
 });
});
