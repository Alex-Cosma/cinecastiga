SELECT current_database() database,current_setting('transaction_read_only') read_only,pg_is_in_recovery() in_recovery,current_setting('work_mem') work_mem,current_setting('max_parallel_workers_per_gather') parallel_workers,
(SELECT max(version) FROM app.monitoring_refreshes WHERE status='ready') latest_ready_checkpoint,
(SELECT bool_and(paused AND NOT processing_enabled) FROM app.collection_control) collectors_stopped
