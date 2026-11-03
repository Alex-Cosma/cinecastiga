-- The award's own documents (documente constatatoare, owner 3 November 2026). The collector finds the awards
-- whose collected detail counts attachments (data.ackDocsCount > 0) by walking those details in the order they
-- were collected (raw.raw_documents (source, fetched_at)), so a detail collected after its award, or collected
-- again with more documents, is seen too. The walk's position: the last detail examined.
ALTER TABLE app.document_collection_control
  ADD COLUMN IF NOT EXISTS award_scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS award_scanned_id bigint;
