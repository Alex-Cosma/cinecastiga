import type { DbSql } from "@seap/db";
import { cleanName, onrcBirthYear } from "../format";
import { buildPlaces, type UatSource } from "./places";
import { suggestAuthorities, suggestCpv, suggestPersons, suggestSuppliers } from "./vocabulary-queries";
import type { PlaceEntry, Vocabulary } from "./types";

/**
 * The SQL vocabulary: /api/suggest's queries for CPV, authorities, suppliers
 * and persons; the place gazetteer and the synonym list are small, read once
 * per process and kept in memory (reference data, changed only by imports).
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

/**
 * `sql` is used for the per-question lookups (callers pass a read-only
 * transaction with a statement timeout); `shared` loads the cached lists.
 */
export function sqlVocabulary(sql: DbSql, shared: DbSql = sql, opts: { cache?: boolean } = {}): Vocabulary {
  const useCache = opts.cache ?? true;
  return {
    places: () => (useCache ? cached("__seapIntentPlaces", () => loadPlaces(shared)) : loadPlaces(shared)),
    synonyms: () => (useCache ? cached("__seapIntentSynonyms", () => loadSynonyms(shared)) : loadSynonyms(shared)),
    cpv: async (q) => (await suggestCpv(sql, q)).map((r) => ({ term: r.term, cpvName: r.cpv_name })),
    authorities: async (q) =>
      (await suggestAuthorities(sql, q))
        .filter((r) => r.name_display)
        .map((r) => ({ id: r.entity_id ? Number(r.entity_id) : null, name: cleanName(r.name_display), county: r.county })),
    suppliers: async (q) =>
      (await suggestSuppliers(sql, q))
        .filter((r) => r.name_display)
        .map((r) => ({ id: r.entity_id ? Number(r.entity_id) : null, name: cleanName(r.name_display), county: r.county })),
    persons: async (q) =>
      (await suggestPersons(sql, q)).map((r) => ({
        key: r.person_key,
        name: cleanName(r.nm),
        birthYear: onrcBirthYear(r.by, r.sy).birthYear,
        birthLocality: r.bl && /\p{L}/u.test(r.bl) ? r.bl : null,
        nFirms: Number(r.nf ?? 0),
      })),
  };
}
