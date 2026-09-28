-- Keep existing questions and immutable revisions. Only duplicate current names
-- get a new revision; the oldest question keeps its name.
DO $$
DECLARE r record; candidate text; base text; suffix text; n integer;
BEGIN
  LOCK TABLE app.query_recipes IN SHARE ROW EXCLUSIVE MODE;
  FOR r IN
    SELECT * FROM (
      SELECT q.*, row_number() OVER (
        PARTITION BY owner_user_id, lower(btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')))
        ORDER BY created_at, id
      ) AS duplicate_number FROM app.query_recipes q
    ) ranked WHERE duplicate_number > 1 ORDER BY owner_user_id, created_at, id
  LOOP
    base := regexp_replace(btrim(regexp_replace(r.title, '[[:space:]]+', ' ', 'g')), ' — copie( [0-9]+)?$', '', 'i');
    n := 1;
    LOOP
      suffix := CASE WHEN n = 1 THEN ' — copie' ELSE ' — copie ' || n END;
      candidate := rtrim(left(base, 160 - length(suffix))) || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM app.query_recipes q WHERE q.owner_user_id = r.owner_user_id
        AND lower(btrim(regexp_replace(q.title, '[[:space:]]+', ' ', 'g'))) = lower(candidate)
      );
      n := n + 1;
    END LOOP;
    INSERT INTO app.query_recipe_versions(recipe_id, version, title, note, spec)
      SELECT recipe_id, r.current_version + 1, candidate,
        'Nume diferențiat automat pentru a evita confuzia cu o altă întrebare salvată.', spec
      FROM app.query_recipe_versions WHERE recipe_id = r.id AND version = r.current_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'Saved question % has no current revision', r.id; END IF;
    UPDATE app.query_recipes SET title = candidate, current_version = r.current_version + 1, updated_at = now() WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "query_recipes_owner_title_unique" ON "app"."query_recipes" USING btree ("owner_user_id",lower(btrim(regexp_replace("title", '[[:space:]]+', ' ', 'g'))));