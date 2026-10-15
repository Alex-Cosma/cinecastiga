import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createServer as httpServer,type Server} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {connect,type Socket} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {continueDocumentRequest,launchDocumentBrowser,type DocumentProxy} from './proxy';

// Opt-in Chromium checks. Only loopback fixtures; never contact SEAP or a provider.
describe.skipIf(process.env.DOCUMENTS_PROXY_BROWSER_TEST!=='true')('real browser proxy transport',()=>{
 let dir:string,source:Server,proxy:Server,sourcePort:number,proxyPort:number;
 let seen:{method:string;cookie:string;authorization:string;path:string}[]=[];
 const sockets=new Set<Socket>();
 const tunnels:string[]=[];
 const listen=(server:Server)=>new Promise<number>(resolve=>server.listen(0,'127.0.0.1',()=>resolve((server.address() as {port:number}).port)));
 const track=(socket:Socket)=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));};
 const configured=():DocumentProxy=>({id:'proxy-1',server:`http://127.0.0.1:${proxyPort}`,username:'fixture-user',password:'fixture-pass'});
 beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'seap-proxy-browser-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  source=httpsServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(req,res)=>{
   seen.push({method:req.method!,cookie:req.headers.cookie??'',authorization:req.headers['proxy-authorization']??'',path:req.url??''});
   if(req.url==='/redirect'){res.writeHead(302,{location:'/unexpected'});res.end();return;}
   res.setHeader('content-type',req.url==='/notice'?'text/html':'application/json');
   if(req.url==='/notice')res.setHeader('set-cookie','session=fixture-session; Path=/; Secure; HttpOnly');
   res.end(req.url==='/notice'?'<title>Fixture</title>':'""');
  });
  source.on('connection',track);sourcePort=await listen(source);
  proxy=httpServer((_req,res)=>{res.writeHead(502);res.end();});
  proxy.on('connection',track);
  proxy.on('connect',(req,socket,head)=>{
   if(req.headers['proxy-authorization']!=='Basic '+Buffer.from('fixture-user:fixture-pass').toString('base64')){
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="fixture"\r\nContent-Length: 0\r\n\r\n');return;
   }
   if(req.url!==`127.0.0.1:${sourcePort}`){socket.destroy();return;}
   tunnels.push(req.url);
   const upstream=connect(sourcePort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
   track(upstream);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  });
  proxyPort=await listen(proxy);
 },15000);
 afterAll(async()=>{
  for(const socket of sockets)socket.destroy();
  await Promise.all([source,proxy].filter(Boolean).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
  if(dir)await rm(dir,{recursive:true,force:true});
 });
 it('routes HTTPS notice, POST and GET through the same authenticated proxy, preserving the cookie',async()=>{
  const browser=await launchDocumentBrowser(configured());
  try{
   // The self-signed fixture exception is test-only. Production TLS is never relaxed.
   const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
   const base=`https://127.0.0.1:${sourcePort}`;
   await context.route('**/*',route=>route.request().url().startsWith(base+'/')?continueDocumentRequest(route):route.abort());
   const page=await context.newPage();
   await page.goto(base+'/notice');
   await page.evaluate(async()=>{for(const method of ['POST','GET']){const r=await fetch('/file',{method,credentials:'include'});if(r.status!==200)throw Error('Fixture request failed');}});
   expect(seen.map(r=>r.method)).toEqual(['GET','POST','GET']);
   expect(seen.slice(1).every(r=>r.cookie==='session=fixture-session')).toBe(true);
   expect(seen.every(r=>r.authorization==='')).toBe(true);
   expect(tunnels.length).toBeGreaterThan(0);
   expect(new Set(tunnels)).toEqual(new Set([`127.0.0.1:${sourcePort}`]));
  }finally{await browser.close();}
 },20000);
 it('blocks navigation redirects outside the explicit request allowlist',async()=>{
  seen=[];
  const browser=await launchDocumentBrowser(configured());
  try{
   const context=await browser.newContext({ignoreHTTPSErrors:true});
   const target=`https://127.0.0.1:${sourcePort}/redirect`;
   let used=false;
   await context.route('**/*',async route=>{if(used||route.request().url()!==target){await route.abort();return;}used=true;await continueDocumentRequest(route);});
   const page=await context.newPage();
   await page.goto(target,{timeout:4000}).catch(()=>{});
   expect(seen.map(r=>r.path)).toEqual(['/redirect']);
  }finally{await browser.close();}
 },10000);
 it('does not reach the origin directly when proxy authentication fails',async()=>{
  seen=[];
  const browser=await launchDocumentBrowser({...configured(),password:'incorrect'});
  try{
   const page=await browser.newPage({ignoreHTTPSErrors:true});
   await page.route('**/*',continueDocumentRequest);
   await expect(page.goto(`https://127.0.0.1:${sourcePort}/notice`,{timeout:4000})).rejects.toThrow();
   expect(seen).toHaveLength(0);
  }finally{await browser.close();}
 },10000);
 it('does not reach the origin directly when the proxy is unavailable',async()=>{
  seen=[];
  const closed=httpServer();const port=await listen(closed);await new Promise<void>(resolve=>closed.close(()=>resolve()));
  const browser=await launchDocumentBrowser({...configured(),server:`http://127.0.0.1:${port}`});
  try{
   const page=await browser.newPage({ignoreHTTPSErrors:true});
   await page.route('**/*',continueDocumentRequest);
   await expect(page.goto(`https://127.0.0.1:${sourcePort}/notice`,{timeout:4000})).rejects.toThrow();
   expect(seen).toHaveLength(0);
  }finally{await browser.close();}
 },10000);
});
