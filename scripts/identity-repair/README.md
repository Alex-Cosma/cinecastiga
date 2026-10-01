# Historical authority identity repair

This is an incident workflow, not a normal ingestion command. See
`docs/reviews/entity-identities-20261001/report.md` for the source evidence.
No script in this directory contacts SEAP.

## Archive audit (read only)

```sh
pnpm --filter ingestion build
node apps/ingestion/dist/scripts/audit-legacy-authorities.js db-old /absolute/path/to/NEW-audit-bundle
```

The directory must be new. `manifest.json` appears only after every BSON frame,
unique acquisition ID and group count has been read, and source/output SHA-256
hashes have been calculated. `rows.tsv` contains **every** source acquisition,
including unresolved identities. The original dimension, not polluted core
SICAP mappings, corroborates CUI/name or actual SICAP/name. Name alone is never
a merge key. A CUI/name mismatch, namespace conflict or absent dimension stays
unresolved. These candidates are not automatic corporate/legal succession.

## Local rehearsal

Prepare a **new** `seap_test_identity_*` PostgreSQL database. The script enforces
that prefix and a local Unix-socket Docker context by default. The separately
guarded dated publication mode below must never be used for local development.
Supply schema and real public data from a consistent copy. At minimum: entities,
SICAP IDs, CPV, acquisitions and authority/UAT mappings. Empty other source tables
mean only a procurement-row rehearsal, **not** a full publication validation.
Apply migration 0046 on the copy before exercising aliases.

```sh
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase prepare
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase audit
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase pilot
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase verify
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase apply
python3 scripts/identity-repair/rehearse.py --database seap_test_identity_NAME --bundle /path/to/audit --phase verify
```

`prepare`/`audit` refuse existing tables; inspect failed work instead of dropping
it blindly. `pilot` selects Cluj `2147251 → 2146445`; it does not touch CUI14920794.
`apply` corrects only individually evidenced source rows. It refuses conflicts
with a non-null raw_id or changed row data, uses one transaction, records applied
rows and is idempotent. All non-authority fields are compared exactly. Global
counts, amounts and record fingerprints must be conserved, and a second whole
row fingerprint verifies that authority changes equal precisely the plan.

`aliases.sql` is a separate, non-idempotent rehearsal phase. Only fully evacuated,
no-CUI/no-foreign-ID profiles without other procurement roles can become aliases.
It checks that the fabricated mapping is not an actual original dimension ID,
retains old entity rows and audit identities, removes the fabricated SICAP key,
and preserves/reconciles UAT mappings. Conflicting UAT mappings abort the alias
transaction. Retain `identity_repair` schema and the bundle for traceability.
Inspect all candidates and reference checks before running it; a partial copy
cannot prove absence of references in missing tables.

## Compatibility and publication requirements

- Redirects are terminal and acyclic. Old profile URLs preserve query parameters.
- Live queries map IDs in filters, comparison, population inclusions/exclusions
  and drawer selections. Saved question/capture JSON is not rewritten.
- Connections and watches accept an old identity receipt only against recorded
  previous identity evidence; monitoring also checks the current canonical
  identity against the recorded target. Frozen receipts keep checkpoint checks.
- Full production-shaped clone validation must rebuild statistics, transaction
  marts, risk and Radiografie, validate the snapshot and reindex search.
- Never publish just the SQL row correction over stale marts/risk.
- Live requires a fresh backup, maintenance/write exclusion and publication
  validation. Restore remains the rollback route.

## Dated production publication (1 October 2026)

Execution and current status: [live publication report](../../docs/implementation/entity-identity-release-20261001.md).
The commands below document the incident procedure, not work to repeat at the next deploy.

`publish.sh prepare|publish|reopen <deployed-sha> [inspected-revision]` is an explicit
one-off coordinator for this incident. It is not part of cron or deploy. Do not
run it without the current owner's authorization and complete copy validation.
The pinned checkout must be clean and already deployed with migration0046.

It requires the full-copy refresh, independent search and HTTP checks, recorded
in `/srv/seap/backups/identity-repair-20261001/release-validation.json`. That file
must include `status: validated`, `routesPassed: true`, checkpointId, proofFiles
from the source manifest, plannedRows, planFingerprint and aliases from the
verified plan. Do not fabricate this marker to bypass an unfinished check.

Prepare takes the deployment lock, checks the inspected control revision, gates
the site, drains and stops source workers, freezes the boundary, and creates a
new full private backup with checksum in `identity-live-20261001`. Publish first
invalidates analytic readiness, verifies the same source proof and **exact row
plan fingerprint** as the clone, repairs rows/aliases, verifies conservation,
rebuilds the complete pipeline and both search indexes, and validates examples.
Reopen requires that exact ready checkpoint and an unchanged control revision;
it preserves operator pauses, source blocks, delays and the existing schedule.
Any failure retains maintenance. Existing artifacts prohibit blind reruns.

The Python live option additionally requires `--publication-boundary` at the
fixed incident path, database `seap`, the production container name and explicit
`IDENTITY_REPAIR_APPLY=20261001-approved-copy`. Every SQL mutation transaction
checks the boundary before and after; alias count drift aborts its transaction.
This is a guard for the coordinator, not a general-purpose production CLI.

## Tests

New unit tests: legacy namespace provenance, strict BSON frame reading and saved
filter mapping. Real integration tests require a separately prepared disposable
`IDENTITY_TEST_DATABASE_URL` with the `seap_test_identity_*` prefix. Do not point
fixture tests at the real-data rehearsal copy: the importer fixture test clears
its isolated source tables. Use `seap_test_identity_import` for fixtures.

`test_rehearse.py` exercises the repair against synthetic records in a separate
copy of that empty fixture database. `publication-control.test.mjs` uses rollback
fixtures and the same explicit URL guard to exercise real PostgreSQL control
revision/boundary checks and preservation of request/schedule settings.
