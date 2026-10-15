import json,re,collections,hashlib,sys
from pathlib import Path
from decimal import Decimal
root=Path(sys.argv[1]); baseline={x['id']:x for x in map(json.loads,Path(sys.argv[2]).read_text().splitlines())}; report=json.loads((root/'reconciliation.json').read_text()); verified=[]; extra_docs=[]
def cui(s):
 m=re.match(r'^(RO?)?\s*(\d{2,10})\b[\s-]*(.+)$',re.sub(r'^`+(?=(?:RO?)?\s*\d{2,10}\b)','',s.strip(),flags=re.I),re.I)
 if not m:return None
 n=m[2].lstrip('0');check=(sum(int(a)*b for a,b in zip(n[:-1].zfill(9),[7,5,3,2,1,7,5,3,2]))*10)%11;check=0 if check==10 else check
 return n if check==int(n[-1]) else None
for day in report['days']:
 rows={}
 for leaf in day['leaves']:
  d=json.load(open(root/f'{day["date"]}-prefix-{leaf["prefix"]}.json'),parse_float=Decimal)
  assert not d['searchTooLong'] and len(d['items'])==d['total']<2000
  for x in d['items']:
   id=str(x['directAcquisitionId']);assert x['finalizationDate'][:10]==day['date']
   if id in rows:assert rows[id]==x
   rows[id]=x
 enriched=[];contradictions=[];changes=[];omissions=[]
 for id,x in rows.items():
  b=baseline.get(id)
  if not b:
   # Preserve original JSON number tokens through a separate ordinary parse below.
   continue
  assert b['date']==day['date'] and b['cpv']==x['cpvCode'][:10] and b['state']==x['sysDirectAcquisitionState']['text']
  if Decimal(b['value'])!=Decimal(str(x['closingValue'])):changes.append({'id':id,'before':b['value'],'after':str(x['closingValue'])})
  for field,key in [('contractingAuthority','authorityCui'),('supplier','supplierCui')]:
   actual=cui(x[field]);expected=b[key]
   if actual!=expected:
    (enriched if expected is None and actual is not None else contradictions).append({'id':id,'field':key,'before':expected,'after':actual})
 for id in day['missing']:
  d=json.load(open(root/f'detail-{id}.json'));assert d['directAcquisitionID']==int(id);actual=d.get('finalizationDate');assert actual is None or actual[:10]!=day['date'];omissions.append({'id':id,'now':actual,'state':d['sysDirectAcquisitionStateID']})
 assert not contradictions and not changes,(day['date'],contradictions,changes)
 extra={}
 for leaf in day['leaves']:
  for x in json.load(open(root/f'{day["date"]}-prefix-{leaf["prefix"]}.json'))['items']:
   if str(x['directAcquisitionId']) in day['extra']:extra[str(x['directAcquisitionId'])]=x
 extra_docs.extend({'source':'elicitatie','externalId':'da:'+id,'endpointVersion':'da-list:v1','payload':x} for id,x in extra.items())
 verified.append({'date':day['date'],'baseline':day['baseline'],'current':len(rows),'partitionRequests':day['requests'],'placeholderRequests':1,'explainedOmissions':omissions,'newIds':day['extra'],'enrichedCuis':len(enriched),'contradictions':len(contradictions),'valueChanges':changes})
assert len(verified)==10 and len(extra_docs)==114
(Path(sys.argv[3])/'verified.json').write_text(json.dumps(verified,indent=2))
(Path(sys.argv[3])/'extra-docs.json').write_text(json.dumps(extra_docs,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'days':len(verified),'baseline':sum(d['baseline'] for d in verified),'current':sum(d['current'] for d in verified),'new':len(extra_docs),'enrichedCuis':sum(d['enrichedCuis'] for d in verified),'partitionCalls':sum(d['partitionRequests'] for d in verified),'extraDocsSha256':hashlib.sha256((Path(sys.argv[3])/'extra-docs.json').read_bytes()).hexdigest()}))
