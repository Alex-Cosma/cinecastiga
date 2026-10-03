SELECT table_schema,table_name,string_agg(column_name||':'||data_type,', ' ORDER BY ordinal_position) columns
FROM information_schema.columns WHERE table_schema IN ('core','marts','reference') OR (table_schema='app' AND table_name IN ('monitoring_refreshes','collection_control','processing_control')) GROUP BY 1,2 ORDER BY 1,2
