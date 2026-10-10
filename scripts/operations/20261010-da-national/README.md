# Dated national DA activation — 10 October 2026

Only run under the owner's explicit authorization after the ten-day shadow audit passes. This is not a routine deployment hook. [Source proof](../../../docs/research/da-busy-days-20261010/README.md).

Implementation:
- Migration0066 adds `collection_batches.da_strategy`, default `authority`. Old behavior is preserved until explicit activation.
- `collection national-da` requires a paused, drained collector, no global source block, and one continuous recovery batch. It atomically seeds national closed-day roots covering untouched pending authority windows plus the trailing7days; preserves original task parameters/results and an audit of replaced pending tasks; leaves all failed/retry-budget work intact. It leaves the pause enabled.
- A national day starts with one request. Overflow→verified CPV prefixes; source substring results overlap but each archived list item belongs only to its leading-prefix leaf. Includes the source placeholder00000000. Saturated exact codes/observed unknown codes use a fresh authority-catalogue fallback. Saturation within one authority still fails closed.
- Completed leaves reconcile previously normalized IDs. A disappeared ID gets a metered full-detail task. Only verified date/CPV relocation or reopened state can explain absence; no deletion based on absence. Source versions are archived normally and normalized at the scheduled boundary.
- Automatic daily extension revisits the trailing7closed days, and validates the whole CPV vocabulary once per week. Source changes beyond that window still require historical audits; this is not a modification-date feed.
- Ordinary institution-catalogue refreshes no longer spawn38000DAqueries in the national strategy. The catalogue remains available for fallback.
- Admin states the active approach and groups estimation samples by DA day/scan. Activation resets the useful-pace observation boundary.

Release procedure: verify CI/deploy and migrated schema; pause/drain with revision check and audit, preserving all other settings; run the explicit activation; optionally execute the reviewed114record gap archive; resume with another revision check; verify successful national root/split/leaf/vocabulary work, source/error diagnostics, app health and unchanged public availability. Never clear an unrelated source block to make deployment succeed.

`archive-shadow-gaps.mjs FILE SHA256` runs inside the collector environment after the private reviewed file is installed. It checks114unique IDs from the three2018days, requires paused/drained/no processing, refuses changed normalized baseline, archives through `archiveDocumentsSql`, and records an idempotent operation audit. It does not mutate core, statistics, rates or processing schedules.

Local validation: full20-task turbo build/typecheck/lint/test, separate24ingestion DB tests and10admin DB tests, plus host deployment/scheduler checks. DB fixtures use a new isolated `seap_test_da_national_20261010`, populated with schema only and migration0066DDL; this is a fixture, not a restored production database or fabricated migration baseline.

Production activation status: pending release verification; append observed commit, control revisions, archival counts and source outcomes after execution.
