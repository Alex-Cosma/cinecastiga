import {it,expect} from 'vitest';import {createServer} from 'node:http';import {chromium} from 'playwright-core';import {browserDocumentStream} from './browser-request';
it.skipIf(process.env.DOCUMENT_TOOLS_TEST!=='true')('streams a >50 MiB authenticated response through the same isolated browser session',async()=>{
 const size=53*1024*1024+3;let gets=0;
 const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Set-Cookie','fixture=yes');res.end('<title>Fixture</title>');return;}if(req.url!=='/file'){res.writeHead(204);res.end();return;}if(req.headers.cookie!=='fixture=yes'){res.writeHead(403);res.end();return;}gets++;res.setHeader('Content-Length',size);let sent=0;const block=Buffer.alloc(65536,97);function send(){while(sent<size){const n=Math.min(block.length,size-sent);sent+=n;if(!res.write(block.subarray(0,n))){res.once('drain',send);return;}}res.end();}send();});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 const browser=await chromium.launch({executablePath:process.env.DOCUMENTS_CHROMIUM??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'}),page=await context.newPage();await page.goto(`http://127.0.0.1:${port}/`);let received=0,max=0;
  await page.exposeFunction('receiveChunk',async(value:string)=>{const bytes=Buffer.from(value,'base64');received+=bytes.length;max=Math.max(max,bytes.length);expect(bytes[0]).toBe(97);});
  const result=await page.evaluate(browserDocumentStream,{url:`http://127.0.0.1:${port}/file`,sink:'receiveChunk'});
  expect(result.status).toBe(200);expect(received).toBe(size);expect(result.receivedBytes).toBe(size);expect(max).toBeLessThanOrEqual(65536);expect(gets).toBe(1);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
},60000);
