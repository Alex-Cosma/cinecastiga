#!/usr/bin/env python3
"""Recheck cached public sources without exporting birth dates or contacting sources."""
import collections, csv, hashlib, json, re, sys
from pathlib import Path
cache=Path(sys.argv[1]); out=Path(__file__).resolve().parent/'results'
p=cache/'onrc/2026-07-08-od_reprezentanti_legali.csv'; formats=collections.Counter(); admins=collections.Counter()
with p.open(encoding='utf-8-sig') as f:
    next(f)
    for line in f:
        a=line.rstrip('\r\n').split('^')
        if len(a)!=10: continue
        d=a[3].strip()
        k='empty' if not d else 'date' if re.fullmatch(r'\d{2}/\d{2}/\d{4}',d) else 'date_with_time' if re.fullmatch(r'\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}',d) else 'other'
        formats[k]+=1
        if 'administrator' in a[2].lower(): admins[k]+=1
with p.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
res={'file':p.name,'sha256':digest,'date_formats':dict(formats),'administrator_date_formats':dict(admins)}
(out/'onrc-source-formats.json').write_text(json.dumps(res,indent=2)+'\n')
financial=[]
for p in sorted((cache/'financials').glob('*UU*.spec.csv')):
    for line in p.read_text().splitlines():
        if 'profit' in line.lower() and 'net' in line.lower(): financial.append({'file':p.name,'label':line,'matched_by_current_parser':bool(re.search(r'^profitul?\s+net',line,re.I))})
p=cache/'financials/2025-WEB_UU_AN2025.txt'; counts=collections.Counter(); examples=[]
with p.open() as f:
    for r in csv.DictReader(f):
        counts['rows']+=1
        value=r.get('I18','').strip()
        if value: counts['profit_present']+=1
        if value and float(value)>0: counts['positive_profit']+=1
        if r.get('CUI') in ['30976819','16617020']: examples.append({'cui':r['CUI'],'profit_net_source':value})
with p.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
res={'labels':financial,'2025_UU':dict(counts),'source_file':p.name,'sha256':digest,'examples':examples}
(out/'financial-source-labels.json').write_text(json.dumps(res,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'onrc':dict(formats),'financial_2025_UU':dict(counts),'examples':examples}))
