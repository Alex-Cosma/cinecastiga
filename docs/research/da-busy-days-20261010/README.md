# Ten busiest DA days — verified 10 October 2026

Owner authorized: test the10 busiest available days; if reconciled, implement, commit, push, deploy and activate national discovery. Selected by actual count over all20.7million normalized production DAs, not chosen for convenient outcomes. Read-only public baseline:203171records,10closed days spanning2018/2021/2022/2023/2024. See `top-days.sql`, `top-days.csv`, `verified-results.json`, and `replay-results.json`.

| Day | Baseline | Current source IDs | CPV list calls incl. placeholder | Newly found IDs | Explained departures |
|---|---:|---:|---:|---:|---:|
|2023-10-27|22483|22481|143|0|2|
|2024-08-28|22044|22044|153|0|0|
|2018-12-18|20829|20876|137|47|0|
|2018-12-19|20638|20647|137|9|0|
|2022-12-13|19722|19722|120|0|0|
|2018-12-17|19715|19773|121|58|0|
|2023-10-26|19579|19579|126|0|0|
|2022-12-14|19449|19449|111|0|0|
|2021-12-15|19411|19411|111|0|0|
|2021-12-16|19301|19301|102|0|0|

**No unexplained missing IDs.** IDs115678511 and115677816 now have finalization date9October2026 and refused-by-authority state6, verified through independent full-detail requests. All114additional IDs were absent from both production core and raw archive. These are actual historical gaps, not incidental overlap or duplicates.

Shared records have matching CPV, state and exact decimal amount.1036sourceCUIs enrich null baseline identities. One source authority string begins with a stray backtick before valid CUI4278205; baseline has the correct CUI. The new parser handles only this narrowly defined fiscal-ID format, retains ordinary backtick-prefixed names, and still uses existing checksum validation. Source payloads remain unchanged. These metadata findings are not a claim that every historical identity has been repaired by this release.

The implementation itself was replayed offline over **every saved list response**. Strict prefix ownership produced203283distinct records, zero overlapping owners, and exactly the same ID union as the research algorithm. Prefix-filter adherence, full source totals, dates, IDs, taxonomy partitions and saturated parents were checked. Parent/truncated rows are never archived as complete slices.

## Traffic and limits

1454HTTP attempts:1251successful ordinary-prefix lists +10placeholder checks +190CPVcatalogue pages +2detail checks +1timeout. Request430465 timed out after45s during body consumption for2023-10-26/prefix92. The normal collector continued. Research resumed from cached successful files; the failed slice was retried after processing the other days, more than5minutes later, and succeeded. No repeated completed days, no hidden retries, no direct-IP traffic or PDFs. Every request used the existing production budget/proxy gate.

Each table count excludes the initial national overflow probe (one additional request in the deployed strategy). Thus these peak days need103–154discovery requests, versus the current daily design's approximately38425initial authority requests:over99.5% fewer on these samples. Detail corrections, weekly190-request vocabulary audit, retries and rare authority fallback are separate. No fixed call-count promise for all days.

The complete source vocabulary is9455unique IDs/codes:all9454official CPV2008codes plus internal10000, `00000000 Coduri CPV (Rev.2)`. All10placeholder queries were empty. The implementation explicitly retains that scope and validates the full vocabulary weekly; a new/missing/duplicate source code stops for review rather than silently using stale coverage.

## Evidence and reproducibility

Private responses, baseline, scripts and checksums: `.local/da-busy-days-20261010/`; server `/srv/seap/repairs/da-busy-days-20261010/`. Request context `audit:da-busy-days-20261010`. Do not commit raw source bodies or copy production credentials. Source probing scripts are dated evidence, not onboarding commands.

Offline only, after building ingestion:

```
node docs/research/da-busy-days-20261010/replay.mjs SOURCE_DIRECTORY
python3 docs/research/da-busy-days-20261010/verify.py SOURCE_DIRECTORY BASELINE_JSONL PRIVATE_OUTPUT_DIRECTORY
```

The verifier emits the114missing documents for the guarded archive operation. Reviewed input SHA256: `ea6267061f70c4c3abead0657063991e4116f7d3713ee2d02309394fabb57ac9`. These go through ordinary redaction/hash archival and subsequent scheduled normalization; no immediate core/statistics rebuild is part of activation.

A ten-day sample does not certify every historical day. The records and source evidence above justify this strategy for the tested source contract; unknown/saturated cases remain explicit, bounded fallback or gaps.

## Release

Implemented, committed and deployed on 10 October 2026. [Activation, recovered records, production checks and current limitations](../../../scripts/operations/20261010-da-national/README.md).
