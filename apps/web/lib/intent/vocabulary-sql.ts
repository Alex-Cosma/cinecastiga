import type { DbSql } from "@seap/db";
import { cleanName, onrcBirthYear } from "../format";
import { buildPlaces, type UatSource } from "./places";
import { entitiesByCui, entityCandidates, personsByExactName, suggestCpv } from "./vocabulary-queries";
import type { PlaceEntry, Vocabulary } from "./types";
import { personPatterns } from "./text";

/**
 * The SQL vocabulary: /api/suggest's CPV query, a non-collapsing entity
 * lookup and an exact ONRC name lookup (both with total counts). The place
 * gazetteer and the synonym list are small reference lists, loaded once per
 * process and kept in memory.
 *
 * Pool safety (review of 22 Oct 2026): the per-question lookups run inside
 * one read-only transaction, i.e. on one pooled connection. The shared lists
 * must therefore be loaded BEFORE that transaction opens (`loadSharedLists`),
 * never from inside it: otherwise N concurrent cold questions hold all N
 * connections and wait for an N+1th that never comes. A load that fails or
 * exceeds its time bound is evicted, never cached.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const LOAD_TIMEOUT_MS = 5000;

interface Slot<T> { at: number; value: Promise<T>; settled: boolean }
const cache = globalThis as unknown as {
  __seapIntentPlaces?: Slot<PlaceEntry[]>;
  __seapIntentSynonyms?: Slot<string[]>;
};
type SlotName = "__seapIntentPlaces" | "__seapIntentSynonyms";

function bounded<T>(load: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    load(),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("intent-vocabulary-timeout")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function cached<T>(slot: SlotName, load: () => Promise<T>): Promise<T> {
  const hit = cache[slot] as Slot<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const entry: Slot<T> = { at: Date.now(), value: bounded(load, LOAD_TIMEOUT_MS), settled: false };
  (cache as Record<string, unknown>)[slot] = entry;
  entry.value.then(
    () => { entry.settled = true; },
    () => { if (cache[slot] === (entry as unknown)) delete cache[slot]; },
  );
  return entry.value;
}

/** Tests only: forget the process-wide lists (simulates a cold start). */
export function resetSharedLists() {
  delete cache.__seapIntentPlaces;
  delete cache.__seapIntentSynonyms;
}

export async function loadPlaces(sql: DbSql): Promise<PlaceEntry[]> {
  const rows = (await sql`select siruta, name, tip, county from reference.uat`) as unknown as UatSource[];
  return buildPlaces(rows.map((r) => ({ siruta: Number(r.siruta), name: r.name, tip: r.tip, county: r.county })));
}

export async function loadSynonyms(sql: DbSql): Promise<string[]> {
  const rows = (await sql`select distinct lower(unaccent(term)) term from reference.cpv_synonym`) as unknown as { term: string }[];
  return rows.map((r) => r.term);
}

export interface SharedLists { places: PlaceEntry[]; synonyms: string[] }

/** The gazetteer and synonyms, cached; call on the pool, outside any transaction. */
export async function loadSharedLists(sql: DbSql, opts: { cache?: boolean } = {}): Promise<SharedLists> {
  const useCache = opts.cache ?? true;
  // allSettled: both loads finish (and a failed one is evicted) before the caller sees an error
  const [places, synonyms] = await Promise.allSettled([
    useCache ? cached("__seapIntentPlaces", () => loadPlaces(sql)) : bounded(() => loadPlaces(sql), LOAD_TIMEOUT_MS),
    useCache ? cached("__seapIntentSynonyms", () => loadSynonyms(sql)) : bounded(() => loadSynonyms(sql), LOAD_TIMEOUT_MS),
  ]);
  if (places.status === "rejected") throw places.reason;
  if (synonyms.status === "rejected") throw synonyms.reason;
  return { places: places.value, synonyms: synonyms.value };
}

const LETTER = /\p{L}/u;

/** Registry names sometimes start with a fiscal code ("`4278205 - Colegiul …"); readers need the name. */
function registryName(name: string | null): string {
  return cleanName(name).replace(/^[`'"]?\s*\d{4,10}\s*[-–]?\s*/, "").trim() || cleanName(name);
}

/**
 * Per-question lookups on `sql` (callers pass a read-only transaction with a
 * statement timeout) over the shared lists loaded beforehand. Once `signal`
 * aborts (the API's time budget), no further lookup starts.
 */
export function sqlVocabulary(sql: DbSql, shared: SharedLists, opts: { signal?: AbortSignal } = {}): Vocabulary {
  const live = <T>(run: () => Promise<T>): Promise<T> =>
    opts.signal?.aborted ? Promise.reject(new Error("intent-aborted")) : run();
  return {
    places: async () => shared.places,
    synonyms: async () => shared.synonyms,
    cpv: (q) => live(async () => (await suggestCpv(sql, q)).map((r) => ({ term: r.term, cpvName: r.cpv_name }))),
    entities: (role, q) => live(async () => {
      const rows = await entityCandidates(sql, role, q);
      return {
        hits: rows.map((r) => ({ id: Number(r.entity_id), name: registryName(r.name_display), county: r.county })),
        total: Number(rows[0]?.total ?? 0),
      };
    }),
    entitiesByCui: (cui) => live(async () => (await entitiesByCui(sql, cui)).map((r) => ({
      role: r.role,
      hit: { id: Number(r.entity_id), name: registryName(r.name_display), county: r.county },
    }))),
    personsNamed: (names) => live(async () => {
      // A slow ONRC lookup (cold index, very common short name) must not abort the whole question:
      // it runs in a savepoint, and a statement timeout there only drops the person part.
      const tx = sql as unknown as { savepoint?: <T>(run: (sp: DbSql) => Promise<T>) => Promise<T> };
      let rows: Awaited<ReturnType<typeof personsByExactName>>;
      try {
        rows = tx.savepoint ? await tx.savepoint((sp) => personsByExactName(sp, names)) : await personsByExactName(sql, names);
      } catch (error) {
        if ((error as { code?: string }).code === "57014") return { hits: [], total: 0, exhaustive: false, timedOut: true };
        throw error;
      }
      return {
        hits: rows.map((r) => ({
          key: r.person_key,
          name: cleanName(r.nm),
          birthYear: onrcBirthYear(r.by, r.sy).birthYear,
          birthLocality: r.bl && LETTER.test(r.bl) ? r.bl : null,
          nFirms: Number(r.nf ?? 0),
        })),
        total: Number(rows[0]?.total ?? 0),
        exhaustive: personPatterns(names.map((n) => n.normalize("NFKC").replace(/[\s-]+/g, " ").trim())).exhaustive,
      };
    }),
  };
}
