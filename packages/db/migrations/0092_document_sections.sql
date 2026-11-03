-- Documents of every procedure (owner, 3 November 2026). A notice's files come from two SEAP sources:
-- its procurement documentation (NoticeCommon/GetDfNoticeSectionFiles: specifications, data sheet,
-- contract model, forms, ESPD) and its document list (NoticeDocument/GetAll: clarifications, decisions,
-- notifications). `section` says which source and part a file came from; existing rows came from the list.
-- `source_type` keeps SEAP's own type of a listed file ("Clarificare", "Decizie CNSC"…).
-- `inventory` is 2 once a notice was read from both sources: lists taken before (1) are taken again.
ALTER TABLE app.procurement_documents
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_type_id integer;
ALTER TABLE app.document_notices ADD COLUMN IF NOT EXISTS inventory integer NOT NULL DEFAULT 1;
-- With every procedure listed, downloading each identified specification would need about 1 TB: the
-- collector lists only, until an operator turns automatic downloads on. Files still come on request.
ALTER TABLE app.document_collection_control ADD COLUMN IF NOT EXISTS automatic_downloads boolean NOT NULL DEFAULT false;
-- Anyone's requests run on every network lane (owner, 3 November 2026), not only on slot 0.
ALTER TABLE app.document_jobs DROP CONSTRAINT IF EXISTS document_job_slot;
ALTER TABLE app.document_jobs ADD CONSTRAINT document_job_slot CHECK (slot BETWEEN 0 AND 13);
-- The collector seeds the participation notices that awarded contracts, matched like the contract page:
-- same procedure and buyer.
CREATE INDEX IF NOT EXISTS awards_procedure_authority_idx ON core.awards (procedure_id, authority_entity_id) WHERE procedure_id IS NOT NULL;
