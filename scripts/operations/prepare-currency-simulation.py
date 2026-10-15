#!/usr/bin/env python3
"""Copy public monetary inputs into an EMPTY, pre-created local test database.
No source requests; no private users, sessions, investigations or worker queues.
The destination schema must first be copied with pg_dump --schema-only.
"""
import subprocess,sys
name=sys.argv[1] if len(sys.argv)>1 else ''
if not name.startswith('seap_test_currency_'): raise SystemExit('Destination must start with seap_test_currency_')
base=['docker','exec','-i','seap-postgres-1','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','seap']
for table in ['core.entities','core.cpv_codes','core.awards','core.contracts','core.contract_winners','marts.contract_transactions','drizzle.__drizzle_migrations']:
    test=subprocess.check_output(base+['-d',name,'-At','-c',f'SELECT count(*) FROM {table}'],text=True).strip()
    if test!='0': raise SystemExit(f'{table} is not empty; refusing to overwrite')
    print('Copying',table,flush=True)
    src=subprocess.Popen(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c work_mem=8MB -c max_parallel_workers_per_gather=0','seap-postgres-1','psql','-X','-q','-U','seap','-d','seap','-c',f'COPY {table} TO STDOUT'],stdout=subprocess.PIPE)
    dst=subprocess.run(base+['-d',name,'-c',f'COPY {table} FROM STDIN'],stdin=src.stdout)
    src.stdout.close()
    if src.wait() or dst.returncode: raise SystemExit('Copy failed')
print('Copying archived contract responses',flush=True)
src=subprocess.Popen(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on','seap-postgres-1','psql','-X','-q','-U','seap','-d','seap','-c',"COPY (SELECT * FROM raw.raw_documents WHERE endpoint_version='award-contracts:v1') TO STDOUT"],stdout=subprocess.PIPE)
dst=subprocess.run(base+['-d',name,'-c','COPY raw.raw_documents FROM STDIN'],stdin=src.stdout)
src.stdout.close()
if src.wait() or dst.returncode: raise SystemExit('Raw copy failed')
print('Public monetary copy complete. No shared database was changed.',flush=True)

for table in ["drizzle.__drizzle_migrations","core.contracts","core.entities"]:
    subprocess.run(base+["-d",name,"-c",f"SELECT setval(pg_get_serial_sequence('{table}','id'), (SELECT max(id) FROM {table}))"],check=True)
subprocess.run(base+["-d",name,"-c","CREATE INDEX currency_sim_raw_idx ON core.contracts(raw_id); ANALYZE core.contracts; ANALYZE raw.raw_documents;"],check=True)
