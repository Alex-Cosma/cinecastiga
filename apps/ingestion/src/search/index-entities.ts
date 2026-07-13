import { Meilisearch } from "meilisearch";
import type { DbSql } from "@seap/db";

/**
 * Build the Meilisearch `entities` index from core + marts. One document per
 * canonical entity, searchable by name + CUI, filterable by role/county,
 * sortable by spend. Read side (web) queries this instead of the DB for
 * free-text lookup. Meili folds diacritics and tolerates typos by default,
 * matching the diacritic-free SICAP data.
 */
export const ENTITIES_INDEX = "entities";

export function meiliClient(): Meilisearch {
  return new Meilisearch({
    host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
    apiKey: process.env["MEILISEARCH_KEY"] ?? "seap_dev_master_key",
  });
}

interface EntityDoc {
  id: number;
  name: string;
  cui: string | null;
  county: string | null;
  roles: string[];
  supplierTotal: number;
  authorityTotal: number;
  total: number;
}

const BATCH = 20_000;

export interface IndexReport {
  documents: number;
}

export async function indexEntities(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<IndexReport> {
  const log = opts.log ?? (() => {});
  const client = meiliClient();
  const index = client.index(ENTITIES_INDEX);

  await client.createIndex(ENTITIES_INDEX, { primaryKey: "id" }).catch(() => {});
  const settingsTask = await index.updateSettings({
    searchableAttributes: ["name", "cui"],
    filterableAttributes: ["roles", "county"],
    sortableAttributes: ["total"],
    // Rank exact/prefix name matches first, then by spend on ties.
    rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
  });
  await client.tasks.waitForTask(settingsTask.taskUid, { timeout: 120_000 });

  // One row per entity, roles + per-role totals folded together.
  const rows = (await sql`
    select
      e.id,
      e.name_display,
      e.cui_canonical,
      e.county,
      array_agg(distinct ep.role) as roles,
      coalesce(max(ep.total_ron_full) filter (where ep.role = 'supplier'), 0)  as supplier_total,
      coalesce(max(ep.total_ron_full) filter (where ep.role = 'authority'), 0) as authority_total
    from core.entities e
    join marts.entity_profile ep on ep.entity_id = e.id
    group by e.id, e.name_display, e.cui_canonical, e.county
  `) as unknown as {
    id: bigint;
    name_display: string | null;
    cui_canonical: string | null;
    county: string | null;
    roles: string[];
    supplier_total: string;
    authority_total: string;
  }[];

  log(`indexing ${rows.length} entities...`);

  let sent = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const docs: EntityDoc[] = rows.slice(i, i + BATCH).map((r) => {
      const supplierTotal = Number(r.supplier_total);
      const authorityTotal = Number(r.authority_total);
      return {
        id: Number(r.id),
        name: r.name_display ?? "(fără nume)",
        cui: r.cui_canonical,
        county: r.county,
        roles: r.roles,
        supplierTotal,
        authorityTotal,
        total: Math.max(supplierTotal, authorityTotal),
      };
    });
    const task = await index.addDocuments(docs);
    await client.tasks.waitForTask(task.taskUid, { timeout: 120_000 });
    sent += docs.length;
    log(`  ${sent}/${rows.length}`);
  }

  const stats = await index.getStats();
  return { documents: stats.numberOfDocuments };
}
