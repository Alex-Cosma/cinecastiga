# Publication recovery — 9 October 2026, late evening

## Current decision: HOLD, no reopening promised

The owner authorized autonomous repair before the next scheduled processing and reopening **only on verified success**, explicitly permitting a hold if a serious issue requires their input. This supersedes the earlier documentation-only request for publication work. The historical collection pagination repair remains deferred; its independent block was not cleared.

**This branch is a tested draft, NOT deployed and NOT a successful production repair.** Production remains on `a39ecca`, revision103, maintenance=true, archive gate=true, blocked on collection task542533. The05:00 Romanian-time schedule is unchanged. Without further work the next run is still expected to stop at identity-quality and keep maintenance. Do not claim nightly processing will fix this automatically.

An asynchronous question is pending: should statistics use the latest **verified** contract version once, with earlier versions and changes visible, or retain original award values and present amendments separately? Neither choice was approved. The first is a recommendation, not permission to select the highest ID or amount automatically. No production dedup decisions, hashes, canonical IDs, source data, schedules or request limits were changed.

## What the deeper source check found

Read-only export, boundary18294756:8,045 approved groups,23,346 cohort contracts,372 available production list/contract archives; combined with the original checksum-pinned619-archive bundle. No SEAP HTTP calls.

1. All previously approved members still have the same economic fields. Exact-signature grouping and archive proof find4,390 three-publication groups,one four-publication group and3,654 pairs.
2. This is **not sufficient to authorize the entire refresh**. Looking beyond exact equality to the same notice, authority, contract number, date and lot finds35 candidates with another signature:33 differing in value,one in value/title,one in suppliers. An equality-only repair would miss revised amounts and could count the old and amended versions separately.
3. The35 candidates are not necessarily35 new amendments: CAN1025198 includes an already-coexisting contract104380499 with a different amount inside the older publication. That case needs distinction from a new revision; no fuzzy collapse is authorized.
4. SEAP supplies `modifiedCount`, `hasModifiedVersions` and publication dates for many of these. They support investigation, not a generic proof that the highest numericID is legally/economically authoritative. Some historical archives have different modification counters without a different value; one later title explicitly names a later addendum while its modification counter remains0.

Examples:

- **CAN1089254**, contract37014/05.09.2022-374/13.09.2022, lot8, Constanța public transport:107338420 and108116431 each49,781,431.91RON;108153641 lists57,143,904.29RON. Same procedure100180169, contract date13Sep2022 and suppliers. Modification count1→2; later notice publication2Oct2026. Do not add both values or silently discard the update.
- **CAN1142277**, contract139806:6,904,257.48→6,904,234.13RON. Title changes from addendum163661/21Apr2026 to350033/15Sep2026; modification counter0on both. Requires explicit version evidence rather than relying only on that counter.
- **CAN1154268**:22,500RON unchanged, suppliers change from CUI217930 to217930+23100700. Contract-version choice affects supplier totals too.

[All35 review candidates](review-candidates.json) contain public identifiers/amounts and links, without raw contact data. These are data-version questions, not allegations of misconduct.

## Draft implementation

- `assessContractPublicationGroup`: supports2+ publications, verifies every source and procedure/conditions, rejects duplicate members or multiple identical contracts inside one publication. Legacy pair assessor retains version1fingerprints and pair-only behavior.
- `verifyApprovedPublications`: begins only from existing explicit approvals; old economic identities must remain identical. Extends exact matches with complete source proof, preserves canonical IDs and eligibility. An alternate signature at the same contract anchor blocks instead of becoming extra spending silently. Aggregates the number of blocked groups.
- `prepareApprovedRevalidation`: bounded cohort read, original pinned historical bundle plus **all** available current archives up to the frozen raw boundary. Never replaces conflicting old evidence with a convenient newest record. Unrelated new groups are never approved automatically.
- `revalidateApprovedContractIdentities`: only during a running, backed-up/backup-verified, normalized publication, in maintenance+paused with unchanged control revision. Verify every group before writes. One atomic transaction updates evidence/membership fingerprints and adds revision history; failure rolls everything back. Original approvals, source records and old observations remain. Same-state rerun is a no-op.
- Migration0065adds append-only `marts.contract_identity_revisions`; no data repair runs on migration/deploy. Each revision preserves the previous decision and memberships/hashes and the new proof/memberships with processing run ID.
- Processing CLI calls revalidation between the original one-time repair and existing identity-quality gate. Baseline/direct validators are not bypassed. The original one-time repair marker remains completed, never reset.
- Shared DBquality validator accepts evidence-backed multi-publication groups with exact membership, methodversion2for3+ members and unchanged fingerprints. Canonical filtering is unchanged.
- Contract detail wording displays the actual publication count instead of hard-coded “two”.

