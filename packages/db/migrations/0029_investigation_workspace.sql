CREATE TABLE "app"."investigation_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "investigation_invites_role" CHECK ("app"."investigation_invites"."role" in ('editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE "app"."investigation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investigation_members_role" CHECK ("app"."investigation_members"."role" in ('editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE "app"."question_evidence" (
	"investigation_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"stance" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_evidence_question_id_clip_id_pk" PRIMARY KEY("question_id","clip_id"),
	CONSTRAINT "question_evidence_stance" CHECK ("app"."question_evidence"."stance" in ('supports','contradicts','check'))
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"alternative" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurred_on" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workspace_entries_kind" CHECK ("app"."workspace_entries"."kind" in ('question','note','task','event')),
	CONSTRAINT "workspace_entries_status" CHECK ("app"."workspace_entries"."status" in ('open','checking','done'))
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."investigation_invites" ADD CONSTRAINT "investigation_invites_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."investigation_invites" ADD CONSTRAINT "investigation_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."investigation_members" ADD CONSTRAINT "investigation_members_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."investigation_members" ADD CONSTRAINT "investigation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_evidence" ADD CONSTRAINT "question_evidence_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_evidence" ADD CONSTRAINT "question_evidence_question_id_workspace_entries_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."workspace_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_evidence" ADD CONSTRAINT "question_evidence_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "app"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_entries" ADD CONSTRAINT "workspace_entries_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "app"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_entries" ADD CONSTRAINT "workspace_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_entries" ADD CONSTRAINT "workspace_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_revisions" ADD CONSTRAINT "workspace_revisions_entry_id_workspace_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "app"."workspace_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_revisions" ADD CONSTRAINT "workspace_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_invites_token_uq" ON "app"."investigation_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "investigation_invites_parent_idx" ON "app"."investigation_invites" USING btree ("investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigation_members_user_uq" ON "app"."investigation_members" USING btree ("investigation_id","user_id");--> statement-breakpoint
CREATE INDEX "investigation_members_lookup_idx" ON "app"."investigation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "question_evidence_parent_idx" ON "app"."question_evidence" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "workspace_entries_parent_idx" ON "app"."workspace_entries" USING btree ("investigation_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_revisions_number_uq" ON "app"."workspace_revisions" USING btree ("entry_id","revision");