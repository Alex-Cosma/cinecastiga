import { createDb, type DbSql } from "@seap/db";
import type { RecipeInput } from "./ask/recipe-input";

const globalDb = globalThis as unknown as { __seapRecipesSql?: DbSql };
function database() { return globalDb.__seapRecipesSql ??= createDb().sql; }
export interface RecipeSummary { id:string; title:string; currentVersion:number; updatedAt:string }
export interface RecipeRevision { version:number; title:string; note:string | null; createdAt:string }
export interface RecipeVersion extends RecipeSummary { version:number; spec:unknown; revisions:RecipeRevision[] }

/** Injecting a connection allows owner/concurrency tests without touching live data. */
export function recipeStore(sql: DbSql = database()) {
  return {
    async list(userId: string): Promise<RecipeSummary[]> {
      const rows = await sql`select id, title, current_version, updated_at from app.query_recipes
        where owner_user_id = ${userId} order by updated_at desc, id limit 200`;
      return rows.map(row => ({ id:String(row.id), title:String(row.title), currentVersion:Number(row.current_version), updatedAt:String(row.updated_at) }));
    },
    async open(userId: string, id: string, version?: number): Promise<RecipeVersion | null> {
      return sql.begin("isolation level repeatable read read only", async tx => {
        const [recipe] = await tx`select id, title, current_version, updated_at from app.query_recipes where id = ${id}::uuid and owner_user_id = ${userId}`;
        if (!recipe) return null;
        const [row] = await tx`select version, title, note, spec, created_at from app.query_recipe_versions where recipe_id = ${id}::uuid and version = ${version ?? Number(recipe.current_version)}`;
        if (!row) return null;
        const revisions = await tx`select version, title, note, created_at from app.query_recipe_versions where recipe_id = ${id}::uuid order by version desc`;
        return { id, title:String(row.title), currentVersion:Number(recipe.current_version), updatedAt:String(recipe.updated_at), version:Number(row.version), spec:row.spec,
          revisions:revisions.map(r => ({ version:Number(r.version), title:String(r.title), note:r.note === null ? null : String(r.note), createdAt:String(r.created_at) })) };
      });
    },
    async create(userId: string, input: RecipeInput) {
      return sql.begin(async tx => {
        const [recipe] = await tx`insert into app.query_recipes (owner_user_id, title) values (${userId}, ${input.title}) returning id`;
        const id = String(recipe!.id);
        await tx`insert into app.query_recipe_versions (recipe_id, version, title, note, spec) values (${id}::uuid, 1, ${input.title}, ${input.note}, ${JSON.stringify(input.spec)}::jsonb)`;
        return { id, version:1 };
      });
    },
    async revise(userId: string, id: string, input: RecipeInput): Promise<{ id:string; version:number } | { error:"missing" | "conflict" }> {
      return sql.begin(async tx => {
        // Owner is checked before reading any revision. Lock serializes concurrent saves.
        const [recipe] = await tx`select current_version from app.query_recipes where id = ${id}::uuid and owner_user_id = ${userId} for update`;
        if (!recipe) return { error:"missing" as const };
        if (Number(recipe.current_version) !== input.expectedVersion) return { error:"conflict" as const };
        const version = Number(recipe.current_version) + 1;
        await tx`insert into app.query_recipe_versions (recipe_id, version, title, note, spec) values (${id}::uuid, ${version}, ${input.title}, ${input.note}, ${JSON.stringify(input.spec)}::jsonb)`;
        await tx`update app.query_recipes set current_version = ${version}, title = ${input.title}, updated_at = now() where id = ${id}::uuid and owner_user_id = ${userId}`;
        return { id, version };
      });
    },
  };
}
