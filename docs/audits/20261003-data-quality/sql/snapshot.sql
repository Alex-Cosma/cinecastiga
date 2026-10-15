SELECT 'refreshes' kind,jsonb_agg(x) data FROM (SELECT version,kind,status,started_at,completed_at,methodology FROM app.monitoring_refreshes ORDER BY version DESC LIMIT 3) x
UNION ALL SELECT 'controls',jsonb_agg(x) FROM (SELECT paused,processing_enabled,maintenance FROM app.collection_control) x
UNION ALL SELECT 'normalization',jsonb_agg(x) FROM core.normalize_watermarks x
UNION ALL SELECT 'migrations',jsonb_build_array(jsonb_build_object('count',count(*))) FROM drizzle.__drizzle_migrations
UNION ALL SELECT 'coverage',jsonb_agg(x) FROM marts.data_coverage x
