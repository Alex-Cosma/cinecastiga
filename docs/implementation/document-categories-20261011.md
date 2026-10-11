# Document categories and specification priority — 11 October 2026

Status: implemented and verified locally on `fix/document-archive-recovery`. Not committed, pushed or deployed in this step. Production source settings and jobs have not been changed by this implementation. This is separate from the earlier expanded-format production release and the still-unfinished multipart-archive recovery.

## Product decision

The approved reference is `mockups/document-categories/`. The contract's existing document section becomes a compact library: desktop category sidebar, mobile select, filename/member-name search, ready-only filter and six original files per page. Original filenames, SEAP codes, archived originals and classification explanations remain accessible. A mixed archive appears in each applicable category but counts once in the all-files list. Categories describe roles, not proof of wrongdoing, signed-contract validity or document completeness.

Categories, in display order:

1. Caiete de sarcini.
2. Clarificări și modificări.
3. Documentație tehnică.
4. Participare și formulare.
5. Modele de contract.
6. Evaluare și atribuire.
7. Contracte și acte adiționale.
8. Neclasificate.

The user chose specification documents throughout the history, newest procedures first within that priority. A manual job retains precedence. Files already running are not interrupted to reorder them. Only known/identified specifications can be prioritized; an unseen file inside an unprocessed generic archive cannot be inferred.

## Classification

`apps/web/lib/documents/classification.ts` contains deterministic versioned rules. Diacritics and punctuation are normalized. Filename results are explicitly preliminary. Clarifications, templates and forms take precedence over references to specifications/contracts. A bounded CS abbreviation at the start is a candidate. Technical evaluations are not automatically procurement-award evaluations.

Existing native/OCR text supplies stronger evidence only when an explicit heading appears near the start of the document/member's first page. Mentioning a specification in body prose is insufficient. Members of a prepared archive are classified individually and retain their original combined-PDF page references. Unrecognized members keep `unknown`; a file extension or an archive container is not a document role.

Persisted JSON includes rule version, category IDs, method, filename/heading evidence and member/page evidence. Migration `0071_perpetual_darwin.sql` adds this JSON, classification version, classified-PDF hash, queue priority and a partial priority index. There is no raw-document rewrite or statistical recalculation in this migration.

`classifyDocumentBatch` processes up to25 records per transaction with `FOR UPDATE SKIP LOCKED` and a15s statement timeout. It uses stored metadata and existing text only: no SEAP request, conversion or OCR. Version/PDF-hash checkpoints make completed passes idempotent; a newly published PDF triggers reclassification. Future manual classifications are preserved, but **no manual correction editor is implemented in this release**.

New metadata is classified during inventory insertion. The worker also reclassifies at preparation, OCR checkpoints and completion. The supervisor runs a small backfill batch every3s outside maintenance; the ordinary worker loop does the same when automatic collection is disabled. It requires the document worker to be enabled and configured. It never enables source collection by itself.

Explicit offline CLI, with `DATABASE_URL` already pointing to the intended database:

```sh
pnpm --filter web documents:classify          # read-only count
pnpm --filter web documents:classify --apply  # classification + scheduling priority
```

This command does not enqueue/cancel jobs, change source controls or modify original bytes/pages. It does change which pending automatic files the scheduler prefers. Apply migrations first. Ordinary local development still does not run a source worker.

## Scheduler and OCR

`priority=0` means a file contains/appears to be a specification; other files use100. There are separately bounded frontiers of40 specification files and40 other files, plus40 inventory-list jobs. The second file frontier prevents already-queued ordinary files from blocking admission of newly identified specifications.

Automatic download and OCR claims prefer priority first, then procedure source date descending. A network lane favors inventory jobs so discovery can continue through older notices. The remaining lanes prefer file jobs; existing source budget, proxy pacing, quiet window, maintenance, retries, 10-download ceiling and4-processing ceiling remain unchanged.

Within an already prepared archive, the OCR traversal visits known specification members before other pages. **The combined PDF itself is not reordered.** Page numbers, originals, page checkpoints and frozen investigation evidence remain unchanged. The existing publication gate still requires all pages to finish before that combined document becomes publicly readable; this feature does not publish partial OCR results.

Archive-volume prerequisite scheduling is **not implemented here**. The separate `volumes.ts` helper is only filename grouping, not automatic multipart extraction or follower-document publication. Do not describe those failed files as fixed by this classification feature.

## UI and admin

`DocumentLibrary.tsx` replaces the old unpaginated file list within `ContractFiles.tsx`; the existing PDF/page reader, transcript, text search and quote-saving remain. Archive members open at their actual combined-PDF page. The stored original stays publicly downloadable; asking SEAP for a file still requires authentication on both UI and API. Unknown/empty categories do not assert a document is missing from the procedure.

FIFO position is no longer shown: it is misleading with priorities and parallel lanes. Actual download/OCR states and page progress remain. The library uses the existing theme, typography and icon system, including dark mode, reduced motion and the corrected text contrast.

Both `/admin` and `/admin/fisiere` show a classification progress bar plus specification counts: identified (including archives), downloaded, ready and unknown categories. A completed classification pass can legitimately contain unknown categories; the progress label states this. A missing classification field in an older status response is tolerated during rollout.

## Verification performed

- Web and database-package TypeScript checks passed. Production web build passed in the separate `.next-documents` directory. The first build found stale generated types left by removal of the temporary browser fixture route; removing only those generated fixture/validator files allowed the clean build to pass. No application-code build failure remains.
-26 focused unit tests passed (classification, document helpers, request limits, volume grouping).
-16 PostgreSQL integration tests passed, genuinely executed on `seap_test_document_pool_20261010`, including idempotency, immutable originals/pages, unfinished archive metadata, preservation of manual overrides,40 queued ordinary files not blocking a specification, newest-first ordering, inventory capacity, manual precedence and existing concurrency/retry gates.
-4 converter/worker integration tests passed inside Linux document tooling, with the isolated PostgreSQL database. They include165-page resumption and a60-page archive whose specification pages31–55 are processed in the first25-page slice while its PDF order remains unchanged. The other two cover Word/Excel archive conversion and the earlier qpdf recovery for a PDF that opens without a password.
-22 browser checks passed on the actual React components through a temporary local fixture route, including real PDF rendering at an archive member's page2, six-row pagination, search, categories, anonymous/read/download distinction, queued feedback,320/390px widths, dark mode, reduced motion and the corrected text contrast. Fixture API responses were intercepted; no SEAP traffic. This is component integration evidence, not a complete production-contract-page verification.
-Offline filename-only preview on3,502 previously saved metadata rows:79 specification candidates,2,420 clarifications,100 technical,117 participation,45 templates,16 award,8 contracts,717 unknown. These are candidates from that snapshot, not a count of confirmed specifications or current live totals. No original downloads or database writes were needed.
-Private captures, browser report and filename-preview details: `.local/document-categories-implementation/`. No secrets or private data belong in Git.

The ordinary local database was read-only:62 recorded migrations, no `core.notices.notice_namespace`,9 original document rows/1 processed. It is behind this branch's notice-identity and document migrations. No historical local repair or production clone was attempted for a UI task. Migration0071 was applied only to the isolated fixture database. Deployment must apply the normal migration chain before starting the new web/worker code; the backfill then runs automatically with the enabled worker. Production activation has not occurred in this step.

Independent visual review: both requested contrast corrections were scored resolved (`ship` for that correction set). Final captures use `*-reviewed.png`; filename-search placeholder dark contrast7.07:1 and highlighted filename light contrast7.18:1. No global design-system rewrite. Temporary browser fixture route was removed; private fixture source remains with the verification artifacts.
