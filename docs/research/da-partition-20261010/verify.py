import json,re,sys,collections
from pathlib import Path
from decimal import Decimal
root=Path(sys.argv[1]); baseline={x['id']:x for x in map(json.loads,Path(sys.argv[2]).read_text().splitlines())}; report=json.loads((root/'reconciliation.json').read_text()); codes=[x['code'][:8] for x in json.load(open('packages/db/seed/cpv_2008.json'))]
def cui(raw):
 m=re.match(r'^(RO?)?\s*(\d{2,10})\b[\s-]*(.+)$',raw.strip(),re.I)
 if not m:return None
 n=m[2].lstrip('0');body=n[:-1].zfill(9);check=(sum(int(a)*b for a,b in zip(body,[7,5,3,2,1,7,5,3,2]))*10)%11;check=0 if check==10 else check
 return n if check==int(n[-1]) else None
out=[]
for day in report['days']:
 date=day['date']; rows={};conflicts=[]
 for leaf in day['leaves']:
  data=json.load(open(root/f'{date}-prefix-{leaf["prefix"]}.json'),parse_float=Decimal)
  assert not data['searchTooLong'] and data['total']==len(data['items'])<2000
  for r in data['items']:
   id=str(r['directAcquisitionId']);assert r['finalizationDate'][:10]==date
   if id in rows and rows[id]!=r:conflicts.append(id)
   rows[id]=r
 coverage=collections.Counter(sum(c.startswith(x['prefix']) for x in day['leaves']) for c in codes);assert coverage=={1:9454},coverage
 missing=[id for id,x in baseline.items() if x['date']==date and id not in rows];extra=[id for id in rows if id not in baseline or baseline[id]['date']!=date]
 changes=[];cui_diffs=[];cpv_diffs=[];states=[]
 for id,x in rows.items():
  b=baseline[id]
  if Decimal(str(x['closingValue']))!=Decimal(b['value']):changes.append({'id':id,'baseline':b['value'],'source':str(x['closingValue'])})
  for field,key in [('contractingAuthority','authorityCui'),('supplier','supplierCui')]:
   n=cui(x[field]);
   if n!=b[key]:cui_diffs.append({'id':id,'field':key,'sourceRaw':x[field],'sourceParsed':n,'baseline':b[key]})
  if x['cpvCode'][:10]!=b['cpv']:cpv_diffs.append(id)
  if x['sysDirectAcquisitionState']['text']!=b['state']:states.append(id)
 explained=[];unexplained=[]
 for id in missing:
  f=root/f'detail-{id}.json'
  if not f.exists():unexplained.append(id);continue
  d=json.load(open(f));fdate=d.get('finalizationDate');state=d.get('sysDirectAcquisitionStateID');explanation={'id':id,'baselineDate':date,'sourceDate':fdate,'sourceState':state}
  if fdate is None or fdate[:10]!=date:explained.append(explanation)
  else:unexplained.append(explanation)
 result={'date':date,'requests':day['requests'],'baseline':day['baseline'],'distinct':len(rows),'leafRows':day['leafRows'],'duplicateRows':day['duplicateRows'],'missingExplained':explained,'missingUnexplained':unexplained,'extra':extra,'valueChanges':changes,'cuiDifferences':cui_diffs,'cpvDifferences':cpv_diffs,'stateDifferences':states,'conflicts':conflicts,'catalogueCodesCoveredExactlyOnce':9454}
 out.append(result)
print(json.dumps(out,ensure_ascii=False,indent=2))
