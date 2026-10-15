#!/usr/bin/env python3
"""Dated local-only forensic extraction. Reads the public 30 September backup;
never restores tables, contacts SEAP or prints response payloads. The archive
checksum must match its manifest. Run from repository root. Output is ignored.
The Docker mount is read-only. Requires local postgres:16 tools.
"""
import subprocess,json,re,time,hashlib
from pathlib import Path
root=Path.cwd();out=root/'infra/prod/dumps/dq02-evidence-20261003';dump=root/'infra/prod/dumps/handover-local-20260930/database.dump'
q="select jsonb_agg(ca_notice_id::text) from core.awards where notice_no in (select notice_no from core.awards where notice_no is not null group by notice_no having count(*)>1)"
r=subprocess.run(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000','seap-postgres-1','psql','-X','-qAt','-U','seap','-d','seap','-c',q],capture_output=True,text=True,check=True)
ids=json.loads(r.stdout);wanted={('award:'+x).encode() for x in ids};(out/'notice-ids.json').write_text(json.dumps(ids))
start=time.monotonic();h=hashlib.file_digest(open(dump,'rb'),'sha256').hexdigest();expected=json.load(open(dump.parent/'manifest.json'))['sha256']
if h!=expected:raise RuntimeError('Backup checksum mismatch')
print('Checksum verified; extracting targeted award responses',flush=True)
awk = r'''BEGIN { FS="\t"; split(ids, wanted, ","); for (i in wanted) keep["award:" wanted[i]]=1 }
/^COPY raw.raw_documents / { head=$0; sub(/^[^(]*\(/,"",head); sub(/\).*/,"",head); split(head,col,", "); for(i in col) pos[col[i]]=i; active=1; print; next }
active && $0=="\\." { print "__TOTAL__\t" total; print; active=0; next }
active { total++; if(total%1000000==0) print "Scanned " total " rows" > "/dev/stderr"; if(($(pos["external_id"]) in keep) && ($(pos["endpoint_version"])=="award-contracts:v1" || $(pos["endpoint_version"])=="award-list:v1")) print }
'''
command='set -o pipefail; pg_restore --data-only --table=raw_documents --file=- /evidence/database.dump | awk -v ids="$1" "$2"'
p=subprocess.Popen(['docker','run','--rm','-v',str(dump.parent)+':/evidence:ro','postgres:16','bash','-c',command,'extract',','.join(ids),awk],stdout=subprocess.PIPE,stderr=open(out/'restore-stderr.log','wb'))
def unescape(s):
 return re.sub(r'\\([0-7]{1,3}|.)',lambda m: chr(int(m[1],8)) if m[1][0] in '01234567' else {'b':'\b','f':'\f','n':'\n','r':'\r','t':'\t','v':'\v'}.get(m[1],m[1]),s)
cols=None;n=0;seen=0;scanned=None
with (out/'award-raw.jsonl.partial').open('w') as f:
 for line in p.stdout:
  if line.startswith(b'__TOTAL__'):
   scanned=int(line.split(b'\t')[1]);continue
  if line.startswith(b'COPY raw.raw_documents '):
   cols=line.decode().split('(',1)[1].split(')',1)[0].split(', ');continue
  if cols is None:continue
  if line==b'\\.\n':cols=None;continue
  fields=line.rstrip(b'\n').split(b'\t');seen+=1
  if seen%1000000==0:print(f'Scanned {seen} rows; retained {n} responses',flush=True)
  if fields[cols.index('external_id')] not in wanted or fields[cols.index('endpoint_version')] not in {b'award-contracts:v1',b'award-list:v1'}:continue
  row={k:None if v==b'\\N' else unescape(v.decode()) for k,v in zip(cols,fields)};row['payload']=json.loads(row['payload']);f.write(json.dumps(row,ensure_ascii=False)+'\n');n+=1
if p.wait()!=0 or scanned is None:raise RuntimeError('pg_restore failed')
(out/'award-raw.jsonl.partial').rename(out/'award-raw.jsonl')
report={'sha256':h,'source':'public-local-dump-20260930','targetNotices':len(ids),'rawRowsScanned':scanned,'extractedResponses':n,'elapsedSeconds':round(time.monotonic()-start,3)}
(out/'extraction.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
