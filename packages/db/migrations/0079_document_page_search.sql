-- Indexed full-text search of prepared document pages (public /cauta).
-- Same expression as title search: to_tsvector('simple', unaccent(text)).
-- unaccent() is STABLE, so it cannot back a generated column or an expression
-- index; like marts.topic_acquisitions.search, the vector is stored by the
-- writer. The writer here is a trigger, so pages written by any worker version
-- (including the one still running while a deploy migrates) are indexed.
-- A separate table instead of a new column: CREATE TRIGGER and the foreign key
-- take SHARE ROW EXCLUSIVE on app.document_pages, which does not block readers
-- (document reader, running searches); only page inserts wait for the commit.
CREATE TABLE "app"."document_page_search" (
	"document_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"search" "tsvector" NOT NULL,
	CONSTRAINT "document_page_search_document_id_page_pk" PRIMARY KEY("document_id","page")
);
--> statement-breakpoint
-- A page over the tsvector size limit (1 MB of lexemes) stays readable but is
-- not searchable, instead of failing the worker's page insert.
CREATE FUNCTION app.document_page_search_vector(page_text text) RETURNS tsvector
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN to_tsvector('simple', unaccent(page_text));
EXCEPTION WHEN program_limit_exceeded THEN
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION app.index_document_page() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER document_page_search_sync AFTER INSERT OR UPDATE OF text ON app.document_pages
FOR EACH ROW EXECUTE FUNCTION app.index_document_page();
--> statement-breakpoint
-- Backfill after the trigger exists: its lock holds new page inserts until
-- commit, so no page is missed between the two. Bulk-load before the GIN index.
INSERT INTO app.document_page_search(document_id, page, search)
SELECT document_id, page, vector FROM (
  SELECT document_id, page, app.document_page_search_vector(text) vector FROM app.document_pages
) pages WHERE vector IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "app"."document_page_search" ADD CONSTRAINT "document_page_search_page_fk" FOREIGN KEY ("document_id","page") REFERENCES "app"."document_pages"("document_id","page") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_page_search_idx" ON "app"."document_page_search" USING gin ("search");--> statement-breakpoint
ANALYZE app.document_page_search;
