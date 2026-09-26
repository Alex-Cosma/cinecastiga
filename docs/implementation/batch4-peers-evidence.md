# Batch 4: comparison evidence

Active implementation, 20 September 2026. No commit, push or deployment.

Receipt `peer-evidence-1` contains the focal entity identity, checkpoint, role, dataset, year, CPV division, optional registered county and either the full comparison or an identified member. The server recomputes membership at that checkpoint; browser names and values are never accepted.

Full comparison capture includes the focal entity plus every other member (maximum 499 others), all eligible source rows, exact per-member totals, median, membership rules and limitations. Broader cohorts retain full displayed medians and per-member inspection but require narrowing before whole-comparison capture. Per-member inspection also works beyond the 499 limit. Registered county never becomes a buyer-county transaction filter.

Source list filters are available for inspection. Saving the whole comparison refuses local filters rather than freezing only a filtered portion under an unfiltered comparison. Saving an individual member can retain local filters; its context explicitly distinguishes filtered member sources from the unfiltered focal/group measures. The stored whole comparison result and sources must reconcile for every selected member; publication is atomic.

Implemented: receipt validator/binder, guarded rows and CSV handlers, queue/worker/recapture, immutable per-member reconciliation, readable dossier export, and shared case/frozen-source comparison summary. The case summary shows the actual criteria, focal value, cohort size, median only when at least five others exist, limitations and full saved roster. A member-only capture is labelled separately.

Queue time stores a SHA-256 fingerprint of canonical membership, focal and cohort measurements. The worker reuses one bound cohort in its guarded repeatable-read transaction, checks that fingerprint, then copies all source rows SQL-to-SQL and reconciles each unfiltered member. Any changed peer identity, missing sources or changed checkpoint fails atomically with no published partial rows. Case recapture retains the original binding.

Verification so far: 4 unit tests and 6 isolated PostgreSQL scenarios pass. They cover receipt validation and forged browser claims, actual rows/CSV handlers, registered supplier county versus buyer county, exact consortium allocation values and natural SEAP/TED IDs, full membership/median capture and readable export, member-only filters, nonmembers, reused member IDs, delayed worker fingerprint mismatch, and checkpoint/recapture failures. Fixture captured 8 records totaling `121.0106`, with 5 other members and exact median `5.0001`.

Dedicated disposable database: `seap_test_batch4_peers_evidence`. Test run:

```sh
TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_batch4_peers_evidence pnpm --filter web test lib/peers-evidence.test.ts lib/peers-evidence.integration.test.ts
```

Final focused regression run: **23 tests passed** (4 peer unit, 6 peer PostgreSQL, 6 existing connection PostgreSQL, 7 existing capture PostgreSQL), including existing 100,000+ row capture coverage. Integration suites sharing one disposable database must run with `vitest run --no-file-parallelism`: concurrent suites deliberately change the global checkpoint and interfere with each other. An initial combined parallel run failed for that fixture reason; the serialized rerun passed completely.

The peer worker now reuses its first bound cohort throughout the transaction, avoiding a duplicate national aggregation. Source grounding exposes the verified CPV prefix to the compiler's normal index predicate in addition to the exact population condition.

Remaining: root final build/browser review. Disposable evidence test database has been dropped after the completed run. Owned by `/root/batch4_peers_evidence`.
