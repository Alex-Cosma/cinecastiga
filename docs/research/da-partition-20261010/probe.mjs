import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {getElicitatieClient} from '/app/apps/ingestion/dist/scrape/elicitatie/client.js';
import {closeSharedDb} from '/app/apps/ingestion/dist/db.js';
import {parseEntityString} from '/app/apps/ingestion/dist/normalize/name.js';
import {canonicalCui} from '/app/apps/ingestion/dist/normalize/cui.js';
import {withCollectionStream} from '/app/packages/db/dist/index.js';
const root='/tmp/da-partition-proof-20261010',c=getElicitatieClient();
const codes=JSON.parse(await readFile('/tmp/da-proof-cpv.json','utf8')).map(x=>x.code.slice(0,8));
const baseline=(await readFile('/tmp/da-proof-baseline.jsonl','utf8')).trim().split('\n').map(JSON.parse);
const roots=[...new Set(codes.map(x=>x.slice(0,2)))].sort();
await mkdir(root,{recursive:true,mode:0o700});let requests=0,stop=null;
const report={strategy:'CPV text substrings with validated CPV taxonomy prefix tree; union only complete leaves',catalogueCodes:codes.length,roots,days:[],maxRequests:400};
try{
 for(const date of ['2026-10-08','2026-10-07']){
  const queue=roots.map(prefix=>({prefix})),leaves=[],splits=[],all=[];const start=requests;
  async function worker(){while(queue.length&&!stop){const {prefix}=queue.shift();try{
   if(++requests>400)throw Error('Request budget exceeded');
   const probe=`${date}-prefix-${prefix}`;
   const data=await withCollectionStream('da',async()=> (await c.http.postJson('/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/',{pageIndex:0,pageSize:2000,showOngoingDa:false,cookieContext:null,finalizationDateStart:date,finalizationDateEnd:date,cpvCodeText:prefix})).data,{kind:'audit',partition:'audit:da-partition-proof-20261010',parameters:{probe}});
   await writeFile(`${root}/${probe}.json`,JSON.stringify(data),{mode:0o600});
   if(!Array.isArray(data.items)||!Number.isInteger(data.total))throw Error('Invalid envelope '+probe);
   if(data.items.some(x=>x.finalizationDate?.slice(0,10)!==date||!/^\d{8}-\d/.test(x.cpvCode)))throw Error('Date/CPV violation '+probe);
   if(new Set(data.items.map(x=>x.directAcquisitionId)).size!==data.items.length)throw Error('Duplicate IDs within '+probe);
   const own=data.items.filter(x=>x.cpvCode.startsWith(prefix)).length;
   if(data.searchTooLong||data.total>=2000){
    if(prefix.length>=8)throw Error('Exact code overflow requires fallback '+probe);
    const children=[...new Set(codes.filter(code=>code.startsWith(prefix)).map(code=>code.slice(0,prefix.length+1)))];
    if(!children.length)throw Error('Missing taxonomy children '+probe);
    splits.push({prefix,total:data.total,rows:data.items.length,children});queue.push(...children.map(prefix=>({prefix})));
   }else{
    if(data.total!==data.items.length)throw Error('Incomplete leaf '+probe);
    leaves.push({prefix,rows:data.items.length,ownPrefixRows:own});all.push(...data.items);
   }
   if((leaves.length+splits.length)%15===0)console.log(JSON.stringify({date,finished:leaves.length+splits.length,pending:queue.length,requests}));
  }catch(e){stop=e;throw e;}}}
  const done=await Promise.allSettled(Array.from({length:3},worker));for(const r of done)if(r.status==='rejected')console.error(r.reason?.message);
  if(stop)throw stop;
  const merged=new Map(),conflicts=[];
  for(const item of all){const old=merged.get(String(item.directAcquisitionId));if(old&&JSON.stringify(old)!==JSON.stringify(item))conflicts.push(item.directAcquisitionId);merged.set(String(item.directAcquisitionId),item);}
  const expected=new Map(baseline.filter(x=>x.date===date).map(x=>[x.id,x]));
  const missing=[...expected.keys()].filter(x=>!merged.has(x)),extra=[...merged.keys()].filter(x=>!expected.has(x));
  const differences=[];
  for(const [id,item] of merged){const old=expected.get(id);if(!old)continue;const changes=[];
   if(item.cpvCode.slice(0,10)!==old.cpv)changes.push('cpv');
   if(Number(item.closingValue)!==Number(old.value))changes.push('closingValue');
   if(item.sysDirectAcquisitionState?.text!==old.state)changes.push('state');
   for(const [field,key] of [['contractingAuthority','authorityCui'],['supplier','supplierCui']]){const parsed=canonicalCui(parseEntityString(item[field]??'').cuiRaw);const cui=parsed.valid?parsed.cui:null;if(cui!==old[key])changes.push(key);}
   if(changes.length)differences.push({id,changes});
  }
  const day={date,requests:requests-start,baseline:expected.size,distinct:merged.size,leafRows:all.length,duplicateRows:all.length-merged.size,missing,extra,differences,conflicts:[...new Set(conflicts)],leaves,splits};report.days.push(day);
  console.log(JSON.stringify({date,requests:day.requests,baseline:day.baseline,distinct:day.distinct,missing:missing.length,extra:extra.length,differences:differences.length,conflicts:day.conflicts.length,splits:splits.length,leaves:leaves.length}));
  await writeFile(`${root}/reconciliation.json`,JSON.stringify(report,null,2),{mode:0o600});
 }
}finally{console.log(JSON.stringify({requestsAttempted:requests}));await closeSharedDb();}
