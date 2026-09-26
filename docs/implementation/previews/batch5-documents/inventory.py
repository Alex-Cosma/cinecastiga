import subprocess,json,collections,re,xml.etree.ElementTree as ET
from urllib.parse import urlparse
sql="SELECT row_to_json(s) FROM (SELECT endpoint_version,payload FROM raw.raw_documents TABLESAMPLE SYSTEM (0.05) REPEATABLE(26)) s"
r=subprocess.run(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=12000','seap-postgres-1','psql','-U','seap','-d','seap','-X','-At','-c',sql],capture_output=True,text=True,check=True)
stats={}
for line in r.stdout.splitlines():
 row=json.loads(line); v=row['endpoint_version']; st=stats.setdefault(v,{'sampledRows':0,'topLevelKeys':collections.Counter(),'documentRelatedFields':collections.Counter(),'urlHosts':collections.Counter(),'xmlDocumentTags':collections.Counter()});st['sampledRows']+=1
 def walk(x,path=''):
  if isinstance(x,dict):
   for k,val in x.items():
    p=path+'.'+k if path else k
    if not path:st['topLevelKeys'][k]+=1
    if re.search(r'document|attach|file|download',k,re.I):st['documentRelatedFields'][p]+=1
    walk(val,p)
  elif isinstance(x,list):
   for val in x:walk(val,path+'[]')
  elif isinstance(x,str):
   if x.startswith(('https://','http://')):st['urlHosts'][urlparse(x).netloc]+=1
   if path=='xml':
    try:
     root=ET.fromstring(x)
     for el in root.iter():
      tag=el.tag.split('}')[-1]
      if re.search('DocumentReference|DocumentURI|URI_DOC|URL_DOCUMENT|ProcurementDocument',tag,re.I):st['xmlDocumentTags'][tag]+=1
      val=(el.text or '').strip()
      if val.startswith(('https://','http://')):st['urlHosts'][urlparse(val).netloc]+=1
    except ET.ParseError:st.setdefault('xmlParseErrors',0);st['xmlParseErrors']+=1
 walk(row['payload'])
result={'checkedAt':'2026-09-26','scope':'Local database only; SYSTEM(0.05) REPEATABLE(26) page sample, not coverage estimate or production inventory. Keys and hostnames only; no account data or document contents exported.','endpoints':stats}
open('docs/implementation/previews/batch5-documents/data-inventory.json','w').write(json.dumps(result,ensure_ascii=False,indent=2))
for k,v in stats.items():print(k,json.dumps({key:val for key,val in v.items() if key!='topLevelKeys'},ensure_ascii=False))
