import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DbSql } from "@seap/db";
import { financialSpecCodes, onrcDate } from "./parsers.js";
import { parseName, parseTxt } from "./financials.js";

const repColumns = "j_number,cui,person_name,calitate,birth_date,birth_locality,birth_county,birth_country,res_locality,res_county,res_country,person_key,snapshot_date";
const nn = (s: string | undefined) => s?.trim() || null;
const copyCell = (s: unknown) => s === null || s === undefined ? "\\N" : String(s)
  .replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
const copyRow = (row: unknown[]) => row.map(copyCell).join("\t") + "\n";

async function* copyChunks(rows: AsyncIterable<string> | Iterable<string>) {
  let chunk = "";
  for await (const row of rows) {
    chunk += row;
    if (chunk.length >= 65536) { yield chunk; chunk = ""; }
  }
  if (chunk) yield chunk;
}

async function digest(path: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}

/** Aggregate only: neither names nor dates of birth leave the database. */
async function onrcImpact(sql: DbSql) {
  const [row] = await sql`
    with supplier_cuis as (
      select distinct e.cui_canonical cui from core.entities e
      join marts.entity_profile ep on ep.entity_id=e.id and ep.role='supplier'
      where e.cui_canonical is not null
    ), reps as (
      select r.* from reference.company_reps r join supplier_cuis s using(cui)
    ), shared as (
      select person_key from reps where birth_date is not null
      group by person_key having count(distinct cui)>1
    ) select
      (select count(*) from reference.company_reps) total_rows,
      (select count(birth_date) from reference.company_reps) dated_rows,
      (select count(*) from reference.company_reps where birth_date < date '1900-01-01' or birth_date>snapshot_date) dates_for_review,
      (select count(*) from reps where birth_date is null) supplier_rows_without_date,
      (select count(*) from shared) person_keys_in_multiple_suppliers
  `;
  return row!;
}

/** Requires a transaction. Source snapshot must match the complete stored multiset. */
export async function repairOnrc(sql: DbSql, path: string, snapshot: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) throw new Error("Invalid snapshot argument");
  await sql`lock table reference.company_reps in share row exclusive mode`;
  const before = await onrcImpact(sql);
  await sql`create temp table repair_reps (like reference.company_reps, legacy_birth_date date) on commit drop`;
  const formats: Record<string, number> = {};
  let rows = 0;
  async function* source() {
    const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
    let header = true;
    for await (const raw of rl) {
      if (header) {
        header = false;
        if (raw.replace(/^\ufeff/, "").trim() !== "COD_INMATRICULARE^PERSOANA_IMPUTERNICITA^CALITATE^DATA_NASTERE^LOCALITATE_NASTERE^JUDET_NASTERE^TARA_NASTERE^LOCALITATE^JUDET^TARA") {
          throw new Error("Unexpected ONRC header");
        }
        continue;
      }
      if (!raw) continue;
      const c = raw.replace(/^\ufeff/, "").split("^");
      if (c.length !== 10) throw new Error("Malformed ONRC row; repair refused");
      const parsed = onrcDate(c[3]);
      if (parsed.format === "invalid") throw new Error("Invalid ONRC date; repair refused");
      formats[parsed.format] = (formats[parsed.format] ?? 0) + 1;
      rows++;
      yield copyRow([c[0]!.trim(), null, c[1]!.trim(), nn(c[2]), parsed.value,
        ...c.slice(4).map(nn), null, snapshot, parsed.format === "date" ? parsed.value : null]);
    }
    if (!rows) throw new Error("Empty ONRC source");
  }
  await pipeline(Readable.from(copyChunks(source())), await sql.unsafe(`copy repair_reps (${repColumns},legacy_birth_date) from stdin`).writable());
  if (rows !== Number(before.total_rows)) {
    throw new Error("ONRC source differs from stored snapshot in row count; repair refused");
  }
  await sql`update repair_reps r set cui=f.cui from reference.onrc_firm f where f.j_number=r.j_number and f.cui is not null`;
  await sql`update repair_reps set person_key=lower(unaccent(person_name))||'|'||coalesce(birth_date::text,'')||'|'||lower(unaccent(coalesce(birth_locality,'')))`;
  await sql`analyze repair_reps`;
  const differs = async (legacy: boolean) => {
    const projection = legacy
      ? repColumns.replace("birth_date", "legacy_birth_date as birth_date").replace("person_key", "lower(unaccent(person_name))||'|'||coalesce(legacy_birth_date::text,'')||'|'||lower(unaccent(coalesce(birth_locality,''))) as person_key")
      : repColumns;
    // With equal cardinality (checked above), an empty one-way EXCEPT ALL
    // proves multiset equality, including duplicates; no second wide sort needed.
    const [r] = await sql.unsafe(`select exists(
      select ${projection} from repair_reps except all select ${repColumns} from reference.company_reps
    ) mismatch`);
    return r!.mismatch as boolean;
  };
  // Idempotence is exact, including duplicate source rows. No name-only UPDATE.
  const alreadyCorrect = !(await differs(false));
  if (!alreadyCorrect && await differs(true)) throw new Error("ONRC source differs from stored snapshot beyond the known date-parser defect; repair refused");
  let changed = 0;
  if (!alreadyCorrect) {
    await sql`drop index if exists reference.company_reps_cui_idx`;
    await sql`drop index if exists reference.company_reps_person_key_idx`;
    await sql`drop index if exists reference.company_reps_name_trgm_idx`;
    await sql`truncate reference.company_reps`;
    await sql.unsafe(`insert into reference.company_reps (${repColumns}) select ${repColumns} from repair_reps`);
    await sql`create index company_reps_cui_idx on reference.company_reps(cui)`;
    await sql`create index company_reps_person_key_idx on reference.company_reps(person_key)`;
    await sql`create index company_reps_name_trgm_idx on reference.company_reps using gin(person_name gin_trgm_ops)`;
    changed = formats.date_time ?? 0;
    await sql`analyze reference.company_reps`;
  }
  return { snapshot, sha256: await digest(path), formats, changed, before, after: await onrcImpact(sql) };
}

