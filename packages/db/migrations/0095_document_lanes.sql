-- Up to 100 document network lanes (owner, 3 November 2026: use every proxy at the pool's own limits).
-- A list job keeps one proxy for its session and waits that proxy's spacing (35-45 s) between requests, so ten
-- lanes made about 20 requests a minute while ninety proxies stood idle. Network lanes are slots 1-100; the
-- processing lanes move from 11-13 to 101-103 (slot 0 stays the first processing lane); 199 is kept for pilots.
-- The lanes now share one browser (a context per proxy) and hold a database session only during a request.
-- The lane count stays an operator setting (download_concurrency): it is not raised here, so a worker of the
-- previous release draining during the deploy keeps its ten lanes.
ALTER TABLE app.document_jobs DROP CONSTRAINT IF EXISTS document_job_slot;
ALTER TABLE app.document_jobs ADD CONSTRAINT document_job_slot CHECK (slot BETWEEN 0 AND 199);
ALTER TABLE app.document_collection_control DROP CONSTRAINT IF EXISTS document_collection_concurrency;
ALTER TABLE app.document_collection_control ADD CONSTRAINT document_collection_concurrency
  CHECK (download_concurrency BETWEEN 1 AND 100 AND processing_concurrency BETWEEN 1 AND 4);
