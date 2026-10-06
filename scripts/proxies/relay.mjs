// Optional network boundary: each port forwards only to its configured fixed proxy.
// Workers on the internal Docker network have no direct Internet route.
import {readFile} from 'node:fs/promises';
import {createServer,connect,isIP} from 'node:net';
if(!process.env.SEAP_PROXY_FILE)throw Error('SEAP_PROXY_FILE is required');
let pool;
try{
 const source=await readFile(process.env.SEAP_PROXY_FILE,'utf8');
 if(Buffer.byteLength(source)>65536)throw Error();
 pool=JSON.parse(source);
 if(!Array.isArray(pool)||!pool.length||pool.length>100)throw Error();
 const ids=new Set(),ips=new Set();
 for(const p of pool){
  const u=new URL(p.server);
  if(!/^proxy-[1-9]\d{0,2}$/.test(p.id)||ids.has(p.id)||u.protocol!=='http:'||!isIP(u.hostname)||ips.has(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();
  ids.add(p.id);ips.add(u.hostname);
 }
}catch{throw Error('Invalid fixed proxy configuration');}
const servers=pool.map(p=>{
 const endpoint=new URL(p.server);
 const server=createServer(client=>{
  const upstream=connect({host:endpoint.hostname,port:Number(endpoint.port||80)});
  const close=()=>{client.destroy();upstream.destroy();};
  client.on('error',close);upstream.on('error',close);
  client.on('close',close);upstream.on('close',close);
  client.setTimeout(90000,close);upstream.setTimeout(90000,close);
  client.pipe(upstream);upstream.pipe(client);
 });
 server.maxConnections=16;
 server.on('error',()=>{console.error('Proxy relay listener failed');process.exit(1);});
 server.listen(18000+Number(p.id.slice(6)),'0.0.0.0');
 return server;
});
console.log(`Fixed proxy relay: ${servers.length} endpoints. No general-purpose forwarding.`);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{for(const server of servers)server.close();setTimeout(()=>process.exit(0),1000).unref();});
