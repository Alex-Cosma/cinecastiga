#!/usr/bin/env python3
"""Create an isolated public-reference copy from LOCAL seap. Never contacts sources.
Usage: python3 scripts/operations/prepare-reference-simulation.py seap_test_references_<suffix>
An existing destination is refused. No accounts, sessions, cases or queues are copied.
"""
import re
import subprocess
import sys

name = sys.argv[1] if len(sys.argv) == 2 else ""
if not re.fullmatch(r"seap_test_references_[a-z0-9_]+", name):
    raise SystemExit("Expected seap_test_references_<suffix>")
base = ["docker", "exec", "-i", "seap-postgres-1"]
psql = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "seap"]

def pipe(source, destination):
    src = subprocess.Popen(source, stdout=subprocess.PIPE)
    dst = subprocess.run(destination, stdin=src.stdout)
    src.stdout.close()
    if src.wait() or dst.returncode:
        raise SystemExit("Copy failed; incomplete isolated database retained for inspection")

subprocess.run(base + ["createdb", "-U", "seap", name], check=True)
pipe(base + ["pg_dump", "-U", "seap", "-d", "seap", "--schema-only"],
     base + psql + ["-d", name])
for table in ["drizzle.__drizzle_migrations", "reference.onrc_firm", "reference.company_reps",
              "reference.company_financials", "core.entities", "marts.entity_profile"]:
    print("Copying", table, flush=True)
    pipe(["docker", "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on", "seap-postgres-1"] +
         psql + ["-d", "seap", "-c", f"COPY {table} TO STDOUT"],
         base + psql + ["-d", name, "-c", f"COPY {table} FROM STDIN"])
subprocess.run(base + psql + ["-d", name, "-c", "SELECT setval(pg_get_serial_sequence('drizzle.__drizzle_migrations','id'), (SELECT max(id) FROM drizzle.__drizzle_migrations)); ANALYZE"], check=True)
print("Ready. Source database unchanged.", flush=True)
