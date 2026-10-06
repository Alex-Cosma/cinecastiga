// Docker-only fixture. No SEAP/provider requests; no published ports or real credentials.
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const tag=`proxy-guard-${process.pid}`,network=tag+'-internal',source=tag+'-source',relay=tag+'-relay';
const image=process.env.PROXY_TEST_IMAGE??'seap-documents-local:latest';
const dir=await mkdtemp(join(tmpdir(),'proxy-guard-'));
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000}).trim();
try{
 docker('network','create','--internal',network);
 docker('run','-d','--name',source,'--network','bridge','--entrypoint','node',image,'-e',"require('node:net').createServer(s=>s.end('fixture-ok')).listen(9900,'0.0.0.0')");
 const ip=docker('inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',source);
 await writeFile(join(dir,'pool.json'),JSON.stringify([{id:'proxy-1',server:`http://${ip}:9900`,username:'fixture',password:'fixture'}]));
 docker('run','-d','--name',relay,'--network','bridge','--entrypoint','node','-e','SEAP_PROXY_FILE=/pool.json','-v',`${dir}/pool.json:/pool.json:ro`,'-v',`${resolve('scripts/proxies/relay.mjs')}:/relay.mjs:ro`,image,'/relay.mjs');
 docker('network','connect','--alias','proxy-egress',network,relay);
 const script=`const net=require('node:net');async function probe(host,port){return new Promise(resolve=>{const s=net.connect({host,port});s.setTimeout(1800);s.on('timeout',()=>{s.destroy();resolve(false)});s.on('error',()=>resolve(false));s.on('data',b=>{s.destroy();resolve(b.toString()==='fixture-ok')});})}(async()=>{const via=await probe('proxy-egress',18001),direct=await probe('${ip}',9900);if(!via||direct)throw Error('Isolation failed');console.log(JSON.stringify({relayReachable:via,directSourceReachable:direct,seapRequests:0}));})().catch(()=>process.exit(1));`;
 console.log(docker('run','--rm','--network',network,'--entrypoint','node',image,'-e',script));
}finally{
 for(const name of [relay,source]){try{docker('rm','-f',name);}catch{}}
 try{docker('network','rm',network);}catch{}
 await rm(dir,{recursive:true,force:true});
}
