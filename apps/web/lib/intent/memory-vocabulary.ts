import { aliasQueries, queryTokens } from "../ask/entity-alias";
import { buildPlaces, catalogUatSource, type UatSource } from "./places";
import { fold } from "./text";
import type { CpvHit, EntityHit, PersonHit, PlaceEntry, Vocabulary } from "./types";

/**
 * In-memory Vocabulary with /api/suggest's matching semantics, for unit tests
 * and offline evaluation of interpreters. Not used by the running site.
 */
export interface MemoryFixture {
  uats?: UatSource[];
  catalog: { code: string; name: string }[];
  synonyms: { term: string; prefix: string }[];
  authorities: (EntityHit & { total: number })[];
  suppliers: (EntityHit & { total: number })[];
  persons: PersonHit[];
}

const f = (s: string) => fold(s).trim();

export function memoryVocabulary(fx: MemoryFixture): Vocabulary {
  let places: PlaceEntry[] | null = null;
  const byTotal = (a: { total: number }, b: { total: number }) => b.total - a.total;
  const strip = ({ total: _t, ...e }: EntityHit & { total: number }): EntityHit => e;
  return {
    async places() {
      places ??= buildPlaces(fx.uats ?? catalogUatSource());
      return places;
    },
    async synonyms() {
      return fx.synonyms.map((s) => f(s.term));
    },
    async cpv(q): Promise<CpvHit[]> {
      const code = /^(\d{2,8})(?:-\d)?$/.exec(q.replace(/\s+/g, ""));
      if (code) return fx.catalog.filter((c) => c.code.startsWith(code[1]!)).slice(0, 5).map((c) => ({ term: c.code, cpvName: c.name }));
      const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (!words.length) return [];
      const phrase = words.join(" ");
      const rows: { term: string; cpvName: string | null; priority: number; len: number }[] = [];
      for (const c of fx.catalog) {
        const name = f(c.name);
        if (!words.every((w) => name.includes(w))) continue;
        rows.push({ term: c.code, cpvName: c.name, priority: name === phrase ? 0 : name.startsWith(phrase) ? 1 : name.includes(phrase) ? 2 : 3, len: c.name.length });
      }
      const seen = new Set<string>();
      for (const s of fx.synonyms) {
        const term = f(s.term);
        if (seen.has(term) || !words.every((w) => term.includes(w))) continue;
        seen.add(term);
        const cpvName = fx.catalog.filter((c) => c.code.startsWith(s.prefix)).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))[0]?.name ?? null;
        rows.push({ term: s.term, cpvName, priority: term === phrase ? 0 : 4, len: s.term.length });
      }
      return rows
        .sort((a, b) => a.priority - b.priority || a.len - b.len || a.term.localeCompare(b.term))
        .slice(0, 8)
        .map(({ term, cpvName }) => ({ term, cpvName }));
    },
    async authorities(q) {
      const pats = aliasQueries(q);
      const toks = queryTokens(q);
      return fx.authorities
        .filter((e) => {
          const name = f(e.name);
          return pats.some((p) => name.includes(p)) || (toks.length > 1 && toks.every((t) => name.includes(t)));
        })
        .sort(byTotal).slice(0, 5).map(strip);
    },
    async suppliers(q) {
      const toks = queryTokens(q);
      return fx.suppliers
        .filter((e) => {
          const name = f(e.name);
          return name.includes(q) || (toks.length > 1 && toks.every((t) => name.includes(t)));
        })
        .sort(byTotal).slice(0, 5).map(strip);
    },
    async persons(q) {
      if (q.length < 4) return [];
      return fx.persons.filter((p) => f(p.name).includes(q)).sort((a, b) => b.nFirms - a.nFirms).slice(0, 4);
    },
  };
}
