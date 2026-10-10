# 10 October: latest verified contract version, with source history

Owner approved: **latest verified version once; preserve version history**. Deployment and a backed-up full recovery are authorized by the preceding instruction to repair autonomously and reopen only after successful publication. This supersedes the9October policy hold. The independent historical collection pagination blocker is unchanged.

## Verified semantics

- Only previously approved economic identities enter automatic revalidation. Original publication fields must still match their saved evidence. New unrelated candidates are not approved implicitly.
- A version family shares exact official notice number, authority, procedure, acquisition type, CPV, contract number/date, currency and lot. Each member has a distinct publication and source contract ID. Every normalized amount/title/fiscal supplier ID is independently checked against all available archives, including the checksum-pinned historical bundle. Conflicting revisions under one source ID still fail closed.
- Changed amount/title/suppliers require unambiguous timestamped published notices and source modification evidence (`hasModifiedVersions` with positive `modifiedCount`, or the explicit addendum wording in the verified title). Modification counters are corroboration, **not** version IDs: historical copies can acquire a higher counter without changing their amount. Numeric source IDs never establish the latest changed version. Equal dates with different economic fields fail.
- Select the latest verified changed version chronologically, including decreases and supplier amendments. Identical copies of the same economic version may retain their existing stable representative; they have identical statistical fields.
- Two different records coexisting in one source publication are not collapsed by a partial key. The CAN1025198sibling104380499is independently verified and stays distinct. If a new amendment could belong to either coexisting record, the operation stops for review.
- Append-only observations and revision history preserve every previous decision, canonical choice, source membership and fingerprint. Source contracts/raw archives/private frozen evidence are not deleted or rewritten.
- A full transaction verifies every group before changing the registry. Existing identity quality checks still run in the pipeline, direct builders and final validation. A failed check retains maintenance.

## Copied-production verification

Frozen boundary18294756; copied cohort23,346contracts,327awards,372archived envelopes plus pinned historical bundle. All372current envelopes replayed through the real normalizer before revalidation.

- All8,045approved groups pass without exclusions;20,519source publications retained,4,425groups extended.
-34canonical representatives change to verified amended versions; the35thcandidate was the distinct coexisting record above.
- Zero stale members/invalid decisions; repeating is a no-op.
- Actual `runMarts` on the cohort:10,004eligible economic contracts,12,633supplier allocations,exact9,950,461,813.41RON. Every expected contract/allocation reconciles; zero differences.
- Constanța example: only108153641contributes57,143,904.29RON; older107338420/108116431remain accessible with49,781,431.91RON. The old page does not show the newer version's supplier allocation or competition fields as its own.
- Two web DBintegration checks cover duplicate-source URLs and amended-source/history/statistics behavior.
-14ingestion DBintegration checks cover real marts/TED, one-time repair, amendment evidence, source-date ties, value/source contradictions, canonical history/idempotence and maintenance/backup/revision guards.
-228ingestion units,406web units and10DBunits pass in the workspace suite.187optional webDB tests are skipped in that general suite, not claimed passed. Workspace20build/typecheck/lint/test tasks passed. The extra explicit DBsuites above are run separately.
- UI component inspected at390pxand1280pxin both themes, keyboard disclosure tested, no horizontal overflow. Existing styles retained; history is collapsed by default and opened when viewing an older economic version. The mechanical detector's type-size advisory was corrected to the existing15pxstep.

[Copied cohort proof](copy-proof.json). This is not a whole-production snapshot validation; the full production pipeline/search gate remains required before reopening.

## Operations

Production morning run45928c24-9856-42d0-90b4-161286eb2c8afailed atidentity-quality, boundary18294756. Revision105,paused+maintenance+archivegate; source block542533. Migration0065is additive audit history; deployment alone does not change approved decisions or reopen.

Dated `scripts/operations/20261010-publication-recovery/run.sh` requires pinned deployedSHA, exact old revision/run/sourceblock, copied proof and a fresh read-only live source preflight. Creates one manual full run, drains/stops workers, takes a **new full backup+checksum**, then uses the ordinary processing CLI, snapshot validation, search validation, health and reopen gates. Failure retains maintenance. No source HTTP traffic, rate change, collector unblocking or historical repair-marker reset. Do not rerun after an attempt; inspect run/audit first.

Next normal schedule remains daily05:00RO /Sundayrisk. Full recovery now is necessary after failed partial publications. A successful reopening keeps collection paused/blocked independently.

## Current state

Implementation and copied validation complete; deployment/recovery verification follows below when actually observed. Do not infer production success from this section alone.
