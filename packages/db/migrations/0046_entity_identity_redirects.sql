CREATE TABLE "core"."entity_redirects" (
	"old_id" bigint PRIMARY KEY NOT NULL,
	"canonical_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_redirects_not_self" CHECK ("core"."entity_redirects"."old_id" <> "core"."entity_redirects"."canonical_id")
);
--> statement-breakpoint
ALTER TABLE "core"."entity_redirects" ADD CONSTRAINT "entity_redirects_old_id_entities_id_fk" FOREIGN KEY ("old_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."entity_redirects" ADD CONSTRAINT "entity_redirects_canonical_id_entities_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "core"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_redirects_canonical_idx" ON "core"."entity_redirects" USING btree ("canonical_id");
--> statement-breakpoint
CREATE FUNCTION core.canonical_entity_id(requested_id bigint) RETURNS bigint
LANGUAGE sql STABLE STRICT PARALLEL SAFE AS $$
  SELECT coalesce((SELECT canonical_id FROM core.entity_redirects WHERE old_id = requested_id), requested_id)
$$;
--> statement-breakpoint
CREATE FUNCTION core.check_entity_redirect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- All aliases point directly to a terminal identity. Serialize writers so two
  -- concurrent repairs cannot each validate one half of a cycle/chain.
  PERFORM pg_advisory_xact_lock(710012026);
  IF EXISTS (SELECT 1 FROM core.entity_redirects WHERE old_id = NEW.canonical_id OR canonical_id = NEW.old_id) THEN
    RAISE EXCEPTION 'Entity redirects must be direct and acyclic';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER entity_redirect_terminal BEFORE INSERT OR UPDATE ON core.entity_redirects
FOR EACH ROW EXECUTE FUNCTION core.check_entity_redirect();
