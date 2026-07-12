import {
  cpvTree,
  entityProfile,
  nationalStats,
  spendByCpv,
  spendByType,
  type Db,
  type DbSql,
} from "@seap/db";
import { readBson } from "./bson.js";

/**
 * Build the gold marts from the 2020 dump's precomputed collections — a 2020
 * snapshot, not the live pipeline's output. Populates the marts whose inputs
 * exist in the dump's aggregate collections:
 *   - entity_profile / top_entities  ← {supplier,contractingAuthority}TotalSpendingByType
 *   - spend_by_type                   ← contractsTotalSpendingByType (national)
 *   - spend_by_cpv                    ← nationalCpvDataSimplified (division roots)
 *   - national_stats                  ← headline counts + total spend
 *
 * entity_top_partners and authority_concentration need pair-level (authority↔
 * supplier) data, which lives only in the multi-GB *CpvData/*Details dumps — left
 * empty here (a later full replay through core fills them).
 */
const BATCH = 1000;

export interface BuildMartsResult {
  entityProfiles: number;
  topEntities: number;
  spendByType: number;
  spendByCpv: number;
  cpvTreeNodes: number;
  spendByCounty: number;
  totalSpendRon: number;
}

/** Recursively flatten a nationalCpvDataSimplified node into cpv_tree rows. */
function* flattenCpv(
  node: Record<string, unknown>,
  parentCode: string | null,
  level: number,
): Generator<typeof cpvTree.$inferInsert> {
  const code = String(node["_id"]);
  const children = (node["children"] as Record<string, unknown>[] | undefined) ?? [];
  yield {
    code,
    parentCode,
    level,
    nameRo: (node["description"] as string | undefined) ?? null,
    totalRon: (Number(node["total"]) || 0).toFixed(2),
    nChildren: children.length,
  };
  for (const c of children) yield* flattenCpv(c, code, level + 1);
}

/** Sum a *TotalSpendingByType collection to sicapId → total RON. */
function sumByEntity(file: string, idField: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of readBson(file)) {
    const id = Number(d[idField]);
    if (!Number.isFinite(id)) continue;
    const t = Number(d["total"]) || 0;
    m.set(id, (m.get(id) ?? 0) + t);
  }
  return m;
}

