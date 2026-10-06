import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {documentBrowserOptions,loadDocumentProxy,parseDocumentProxies,proxyTransportError} from './proxy';

const entry={id:'proxy-1',server:'http://192.0.2.1:12345',username:'private-user',password:'private-password'};
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
describe('document proxy configuration',()=>{
 it('accepts fixed endpoints and keeps credentials out of the server URL',()=>{
  const [proxy]=parseDocumentProxies(JSON.stringify([entry]));
  expect(documentBrowserOptions(proxy!,{}).proxy).toEqual({server:entry.server,username:entry.username,password:entry.password,bypass:'<-loopback>'});
  expect(documentBrowserOptions(null,{}).proxy).toBeUndefined();
 });
 it.each([
  [],[entry,entry],[{...entry,id:'private-user'}],[{...entry,server:'socks5://192.0.2.1:1080'}],
  [{...entry,server:'http://rotating.example.com:80'}],[{...entry,server:'http://private-user:private-password@192.0.2.1:8080'}],
  [{...entry,server:'http://192.0.2.1:8080/path'}],[{...entry,password:''}],[{...entry,bypass:'*'}],
 ].map(data=>({data})))('rejects ambiguous or unsafe configuration without printing its contents (%#)',({data})=>{
  expect(()=>parseDocumentProxies(JSON.stringify(data))).toThrow('Configurația proxy');
  try{parseDocumentProxies(JSON.stringify(data));}catch(error){expect(String(error)).not.toContain('private-');}
 });
 it('refuses malformed JSON without echoing the secret',()=>{
  expect(()=>parseDocumentProxies('{"password":"private-password",')).toThrow('Configurația proxy');
 });
 it('is optional for existing installs but fails closed when required or configured',async()=>{
  expect(await loadDocumentProxy({})).toBeNull();
  await expect(loadDocumentProxy({DOCUMENTS_PROXY_REQUIRED:'true'})).rejects.toThrow('conexiunea directă nu va fi folosită');
  await expect(loadDocumentProxy({DOCUMENTS_PROXY_REQUIRED:'typo'})).rejects.toThrow();
  await expect(loadDocumentProxy({DOCUMENTS_PROXY_FILE:'/does-not-exist/private-password'})).rejects.toThrow('Configurația proxy');
  const dir=await mkdtemp(join(tmpdir(),'seap-proxy-unit-'));dirs.push(dir);
  const file=join(dir,'proxies.local');await writeFile(file,JSON.stringify([entry]),{mode:0o600});
  expect(await loadDocumentProxy({DOCUMENTS_PROXY_FILE:file})).toEqual(entry);
  await writeFile(file,'[]');
  await expect(loadDocumentProxy({DOCUMENTS_PROXY_FILE:file,DOCUMENTS_PROXY_REQUIRED:'false'})).rejects.toThrow();
 });
 it('retains only allowlisted failure codes, never raw proxy diagnostics',()=>{
  const error=proxyTransportError(new Error('http://private-user:private-password@192.0.2.1 ERR_TUNNEL_CONNECTION_FAILED'));
  expect(error.message).toContain('ERR_TUNNEL_CONNECTION_FAILED');
  expect(JSON.stringify({message:error.message,stack:error.stack})).not.toContain('private-');
  expect(error.cause).toBeUndefined();
 });
});
