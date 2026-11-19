import type { DbSql } from "@seap/db";
import { riskActive } from "./entity-card";
import { fold } from "./predicates";
import { countyDisplay } from "./resolved-spec";
import { hasFlag, historicDay, listRows, scatterOrder, type ScatterInput, type ScoredRow } from "./scatter";
import { SCATTER_LIST_PAGE_SIZE, scatterListColumns } from "./scatter-list-columns";
import {
  SCATTER_CLOUD_MIN_DAS, SCATTER_CLOUD_MIN_PROFILES, SCATTER_LIST_MIN_DAS, activeScatterFlag, leavesHistoric, scatterFlagsOf, scatterRank, type ScatterListRow,
} from "./scatter-shared";
import { channelWhere, facetOf, type Channel, type FacetRequest, type FilterSource } from "../table-filters/server/query";
import type { Facet, FilterState } from "../table-filters/types";

/*
 * The whole list of the risk map, a page at a time, under the column filters (owner, 19 November 2026, variant B: no
 * „Arată încă 10” over the first 50; pagination and a funnel on each column over every profile of the list). The list
 * is the answer's own: the same group, floor of acquisitions, signal and order (scatter.ts), so page 1 without filters
 * is the answer's first rows.
 */

type Fragment = ReturnType<DbSql>;
const frag = (query: unknown): Fragment => query as Fragment;
const like = (term: string) => `%${fold(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The list's rows before any column filter, as scatterAnswer lists them. */
async function listSource(s: DbSql, input: ScatterInput): Promise<{ source: FilterSource; channel: Channel }> {
  const { spec, role } = input;
  const flag = activeScatterFlag(spec), flags = scatterFlagsOf(role);
  const group = frag(s`${input.where} and ef.cri is not null`);
  const [size] = (await s`select count(*)::int n from marts.entity_flags ef where ${group}`) as unknown as { n: number }[];
  const listMin = Number(size?.n ?? 0) < SCATTER_CLOUD_MIN_PROFILES ? SCATTER_CLOUD_MIN_DAS : SCATTER_LIST_MIN_DAS;
  const where = frag(s`${group} and ef.n_das >= ${listMin} and ${hasFlag(s, flag)}${leavesHistoric(spec) ? s` and ${riskActive(s, "ef")}` : s``}`);
  const channel: Channel = {
    name: "profiles", from: frag(s`marts.entity_flags ef`), where,
    bindings: {
      // A profile is one row: its options come by value, and a search reads the names.
      nume: { kind: "list", value: frag(s`ef.entity_id::text`), label: frag(s`ef.name_display`), weight: frag(s`coalesce(ef.total_ron, 0)`) },
      judet: { kind: "list", value: input.county },
      // The score's patterns alone (the strip's): a profile with any of the chosen ones stays.
      tipare: {
        kind: "list", value: frag(s`unnest(array(select x from jsonb_array_elements_text(coalesce(ef.flags, '[]'::jsonb)) x where x = any(${s.array([...flags])}::text[])))`),
        match: (values) => frag(s`ef.flags ?| ${s.array(values.filter((v) => (flags as readonly string[]).includes(v)))}::text[]`),
      },
      valoare: { kind: "range", value: frag(s`ef.total_ron`) },
      risc: { kind: "range", value: frag(s`coalesce(ef.score, 0)`) },
      achizitii: { kind: "range", value: frag(s`ef.n_das`) },
    },
  };
  const source: FilterSource = {
    columns: scatterListColumns(role), channels: [channel],
    labelOf: (key, value) => (key === "judet" ? countyDisplay(value) : undefined),
  };
  return { source, channel };
}

export interface ScatterListPage {
  rows: ScatterListRow[];
  /** The rows under the filters, and the list's rows without them. */
  total: number; all: number;
  page: number;
}

export async function scatterListPage(s: DbSql, input: ScatterInput, state: FilterState, page: number): Promise<ScatterListPage> {
  const { channel } = await listSource(s, input);
  const where = channelWhere(s, channel, state);
  const [all] = (await s`select count(*)::int n from marts.entity_flags ef where ${channel.where}`) as unknown as { n: number }[];
  if (where === null) return { rows: [], total: 0, all: Number(all?.n ?? 0), page: 1 };
  const [count] = (await s`select count(*)::int n from marts.entity_flags ef where ${where}`) as unknown as { n: number }[];
  const total = Number(count?.n ?? 0), pages = Math.max(1, Math.ceil(total / SCATTER_LIST_PAGE_SIZE)), at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const listed = (await s`
    select ef.entity_id::text id, ef.name_display name, ${input.county} county, ef.total_ron, ef.n_das,
           coalesce(ef.score, 0)::int score, coalesce(ef.score_raw, 0) score_raw, ef.n_flags, ef.flags, ${historicDay(s)} historic
    from marts.entity_flags ef
    where ${where}
    order by ${scatterOrder(s, scatterRank(input.spec))} limit ${SCATTER_LIST_PAGE_SIZE} offset ${(at - 1) * SCATTER_LIST_PAGE_SIZE}
  `) as unknown as ScoredRow[];
  return { rows: await listRows(s, input, listed), total, all: Number(all?.n ?? 0), page: at };
}

/** A funnel's options under the other filters; a search reads the names (the institution, the county). */
export async function scatterListFacet(s: DbSql, input: ScatterInput, key: string, state: FilterState, request: FacetRequest = {}): Promise<Facet> {
  const { source } = await listSource(s, input);
  if (key === "nume" && request.term) {
    // A name is searched without diacritics, as „Unde e o instituție?” does; the options stay by value.
    const channel = source.channels[0]!;
    const named: FilterSource = { ...source, channels: [{ ...channel, where: frag(s`${channel.where} and lower(unaccent(ef.name_display)) like ${like(request.term)}`) }] };
    return facetOf(s, named, key, state, { ...(request.limit !== undefined ? { limit: request.limit } : {}) });
  }
  return facetOf(s, source, key, state, request);
}
