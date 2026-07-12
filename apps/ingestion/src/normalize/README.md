# normalize/

Replayable raw → core transforms: zod fail-loud parsing (era-aware per
`endpoint_version`), entity resolution (CUI-keyed, alias table, no silent
name-similarity merges).

**Boundary:** reads `raw.raw_documents` ONLY, writes `core` ONLY. Never fetches —
a full reprocess must work offline from the archive.
