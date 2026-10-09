# Collection throughput diagnosis — 9 October 2026

Read-only production inspection at approximately 15:44–15:46 Europe/Bucharest. User asked why throughput fell from approximately 130–140 to 80 requests/minute. No settings, code, indexes, queues or services changed; no additional SEAP requests made.

## Confirmed findings

- Collection active: control revision101, paused=false, blocked_reason=null, maintenance=true, collection_during_maintenance=true. Proxy settings unchanged:200starts/min ceiling,10concurrent,35–45seconds/IP.
- 94configured enabled proxies, none with consecutive failures;6configured disabled proxies. Normal pacing accounts for endpoints temporarily waiting. No recent configuration change in the audit log.
- Five-minute windows at12:45–12:55RO:125.4–128.0requests/min.13:00–13:15RO:119.2–123.4/min. Abrupt drop at13:20RO:80.4/min; subsequent windows79–80/min.
- Latest full ten-minute windows approximately79/min. Source/request ledger durations around1.5seconds, similar before/after; one failure in the preceding complete hour and zero failures in the latest ten-minute snapshot. Not evidence of source throttling or loss of the proxy pool.
- Repeated pg_stat_activity samples show7workers waiting for the collection_control row while its owner executes the orphan-request safety query in packages/db/src/collection.ts.
- EXPLAIN ANALYZE of that exact read-only query: sequential scan of collection_requests,367,890rows discarded by outcome='running',87,669shared buffer hits,421.175ms. Existing indexes cover id,started_at,(stream,started_at), but not running requests. The table has approximately368,000live rows.
- PostgreSQL CPU approximately100% of one core; host load1.28. The bottleneck is serialized admission work, not evidence that the whole server is exhausted.
- Table auto-analyze occurred10:20:10UTC /13:20:10RO, matching the abrupt drop. A plan change after statistics refresh is a plausible trigger, **not proven** because the previous execution plan was not captured.

## Repair applied in production, 15:47 RO

User authorized the production fix. Prebuilt `app.collection_requests_running` concurrently, on id WHERE outcome='running', without stopping collection. Both indisvalid and indisready are true. Procedure: `scripts/operations/20261009-collection-throughput/create-running-index.sql`; do not blindly rerun it.

The exact safety query now uses Index Only Scan:5active rows,8buffer hits,0.420ms execution versus421.175ms before. Ownership checks, control lock, configured94proxies,200/min ceiling,10concurrent and35–45seconds/IP are unchanged. Control revision remains101, paused=false, blocked_reason=null.

Schema and generated migration0063 preserve the fix for other environments. The transactional migration uses IF NOT EXISTS to retain the verified concurrent production prebuild; ordinary migration history is still applied normally, without manual history inserts. Fresh environments create the index through the migration. For another busy environment, use a reviewed concurrent prebuild before running the transactional migration. Typecheck passed; existing database-package units passed10/10. Sustained throughput and deployment checks are recorded below when complete.

Separate observation: today's05:00processing run failed at identity-quality at05:19RO; no processing run was active during this throughput inspection. Public maintenance remains intentional. This diagnosis does not resolve publication integrity.

## Release verification, 15:52 RO

- Commit06d5408 pushed to main; CI and deploy37932378118 both succeeded. Server checkout06d5408,64migrations applied through the ordinary migrator. Index remains valid and ready after deployment.
- Complete minutes15:47–15:51RO:153,131,143,135,128requests (690total,138/min average),zero failed attempts. This includes the deployment interval. The previous five-minute baseline was78.8/min.
- PostgreSQL CPU spot check fell from100.04% of one core to9.92%; repeated post-fix activity samples showed zero active sessions waiting on locks. These are observations, not guaranteed future capacity.
- Collector running after deployment and new requests being admitted. Controlrevision101 unchanged,paused=false,blocked_reason=null;94enabledproxies and200/min,10concurrent,35–45seconds/IP preserved. Public maintenance/collection-during-maintenance both remain true;healthHTTP200. No historical recovery or nightly processing triggered.
