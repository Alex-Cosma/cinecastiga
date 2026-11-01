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
  /** ONRC's other name the words matched when the SICAP name does not (a renamed firm). */
  registryName?: string;
  /** D2, only with `uat=1`: the locality this town hall is an identity of (lib/ask/town-hall-pick.ts). */
  uat?: { siruta: number; name: string; tip: string; county: string };
}

const words = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** The ONRC name that explains a hit when the typed words are not all in its name, or undefined. */
export function matchedRegistryName(query: string, name: string, registryNames: readonly string[] | undefined): string | undefined {
  const typed = words(query);
  if (!typed.length || !registryNames?.length) return undefined;
  const covered = (target: string) => {
    const targetWords = words(target);
    return typed.filter((w) => targetWords.some((t) => t.startsWith(w))).length;
  };
  let best: string | undefined;
  let bestCovered = covered(name);
  if (bestCovered === typed.length) return undefined;
  for (const other of registryNames) {
    const n = covered(other);
    if (n > bestCovered) [best, bestCovered] = [other, n];
  }
  return best;
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
      // Index ranking has "sort" ahead of proximity/attribute; without this
      // param that rule is skipped and tiny entities leapfrog big ones.
      sort: ["total:desc"],
      ...(filter ? { filter } : {}),
      attributesToRetrieve: ["id", "name", "registryNames", "cui", "county", "roles", "total"],
    });
  const hits = (res.hits as unknown as (EntityHit & { registryNames?: string[] })[]).map(({ registryNames, ...hit }) => {
    const registryName = matchedRegistryName(query, hit.name, registryNames);
    return registryName ? { ...hit, registryName } : hit;
  });
  return {
    hits,
    total: res.estimatedTotalHits ?? res.hits.length,
  };
}
