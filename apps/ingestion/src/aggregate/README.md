# aggregate/

Batch jobs producing the read layer: incremental rollups (entity_stats,
national_stats_*) and red-flag indicators. Incremental per ingestion batch —
never full recomputation.

**Boundary:** reads `core`, writes `marts` ONLY. The web app reads marts;
nothing request-time ever computes here.
