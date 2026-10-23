/**
 * Several subjects in one AskFilters.cpvTerm ("parcuri + spatii verzi"): the
 * engine grounds each one and counts their union (ground.ts unionCpvParts),
 * each record once. No database import, so the interpreter's spec mapping
 * and client code can use it.
 */
export const CPV_TERM_SEPARATOR = " + ";

/** The subjects of a cpvTerm ("parcuri + spatii verzi" → two); a single subject stays whole. */
export function cpvTermParts(term: string): string[] {
  const parts = term.split("+").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? [...new Set(parts)] : [term];
}

/** Several subjects as one cpvTerm the engine grounds as their union. */
export function joinCpvTerms(terms: string[]): string {
  return [...new Set(terms)].join(CPV_TERM_SEPARATOR);
}
