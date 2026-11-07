import { encodeSpec } from "./ask/permalink";
import { personClipSpec } from "./ask/site-links";
import { cleanName } from "./format";
import { FLAG_META, flagFindingLabel } from "./flags";
import type { CaptureSummary } from "./evidence-captures-shared";

/*
 * What a saved item of a dossier is called, where it opens and what it is worth, in one place for the dossier, its
 * frozen-sources page ("fișa de probă"), the citation and the export (owner, 7 November 2026). Pure: no database.
 */

export interface ClipLike {
  id: string;
  kind: string;
  refId: string | null;
  spec: unknown;
  snapshot: Record<string, unknown> | null;
  note: string | null;
  createdAt?: string;
  capture?: CaptureSummary | null;
}

export const clipKindLabel: Record<string, string> = { document_quote: "Pasaj din document", entity: "Entitate", contract: "Contract", notice: "Anunț", person: "Persoană", query: "Întrebare salvată", flag: "Semnal", note: "Notă", da: "Achiziție directă", signal: "Semnal", radiografie: "Radiografie", monitoring: "Modificare urmărită" };

/** The group a link picker shows the item under (plural, as a reader scans a list). */
export const clipKindGroup: Record<string, string> = { contract: "Contracte", da: "Achiziții directe", notice: "Anunțuri", entity: "Instituții și firme", person: "Persoane", query: "Întrebări salvate", flag: "Semnale", signal: "Semnale", radiografie: "Radiografii", monitoring: "Modificări urmărite", document_quote: "Pasaje din documente", note: "Note" };

export function clipTitle(c: ClipLike): string {
  const s = c.snapshot ?? {};
  if (c.kind === "monitoring" && typeof s.watchTitle === "string") return `Actualizare · ${s.watchTitle}`;
  if (c.kind === "entity" && typeof s.name === "string" && s.name.trim()) return cleanName(s.name);
  if (typeof s.title === "string" && s.title.trim()) return c.kind === "entity" || c.kind === "person" ? cleanName(s.title) : s.title;
  if (typeof s.name === "string") return cleanName(s.name);
  if (Array.isArray(s.pills)) return s.pills.join(" · ");
  if (s.code && FLAG_META[String(s.code)]) return `${flagFindingLabel(String(s.code))}${s.entityName ? ` · ${cleanName(String(s.entityName))}` : ""}`;
  if (s.noticeNo) return `Anunț ${s.noticeNo}`;
  if (c.kind === "note") return c.note?.split("\n")[0]?.slice(0, 100) || "Notă salvată";
  return `${clipKindLabel[c.kind] ?? "Dovadă"}${c.refId ? ` · ${c.refId}` : ""}`;
}

