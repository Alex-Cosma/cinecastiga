-- „Știați că” (owner, 26 November 2026): facts of impact taken from the data (shares, large sums, very many
-- records), proposed by every processing run and published only by an administrator's choice in Admin → Știați că.
-- app.facts holds the proposals and the decisions. Operator data: read live, never copied or swapped by the build.
--
-- A fact is public when status = 'approved' and publish_on has come (Romanian calendar): „Publică acum” sets today,
-- „Programează” a later day. A proposal nobody touches stays unpublished. `key` names what the fact is about (recipe,
-- period, entity), so a run proposes it once and refreshes its figures only while it is still a proposal.
-- A run writes the numbers (`data`); the words (`figure`, `unit`, `statement`, `context`, the link) are composed by
-- the site from them and saved when an administrator publishes or edits the fact.
CREATE TABLE "app"."facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"recipe" text NOT NULL,
	"kind" text NOT NULL,
	"figure" text,
	"unit" text,
	"statement" text,
	"context" text,
	"link_href" text,
	"link_label" text,
	"check_status" text DEFAULT 'ok' NOT NULL,
	"check_note" text,
	"entity_ids" bigint[] DEFAULT '{}' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"publish_on" date,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facts_key_unique" UNIQUE("key"),
	CONSTRAINT "facts_kind" CHECK ("app"."facts"."kind" in ('share','count','sum','record','pattern')),
	CONSTRAINT "facts_check_status" CHECK ("app"."facts"."check_status" in ('ok','look')),
	CONSTRAINT "facts_status" CHECK ("app"."facts"."status" in ('proposed','approved','rejected','withdrawn')),
	CONSTRAINT "facts_publish_on" CHECK ("app"."facts"."status" <> 'approved' or ("app"."facts"."publish_on" is not null and "app"."facts"."figure" is not null and "app"."facts"."statement" is not null))
);--> statement-breakpoint
CREATE INDEX "facts_public_idx" ON "app"."facts" USING btree ("publish_on" DESC, "id" DESC) WHERE "app"."facts"."status" = 'approved';
