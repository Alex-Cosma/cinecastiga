// Seeds core.cpv_codes from the vendored EU CPV 2008 asset (DEC-005).
// Idempotent: re-running upserts, so it's safe after any migration.
//   node scripts/seed-cpv.mjs
import postgres from "postgres";
import { readFileSync } from "node:fs";

const cpv = JSON.parse(
  readFileSync(new URL("../seed/cpv_2008.json", import.meta.url), "utf8"),
);

const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://seap:seap_dev@localhost:5432/seap",
);

const CHUNK = 1000;
let n = 0;
for (let i = 0; i < cpv.length; i += CHUNK) {
  const rows = cpv.slice(i, i + CHUNK);
  await sql`
    insert into core.cpv_codes ${sql(rows, "code", "name_ro", "name_en", "revision", "division")}
    on conflict (code) do update set
      name_ro = excluded.name_ro,
      name_en = excluded.name_en,
      revision = excluded.revision,
      division = excluded.division
  `;
  n += rows.length;
}
console.log(`seeded ${n} CPV codes`);
await sql.end();
