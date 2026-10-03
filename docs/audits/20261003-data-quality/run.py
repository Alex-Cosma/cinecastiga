#!/usr/bin/env python3
"""Local diagnostics only; PostgreSQL enforces read-only and bounded queries."""
import json, subprocess, sys, time
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path
root=Path(__file__).resolve().parent
for name in sys.argv[1:]:
    path=root/'sql'/f'{name}.sql'
    query=path.read_text().strip().rstrip(';')
    started=time.monotonic()
    started_at=datetime.now(timezone.utc).isoformat()
    proc=subprocess.run(['docker','exec','-i','-e',"PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=180000 -c lock_timeout=3000 -c timezone=Europe/Bucharest -c work_mem=8MB -c max_parallel_workers_per_gather=0 -c jit=off",'seap-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','seap','-d','seap'],input="SELECT coalesce(json_agg(row_to_json(audit_row)), '[]'::json) FROM (\n"+query+'\n) audit_row;',text=True,capture_output=True)
    result={'query':name,'started_at':started_at,'elapsed_seconds':round(time.monotonic()-started,3),'exit_code':proc.returncode}
    if proc.returncode: result['error']=proc.stderr.strip()
    else: result['rows']=json.loads(proc.stdout, parse_float=Decimal)
    (root/'results'/f'{name}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(result,ensure_ascii=False,default=str),flush=True)
    if proc.returncode: sys.exit(proc.returncode)
