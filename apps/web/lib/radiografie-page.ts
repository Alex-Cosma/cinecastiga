import { canonicalEntityId, type DbSql } from "@seap/db";
import { readRadiografieEvidence, type RadiografieSelection } from "./radiografie-evidence";
import { readRecordTitles, type SourceEvidence } from "./source-evidence";
import { groupSourceRecords, sourcePage } from "./source-groups";
import { ceilingEraOn, type CeilingEra } from "./signal-page-words";

/*
 * What the sources page of a Radiografie finding reads (/entitati/{id}/radiografie/surse, owner 7 November 2026, on the
 * record template): the institution, the finding itself (a repeated lot pattern with its members, or a pair's direct
 * acquisitions adding up over the ceiling in force), its records (the same selection as its CSV and a capture) and the
 * titles of the rows on screen. Run on the caller's read-only transaction.
 */

export type PatternKind = "rotatie" | "impartire" | "maturare" | "consortiu";

export interface RadiografiePattern {
  kind: PatternKind | string;
  cpvClass: string;
  cpvName: string | null;
  members: { id: string; name: string }[];
  /** Notices the pattern repeats in. */
  reps: number;
  y0: string | null;
  y1: string | null;
  /** Exact recorded value of the pattern's contracts. */
  valueExact: string;
  /** Lots with a single tender, of those whose tenders are known. */
  single: number;
  known: number;
  sharedAdmin: string | null;
}

export interface RadiografieSlice {
  supplier: { id: string; name: string };
  cpvClass: string | null;
  cpvName: string | null;
  from: string | null;
  to: string | null;
  /** Acquisitions recorded in the window. */
  n: number;
  sumExact: string;
  ceilingExact: string | null;
  ratio: number | null;
  /** da_ceiling_works / da_ceiling_goods_services. */
  type: string | null;
  /** The ceiling's era on the window's first day (its value, dates and law). */
  era: CeilingEra | null;
  methodology: string;
}

export interface RadiografieSourcesData {
  authority: { id: string; name: string; county: string | null };
  pattern: RadiografiePattern | null;
  slice: RadiografieSlice | null;
  evidence: SourceEvidence;
  titles: Record<string, string>;
}

export async function readRadiografieSources(sql: DbSql, authorityId: string, selection: RadiografieSelection, page: number): Promise<RadiografieSourcesData | null> {
  const evidence = await readRadiografieEvidence(sql, authorityId, selection);
  if (!evidence) return null;
  const id = await canonicalEntityId(sql, authorityId);
  const [authority] = await sql`select id::text id, name_display name, county from core.entities where id = ${id}`;
  if (!authority) return null;
  let pattern: RadiografiePattern | null = null, slice: RadiografieSlice | null = null;
  if (selection.type === "pattern") {
    const [p] = await sql`select p.kind, p.cpv_class, p.reps, p.y0, p.y1, p.value::text value, p.single, p.known, p.shared_admin,
        array(select m::text from unnest(p.member_ids) m) member_ids, p.member_names,
        (select min(name_ro) from core.cpv_codes where code like p.cpv_class || '0000%') cpv_name
      from marts.lot_patterns p where p.id = ${selection.patternId} and p.authority_id = ${id}`;
    if (p) {
      const ids = (p.member_ids as string[]) ?? [], names = (p.member_names as string[]) ?? [];
      pattern = {
        kind: String(p.kind), cpvClass: String(p.cpv_class), cpvName: (p.cpv_name as string | null) ?? null,
        members: ids.map((m, i) => ({ id: m, name: names[i] ?? "" })),
        reps: Number(p.reps), y0: p.y0 ?? null, y1: p.y1 ?? null, valueExact: String(p.value),
        single: Number(p.single), known: Number(p.known), sharedAdmin: (p.shared_admin as string | null) ?? null,
      };
    }
  } else {
    const [s] = await sql`select supplier_id::text supplier_id, supplier_name, cpv_class, cpv_name, d0::text d0, d1::text d1, n,
        sum_window::text sum_window, ceiling::text ceiling, ratio::float8 ratio, acquisition_type, methodology_version
      from marts.da_slicing where authority_id = ${id} and supplier_id = ${selection.supplierId}`;
    if (s) slice = {
      supplier: { id: String(s.supplier_id), name: String(s.supplier_name ?? "") },
      cpvClass: s.cpv_class ?? null, cpvName: s.cpv_name ?? null, from: s.d0 ?? null, to: s.d1 ?? null,
      n: Number(s.n), sumExact: String(s.sum_window), ceilingExact: s.ceiling ?? null,
      ratio: s.ratio == null ? null : Number(s.ratio), type: s.acquisition_type ?? null,
      era: ceilingEraOn(s.d0 ?? null, s.acquisition_type ?? null), methodology: String(s.methodology_version ?? ""),
    };
  }
  const { rows } = sourcePage(groupSourceRecords(evidence.records), page);
  const titles = Object.fromEntries(await readRecordTitles(sql, rows.flatMap((g) => g.records)));
  return { authority: { id: String(authority.id), name: String(authority.name ?? ""), county: authority.county ?? null }, pattern, slice, evidence, titles };
}
