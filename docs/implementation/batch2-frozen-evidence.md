# Batch 2 — frozen evidence and portable bundles

Implemented against additive migration `0028_frozen_evidence.sql`. Evidence is in the `app` schema and is never rebuilt by procurement ingestion.

## Trust boundary and scope

Clip requests supply source identity, the validated complete Ask spec, and optional drawer `evidenceScope` / `evidenceOptions` (`search`, `state`, `stream`). The server ignores client money, headline, result and title. It grounds the spec again and reads both the answer and the source population in one repeatable-read transaction. All source selectors use the existing `runRows` compiler, including the 13 renderers, historical profile conventions, precise population predicates and transaction comparisons. The stored request and actual grounded answer are separate, so an answer for the full query cannot be confused with a selected subgroup/list filter.

Query captures copy the entire effective source SELECT directly into `app.evidence_capture_rows`. They do not inherit the ordinary 100,000-row CSV cap and do not buffer all records in JavaScript. Count and exact decimal sum are reconciled before publication. Amounts are PostgreSQL numeric strings. Missing original DA amounts stay NULL, with known-value sum and missing-value count separately recorded. For contracts, the full original value/currency is distinct from each supplier allocation; natural SEAP contract IDs and notice URLs remain available.

Named DA, contract, notice, entity, person, signal and Radiografie selections use server readers.

Radiografie lot-pattern serial IDs are rebuild-local. At queue creation the server binds the exact authority, pattern kind, CPV class, normalized member-ID set and notice set with a SHA-256 fingerprint. Workers compare that descriptor before reading sources; re-capture carries forward the previous server binding. Reused IDs, missing patterns and unbound old queued requests fail closed. New Radiografie links, source pagination, CSV requests and save requests also carry an expected fingerprint, checked against the actual server row, so a page left open across a rebuild cannot silently save a different pattern. New pattern captures require that displayed fingerprint; old clients without it must reload. This expected hash is only a precondition; client descriptors/hashes never become the authoritative binding. Amount changes with the same source membership can be captured as a new version; changes of membership require deliberately saving a new finding.

 Signal/Radiografie context preserves recorded findings and clearly labels reconstructed present-day membership or unavailable historical records. Named source readers reject selections over 200,000 records explicitly; they never report a truncated sample as complete. Query captures have no row-count limit but individual SQL statements have a 15-minute timeout. Failure rolls back all rows and leaves an actionable failed job.

## Jobs, versions and permissions

Saving creates a durable queued capture; the web route schedules work using Next `after()`. Status is queued/running/complete/failed. Re-capture appends a version and never updates a complete version. An explicit retry resumes a failed or stale running version (five-minute stale threshold; an active database row lock prevents concurrent processing). Status and complete source rows survive application restart.

Owners/editors can add, capture and retry; viewers can read and export. Private status/source reads check access inside the same transaction as the read. Heavy capture work does not lock the investigation for its entire duration. Before publication it locks the investigation and rechecks access; membership mutations update that parent row, so revocation during a repeatable-read capture forces rollback. A worker may only mark its own attempt failed after revocation; no rows are published.

An operator can resume durable jobs explicitly on the intended database:

```
pnpm --filter web exec tsx scripts/resume-evidence-captures.ts --limit=20
```

The worker processes queued or stale running jobs sequentially. `--failed` also selects failed jobs. Limit must be 1–100. Each job rechecks the originating user's current edit permission; revoked users are counted and skipped. A current editor can instead retry through the case UI. There is no always-on worker daemon in this change.

## Portable export

`GET /api/anchete/:id/export?format=zip` streams an uncompressed ZIP64 with backpressure. It includes:

- readable `README.md`, methodology Markdown/JSON and original clip editorial content;
- complete workspace entries, evidence/question links and **all** revision history;
- each version's request, timestamps, exact totals, captured answer, methodology and import coverage;
- complete `rows.csv`, original-text `rows.ndjson` and `source_urls.csv` for complete captures;
- a manifest of file lengths and SHA-256 checksums (excluding the manifest's own hash).

CSV protects text from spreadsheet formula execution; JSON preserves original text. Decimal amounts and IDs must be imported as text to avoid spreadsheet rounding. Failed/incomplete versions appear in metadata but have no row files. Historical clips without complete server captures are labeled unverified; their client-supplied old monetary values are never promoted into frozen evidence. Default Markdown export follows the same distinction and does not substitute live relations/amounts.

Exports authorize in one read-only repeatable-read snapshot at download start. An in-flight download can finish after membership is revoked, like a response already delivered; new requests fail. The download does not block workspace edits or revocation. Cancellation stops the stream and releases its snapshot. A download interrupted by an error is not a valid complete ZIP.

The package freezes normalized records and original source links. It does **not** archive remote SEAP/TED pages, signed documents or raw ingestion payloads. Recorded values are not proof of payment; risk signals are not proof of misconduct.

## Verification

Dedicated database: `seap_test_batch2_20260919` (test helper rejects other database names). This automated suite writes no procurement/application fixtures to the shared development database; its dedicated-database user/case/source records are deleted after the suite. Separate browser checks use explicitly synthetic local application accounts managed by the root verifier.

`TEST_DATABASE_URL=... pnpm --filter web exec vitest run lib/evidence-captures.test.ts lib/evidence-captures.integration.test.ts` passed 13 tests, including:

- forged amount/result ignored; complete predicate/scope preservation and invalid scope rejection;
- 18-decimal precision and missing original amounts;
- full consortium value 100.01 versus two shares 50.005, with natural IDs;
- changed source followed by version 2 while version 1 stays byte-equivalent;
- query subgroup plus local stream/search filters;
- viewer/outsider/wrong-case checks and editor revocation immediately before publication;
- permission-safe retry after rollback, with no partial persisted rows;
- pattern ID reuse, stale page/queue guards, recapture binding, harmless member order changes, missing pattern and unchanged old captures;
- an actual complete 100,001-row query capture (about three seconds locally);
- Python `zipfile` extraction/CRC and all portable manifest SHA-256/length checks.

The independent source-reader matrix for 13 signal categories and two Radiografie selections is recorded separately in `previews/batch2/source-checks.json`; it is not a 13-renderer capture test. Query captures share the existing renderer/source compiler; this suite exercises transaction totals, a scoped subgroup and the uncapped path, while the query population suite covers the new predicate/compiler semantics. Web TypeScript check passed after integration.
