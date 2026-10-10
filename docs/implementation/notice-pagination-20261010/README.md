# Historical notice pagination recovery — 10 October 2026

Owner authorized resuming collection after publication recovery completed and the public site reopened. Preserve public availability, nightly processing, proxy/rate settings and strict source reconciliation.

## Evidence and fix

The 28 November 2024 award inventory reported 180 notices but its 100+80 pages shared one ID (100512354), leaving 179 distinct IDs. A bounded re-fetch of the second page and then of the first page made **two source requests** and reproduced the overlap even using both fresh responses. Their bodies are preserved privately under `/srv/seap/repairs/inventory-20261010/`; original attempts, task results and operator state are audited. This establishes overlapping source pagination, not the cause inside SEAP's database.

For cross-page overlaps in one notice day with at most 2,000 reported records, the collector can schedule **one** independent request with pageSize=2,000. It requires exactly the original total, all distinct correctly scoped identities, valid source type/date, and no truncation. It does not merge a partial union or accept 179/180. The replacement cannot recurse or paginate; duplicate rows within its single response, changed totals, capped/incomplete responses or invalid identities stop collection normally.

Superseded task rows remain as `split`, with their original results plus a link to the replacement; full previous state is preserved in collection_audit. Source request diagnostics and raw archives remain. Historical inventory remains list-only; normal recovery retains detail expansion. Old and replacement partitions have different keys, so offsets cannot mix. Inventory reporting excludes superseded results; admin ETA includes the observed additional list work.

## Validation / rollout

25 planner tests, 12 isolated collector DB tests and 8 isolated admin aggregation DB tests passed; ingestion build and web typecheck passed. New transport/bounds tests additionally check the actual request body and refusal of repeated/oversized fallback. No production data or real source traffic is used by these tests.

Dated operation scripts are in `scripts/operations/20261010-resume-inventory/`. The first two rechecks were executed and failed safely; control revision is111, paused=true, maintenance=false, with the original block intact. The third script must run only after the new collector image deploys, under the deployment lock with document/collection workers stopped. It first schedules the verified replacement, issues one gated source request, validates/archives it, and returns to pause. A successful exact reconciliation is required before clearing the pause and starting the ordinary collector. Inspect state before any retry; these are not reusable operational commands.

Deployment and live result pending at this checkpoint. No claim of complete historical collection.
