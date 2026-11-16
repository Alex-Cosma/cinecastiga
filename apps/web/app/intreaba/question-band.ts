import type { AskSpec } from "../../lib/ask/spec";
import { KIND_WORDS } from "../../lib/ask/question-ui";
import { cpvTermParts } from "../../lib/ask/cpv-terms";
import { spellTerm } from "../../lib/ask/term-spelling";
import { countyName } from "../../lib/counties";
import { cleanName } from "../../lib/format";

/*
 * The question in a few words, for the band that keeps it at hand on a phone once its title has scrolled away (UX
 * audit Z2-37, 16 November 2026): „„medicamente” · spitale · Cluj · 2024”. What was bought (or the institution or
 * firm the question is about), who bought it, where, when. The band cuts it with „…” where it does not fit.
 */

/** A locality's name without its kind and county: „Municipiul Cluj-Napoca (Cluj)” → „Cluj-Napoca”. */
const placeName = (name: string) => name.replace(/\s*\([^)]*\)$/, "").replace(/^(?:Municipiul|Orașul|Comuna|Sectorul)\s+/i, "");

/** The first words („„medicamente””, the firm's name) and the rest, or null when the question names nothing to say. */
export function questionGist(spec: AskSpec, cpvName?: string | null): { lead: string; rest: string[] } | null {
  const f = spec.filters;
  const parts: string[] = [];
  const term = f.cpvTerm === undefined ? "" : String(f.cpvTerm).trim();
  if (term) {
    parts.push(cpvTermParts(term).map((part) => /^\d[\d\s-]*$/.test(part)
      ? cpvName && cpvTermParts(term).length === 1 ? cpvName : `CPV ${part.replace(/\s+/g, "")}`
      : `„${spellTerm(part)}”`).join(" + "));
  }
  for (const name of [f.authorityName, f.supplierName]) if (name) parts.push(cleanName(String(name)));
  if (f.authorityKind && KIND_WORDS[String(f.authorityKind)]) parts.push(KIND_WORDS[String(f.authorityKind)]!.bare);
  if (f.uatName) parts.push(placeName(String(f.uatName)));
  else if (f.county) parts.push(countyName(String(f.county)));
  const from = f.yearFrom, to = f.yearTo;
  if (from !== undefined || to !== undefined) parts.push(from === to || to === undefined ? String(from ?? to) : from === undefined ? `până în ${to}` : `${from}–${to}`);
  const [lead, ...rest] = parts;
  return lead ? { lead, rest } : null;
}