async function insertProfiles(
  db: Db,
  role: "supplier" | "authority",
  totals: Map<number, number>,
  idMap: Map<number, bigint>,
): Promise<number> {
  // Re-key spend from SICAP id to canonical entity id and SUM: several SICAP ids
  // can merge onto one entity (same valid CUI), and their spend must combine —
  // aggregating by SICAP id would drop all but one on the (entity_id, role) PK.
  const byEntity = new Map<bigint, number>();
  for (const [sicapId, total] of totals) {
    const entityId = idMap.get(sicapId);
    if (entityId == null) continue; // not in the dimension file
    byEntity.set(entityId, (byEntity.get(entityId) ?? 0) + total);
  }

  let batch: (typeof entityProfile.$inferInsert)[] = [];
  let n = 0;
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await db.insert(entityProfile).values(batch).onConflictDoNothing();
    n += batch.length;
    batch = [];
  };
  for (const [entityId, total] of byEntity) {
    const ron = total.toFixed(2);
    batch.push({
      entityId,
      role,
      nContracts: 0,
      nDas: 0,
      totalRonFull: ron,
      totalRonSplit: ron,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return n;
}

export async function buildMarts(
  db: Db,
  sql: DbSql,
  dir: string,
  supplierMap: Map<number, bigint>,
  authorityMap: Map<number, bigint>,
  log: (m: string) => void = () => {},
): Promise<BuildMartsResult> {
  // ── entity_profile (supplier + authority totals) ──────────────────────────
  const supTotals = sumByEntity(`${dir}/supplierTotalSpendingByType.bson`, "supplierId");
  const supRows = await insertProfiles(db, "supplier", supTotals, supplierMap);
  log(`  entity_profile suppliers: ${supRows}`);
  const authTotals = sumByEntity(
    `${dir}/contractingAuthorityTotalSpendingByType.bson`,
    "contractingAuthorityId",
  );
  const authRows = await insertProfiles(db, "authority", authTotals, authorityMap);
  log(`  entity_profile authorities: ${authRows}`);

  // Denormalize display fields (build-time core join — not a request-time read).
  await sql`
    update marts.entity_profile ep
    set name_display = e.name_display, county = e.county
    from core.entities e where e.id = ep.entity_id
  `;

  // ── top_entities (leaderboards per role, matches live TOP_ENTITIES_LIMIT) ──
  await sql`
    insert into marts.top_entities (role, rank, entity_id, total_ron_full, n_contracts)
    select role, rank, entity_id, total_ron_full, n_contracts
    from (
      select role, entity_id, total_ron_full, n_contracts,
             row_number() over (partition by role order by total_ron_full desc nulls last) rank
      from marts.entity_profile
    ) r
    where rank <= 200
  `;
  const [te] = (await sql`select count(*)::int c from marts.top_entities`) as unknown as {
    c: number;
  }[];

  // ── spend_by_type (national, by acquisition type) ─────────────────────────
  let totalSpend = 0;
  const typeRows: (typeof spendByType.$inferInsert)[] = [];
  for (const d of readBson(`${dir}/contractsTotalSpendingByType.bson`)) {
    const t = Number(d["total"]) || 0;
    totalSpend += t;
    typeRows.push({
      kind: "all",
      acquisitionType: String(d["_id"]),
      n: 0,
      totalRon: t.toFixed(2),
    });
  }
  if (typeRows.length > 0) await db.insert(spendByType).values(typeRows);

  // ── spend_by_cpv (division roots, rolled-up totals) ───────────────────────
  const cpvRows: (typeof spendByCpv.$inferInsert)[] = [];
  for (const d of readBson(`${dir}/nationalCpvDataSimplified.bson`)) {
    const code = String(d["_id"]);
    if (!/^\d{2}/.test(code)) continue; // skip a possible "SEAP" super-root
    cpvRows.push({
      division: code.slice(0, 2),
      nameRo: (d["description"] as string | undefined) ?? null,
      kind: "all",
      n: 0,
      totalRon: (Number(d["total"]) || 0).toFixed(2),
    });
  }
  if (cpvRows.length > 0) await db.insert(spendByCpv).values(cpvRows);

  // ── cpv_tree (full hierarchy, drill-down treemap source) ──────────────────
  const treeRows: (typeof cpvTree.$inferInsert)[] = [];
  for (const d of readBson(`${dir}/nationalCpvDataSimplified.bson`)) {
    if (!/^\d{2}/.test(String(d["_id"]))) continue; // skip a possible "SEAP" super-root
    for (const row of flattenCpv(d, null, 1)) treeRows.push(row);
  }
  for (let i = 0; i < treeRows.length; i += BATCH) {
    await db.insert(cpvTree).values(treeRows.slice(i, i + BATCH)).onConflictDoNothing();
  }

  // ── spend_by_county (choropleth source, both roles) ───────────────────────
  await sql`
    insert into marts.spend_by_county (county, role, n, total_ron)
    select county, role, count(*)::int, sum(total_ron_full)
    from marts.entity_profile
    where county is not null and county <> ''
    group by county, role
  `;
  const [sbc] = (await sql`select count(*)::int c from marts.spend_by_county`) as unknown as {
    c: number;
  }[];

  // ── national_stats (headline surface) ─────────────────────────────────────
  const [supCount] = (await sql`
    select count(*)::int c from marts.entity_profile where role = 'supplier'
  `) as unknown as { c: number }[];
  const [authCount] = (await sql`
    select count(*)::int c from marts.entity_profile where role = 'authority'
  `) as unknown as { c: number }[];
  await db.insert(nationalStats).values([
    { kind: "supplier", year: null, n: supCount!.c, totalRon: null },
    { kind: "authority", year: null, n: authCount!.c, totalRon: null },
    { kind: "spend", year: null, n: 0, totalRon: totalSpend.toFixed(2) },
  ]);

  return {
    entityProfiles: supRows + authRows,
    topEntities: te!.c,
    spendByType: typeRows.length,
    spendByCpv: cpvRows.length,
    cpvTreeNodes: treeRows.length,
    spendByCounty: sbc!.c,
    totalSpendRon: totalSpend,
  };
}
