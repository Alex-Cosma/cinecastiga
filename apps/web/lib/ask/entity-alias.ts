/**
 * Colloquial → registered-name aliases for Romanian public institutions.
 *
 * People search by TYPE + place ("primăria Buzău", "CJ Cluj"), but the
 * registry names are legal forms: the city hall of Buzău is "MUNICIPIUL
 * BUZAU", the county council is "JUDETUL CLUJ (CONSILIUL JUDETEAN)". This
 * expands a folded query into every registered-name shape it could mean;
 * callers OR the patterns together. A token-AND fallback (all words present,
 * any order) covers everything the rules don't.
 */

/** Expects an already-folded query (lowercase, no diacritics). */
export function aliasQueries(folded: string): string[] {
  const q = folded.replace(/\s+/g, " ").trim();
  const out = new Set<string>([q]);

  // primăria X → the UAT's legal names (city halls are registered as the UAT)
  const prim = /^prim[aă]?ri[ae]?\s+(.+)$/.exec(q);
  if (prim) {
    const rest = prim[1]!;
    const sec = /^sector(?:ul)?\s*(\d)$/.exec(rest);
    if (sec) {
      out.add(`sectorul ${sec[1]}`);
      out.add(`sector ${sec[1]}`);
    } else {
      out.add(`municipiul ${rest}`);
      out.add(`orasul ${rest}`);
      out.add(`oras ${rest}`);
      out.add(`comuna ${rest}`);
    }
  }

  // CJ X / consiliul județean X → "JUDETUL X (CONSILIUL JUDETEAN)"
  const cj = /^(?:cj|consiliul?\s+judetean(?:\s+al)?)\s+(.+)$/.exec(q);
  if (cj) {
    out.add(`judetul ${cj[1]}`);
    out.add(`consiliul judetean ${cj[1]}`);
  }

  // prefectura X → instituția prefectului
  const pref = /^prefectura\s+(.+)$/.exec(q);
  if (pref) {
    out.add(`institutia prefectului ${pref[1]}`);
    out.add(`prefectul ${pref[1]}`);
  }

  return [...out];
}

/** Tokens for the all-words-anywhere fallback (skips 1-letter noise). */
export function queryTokens(folded: string): string[] {
  return folded
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 1);
}
