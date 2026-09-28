# Public development snapshot tools

Read `docs/handover/04-database-transfer.md` first. These tools use Docker/PostgreSQL16 and Python3 stdlib; no Python dependencies and no source HTTP.

- `export-public.py`: read-only custom-format snapshot, source checks, explicit app data allowlist, no auth rows, no private app rows, no historical worker/repair schemas, catalogue audit and SHA256manifest. Production requires the existing deployment/publication lock. Use a new output directory. `--schema-only` is for rehearsal, never the colleague's real dataset.
- `package-stick.py`: after the completed public export, adds the tracked source snapshot plus explicit handover files, readable instructions and per-file checksums. No `.git`, ignored environment, dumps in source, dependencies or bytecode.
- `restore-local.py`: trusted archive only, checks checksum/size, local Unix Docker context and Compose project, new database names only, fail-on-error pg_restore with2jobs, fresh paused local control, private-table emptiness, migration count and ANALYZE. No production mutation or automatic DROP. A failure keeps the NEW database for diagnosis.

Full snapshot export example, repository root:

```sh
python3 scripts/handover/export-public.py \
  --container seap-postgres-1 --checkout "$PWD" \
  --source-label cinecastiga-local-20260928 \
  --output infra/prod/dumps/handover-local-20260928
```

Restore on recipient's computer after local Compose starts:

```sh
python3 scripts/handover/restore-local.py \
  --bundle /path/to/handover-local-20260928 \
  --database seap_collab --jobs 2
```

No credentials are embedded except the documented local database role name `seap`. The tools use existing container-local authentication. The dump does not include role passwords or environment files. Public source documents may contain publicly published personal data; no universal anonymization is claimed.

The checksum assumes a trusted manifest and sender; it is not a signature. PostgreSQL restoration executes archive SQL. Do not restore an untrusted dump even into a new database.

Schema and synthetic public/private data were restored into isolated local databases, including overwrite/name/checksum rejection checks. Evidence is in `docs/handover/transfer-procedure-verification.json`. See `TRANSFER-STATUS.md` for verification of the actual large artifact. Export/readback validation does not imply a large archive has been fully restored.
