import { Meilisearch } from "meilisearch";
import { corroboratedCui, otherRegistryNames, type DbSql } from "@seap/db";

/**
 * Build the Meilisearch `entities` index from core + marts. One document per
 * canonical entity, searchable by name + CUI, filterable by role/county,
 * sortable by spend. Read side (web) queries this instead of the DB for
 * free-text lookup. Meili folds diacritics and tolerates typos by default,
 * matching the diacritic-free SICAP data. A firm renamed in ONRC is found by
 * either name: `registryNames` holds ONRC's names for its corroborated CUI that
 * are not the SICAP name (1 November 2026).
 */
export const ENTITIES_INDEX = "entities";
/** The shadow build's index (blue/green, 9 November 2026): filled from the shadow schemas, then exchanged with
 * `entities` by swapIndexes right after the schema swap; the web always queries `entities`. */
export const ENTITIES_NEXT_INDEX = "entities_next";

export function meiliClient(): Meilisearch {
  return new Meilisearch({
    host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
    apiKey: process.env["MEILISEARCH_KEY"] ?? "seap_dev_master_key",
  });
}

interface EntityDoc {
  id: number;
  name: string;
  /** ONRC's other names for the CUI (otherRegistryNames), searchable. */
  registryNames: string[];
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
  opts: { log?: (m: string) => void; indexUid?: string } = {},
): Promise<IndexReport> {
  const log = opts.log ?? (() => {});
  const client = meiliClient();
  const uid = opts.indexUid ?? ENTITIES_INDEX;
  const index = client.index(uid);

  // createIndex enqueues a task: an existing index fails asynchronously, so a
  // catch on the HTTP request does not prevent a failed indexing task.
  const waitForSuccess = async (taskUid: number, timeout: number) => {
    const task = await client.tasks.waitForTask(taskUid, { timeout });
    if (task.status !== "succeeded") {
      throw new Error(`Entity search task ${taskUid} ${task.status}: ${task.error?.code ?? "unknown"}`);
    }
  };
  try {
    await client.getIndex(uid);
  } catch (error) {
    // meilisearch-js 0.59 puts the API error code in `cause` (seen 9 November 2026, when the shadow build first created
    // entities_next); older clients put it on the error.
    const failure = error as { code?: string; cause?: { code?: string } };
    if ((failure?.cause?.code ?? failure?.code) !== "index_not_found") throw error;
    const task = await client.createIndex(uid, { primaryKey: "id" });
    await waitForSuccess(task.taskUid, 120_000);
  }
  // Wipe before push: entity ids change on re-normalize, and upsert-only
  // indexing accumulates stale documents whose links 404 (seen 2026-07-28:
  // 815k docs for 194k entities).
  const wipeTask = await index.deleteAllDocuments();
  await waitForSuccess(wipeTask.taskUid, 300_000);
  const settingsTask = await index.updateSettings({
    searchableAttributes: ["name", "registryNames", "cui"],
    filterableAttributes: ["roles", "county"],
    sortableAttributes: ["total"],
    // All query words + typo tolerance first, then spend (callers pass
    // sort=total:desc) BEFORE proximity/attribute/exactness — so "cluj" ranks
    // Municipiul Cluj-Napoca above "Cluj Info Hub" instead of on a tiny
    // proximity edge. Word-count/typo tiers still keep loose matches below.
    rankingRules: ["words", "typo", "sort", "proximity", "attribute", "exactness"],
    // Colloquial institution names → legal registry forms (one-way; mirrors
    // lib/ask/entity-alias.ts on the web side). City halls are registered as
    // the UAT itself, county councils as "JUDETUL X (CONSILIUL JUDETEAN)".
    synonyms: {
      primaria: ["municipiul", "orasul", "oras", "comuna", "sectorul", "sector"],
      primarie: ["municipiul", "orasul", "oras", "comuna"],
      cj: ["judetul", "consiliul judetean"],
      prefectura: ["institutia prefectului", "prefectul"],
    },
  });
  await waitForSuccess(settingsTask.taskUid, 120_000);

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

  // ONRC's names by corroborated CUI; a database without the ONRC import has none.
  const [onrc] = (await sql`select to_regclass('reference.onrc_firm') is not null present`) as unknown as { present: boolean }[];
  const registryRows = onrc?.present
    ? ((await sql`
        select e.id, array_agg(o.name order by o.j_number) names
        from core.entities e
        join reference.onrc_firm o on o.cui = ${corroboratedCui(sql, "e")}
        where e.cui_canonical is not null and exists (select 1 from marts.entity_profile ep where ep.entity_id = e.id)
        group by e.id
      `) as unknown as { id: bigint; names: string[] }[])
    : [];
  const registryNames = new Map(registryRows.map((r) => [String(r.id), r.names]));

  log(`indexing ${rows.length} entities...`);

  let sent = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const docs: EntityDoc[] = rows.slice(i, i + BATCH).map((r) => {
      const supplierTotal = Number(r.supplier_total);
      const authorityTotal = Number(r.authority_total);
      return {
        id: Number(r.id),
        name: r.name_display ?? "(fără nume)",
        registryNames: otherRegistryNames(r.name_display, registryNames.get(String(r.id)) ?? []),
        cui: r.cui_canonical,
        county: r.county,
        roles: r.roles,
        supplierTotal,
        authorityTotal,
        total: Math.max(supplierTotal, authorityTotal),
      };
    });
    const task = await index.addDocuments(docs);
    await waitForSuccess(task.taskUid, 120_000);
    sent += docs.length;
    log(`  ${sent}/${rows.length}`);
  }

  const stats = await index.getStats();
  return { documents: stats.numberOfDocuments };
}
