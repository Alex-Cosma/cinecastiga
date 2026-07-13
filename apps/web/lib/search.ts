import { Meilisearch } from "meilisearch";

/**
 * Server-only Meilisearch access. The web queries the `entities` index for
 * free-text lookup instead of the DB (the FEATURE's marts+search-only rule).
 * The key stays server-side — search runs in a server component, never shipped
 * to the client.
 */
const g = globalThis as unknown as { __seapMeili?: Meilisearch };
function client(): Meilisearch {
  if (!g.__seapMeili) {
    g.__seapMeili = new Meilisearch({
      host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
      apiKey: process.env["MEILISEARCH_KEY"] ?? "seap_dev_master_key",
    });
  }
  return g.__seapMeili;
}

export interface EntityHit {
  id: number;
  name: string;
  cui: string | null;
  county: string | null;
  roles: string[];
  total: number;
}

export interface SearchResult {
  hits: EntityHit[];
  total: number;
}

export async function searchEntities(
  q: string,
  opts: { limit?: number; role?: "supplier" | "authority" } = {},
): Promise<SearchResult> {
  const query = q.trim();
  if (!query) return { hits: [], total: 0 };
  const filter = opts.role ? [`roles = ${opts.role}`] : undefined;
  const res = await client()
    .index("entities")
    .search(query, {
      limit: opts.limit ?? 30,
      ...(filter ? { filter } : {}),
      attributesToRetrieve: ["id", "name", "cui", "county", "roles", "total"],
    });
  return {
    hits: res.hits as unknown as EntityHit[],
    total: res.estimatedTotalHits ?? res.hits.length,
  };
}