This **does not yet implement contract amendments/version selection**, so it is intentionally not deployed as an overnight reopening fix. Resolve that reporting decision and the source/version evidence before promotion to main. Do not delete the35 approvals or remove the anchor check to get a green run.

## Validation and limits

- DBbuild, ingestion build/typecheck, webtypecheck passed.
-223ingestion unit tests passed (including five new multi-publication cases).
-14DBintegration tests passed: new maintenance/backup/revision guards, missing archives, old identity change, third-publication amount conflict, procedure/terms conflict, atomic rollback, canonical/source/history retention, idempotence, plus existing scheduled repair/marts/TEDreconciliation. Dedicated backup-verified guard retested after tightening.
- Actual copied cohort in `seap_test_currency_publication_20261009`:8,854 stale of16,090approved memberships,zero invalid decisions, matching production.
- Full attempted revalidation **correctly rejects35groups**, leaving zero revision records and all16,090members unchanged.
- Positive-path rehearsal uses a **rolled-back transaction that temporarily removes the35ambiguous approvals only on the isolated test copy**. Remaining8,010groups validate;4,390extend;20,411source members;zero stale/invalid;canonical IDs unchanged.4,072additional eligible duplicate contributions,4,735,643,383.23RON additional reduction in this subset. Repetition is a no-op. Rollback restores original registry. These are simulation figures, not applied production corrections or recovered money.
- All372copied archive envelopes were also replayed through the real normalizer on the isolated cohort. Normalization completed; the following full revalidation again rejected the same35candidates. This is not a passed publication.
- [Exact rehearsal report](copy-validation.json). The subset exclusion is NOT a production solution. No full monitoring checkpoint, risk refresh, Meili index validation or publication was run in this task.

## Local / server artifacts and continuation

Ignored local directory `.local/publication-recovery-20261009/`: production evidence and scoped-copy compressed exports, analysis, full archived notice examples, schema, import/preflight/rehearsal/replay scripts and logs. Original bundle remains `infra/prod/dumps/dq02-evidence-20261003/approved-bundle.json.gz`, SHA256`c3a570b5ad4638778183c77b2e0a7385a3467ae6c22af1e012afd22151621596`. On production it remains mounted read-only under`/repairs/dq02-20261004/`.

One attempted broad export exceeded the exec process's Node heap; it made no DB changes. Replaced it with a bounded cohort export (660entities,1,282SICAP mappings,327awards,23,346contracts,30,817winners,372raw records plus approval registry/reference codes). The collector service was not restarted. Do not repeat the broad export; no full production DBcopy was needed.

Next:

1. Obtain reporting decision; determine source-backed amendment lineage and canonical/version semantics, including the old same-anchor/different-value contract and source-counter inconsistencies. Preserve original values/evidence in contract details.
2. Extend tests and rehearse on the complete copied cohort; no excluded ambiguous groups in an actual publication validation.
3. Recheck production state/time, migration history, pending raw data and last scheduled run. The night may have progressed while this checkpoint was being read.
4. Deploy only the reviewed/validated solution; next backed-up full processing must complete normalize→quality→TED→marts/risk/derived→all snapshot checks→search validation before reopening. Never toggle maintenance manually over mixed core/marts.
5. Keep pagination block542533 independently. Successful publication may reopen the site while collection remains stopped; `finishProcessing` already preserves the source block/pause.

No credentials/dumps/raw personal contact data belong in Git. Preserve the unrelated dirty docs/mockups from earlier sessions. See the prior notice-identity continuation for its separate pagination work and targeted recovery history.
