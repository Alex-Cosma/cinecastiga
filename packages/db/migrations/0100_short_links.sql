-- Short links (owner, 9 November 2026): cinecastiga.ro/l/<code> opens a long address of the site. The code is derived
-- from the address itself (base62 of its SHA-256), so the same address always gets the same link and copying it again
-- writes nothing. A code collision takes one more character (up to 12). The target is a path of the site, never
-- another host. Not part of the processing schemas: the blue/green swap never touches it.
CREATE TABLE IF NOT EXISTS "app"."short_links" (
	"code" text PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"opens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "short_links_code_check" CHECK ("code" ~ '^[0-9A-Za-z]{8,12}$'),
	CONSTRAINT "short_links_target_check" CHECK (length("target") <= 4096 AND "target" LIKE '/%' AND "target" NOT LIKE '//%')
);
