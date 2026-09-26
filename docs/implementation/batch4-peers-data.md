# Peer comparison backend — complete locally

20 September 2026. This is the backend handoff; root owns overall UI/build/release status in HANDOFF.md. No commit, push, deployment, migrations, or main database mutation.

## Contract and scope

- New `lib/peers-shared.ts`, `peers.ts`, `/api/peers`. `getPeersInSnapshot(q,input,checkpoint,{allMembers?,memberId?})` supports exact source/capture binding within the analytic gate. Existing connection identities and shared/exclusive refresh guard are reused.
- `GET /api/peers`: entityId, role, dataset, optional year/cpv/county/page/identity/checkpointId. Unknown/repeated filters fail closed. Returned resolved filters explicitly indicate suggested values.
- Latest available closed calendar year suggested, falling back to latest available year; dominant eligible focal CPV division by value suggested. Neither an ended year nor validation implies complete/fresh collection.
- Same year/dataset/CPV division, 0.5–2x focal eligible record count. Authorities additionally match existing name-pattern type; ambiguous and unknown classifications cannot establish an automatic group. Suppliers have no implied equal budget, headcount or capability. Optional county selects registered peer entities, never purchasing/delivery geography; focal remains the reference even outside that county.
- Full cohort medians exclude focal and are independent of pagination. At least five OTHER members needed for comparative interpretation. Exact SQL numeric total and median total are strings; per-record means and their median are rounded to two decimals and are not unit prices. No wrongdoing claim.
- DA positive <=2m; positive contract supplier allocations. Row counts differ from distinct contracts. Unknown dates/CPV, unresolved entities, unknown authority type/county are disclosed. Source specs preserve exact entity/year/CPV.
- Page size20, deterministic total/id order. Whole-group capture refuses >499 other members (plus focal =500); individual member sources remain available above this bound. No sampled benchmark.

## Verification and performance

Four unit tests and ten isolated PostgreSQL scenarios passed, including exact medians over24othermembers, pagination, county/source distinction, supplier groups, unknown classification, suggested closed year, allocation precision,21source-spec reconciliations,524-member capture refusal with exact individual lookup, and reused identity/checkpoint rejection. Log `/private/tmp/seap-batch4-peers-tests.log`. Isolated `seap_test_batch4_peers_data` was dropped after tests. Initial backend TypeScript check passed; later remaining UI errors were reported to root and fixed there.

Main reads only:

- Buzău2025 /CPV45 /all:18records,481366697.99RON;202othermembers; exact median15519171.185RON. Combined national summary/page query measured6.95s warm. Original two-scan implementation timed out or took26.8s and was replaced with ONE cohort scan. No timeout raised or population sampled.
- RER SUD2025 /CPV90 /all:56records,4151838.15RON;229others; median282153.36RON;19.17s local request. Large national groups remain dependent on local disk/cache speed;20s statement limit retained.
- Whole Buzău group sources:203entities,3561records,5745681623.00RON. Binding13.14s and source query6.98s; both passed the20s per-statement limit. Source compiler applies bound entity IDs inside source selection.
- Forced index scans were slower17.8s and discarded. Timing is local and not a production latency promise.

Artifact `previews/batch4-peers/data-checks.json` stores exact observed results and checks. Independent review of the evidence agent's receipt/capture integration confirmed exact cohort/member identity, large-group boundary, county/source separation, checkpoint gate and per-member source reconciliation. The duplicate worker cohort rebind was identified and removed by that agent; capture source copying now retains its existing longer transaction budget after the single20s cohort bind.