/** Requires a transaction. Update only missing profit in the exact stored category/vintage. */
export async function repairFinancials(sql: DbSql, directory: string) {
  await sql`lock table reference.company_financials in share row exclusive mode`;
  await sql`create temp table repair_financials (like reference.company_financials including defaults) on commit drop`;
  await sql`alter table repair_financials add primary key(cui,year,category,source_vintage)`;
  const groups = await sql`select distinct year,category,source_vintage from reference.company_financials order by year,category`;
  const files = readdirSync(directory);
  const manifest: { year: number; category: string; vintage: number; sha256: string; specSha256: string; rows: number; code: string }[] = [];
  const skipped: { year: number; category: string; reason: string }[] = [];
  for (const group of groups) {
    const candidates = files.filter((f) => {
      const m = /^(\d{4})-(.+)$/.exec(f);
      const meta = m ? parseName(m[2]!) : null;
      return meta !== null && meta.category === group.category && meta.fy === group.year && Number(m![1]) === group.source_vintage;
    });
    if (candidates.length > 1) throw new Error(`Ambiguous MF cache for ${group.category}/${group.year}/${group.source_vintage}`);
    if (!candidates.length) {
      skipped.push({ year: group.year, category: group.category, reason: "No cached source for the stored vintage" });
      continue;
    }
    const path = join(directory, candidates[0]!);
    const spec = `${path}.spec.csv`;
    if (!existsSync(spec)) {
      skipped.push({ year: group.year, category: group.category, reason: "No cached spec; repair does not infer indicator numbers" });
      continue;
    }
    const codes = financialSpecCodes(readFileSync(spec, "utf8"));
    if (!codes.profit_net) {
      skipped.push({ year: group.year, category: group.category, reason: "No unambiguous explicit net-profit indicator" });
      continue;
    }
    const rows = parseTxt(path, group.category, group.year, group.source_vintage, codes, true);
    if (!rows.length) throw new Error(`Empty MF source for ${group.category}/${group.year}`);
    const columns = ["cui", "year", "caen", "category", "source_vintage", "employees", "net_turnover", "total_revenue", "total_expenses", "profit_net", "loss_net"] as const;
    await pipeline(Readable.from(copyChunks((function* () { for (const row of rows) yield copyRow(columns.map((c) => row[c])); })())),
      await sql.unsafe(`copy repair_financials (${columns.join(",")}) from stdin`).writable());
    manifest.push({ year: group.year, category: group.category, vintage: group.source_vintage,
      sha256: await digest(path), specSha256: await digest(spec), rows: rows.length, code: codes.profit_net });
    console.log(`MF staged ${group.category}/${group.year}/${group.source_vintage}: ${rows.length} source rows`);
  }
  await sql`analyze repair_financials`;
  const [conflicts] = await sql`
    select count(*) conflicts from reference.company_financials f join repair_financials s
      using(cui,year,category,source_vintage)
    where (f.caen,f.employees,f.net_turnover,f.total_revenue,f.total_expenses,f.loss_net)
       is distinct from (s.caen,s.employees,s.net_turnover,s.total_revenue,s.total_expenses,s.loss_net)
      or (f.profit_net is not null and f.profit_net is distinct from s.profit_net)
  `;
  if (Number(conflicts!.conflicts)) throw new Error(`MF non-target values differ in ${conflicts!.conflicts} rows; repair refused`);
  // Every stored filing in each repairable group must be traceable to its source.
  const [missing] = await sql`
    select count(*) n from reference.company_financials f
    join jsonb_to_recordset(${JSON.stringify(manifest)}::jsonb) as g(year int,category text,vintage int)
      on f.year=g.year and f.category=g.category and f.source_vintage=g.vintage
    where not exists(select 1 from repair_financials s where (s.cui,s.year,s.category,s.source_vintage)=(f.cui,f.year,f.category,f.source_vintage))
  `;
  if (Number(missing!.n)) throw new Error(`MF source missing ${missing!.n} stored filings; repair refused`);
  const impact = await sql`
    select f.year,f.category,count(*) recovered,
      count(*) filter(where s.profit_net=0) zero_profit,
      count(*) filter(where exists(select 1 from core.entities e join marts.entity_profile ep
        on ep.entity_id=e.id and ep.role='supplier' where e.cui_canonical=f.cui)) supplier_filings
    from reference.company_financials f join repair_financials s using(cui,year,category,source_vintage)
    where f.profit_net is null and s.profit_net is not null group by f.year,f.category order by f.year,f.category
  `;
  const result = await sql`
    update reference.company_financials f set profit_net=s.profit_net from repair_financials s
    where (f.cui,f.year,f.category,f.source_vintage)=(s.cui,s.year,s.category,s.source_vintage)
      and f.profit_net is null and s.profit_net is not null
  `;
  await sql`analyze reference.company_financials`;
  return { changed: result.count, impact: [...impact], manifest, skipped };
}
