import { sumDecimalStrings } from "./ask/evidence";
import { countWords } from "./ask/answer-text";
import { DA_CEILING_ERAS } from "@seap/domain";
import type { SourceRecord } from "./source-evidence";

/*
 * The numbers a source page's head says (/semnale/[id], an entity's Radiografie sources), owner, 7 November 2026: the
 * finding with its key number against its reference. Pure, so the words and the figures are tested apart from the
 * reads. Shares are for reading; every amount a reader may cite stays an exact decimal string.
 */

/** A share in words: whole percents; "peste 99%" short of all, never a rounded "100%"; "sub 1%" above zero. */
export function shareWords(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  if (share >= 1) return "100%";
  if (share >= 0.995) return "peste 99%";
  if (share < 0.005) return "sub 1%";
  return `${Math.round(share * 100)}%`;
}

/** A ratio with a decimal comma: "4,4", "1,02" (`digits` decimals, trailing zeros kept for a steady reading). */
export function ratioNumber(ratio: number, digits = 1): string {
  return Number.isFinite(ratio) ? ratio.toFixed(digits).replace(".", ",") : "—";
}

export interface PartyShare {
  /** The entity id; null for an unidentified party (its source name only). */
  id: string | null;
  name: string;
  /** Exact sum of its records' values (a consortium member's share counts once, its own). */
  valueExact: string;
  value: number;
  /** Distinct records (contracts or acquisitions), not consortium rows. */
  count: number;
  /** Its value over the selection's, 0..1. */
  share: number;
}

type Party = Pick<SourceRecord, "src" | "refId" | "valueExact" | "authorityId" | "authority" | "supplierId" | "supplier">;

/** The parties of one side of a selection with their exact sums and shares, largest first. */
export function partyShares(records: readonly Party[], side: "authority" | "supplier"): PartyShare[] {
  const groups = new Map<string, { id: string | null; name: string; values: string[]; refs: Set<string> }>();
  records.forEach((r, i) => {
    const id = side === "authority" ? r.authorityId : r.supplierId;
    const name = (side === "authority" ? r.authority : r.supplier) ?? "";
    const key = id ? `id:${id}` : `name:${name}`;
    const group = groups.get(key) ?? { id: id ?? null, name, values: [], refs: new Set<string>() };
    group.values.push(r.valueExact ?? "0");
    group.refs.add(r.refId ? `${r.src}:${r.refId}` : `row:${i}`);
    groups.set(key, group);
  });
  const total = Number(sumDecimalStrings(records.map((r) => r.valueExact ?? "0")));
  return [...groups.values()].map((g) => {
    const valueExact = sumDecimalStrings(g.values);
    const value = Number(valueExact);
    return { id: g.id, name: g.name, valueExact, value, count: g.refs.size, share: total > 0 ? value / total : 0 };
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ro"));
}

/** `a - b`, exactly, for two decimal strings ("137330" − "135060" = "2270.00"). */
export function decimalDifference(a: string, b: string): string {
  return sumDecimalStrings([a, b.startsWith("-") ? b.slice(1) : `-${b}`]);
}

/** A list of names in Romanian: "A", "A și B", "A, B și C". */
export function joinWords<T>(items: readonly T[], sep = ", ", last = " și "): (T | string)[] {
  const out: (T | string)[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(i === items.length - 1 ? last : sep);
    out.push(item);
  });
  return out;
}

export interface CeilingEra { from: string; to: string | null; value: number; law: string; works: boolean }

/**
 * The direct-acquisition ceiling in force on `date` for a type (da_ceiling_works / da_ceiling_goods_services), with its
 * era's dates and law; null for an unknown type or a date before the eras.
 */
export function ceilingEraOn(date: string | null, type: string | null): CeilingEra | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const works = type === "da_ceiling_works" ? true : type === "da_ceiling_goods_services" ? false : null;
  if (works === null) return null;
  const day = date.slice(0, 10);
  const era = DA_CEILING_ERAS.find((e) => day >= e.validFrom && (!e.validTo || day < e.validTo));
  if (!era) return null;
  // validTo is exclusive: the last day in force is the day before.
  const to = era.validTo ? new Date(Date.parse(`${era.validTo}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : null;
  return { from: era.validFrom, to, value: works ? era.works : era.goodsServices, law: era.law, works };
}

/** Whole days from one calendar day to another (inclusive of both): 04.06 → 22.07 is 49 days. */
export function daySpan(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`), b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86_400_000) + 1 : null;
}

/** A Radiografie lot pattern's kind, named as the Radiografie names it (LotMatrix). */
export const PATTERN_LABEL: Record<string, string> = {
  rotatie: "Câștigători care reapar împreună",
  impartire: "Împărțire repetată între câștigători",
  maturare: "Același câștigător în toate loturile",
  consortiu: "Asociere repetată",
};

/** A lot pattern as a finding, with how many notices it repeats in. */
export function patternTitle(kind: string, reps: number): string {
  const notices = countAnunturi(reps);
  switch (kind) {
    case "consortiu": return `Aceeași asociere a câștigat ${notices}`;
    case "impartire": return `Aceleași firme își împart loturile în ${notices}`;
    case "maturare": return `Același câștigător ia toate loturile în ${notices}`;
    default: return `Aceiași câștigători reapar împreună în ${notices}`;
  }
}
const countAnunturi = (n: number) => countWords(n, "anunț", "anunțuri");

/**
 * The warnings of a Radiografie selection as its sources page says them: the pattern's note speaks of the matrix of
 * the Radiografie page, which is not on the sources page, so it is said of the table on screen instead.
 */
export function radiografieWarnings(warnings: readonly string[]): string[] {
  return warnings.map((w) => w.startsWith("Sunt prezentate cotele furnizorilor selectați")
    ? "Tabelul arată cotele firmelor din tipar în contractele anunțurilor lui. Un contract al unei asocieri apare o dată, cu cota fiecărui membru; nu se adună de două ori."
    : w);
}
