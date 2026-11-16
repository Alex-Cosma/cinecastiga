/*
 * The subclasses a domain leaves out (UX audit Z2-25, 16 November 2026): „fără 3 subclase (vezi limitele)” pointed at
 * „Ce include calculul”, a screen lower, without a link. The answer's own caveat names them (compile.ts: „Din
 * „medicamente” nu sunt numărate: Dale de cauciuc (33682000-4); …”); the pill lists them where it stands and offers to
 * count them too, by asking about the domain's catalogue code, which has no exclusions.
 */

export interface Subclass { name: string; code: string | null }

/** The pill that says the domain leaves subclasses out (describe.ts). */
export const SUBCLASSES_PILL = /^fără (?:o subclasă|(\d+) (?:de )?subclase) \(vezi limitele\)$/;

/** „−3 subclase”, the pill's short words. */
export function subclassesWords(words: string): string | null {
  const m = SUBCLASSES_PILL.exec(words.trim());
  if (!m) return null;
  return m[1] ? `−${m[1]} subclase` : "−1 subclasă";
}

/** The subclasses the answer's caveat names for its domain, each with its code when written. */
export function excludedSubclasses(caveats: readonly string[] | undefined): Subclass[] {
  const caveat = caveats?.find((c) => /^Din „[^”]+” nu sunt numărate: /.test(c));
  if (!caveat) return [];
  return caveat.replace(/^Din „[^”]+” nu sunt numărate: /, "").replace(/\.$/, "").split("; ").map((part) => {
    const m = /^(.*?)\s*\((\d{8}-\d)\)$/.exec(part.trim());
    return m ? { name: m[1]!.replace(/ş/g, "ș").replace(/ţ/g, "ț"), code: m[2]! } : { name: part.trim(), code: null };
  }).filter((s) => s.name);
}

/** The domain's one catalogue code, from its pill („Produse farmaceutice (33600000-6)”), to count it whole; null otherwise. */
export function wholeDomainCode(pills: readonly string[]): string | null {
  // A union of domains („A (45233000-9) + B (45221000-2)”, „+2 CPV”) has no one code to count whole.
  const codes = pills.flatMap((pill) => [...pill.matchAll(/\((\d{8}-\d)\)|\+\d+ CPV/g)].map((m) => m[1] ?? "+"));
  return codes.length === 1 && codes[0] !== "+" ? codes[0]! : null;
}
