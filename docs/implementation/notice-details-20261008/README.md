# Notice details and recovery — 8 October 2026

In progress. User authorized implementing the missing collection paths and restarting production collection. **No normalization/publication today**; preserve public maintenance and `collection_during_maintenance=true`. Keep operator proxy/rate settings unchanged.

## Verified diagnosis

Production baseline: runtime2501c43, controlrevision96; recovery-2026-09-25 through7October;188395complete/split,51601deferred detail roots(18079participation/33522awards),7failed,0executable. All280award-list days collected. Contract pagination closed for33516of33522award notices. No evidence that forms/lots were fully collected.

`sysNoticeVersionId=2` means **new format**, not necessarily eForms. Original code wrongly deferred every v2 notice and sent both families to C_PUBLIC_CANotice. Public frontend modules and live responses establish separate routes for all12types. Source code cached privately in `/tmp/seap-eforms-20261008`; no credentials committed. All probes use `runCollectionRequest` and managed proxies, with the common admission budget. At49probe requests:46HTTP200 and3expected endpoint-discovery failures(400/404); no PDFs. Check the production request log for final counts; this is a dated research count.

- Award3→C,8→DC,13/18/20→RFQ,16→PC_PUBLIC_CANotice/get/publicID. Root contains ordinary sections. Non-eForms lots: PC_PUBLIC_CANotice/GetCANoticeLots_v2 with **pageIndex/pageSize**, not skip/take.
- Tender2→PUBLICCNotice/getPubCNoticeView;6→PUBLICDCNotice/getDCNoticeView;7→PublicPcNotice/getPCNoticeView;12/17/19→PublicRFQInvitation/getRfqInvitationView. SCN17 also uses RFQ public brief; PUBLICSimplifiedNotice/getSimplifiedNoticeView is not its v2 view route.
- Actual eForms flag: root.conditions.hasEformsDocument(awards), root.hasEformsDocuments(tenders). Full HTML is JSON field `changeNoticeHtml` from POST ENotice/GetNoticeChangeView `{noticeId:internalID,isNoticeChange:false}`. Check header ID/type/number. **Never render archived HTML unsanitized.** No PDF conversion or attachment fetching.
- Ordinary tenders: comboPub/getNoticeGeneralInfo(publicID/type) supplies DF ID; NoticeCommon sections1,21,3,4,6 and paginated Section22LotList, then Section22LotView for every lot. Common section APIs use the **public** ID;21/22 require explicitdfNoticeId.
- Type19RFD/SAD: its full public form is NoticeCommon/GetRfqInvitationSadView with **internalID**. Generic general-info(type19) returns empty zeros; do not treat that as missing procurement or use the parent CN as the current notice.

Each network operation is a durable individual task, one budgeted attempt. Child creation, source archive and task checkpoint share a transaction. Distinct part/lot/page keys prevent collisions. Standard redaction/hash archival remains in place; these new raw shapes are archived, not yet projected into new normalized UI fields. Current forms and lots are covered, not all historical amendments or downloadable attachments. Admin distinguishes contract completion from form/lot completion; no extrapolated69% when executable queue is empty. ETA is for known work while detail discovery remains open.

A validation failure/400/404/410 of a detail remains a failed task and visible notice gap without stopping unrelated collection. Database/archive errors and shared403/429/challenge stops remain global. Timeout/proxy retries keep5/10minutes. No silent skip/false completion.

## Existing seven failures

-84685: archived115last-page rows/514total with two previous pages; **current validator replays successfully and reconciles one final514-contract envelope**.
-88076/89249:201-row surplus with totals508/435. Both replay successfully and schedule the next page under already-deployed overlap validation.
-79183: ENETUNREACH before response;14560/105970/106064: exhausted proxy timeouts. Requeue after deployment, with new bounded retry budgets; preserve previous retry records and all source request diagnostics in the operation audit.

## Activation

`scripts/operations/20261008-notice-details/activate.sql` is a **dated operator action**, not a migration/startup command. Required psqlvars`pilot`and`revision`. Refuses active processing/work or changed control/settings. Reconstructs task metadata exclusively from latest archived source lists and retains`metadataRawId`. Stage1 only12representative roots; stage2 remaining deferred roots and7reviewed failures. Audit retained; no raw/core deletion. Do not rerun without inspecting state. Deployment alone does not activate the old deferred queue.

## Separate publication blocker

The existing identity/deduplication population changed when a third source publication appeared. See `../recovery-20261008/README.md`. This release does not bypass that guard or certify that nightly public release will pass. Public maintenance stays active pending a verified processing run.

## Local verification before publication

Full `pnpm turbo typecheck lint test build`:20/20tasks passed. Ingestion214unit tests, scraper32, web406passed(with184DB-dependenttests skipped in the ordinary suite); separate isolatedDB tests:9runner and6admin status passed on`seap_test_recovery_20261008`.22host deploy/scheduler tests passed. Follow-up SAD identity regression passed. Actual archived failure responses replayed without source traffic; all12live root fixtures passed routing/identity validation. Metadata preflight:all51601deferred roots have matching archived v2publiclists/internal IDs.

Production-size read-only rehearsal caught a20sstatement timeout in the first detail-work forecast query: its correlated average repeated aggregation for every publication day. Aggregate once per stream and join instead. The isolated fixtures alone did not reveal this; verify real query duration before queue activation.
