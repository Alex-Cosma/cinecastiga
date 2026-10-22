-- Indexed full-text search of prepared document pages (public /cauta).
-- Same expression as title search: to_tsvector('simple', unaccent(text)).
-- unaccent() is STABLE, so it cannot back a generated column or an expression
-- index; like marts.topic_acquisitions.search, the vector is stored by the
-- writer. The writer here is a trigger, so pages written by any worker version
-- (including the one still running while a deploy migrates) are indexed.
-- A separate table instead of a new column: no exclusive lock on
-- app.document_pages. The bulk work (backfill, GIN index) runs before the
-- trigger exists and takes no lock that blocks page inserts; CREATE TRIGGER
-- and the foreign key take SHARE ROW EXCLUSIVE only for the short catch-up
-- at the end, so the worker's page inserts wait about a second, not minutes.
CREATE TABLE "app"."document_page_search" (
	"document_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"search" "tsvector" NOT NULL,
	CONSTRAINT "document_page_search_document_id_page_pk" PRIMARY KEY("document_id","page")
);
--> statement-breakpoint
-- A page over the tsvector size limit (1 MB of lexemes) stays readable but is
-- not searchable, instead of failing the worker's page insert. A fixed
-- search_path: unaccent and its dictionary resolve the same for every caller.
CREATE FUNCTION app.document_page_search_vector(page_text text) RETURNS tsvector
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog AS $$
BEGIN
  RETURN to_tsvector('simple', unaccent(page_text));
EXCEPTION WHEN program_limit_exceeded THEN
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION app.index_document_page() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  vector tsvector := app.document_page_search_vector(NEW.text);
BEGIN
  IF vector IS NULL THEN
    DELETE FROM app.document_page_search WHERE document_id = NEW.document_id AND page = NEW.page;
  ELSE
    INSERT INTO app.document_page_search(document_id, page, search) VALUES (NEW.document_id, NEW.page, vector)
    ON CONFLICT (document_id, page) DO UPDATE SET search = EXCLUDED.search;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- Bulk backfill, then the GIN index, while page inserts continue.
INSERT INTO app.document_page_search(document_id, page, search)
SELECT document_id, page, vector FROM (
  SELECT document_id, page, app.document_page_search_vector(text) vector FROM app.document_pages
) pages WHERE vector IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "document_page_search_idx" ON "app"."document_page_search" USING gin ("search");--> statement-breakpoint
ANALYZE app.document_page_search;
--> statement-breakpoint
-- From here page inserts wait until commit. Catch up the pages committed
-- during the backfill and drop vectors of pages deleted meanwhile, then link.
CREATE TRIGGER document_page_search_sync AFTER INSERT OR UPDATE OF text ON app.document_pages
FOR EACH ROW EXECUTE FUNCTION app.index_document_page();
--> statement-breakpoint
-- Find the missing pages first (materialized), so the vector is computed only for them.
WITH missing AS MATERIALIZED (
  SELECT p.document_id, p.page, p.text FROM app.document_pages p
  WHERE NOT EXISTS (SELECT 1 FROM app.document_page_search s WHERE s.document_id = p.document_id AND s.page = p.page)
)
INSERT INTO app.document_page_search(document_id, page, search)
SELECT document_id, page, vector FROM (
  SELECT document_id, page, app.document_page_search_vector(text) vector FROM missing
) pages WHERE vector IS NOT NULL;
--> statement-breakpoint
DELETE FROM app.document_page_search s
WHERE NOT EXISTS (SELECT 1 FROM app.document_pages p WHERE p.document_id = s.document_id AND p.page = s.page);
--> statement-breakpoint
ALTER TABLE "app"."document_page_search" ADD CONSTRAINT "document_page_search_page_fk" FOREIGN KEY ("document_id","page") REFERENCES "app"."document_pages"("document_id","page") ON DELETE cascade ON UPDATE no action;
