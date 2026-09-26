import type { DbSql } from "@seap/db";
import type { MinimumRecords, PopulationCondition, QueryPopulation } from "./population";

/** Population threshold before chart/group selections or drawer-local filters. */
export function minimumRecordsSql(sql: DbSql, source:ReturnType<DbSql>, where:ReturnType<DbSql>, minimum:MinimumRecords): ReturnType<DbSql> {
  const party = minimum.role === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
  return sql`${party} in (select ${party} from ${source} d where ${where} and ${party} is not null group by ${party} having count(*) >= ${minimum.count})`;
}

/** Same alias and predicates for result, evidence, CSV and frozen captures. */
export function populationSql(sql: DbSql, population?: QueryPopulation): ReturnType<DbSql> {
  if (!population) return sql`true`;
  const combine = (parts: ReturnType<DbSql>[], operator: "and" | "or") => parts.reduce((a, b) => operator === "and" ? sql`(${a} and ${b})` : sql`(${a} or ${b})`);
  const condition = (c: PopulationCondition): ReturnType<DbSql> => {
    if (c.field === "date") {
      return c.op === "gte" ? sql`substr(d.finalization_date, 1, 10) >= ${c.value}` : sql`substr(d.finalization_date, 1, 10) <= ${c.value}`;
    }
    if (c.field === "value") return c.op === "gte" ? sql`d.closing_value >= ${c.value}::numeric` : sql`d.closing_value <= ${c.value}::numeric`;
    // Explicit exclusion retains unknowns: missing is not a match to an excluded identity.
    if ("values" in c) {
      let matches: ReturnType<DbSql>;
      if (c.field === "cpv") matches = sql`coalesce(d.cpv_code like any(${sql.array(c.values.map(v => v + "%"))}::text[]), false)`;
      else if (c.field === "county") matches = sql`coalesce(lower(unaccent(d.county)) = any(${sql.array(c.values.map(v => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))}::text[]), false)`;
      else {
        const column = c.field === "authority" ? sql`d.authority_id` : sql`d.supplier_id`;
        matches = sql`coalesce(${column} = any(${sql.array(c.values)}::bigint[]), false)`;
      }
      return c.op === "not_in" ? sql`not (${matches})` : matches;
    }
    throw new Error("Unsupported population condition");
  };
  return combine(population.groups.map(g => combine(g.conditions.map(condition), g.operator)), population.operator);
}
