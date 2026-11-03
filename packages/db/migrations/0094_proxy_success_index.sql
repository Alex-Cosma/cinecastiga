-- The stream circuit counts only proxies that have worked recently (a success in the last 7 days): a proxy that
-- never answers is the proxy's own fault and its circuit disables it, it is no sign of a source outage
-- (3 November 2026: six proxies dead since September re-enabled together paused the documents stream).
CREATE INDEX IF NOT EXISTS collection_requests_proxy_success
  ON app.collection_requests (proxy_id, started_at) WHERE outcome = 'success' AND proxy_id IS NOT NULL;
