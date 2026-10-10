import {readFile} from 'node:fs/promises';
import {planResponse,task} from '../../../apps/ingestion/dist/collection/plan.js';
import {DA_STRATEGY} from '../../../apps/ingestion/dist/collection/da-partition.js';
const root=process.argv[2];const report=JSON.parse(await readFile(root+'/reconciliation.json','utf8'));const output=[];
for(const day of report.days){
 const ids=new Set();let documents=0,sourceRows=0;
 for(const part of [...day.leaves,...day.splits]){
  const t=task('replay','da','da',{from:day.date,to:day.date,page:0,daStrategy:DA_STRATEGY,daScan:'2026-10-09',cpvPrefix:part.prefix});
  const body=JSON.parse(await readFile(`${root}/${day.date}-prefix-${part.prefix}.json`,'utf8'));
  const p=planResponse(t,body,[],'2026-10-09');sourceRows+=body.items.length;
  if(part.children){if(p.status!=='split'||JSON.stringify(p.children.map(c=>c.params.cpvPrefix))!==JSON.stringify(part.children))throw Error('Wrong children '+part.prefix);}
  else if(p.status!=='complete')throw Error('Incomplete leaf '+part.prefix);
  for(const d of p.docs){if(ids.has(d.externalId))throw Error('Duplicate ownership '+d.externalId);ids.add(d.externalId);documents++;}
 }
 const placeholder=JSON.parse(await readFile(`${root}/${day.date}-placeholder.json`,'utf8'));
 const p=planResponse(task('replay','da','da',{from:day.date,to:day.date,page:0,daStrategy:DA_STRATEGY,daScan:'2026-10-09',cpvPrefix:'00000000'}),placeholder,[],'2026-10-09');
 if(p.docs.length||p.children.length)throw Error('Inspect non-empty placeholder');
 if(ids.size!==day.distinct)throw Error(`Ownership count mismatch ${day.date}: ${ids.size}/${day.distinct}`);
 // Reconstruct research union independently, including incidental substring hits.
 const union=new Set();for(const leaf of day.leaves){const d=JSON.parse(await readFile(`${root}/${day.date}-prefix-${leaf.prefix}.json`,'utf8'));for(const r of d.items)union.add(`da:${r.directAcquisitionId}`);}
 if([...union].some(id=>!ids.has(id)))throw Error('ID set mismatch '+day.date);
 output.push({date:day.date,documents,sourceRows,listCalls:day.requests+1,ownershipDuplicates:0,matchingUnionIds:true});
}
console.log(JSON.stringify(output,null,2));
