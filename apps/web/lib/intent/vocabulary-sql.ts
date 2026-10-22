import type { DbSql } from "@seap/db";
import { cleanName, onrcBirthYear } from "../format";
import { buildPlaces, type UatSource } from "./places";
import { entityCandidates, personsByExactName, suggestCpv } from "./vocabulary-queries";
import type { PlaceEntry, Vocabulary } from "./types";

/**
 * The SQL vocabulary: /api/suggest's CPV query, a non-collapsing entity
 * lookup and an exact ONRC name lookup (both with total counts); the place
 * gazetteer and the synonym list are small, read once per process and kept
 * in memory (reference data, changed only by imports).
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = globalThis as unknown as {
  __seapIntentPlaces?: { at: number; value: Promise<PlaceEntry[]> };
  __seapIntentSynonyms?: { at: number; value: Promise<string[]> };
};

function cached<T>(slot: "__seapIntentPlaces" | "__seapIntentSynonyms", load: () => Promise<T>): Promise<T> {
  const hit = cache[slot] as { at: number; value: Promise<T> } | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = load();
  (cache as Record<string, unknown>)[slot] = { at: Date.now(), value };
  value.catch(() => { delete cache[slot]; });
  return value;
}

export async function loadPlaces(sql: DbSql): Promise<PlaceEntry[]> {
  const rows = (await sql`select siruta, name, tip, county from reference.uat`) as unknown as UatSource[];
  return buildPlaces(rows.map((r) => ({ siruta: Number(r.siruta), name: r.name, tip: r.tip, county: r.county })));
}

export async function loadSynonyms(sql: DbSql): Promise<string[]> {
  const rows = (await sql`select distinct lower(unaccent(term)) term from reference.cpv_synonym`) as unknown as { term: string }[];
  return rows.map((r) => r.term);
}

const LETTER = /\p{L}/u;

/** Registry names sometimes start with a fiscal code ("`4278205 - Colegiul …"); readers need the name. */
function registryName(name: string | null): string {
  return cleanName(name).replace(/^[`'"]?\s*\d{4,10}\s*[-–]?\s*/, "").trim() || cleanName(name);
}

/**
 * `sql` is used for the per-question lookups (callers pass a read-only
 * transaction with a statement timeout); `shared` loads the cached lists.
 * Once `signal` aborts (the API's time budget), no further lookup starts.
 */
export function sqlVocabulary(sql: DbSql, shared: DbSql = sql, opts: { cache?: boolean; signal?: AbortSignal } = {}): Vocabulary {
  const useCache = opts.cache ?? true;
  const live = <T>(run: () => Promise<T>): Promise<T> =>
    opts.signal?.aborted ? Promise.reject(new Error("intent-aborted")) : run();
  return {
    places: () => (useCache ? cached("__seapIntentPlaces", () => loadPlaces(shared)) : loadPlaces(shared)),
    synonyms: () => (useCache ? cached("__seapIntentSynonyms", () => loadSynonyms(shared)) : loadSynonyms(shared)),
    cpv: (q) => live(async () => (await suggestCpv(sql, q)).map((r) => ({ term: r.term, cpvName: r.cpv_name }))),
    entities: (role, q) => live(async () => {
      const rows = await entityCandidates(sql, role, q);
      return {
        hits: rows.map((r) => ({ id: Number(r.entity_id), name: registryName(r.name_display), county: r.county })),
        total: Number(rows[0]?.total ?? 0),
      };
    }),
    personsNamed: (names) => live(async () => {
      const rows = await personsByExactName(sql, names);
      return {
        hits: rows.map((r) => ({
          key: r.person_key,
          name: cleanName(r.nm),
          birthYear: onrcBirthYear(r.by, r.sy).birthYear,
          birthLocality: r.bl && LETTER.test(r.bl) ? r.bl : null,
          nFirms: Number(r.nf ?? 0),
        })),
        total: Number(rows[0]?.total ?? 0),
      };
    }),
  };
}
