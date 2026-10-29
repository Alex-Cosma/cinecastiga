import { LOCAL_ADMIN_KIND, type AskSpec } from "./spec";
import { entityLabel, type QuestionSpec } from "./question-ui";

/*
 * The map's lens (F5, plan §4.4 P6, map final §3.7), for the title, the
 * strip and the answer alike: `measure` (Valoare, Înregistrări, Pe locuitor)
 * or `map.lens` (Firme din județ, Cota firmei) on the question. It changes
 * the colours, the order and the answer's title, never the selection.
 */

export type MapLensValue = "value" | "value_per_capita" | "seat" | "count" | "share";
type LensSpec = Pick<QuestionSpec, "measure" | "filters"> & { map?: AskSpec["map"] };

/** A firm or a person's firms on the question: the map is where they sell (map final §3.4). */
export const mapFirm = (spec: Pick<QuestionSpec, "filters">): boolean => {
  const f = spec.filters;
  return Boolean(f.supplierId || f.supplierName || f.adminPersonKey || f.adminName);
};
/** The map of „Primăriile și consiliile județene” (map final §3.3). */
export const mapLocalAdmin = (spec: Pick<QuestionSpec, "filters">): boolean => spec.filters.authorityKind === LOCAL_ADMIN_KIND;

/** The lenses a question offers (map final §3.7): beside a firm the share, on the local administrations per inhabitant. */
export function offeredLenses(spec: Pick<QuestionSpec, "filters">): readonly MapLensValue[] {
  if (mapFirm(spec)) return ["value", "share", "count"];
  return mapLocalAdmin(spec) ? ["value", "value_per_capita", "seat", "count"] : ["value", "seat", "count"];
}

/** The lens the question asks for (map.lens, else the measure), Valoare where it does not offer it (§3.7 „Implicit”). */
export function askedLens(spec: LensSpec): MapLensValue {
  const asked: MapLensValue = spec.map?.lens ?? (spec.measure === "count" || spec.measure === "value_per_capita" ? spec.measure : "value");
  return offeredLenses(spec).includes(asked) ? asked : "value";
}

/** The question after a lens (the strip's path "measure"): the measure, and map.lens for seat and share. */
export function withLens<S extends { measure: string; map?: AskSpec["map"] }>(spec: S, lens: string): S {
  const next = { ...spec };
  if (lens === "seat" || lens === "share") { next.measure = "value"; next.map = { lens }; }
  else { next.measure = lens; delete next.map; }
  return next;
}

/** The question without its firm or person: the share's whole (map final §3.10). */
export function withoutFirm<S extends QuestionSpec>(spec: S): S {
  const filters = { ...spec.filters };
  for (const key of ["supplierId", "supplierName", "adminPersonKey", "adminName"]) delete filters[key];
  const next = { ...spec, filters };
  delete next.map;
  return next;
}

const SENTENCE = /^Cum se împart (achizițiile|contractele)(.*?) pe județe(.*)$/s;

/**
 * The answer's title after its lens (map final §3.7, the declared exception to R11): the sentence on Valoare, else
 * „Cum se împart pe județe înregistrările achizițiilor …?”, „Cât revine pe locuitor din …, pe județe, …?”, „Ce parte
 * din … câștigă firmele cu sediul în același județ, …?”, „Ce parte din … din fiecare județ câștigă PORR CONSTRUCT,
 * …?”. `title` is the question's sentence and tail, `whole` the same without the firm (the share's).
 */
export function lensTitle(title: string, lens: MapLensValue, spec: Pick<QuestionSpec, "filters">, whole?: string): string {
  const m = SENTENCE.exec(title);
  if (lens === "value" || !m) return title;
  const [, noun, middle, rest] = m as unknown as [string, string, string, string];
  if (lens === "count") return `Cum se împart pe județe înregistrările ${noun === "achizițiile" ? "achizițiilor" : "contractelor"}${middle}${rest}`;
  if (lens === "value_per_capita") return `Cât revine pe locuitor din ${noun}${middle}, pe județe${rest}`;
  if (lens === "seat") return `Ce parte din ${noun}${middle} câștigă firmele cu sediul în același județ${rest}`;
  const w = whole ? SENTENCE.exec(whole) : null;
  const [, wNoun, wMiddle, wRest] = (w ?? m) as unknown as [string, string, string, string];
  const f = spec.filters;
  const firm = f.adminPersonKey || f.adminName ? `firmele conduse azi de ${String(f.adminName ?? "persoana aleasă")}` : entityLabel(spec as QuestionSpec, "supplier");
  return `Ce parte din ${wNoun}${wMiddle} din fiecare județ câștigă ${firm}${wRest}`;
}
