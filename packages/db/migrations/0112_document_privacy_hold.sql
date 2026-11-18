-- Owner, 18 November 2026 (legal audit): prepared procurement documents stay public, but one whose text holds a
-- personal identifier (a CNP, an identity card's series and number) is not served and not searchable until an
-- administrator has looked at it. Law 190/2018 art. 4 covers the disclosure of documents that contain a CNP.
--
-- privacy_hold: NULL (never caught), 'held' (caught, waiting for the administrator), 'kept' (the administrator keeps
-- it hidden), 'released' (the administrator publishes it; never caught again). Served: NULL or 'released'.
--
-- The check is a trigger on the page text, like the search index of migration 0079: every page written by any worker
-- version is checked. Columns on app.procurement_documents: ADD COLUMN without a default only changes the catalogue.
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_hold" text;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_reason" text;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_page" integer;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_decided_by" text;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD COLUMN "privacy_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."procurement_documents" ADD CONSTRAINT "procurement_document_privacy_hold" CHECK ("app"."procurement_documents"."privacy_hold" in ('held','kept','released'));--> statement-breakpoint
CREATE INDEX "procurement_document_privacy_hold_idx" ON "app"."procurement_documents" USING btree ("privacy_at" DESC) WHERE "app"."procurement_documents"."privacy_hold" in ('held','kept');--> statement-breakpoint
-- A CNP: sex and century (1, 2: born 1900–1999; 5, 6: 2000–2030; 7, 8: residents), a calendar month and day, a county
-- code (01–52, or 70), and the control digit (weights 279146358279, modulo 11, 10 counts as 1). The century and the
-- control digit keep out most other 13-digit numbers (barcodes, account fragments).
CREATE FUNCTION app.valid_cnp(c text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  w constant int[] := array[2,7,9,1,4,6,3,5,8,2,7,9];
  s int := 0; i int; sex int; yy int; mm int; dd int; jj int; k int;
BEGIN
  IF c IS NULL OR c !~ '^[0-9]{13}$' THEN RETURN false; END IF;
  sex := substr(c, 1, 1)::int; yy := substr(c, 2, 2)::int; mm := substr(c, 4, 2)::int; dd := substr(c, 6, 2)::int; jj := substr(c, 8, 2)::int;
  IF sex NOT IN (1, 2, 5, 6, 7, 8) OR (sex IN (5, 6) AND yy > 30) THEN RETURN false; END IF;
  IF mm < 1 OR mm > 12 OR dd < 1 OR dd > 31 OR NOT (jj BETWEEN 1 AND 52 OR jj = 70) THEN RETURN false; END IF;
  FOR i IN 1..12 LOOP s := s + substr(c, i, 1)::int * w[i]; END LOOP;
  k := s % 11;
  IF k = 10 THEN k := 1; END IF;
  RETURN k = substr(c, 13, 1)::int;
END
$$;
--> statement-breakpoint
-- What a page's text holds: 'cnp' (13 digits after the label "CNP" or "cod numeric personal", or a number that is a
-- valid CNP wherever it stands), 'act_identitate' (CI/BI or "carte de identitate" followed by a series of two letters
-- and a number of six digits), or NULL.
CREATE FUNCTION app.document_page_personal_id(page_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  m text[];
BEGIN
  IF page_text IS NULL OR page_text = '' THEN RETURN NULL; END IF;
  IF page_text ~* '(\mC\.?\s?N\.?\s?P\.?|\mcod(ul)?\s+numeric\s+personal)[^0-9]{0,20}[0-9]{13}(?![0-9])' THEN RETURN 'cnp'; END IF;
  FOR m IN SELECT regexp_matches(page_text, '(?<![0-9])([125678][0-9]{12})(?![0-9])', 'g') LOOP
    IF app.valid_cnp(m[1]) THEN RETURN 'cnp'; END IF;
  END LOOP;
  IF page_text ~* '(\mC\.?\s?I\.?|\mB\.?\s?I\.?|\mcarte[a]?\s+de\s+identitate|\mbuletin(ul)?\s+de\s+identitate)[^0-9]{0,40}seri[ae]\.?[^0-9a-z]{0,4}[a-z]{2}[^0-9]{0,12}[0-9]{6}(?![0-9])' THEN RETURN 'act_identitate'; END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION app.hold_document_with_personal_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  reason text := app.document_page_personal_id(NEW.text);
BEGIN
  IF reason IS NOT NULL THEN
    UPDATE app.procurement_documents SET privacy_hold = 'held', privacy_reason = reason, privacy_page = NEW.page, privacy_at = clock_timestamp()
    WHERE id = NEW.document_id AND privacy_hold IS NULL;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- The trigger first, then the pages already there: a page written while the pass below runs waits for it and is then
-- checked by the trigger. The pass reads every page once (about 60 thousand pages in production on 18 November 2026).
CREATE TRIGGER document_pages_privacy_hold AFTER INSERT OR UPDATE OF text ON "app"."document_pages"
FOR EACH ROW EXECUTE FUNCTION app.hold_document_with_personal_id();--> statement-breakpoint
UPDATE "app"."procurement_documents" d
SET privacy_hold = 'held', privacy_reason = x.reason, privacy_page = x.page, privacy_at = clock_timestamp()
FROM (
  SELECT DISTINCT ON (p.document_id) p.document_id, p.page, r.reason
  FROM "app"."document_pages" p CROSS JOIN LATERAL (SELECT app.document_page_personal_id(p.text) AS reason) r
  WHERE r.reason IS NOT NULL
  ORDER BY p.document_id, p.page
) x
WHERE d.id = x.document_id AND d.privacy_hold IS NULL;
