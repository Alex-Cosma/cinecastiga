import {describe,expect,it} from 'vitest';
import {parseSeapProxies,SEAP_PROXY_MAX,SeapProxyConfigurationError} from './proxy-config.js';
const pool=(n:number,first=1)=>JSON.stringify(Array.from({length:n},(_,i)=>({id:`proxy-${i+first}`,server:`http://198.51.${Math.floor(i/250)}.${i%250+1}:8080`,username:'user-fixture',password:'pass-fixture'})));
describe('proxy pool file',()=>{
 it('accepts a pool of 1,200 fixed endpoints and refuses a larger one',()=>{
  expect(SEAP_PROXY_MAX).toBe(1200);
  const parsed=parseSeapProxies(pool(1200));
  expect(parsed).toHaveLength(1200);expect(parsed[1199]).toMatchObject({id:'proxy-1200',server:'http://198.51.4.200:8080'});
  expect(()=>parseSeapProxies(pool(1201))).toThrow(SeapProxyConfigurationError);
 });
 it('accepts ids up to proxy-9999 (new addresses climb past 999) and nothing longer',()=>{
  expect(parseSeapProxies(pool(1,9999))[0]).toMatchObject({id:'proxy-9999'});
  expect(()=>parseSeapProxies(pool(1,10000))).toThrow(SeapProxyConfigurationError);
  expect(()=>parseSeapProxies(pool(1,0))).toThrow(SeapProxyConfigurationError);
 });
 it('refuses a repeated address or id, and never echoes the file in the error',()=>{
  const two=JSON.parse(pool(2));two[1].server=two[0].server;
  expect(()=>parseSeapProxies(JSON.stringify(two))).toThrow(SeapProxyConfigurationError);
  const same=JSON.parse(pool(2));same[1].id=same[0].id;
  try{parseSeapProxies(JSON.stringify(same));throw Error('accepted');}catch(e){expect(String(e)).not.toContain('pass-fixture');expect(e).toBeInstanceOf(SeapProxyConfigurationError);}
 });
});
describe('loading the pool file',()=>{
 it('parses a file once per version and reads a changed file again',async()=>{
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {loadSeapProxies}=await import('./proxy-config.js');
  const dir=await mkdtemp(join(tmpdir(),'seap-pool-')),file=join(dir,'pool.json');
  try{
   await writeFile(file,pool(3));
   const first=await loadSeapProxies({SEAP_PROXY_FILE:file}),again=await loadSeapProxies({SEAP_PROXY_FILE:file});
   expect(first).toHaveLength(3);expect(again).toEqual(first);
   // Callers get their own array: changing it does not change what the next admission reads.
   first.pop();expect(await loadSeapProxies({SEAP_PROXY_FILE:file})).toHaveLength(3);
   await writeFile(file,pool(5));
   expect(await loadSeapProxies({SEAP_PROXY_FILE:file})).toHaveLength(5);
   await writeFile(file,'not json');
   await expect(loadSeapProxies({SEAP_PROXY_FILE:file})).rejects.toBeInstanceOf(SeapProxyConfigurationError);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
