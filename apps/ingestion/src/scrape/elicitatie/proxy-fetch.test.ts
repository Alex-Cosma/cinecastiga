import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createServer,type Server} from 'node:http';
import {connect,type Socket} from 'node:net';
import {withProxyResponse} from './proxy-fetch.js';
const listen=(s:Server)=>new Promise<number>(resolve=>s.listen(0,'127.0.0.1',()=>resolve((s.address() as {port:number}).port)));
describe('collector proxy transport, loopback only',()=>{
 let origin:Server,proxy:Server,originPort:number,proxyPort:number,sourceCalls=0;
 const sockets=new Set<Socket>();
 const track=(s:Socket)=>{sockets.add(s);s.on('close',()=>sockets.delete(s));};
 beforeAll(async()=>{
  origin=createServer((req,res)=>{sourceCalls++;if(req.url==='/redirect'){res.writeHead(302,{location:'/must-not-follow'});res.end();return;}expect(req.headers['proxy-authorization']).toBeUndefined();res.setHeader('content-type','application/json');res.end('{"ok":true}');});origin.on('connection',track);originPort=await listen(origin);
  proxy=createServer();proxy.on('connection',track);proxy.on('connect',(req,socket,head)=>{
   if(req.headers['proxy-authorization']!=='Basic '+Buffer.from('fixture:correct').toString('base64')){socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');return;}
   expect(req.url).toBe(`127.0.0.1:${originPort}`);
   const upstream=connect(originPort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});track(upstream);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });proxyPort=await listen(proxy);
 });
 afterAll(async()=>{for(const s of sockets)s.destroy();await Promise.all([origin,proxy].map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))));});
 const run=(password='correct',path='/')=>withProxyResponse(`http://127.0.0.1:${originPort}${path}`,{method:'POST',body:'{}'},{id:'proxy-1',server:`http://127.0.0.1:${proxyPort}`,username:'fixture',password},AbortSignal.timeout(3000),async r=>({status:r.status,text:await r.text()}));
 it('tunnels authenticated HTTP and consumes the response',async()=>{expect(await run()).toEqual({status:200,text:'{"ok":true}'});expect(sourceCalls).toBe(1);});
 it('does not fall back to the origin after bad proxy authentication',async()=>{const before=sourceCalls;await expect(run('bad')).rejects.toThrow();expect(sourceCalls).toBe(before);});
 it('does not follow redirects',async()=>{const before=sourceCalls;expect((await run('correct','/redirect')).status).toBe(302);expect(sourceCalls-before).toBe(1);});
});