/** A question saved from Întreabă reopens with its sources; a comparison or a path has no stable reopening link. */
export function clipQueryHref(c: ClipLike): string | null {
  if (!c.spec) return null;
  const s = c.snapshot ?? {};
  if (s.connection || s.peer) return null;
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(c.spec as never))}&drill=1${s.evidenceScope ? `&evidence=${encodeURIComponent(JSON.stringify(s.evidenceScope))}` : ""}${s.evidenceOptions ? `&sourceFilters=${encodeURIComponent(JSON.stringify(s.evidenceOptions))}` : ""}`;
}

/** A Radiografie selection reopens on its sources page (the URL contract: tip=pattern&tipar=<id>[&fingerprint=] or tip=slicing&furnizor=<id>). */
export function radiografieHref(c: ClipLike): string | null {
  const spec = c.spec && typeof c.spec === "object" && !Array.isArray(c.spec) ? c.spec as Record<string, unknown> : null;
  if (!spec || !c.refId) return null;
  const base = `/entitati/${encodeURIComponent(c.refId)}/radiografie/surse`;
  if (spec.type === "slicing" && typeof spec.supplierId === "string") return `${base}?tip=slicing&furnizor=${encodeURIComponent(spec.supplierId)}`;
  if (spec.type === "pattern" && typeof spec.patternId === "string") {
    const bound = c.capture?.scope?.sourceBinding?.fingerprint;
    const fingerprint = typeof spec.expectedFingerprint === "string" ? spec.expectedFingerprint : typeof bound === "string" ? bound : null;
    return `${base}?tip=pattern&tipar=${encodeURIComponent(spec.patternId)}${fingerprint ? `&fingerprint=${fingerprint}` : ""}`;
  }
  return null;
}

/** The item's own page on the site (public), or null when it has none. */
export function clipHref(c: ClipLike): string | null {
  const s = c.snapshot ?? {};
  switch (String(c.kind)) {
    case "document_quote": return s.contractId && c.refId ? `/contracte/${s.contractId}?document=${c.refId}&page=${s.page}` : null;
    case "entity": return c.refId ? `/entitati/${c.refId}` : null;
    case "contract": return c.refId ? `/contracte/${c.refId}` : null;
    case "notice": return c.refId ? `/anunturi/${c.refId}` : null;
    case "da": return c.refId ? `/achizitii/${c.refId}` : null;
    case "query": return clipQueryHref(c);
    case "person": return c.refId ? `/intreaba?spec=${encodeURIComponent(encodeSpec(personClipSpec(c.refId)))}` : null;
    case "flag": return c.refId ? `/entitati/${c.refId}` : null;
    case "signal": return c.refId ? `/semnale/${c.refId}` : null;
    case "radiografie": return radiografieHref(c);
    default: return null;
  }
}

/** The SEAP page of a saved contract, acquisition or notice, from its saved version. */
export function clipSourceUrl(c: ClipLike): string | null {
  const s = c.snapshot ?? {};
  if (Array.isArray(s.sourceUrls) && typeof s.sourceUrls[0] === "string") return s.sourceUrls[0];
  if (c.kind === "da" && c.refId) return `https://e-licitatie.ro/pub/direct-acquisition/view/${c.refId}`;
  if (c.kind === "notice" && c.refId) return `https://e-licitatie.ro/pub/notices/ca-notices/view-c/${c.refId}`;
  if (typeof s.sourceUrl === "string" && /^https:\/\//.test(s.sourceUrl)) return s.sourceUrl;
  return null;
}

const exact = (value: unknown): string | null => typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;

/** "lei" for a value in RON (or of unrecorded currency, as SEAP records them), else the currency's own code: a
 * contract's original value in EUR is never printed as lei. */
export function moneyUnit(currency: unknown): string {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return !code || code.includes("RON") || code === "LEI" ? "lei" : code;
}

/**
 * The item's own exact value and what it is, when it has one: a contract's full value, an acquisition's value, the
 * sum of a selection's records. Never a rounded headline: the capture's exact decimals are the value (owner,
 * 7 November 2026).
 */
export function clipValue(c: ClipLike): { exact: string; label: string; unit: string } | null {
  const s = c.snapshot ?? {};
  if (c.kind === "contract") {
    const full = exact(s.contractValueFull) ?? exact(s.valueExact);
    return full ? { exact: full, label: "valoarea contractului", unit: moneyUnit(s.currency) } : null;
  }
  if (c.kind === "da") {
    const value = exact(s.valueExact) ?? exact(s.valueRon);
    return value ? { exact: value, label: "valoarea achiziției", unit: "lei" } : null;
  }
  if (c.kind === "notice") {
    const value = exact(s.originalNoticeValueExact);
    return value ? { exact: value, label: "valoarea din anunț", unit: moneyUnit(s.originalNoticeCurrency ?? s.currency) } : null;
  }
  const total = c.capture?.status === "complete" ? c.capture.totalExact : exact(s.totalExact);
  return total ? { exact: total, label: "totalul înregistrărilor păstrate", unit: "lei" } : null;
}

/** The item's date as the source gives it (YYYY-MM-DD), when it is one record. */
export function clipDate(c: ClipLike): string | null {
  const s = c.snapshot ?? {};
  return ["contract", "da"].includes(c.kind) && typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.date) ? s.date.slice(0, 10) : null;
}
