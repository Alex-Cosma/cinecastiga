"""Public business roles only; no dates of birth, home addresses or contacts.
Usage: python3 verify-company-sources.py /path/to/seap-heartbeat
"""
import csv, hashlib, json, sys
from pathlib import Path
base=Path(sys.argv[1])/'onrc'
firms=base/'2026-07-08-od_firme.csv'
reps=base/'2026-07-08-od_reprezentanti_legali.csv'
companies={}
with firms.open(encoding='utf-8-sig') as f:
 for r in csv.reader(f,delimiter='^'):
  if len(r)==20 and r[1] in {'24031012','36486492'}:
   companies[r[2]]={'cui':r[1],'name':r[0],'registration':r[2]}
out=[]
with reps.open(encoding='utf-8-sig') as f:
 for n,r in enumerate(csv.reader(f,delimiter='^'),1):
  if len(r)==10 and r[0] in companies:
   out.append(dict(companies[r[0]],personName=r[1],role=r[2],sourceLine=n))
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
print(json.dumps({'observedAt':'2026-10-02','snapshotDate':'2026-07-08',
 'dataset':'https://data.gov.ro/dataset/firme-08-07-2026',
 'files':[{'name':p.name,'sha256':sha(p)} for p in [firms,reps]],
 'representatives':out,
 'limits':'Legal representatives at snapshot date; not shareholders, mandate history or procurement signatories.'},ensure_ascii=False,indent=2))
