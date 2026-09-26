CREATE TABLE "app"."query_recipe_versions" (
	"recipe_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "query_recipe_versions_recipe_id_version_pk" PRIMARY KEY("recipe_id","version"),
	CONSTRAINT "query_recipe_versions_version_check" CHECK ("app"."query_recipe_versions"."version" > 0),
	CONSTRAINT "query_recipe_versions_title_check" CHECK (length("app"."query_recipe_versions"."title") between 1 and 160),
	CONSTRAINT "query_recipe_versions_note_check" CHECK (length("app"."query_recipe_versions"."note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "app"."query_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "query_recipes_title_check" CHECK (length("app"."query_recipes"."title") between 1 and 160),
	CONSTRAINT "query_recipes_current_version_check" CHECK ("app"."query_recipes"."current_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."query_recipe_versions" ADD CONSTRAINT "query_recipe_versions_recipe_id_query_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "app"."query_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."query_recipes" ADD CONSTRAINT "query_recipes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "query_recipes_owner_updated_idx" ON "app"."query_recipes" USING btree ("owner_user_id","updated_at");