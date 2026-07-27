import type { DbSql } from "@seap/db";
import type { AskSpec, AuthorityKind, Dim } from "./spec";
import type { Grounding } from "./ground";

/**
 * Compile a validated AskSpec + grounding into parameterized SQL and execute it
 * under guardrails (read-only transaction, statement timeout, row caps, DA
 * plausibility bound). The LLM never touches SQL — only this compiler does,
 * from a closed vocabulary, so the injection surface is enum fields plus
 * parameterized values.
 *
 * Every semantic guardrail that changes the result (plafond, year clamping,
 * per-capita subset) is reported back as a caveat — adjust loudly, never
 * silently.
 */

/** DA rows above this are treated as data-entry errors (legal DA thresholds are far lower). */
export const DA_PLAFOND_RON = 2_000_000;
const STATEMENT_TIMEOUT = "20s";
/** Minimum DA count before an entity participates in risk-based blocks. */
const RISK_MIN_DAS = 10;

export interface TableRow {
  entityId: string | null;
  name: string;
  county: string | null;
  value: number;
  count: number;
  population: number | null;
}
export interface SeriesPoint {
  year: number;
  value: number;
  count: number;
}
export interface CountyValue {
  county: string;
  value: number;
  count: number;
}
export interface StatValue {
  value: number;
  count: number;
  /** dataset "all": the per-channel split behind the sum. */
  byStream?: { src: "da" | "contracts"; value: number; count: number }[];
}
export interface CompareEntity {
  entityId: string;
  name: string;
  county: string | null;
  role: string;
  value: number;
  count: number;
  cri: number | null;
  nFlags: number;
  flags: string[];
  population: number | null;
}
export interface DistributionData {
  /** 10 CRI buckets [0,0.1) … [0.9,1]. */
  buckets: { from: number; to: number; n: number }[];
  focal: { entityId: string; name: string; cri: number | null; percentile: number | null };
  role: string;
  totalEntities: number;
}
export interface BreakdownSlice {
  code: string;
  name: string | null;
  value: number;
  count: number;
}
export interface ScatterPoint {
  entityId: string;
  name: string;
  county: string | null;
  value: number;
  cri: number;
  nFlags: number;
}
export interface SankeyFlow {
  partnerId: string;
  partner: string;
  categoryCode: string;
  category: string | null;
  value: number;
}
export interface NetworkNode {
  entityId: string;
  name: string;
  value: number;
  count: number;
}
export interface EntityCardData {
  entityId: string;
  name: string;
  county: string | null;
  role: string;
  value: number;
  count: number;
  cri: number | null;
  nFlags: number;
  flags: string[];
  population: number | null;
}
export interface FactCheckData {
  verdict: boolean;
  authority: { entityId: string; name: string };
  supplier: { entityId: string; name: string };
  count: number;
  value: number;
  yearFirst: number | null;
  yearLast: number | null;
  samples: { daCode: string | null; date: string | null; cpvName: string | null; value: number }[];
}
export interface TrendRow {
  entityId: string | null;
  name: string;
  county: string | null;
  valueA: number;
  valueB: number;
}

export type BlockData =
  // total/page/pageSize present only in paged mode (clasament without topN)
  | { block: "table"; rows: TableRow[]; total?: number; page?: number; pageSize?: number }
  | { block: "stat"; stat: StatValue }
  | { block: "timeseries"; series: SeriesPoint[] }
  | { block: "map"; counties: CountyValue[] }
  | { block: "compare"; entities: CompareEntity[] }
  | { block: "distribution"; distribution: DistributionData }
  | { block: "breakdown"; slices: BreakdownSlice[]; other: { value: number; count: number } }
  | { block: "scatter"; points: ScatterPoint[] }
  | { block: "sankey"; flows: SankeyFlow[]; focal: { entityId: string; name: string; role: string } }
  | { block: "network"; nodes: NetworkNode[]; focal: { entityId: string; name: string; role: string } }
  | { block: "entity_card"; card: EntityCardData }
  | { block: "fact_check"; fact: FactCheckData }
  | { block: "trend"; rowsTrend: TrendRow[]; yearA: number; yearB: number };

export interface EngineResult {
  data: BlockData;
  displaySql: string;
  caveats: string[];
  tookMs: number;
}

const KIND_PATTERNS: Record<AuthorityKind, string[]> = {
  comuna: ["comuna %"],
  oras_municipiu: ["oras%", "orș%", "oraș%", "munici%", "primaria %", "primăria %"],
  consiliu_judetean: ["judetul %", "județul %", "consiliul judetean%", "consiliul județean%"],
  spital: ["spital%"],
  scoala: ["%scoala%", "%școala%", "liceul%", "colegiul%", "gradinita%", "grădinița%"],
};

const KIND_LABEL: Record<AuthorityKind, string> = {
  comuna: "comune",
  oras_municipiu: "orașe/municipii",
  consiliu_judetean: "consilii județene / județe",
  spital: "spitale",
  scoala: "școli/licee/grădinițe",
};

interface WhereParts {
  cpvPrefixes: string[];
  county: string | null;
  kind: AuthorityKind | null;
  authorityId: string | null;
  supplierId: string | null;
  /** Locality scope: all authorities mapped to this UAT (reference.authority_uat). */
  uatSiruta: number | null;
  /** dataset "contracts" only: keep rows with is_single_bidder = true. */
  singleBidder: boolean;
  /** Supplier size bounds (MF bilanț employees via marts.entity_profile). */
  minEmployees: number | null;
  maxEmployees: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  /** 1–12; only applied together with the corresponding year bound. */
  monthFrom: number | null;
  monthTo: number | null;
  /** "Conduse de X": supplier ids of the person's firms (ONRC reps). */
  adminSupplierIds: string[] | null;
  /**
   * DA plausibility bound: "strict" filters every row (dataset da),
   * "da-branch" filters only the DA rows of the union (dataset all),
   * "none" for contracts / count measure.
   */
  plafond: "none" | "strict" | "da-branch";
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Supplier size bound → semi-join on the entity_profile employee snapshot. */
function employeesCond(
  sql: DbSql,
  min: number | null,
  max: number | null,
): ReturnType<DbSql> {
  const bounds =
    min !== null && max !== null
      ? sql`ep.employees between ${min} and ${max}`
      : min !== null
        ? sql`ep.employees >= ${min}`
        : sql`ep.employees <= ${max!}`;
  return sql`d.supplier_id in (
    select ep.entity_id from marts.entity_profile ep
    where ep.role = 'supplier' and ep.employees is not null and ${bounds}
  )`;
}

/** Coverage of a stream ('da' | 'award'), cached per process (10 min). */
const coverageCache = new Map<string, { years: number[]; at: number }>();
export async function daCoverageYears(sql: DbSql, kind: "da" | "award" = "da"): Promise<number[]> {
  const hit = coverageCache.get(kind);
  if (hit && Date.now() - hit.at < 600_000) return hit.years;
  const rows = (await sql`
    select year from marts.national_stats where kind = ${kind} and year is not null order by year
  `) as unknown as { year: number }[];
  const years = rows.map((r) => Number(r.year));
  coverageCache.set(kind, { years, at: Date.now() });
  return years;
}

/**
 * The FROM target per dataset. For "all", a UNION ALL subquery with aligned
 * column names (both marts share them by design); `src` tags the channel,
 * `da_code` doubles as the generic reference code (contract_no on the
 * contracts branch), `ref_id` as the source row id. Postgres pushes WHERE
 * quals into both branches, so the union costs what its filtered branches cost.
 */
function txFragment(sql: DbSql, dataset: "all" | "da" | "contracts") {
  if (dataset === "contracts") return sql`marts.contract_transactions`;
  if (dataset === "da") return sql`marts.da_transactions`;
  return sql`(
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           da_code, sicap_da_id as ref_id, null::bigint as ca_notice_id,
           null::text as ted_pubnum, null::boolean as is_single_bidder,
           'da'::text as src
    from marts.da_transactions
    union all
    select authority_id, authority_name, supplier_id, supplier_name, county,
           cpv_code, cpv_name, closing_value, finalization_date,
           contract_no, contract_id, ca_notice_id,
           ted_pubnum, is_single_bidder,
           'contracts'::text
    from marts.contract_transactions
  )`;
}

/** Look up CPV names for a set of tree-node codes (2- or 4-digit stems). */
async function cpvNamesFor(
  sql: DbSql,
  stems: string[],
): Promise<Map<string, string | null>> {
  if (stems.length === 0) return new Map();
  const padded = stems.map((s) => s.padEnd(8, "0"));
  const rows = (await sql`
    select distinct on (substr(c.code, 1, 8)) substr(c.code, 1, 8) stem8, c.name_ro
    from core.cpv_codes c
    where substr(c.code, 1, 8) in ${sql(padded)}
    order by substr(c.code, 1, 8), length(c.code)
  `) as unknown as { stem8: string; name_ro: string | null }[];
  const map = new Map<string, string | null>();
  for (const r of rows) {
    const stem = stems.find((s) => s.padEnd(8, "0") === r.stem8);
    if (stem) map.set(stem, r.name_ro);
  }
  return map;
}

/** Paged clasament (table block WITHOUT an explicit topN): 10 rows/page. */
export const TABLE_PAGE_SIZE = 10;
export const TABLE_SORTS = ["name", "county", "value", "count", "percap"] as const;
export type TableSort = (typeof TABLE_SORTS)[number];
export interface TableOpts {
  page?: number;
  sort?: TableSort;
  dir?: "asc" | "desc";
}

export async function runSpec(
  sql: DbSql,
  spec: AskSpec,
  grounding: Grounding,
  tableOpts: TableOpts = {},
): Promise<EngineResult | { error: string; caveats: string[] }> {
  const caveats: string[] = [];
  const started = Date.now();

  // --- data stream. "all" = DA ∪ contracts (DISJOINT channels — a direct
  // acquisition is never also a contract, so the union is an honest sum). TED
  // is never unioned: it overlaps contracts and would double-count.
  const dataset = spec.dataset ?? "all";
  const txt = txFragment(sql, dataset);
  const codeCol = dataset === "contracts" ? sql`d.contract_no` : sql`d.da_code`;
  if (dataset === "contracts") {
    caveats.push(
      "Sursă: DOAR contracte atribuite prin proceduri competitive (peste prag). Valoarea consorțiilor e împărțită egal între câștigători.",
    );
  } else if (dataset === "da") {
    caveats.push("Sursă: DOAR achiziții directe (sub prag).");
  } else {
    caveats.push(
      "Sursă: ambele canale — achiziții directe (sub prag) + contracte din proceduri (peste prag). Canalele sunt disjuncte, deci suma e corectă; TED nu e niciodată însumat.",
    );
  }
  if (spec.filters.singleBidder) {
    caveats.push(
      "„Un singur ofertant”: numărul de ofertanți e cunoscut doar pentru contractele regăsite și în TED (confirmate). Contractele fără date de competiție NU apar aici — necunoscut nu înseamnă competitiv.",
    );
  }

  // --- resolve grounded anchors, failing loudly when grounding came up empty
  const cpvPrefixes = grounding.cpv?.prefixes ?? [];
  if (spec.filters.cpvTerm && cpvPrefixes.length === 0) {
    return {
      error: `Nu am găsit nicio categorie CPV pentru „${spec.filters.cpvTerm}”. Încearcă alt cuvânt (ex: „lemn de foc”, „medicamente”, „asfaltare”).`,
      caveats,
    };
  }
  if (grounding.cpv && grounding.cpv.method === "fuzzy") {
    caveats.push(
      `Am interpretat „${grounding.cpv.term}” prin potrivire aproximativă pe catalogul CPV: ${grounding.cpv.matchedNames.join("; ")}. Verifică dacă e ce ai vrut.`,
    );
  }

  let authorityId: string | null = null;
  if (spec.filters.authorityName || spec.filters.authorityId) {
    if (!grounding.authority?.entityId) {
      return {
        error: `Nu am găsit autoritatea „${spec.filters.authorityName ?? spec.filters.authorityId}”. Încearcă numele oficial (ex: „Comuna X”, „Municipiul Y”).`,
        caveats,
      };
    }
    authorityId = grounding.authority.entityId;
    if (grounding.authority.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.authority.nameDisplay}”. Alte potriviri: ${grounding.authority.alternatives.join("; ")}.`,
      );
    }
  }
  let supplierId: string | null = null;
  if (spec.filters.supplierName || spec.filters.supplierId) {
    if (!grounding.supplier?.entityId) {
      return {
        error: `Nu am găsit firma „${spec.filters.supplierName ?? spec.filters.supplierId}”.`,
        caveats,
      };
    }
    supplierId = grounding.supplier.entityId;
    if (grounding.supplier.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.supplier.nameDisplay}”. Alte potriviri: ${grounding.supplier.alternatives.join("; ")}.`,
      );
    }
  }
  let compareId: string | null = null;
  if (spec.block === "compare") {
    if (!grounding.compare?.entityId) {
      return {
        error: `Nu am găsit a doua entitate din comparație („${spec.filters.compareWith}”).`,
        caveats,
      };
    }
    compareId = grounding.compare.entityId;
    if (grounding.compare.alternatives.length > 0) {
      caveats.push(
        `Pentru a doua entitate am ales „${grounding.compare.nameDisplay}”. Alte potriviri: ${grounding.compare.alternatives.join("; ")}.`,
      );
    }
  }
  let county: string | null = null;
  if (spec.filters.county) {
    if (!grounding.county?.canonical) {
      return { error: `Nu recunosc județul „${spec.filters.county}”.`, caveats };
    }
    county = grounding.county.canonical;
  }
  let uatSiruta: number | null = null;
  if (spec.filters.uatSiruta) {
    const uat = grounding.uat;
    const uatLabel = spec.filters.uatName ?? uat?.name ?? `UAT ${spec.filters.uatSiruta}`;
    if (!uat || uat.nAuthorities === 0) {
      return {
        error: `Nu am găsit autorități contractante pentru localitatea „${uatLabel}”.`,
        caveats,
      };
    }
    uatSiruta = uat.siruta;
    caveats.push(
      uat.nAuthorities === 1
        ? `Localitatea „${uatLabel}”: o singură autoritate contractantă înregistrată în acest UAT.`
        : `Localitatea „${uatLabel}”: includ toate cele ${uat.nAuthorities} autorități publice din UAT (primărie, școli, alte instituții), nu doar primăria.`,
    );
  }

  // --- year clamping against actual coverage (union of both streams on "all")
  const covered =
    dataset === "contracts"
      ? await daCoverageYears(sql, "award")
      : dataset === "da"
        ? await daCoverageYears(sql, "da")
        : [
            ...new Set([...(await daCoverageYears(sql, "da")), ...(await daCoverageYears(sql, "award"))]),
          ].sort((a, b) => a - b);
  const minY = covered[0] ?? 2018;
  const maxY = covered[covered.length - 1] ?? 2026;
  let yearFrom = spec.filters.yearFrom ?? null;
  let yearTo = spec.filters.yearTo ?? null;
  if (yearFrom !== null || yearTo !== null) {
    const reqFrom = yearFrom ?? minY;
    const reqTo = yearTo ?? maxY;
    if (reqTo < minY || reqFrom > maxY) {
      caveats.push(
        `Perioada cerută (${reqFrom}–${reqTo}) nu există în date. Acoperire achiziții directe: ${minY}–${maxY}. Îți arăt întreaga acoperire.`,
      );
      yearFrom = null;
      yearTo = null;
    } else {
      const cf = Math.max(reqFrom, minY);
      const ct = Math.min(reqTo, maxY);
      if (cf !== reqFrom || ct !== reqTo) {
        caveats.push(`Am restrâns perioada la acoperirea reală a datelor: ${cf}–${ct}.`);
      }
      yearFrom = cf;
      yearTo = ct;
    }
  }

  // Plafond is a DA-specific plausibility bound (legal DA ceiling ≈ 2M works /
  // far less for goods). Contracts are legitimately huge; their bound (1 mld)
  // was applied at mart build time. On "all" it binds only the DA branch.
  const plafond: WhereParts["plafond"] =
    spec.measure === "count" || dataset === "contracts"
      ? "none"
      : dataset === "da"
        ? "strict"
        : "da-branch";
  if (plafond !== "none") {
    caveats.push(
      `Valorile peste ${(DA_PLAFOND_RON / 1_000_000).toLocaleString("ro-RO")} mil. lei pe o achiziție directă sunt excluse ca erori de introducere (plafon de plauzibilitate).`,
    );
  }

  const w: WhereParts = {
    cpvPrefixes,
    county,
    kind: spec.filters.authorityKind ?? null,
    authorityId,
    supplierId,
    uatSiruta,
    singleBidder: dataset === "contracts" && spec.filters.singleBidder === true,
    adminSupplierIds: grounding.admin ? grounding.admin.supplierIds : null,
    minEmployees: spec.filters.minEmployees ?? null,
    maxEmployees: spec.filters.maxEmployees ?? null,
    yearFrom,
    yearTo,
    monthFrom: spec.filters.monthFrom ?? null,
    monthTo: spec.filters.monthTo ?? null,
    plafond,
  };
  if (w.minEmployees !== null || w.maxEmployees !== null) {
    caveats.push(
      "Filtrul pe angajați folosește ultimul bilanț depus la Ministerul Finanțelor. " +
        "Furnizorii fără bilanț (PFA-uri, firme străine, firme radiate) sunt excluși din rezultat.",
    );
  }
  if (spec.filters.adminPersonKey || spec.filters.adminName) {
    if (!grounding.admin?.personKey) {
      return {
        error: `Nu am găsit niciun administrator „${spec.filters.adminName ?? "?"}” în Registrul Comerțului.`,
        caveats,
      };
    }
    if (grounding.admin.supplierIds.length === 0) {
      return {
        error: `${grounding.admin.display ?? "Persoana"} reprezintă ${grounding.admin.nFirms} firme, dar niciuna nu apare ca furnizor în datele noastre.`,
        caveats,
      };
    }
    caveats.push(
      "Filtrul «conduse de» folosește reprezentanții legali din Registrul Comerțului (instantaneu lunar): " +
        "administratorul de AZI, nu neapărat cel de la momentul achiziției; administratorii nu sunt neapărat asociații/proprietarii.",
    );
    if (grounding.admin.alternatives.length > 0) {
      caveats.push(
        `Am ales „${grounding.admin.display}”. Alte persoane cu nume asemănător: ${grounding.admin.alternatives.join("; ")}.`,
      );
    }
  }

  // The focal entity for entity-centric blocks (sankey/network/distribution).
  const focalRole: "authority" | "supplier" = authorityId ? "authority" : "supplier";
  const focalId = authorityId ?? supplierId;
  const focalName =
    (authorityId ? grounding.authority?.nameDisplay : grounding.supplier?.nameDisplay) ?? "?";

  // --- WHERE fragment over the transaction mart (da_/contract_, all parameterized)
  const whereFrag = (opts?: { years?: boolean; entityIds?: boolean }) => {
    const useYears = opts?.years ?? true;
    const useIds = opts?.entityIds ?? true;
    const parts: ReturnType<DbSql>[] = [];
    parts.push(sql`d.closing_value > 0`);
    if (w.plafond === "strict") parts.push(sql`d.closing_value <= ${DA_PLAFOND_RON}`);
    if (w.plafond === "da-branch")
      parts.push(sql`(d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`);
    if (w.cpvPrefixes.length > 0) {
      const ors = w.cpvPrefixes
        .map((p) => sql`d.cpv_code like ${p + "%"}`)
        .reduce((a, b) => sql`${a} or ${b}`);
      parts.push(sql`(${ors})`);
    }
    if (w.county) parts.push(sql`lower(unaccent(d.county)) = ${fold(w.county)}`);
    if (w.kind) {
      const ors = KIND_PATTERNS[w.kind]
        .map((p) => sql`lower(unaccent(d.authority_name)) like ${fold(p)}`)
        .reduce((a, b) => sql`${a} or ${b}`);
      parts.push(sql`(${ors})`);
    }
    if (useIds && w.authorityId) parts.push(sql`d.authority_id = ${w.authorityId}`);
    if (useIds && w.supplierId) parts.push(sql`d.supplier_id = ${w.supplierId}`);
    if (useIds && w.uatSiruta !== null)
      parts.push(
        sql`d.authority_id in (select au.entity_id from reference.authority_uat au where au.uat_siruta = ${w.uatSiruta})`,
      );
    if (w.singleBidder) parts.push(sql`d.is_single_bidder = true`);
    if (w.adminSupplierIds !== null)
      parts.push(sql`d.supplier_id = any(${sql.array(w.adminSupplierIds)}::bigint[])`);
    if (w.minEmployees !== null || w.maxEmployees !== null)
      parts.push(employeesCond(sql, w.minEmployees, w.maxEmployees));
    if (useYears && w.yearFrom !== null) {
      if (w.monthFrom !== null)
        parts.push(
          sql`substr(d.finalization_date, 1, 7) >= ${`${w.yearFrom}-${String(w.monthFrom).padStart(2, "0")}`}`,
        );
      else parts.push(sql`substr(d.finalization_date, 1, 4) >= ${String(w.yearFrom)}`);
    }
    if (useYears && w.yearTo !== null) {
      if (w.monthTo !== null)
        parts.push(
          sql`substr(d.finalization_date, 1, 7) <= ${`${w.yearTo}-${String(w.monthTo).padStart(2, "0")}`}`,
        );
      else parts.push(sql`substr(d.finalization_date, 1, 4) <= ${String(w.yearTo)}`);
    }
    return parts.reduce((a, b) => sql`${a} and ${b}`);
  };

  // --- WHERE fragment over marts.entity_flags (risk-centric blocks)
  const efWhere = (role: "authority" | "supplier", minDas: number) => {
    const parts: ReturnType<DbSql>[] = [];
    parts.push(sql`ef.role = ${role}`);
    parts.push(sql`ef.n_das >= ${minDas}`);
    if (w.county) parts.push(sql`lower(unaccent(ef.county)) = ${fold(w.county)}`);
    if (w.uatSiruta !== null && role === "authority")
      parts.push(
        sql`ef.entity_id in (select au.entity_id from reference.authority_uat au where au.uat_siruta = ${w.uatSiruta})`,
      );
    if (w.kind && role === "authority") {
      const ors = KIND_PATTERNS[w.kind]
        .map((p) => sql`lower(unaccent(ef.name_display)) like ${fold(p)}`)
        .reduce((a, b) => sql`${a} or ${b}`);
      parts.push(sql`(${ors})`);
    }
    return parts.reduce((a, b) => sql`${a} and ${b}`);
  };

  const displaySql = buildDisplaySql(spec, w);

  if (spec.dim === "supplier" && (w.county || spec.block === "table")) {
    caveats.push(
      "Județul din date este al autorității cumpărătoare (unde s-a cheltuit), nu sediul firmei.",
    );
  }
  if (spec.measure === "value_per_capita") {
    caveats.push(
      "Per cap de locuitor: doar autoritățile-UAT cu populație cunoscută (5.575 de autorități, recensământ 2021, populație estimată). Restul sunt excluse din clasament.",
    );
  }
  const RISK_BLOCKS = ["compare", "distribution", "scatter", "entity_card"];
  if (RISK_BLOCKS.includes(spec.block)) {
    caveats.push(
      "Indicele de risc este un semnal statistic, nu o dovadă de neregulă. Semnalele au explicații legitime posibile — verifică întotdeauna detaliile.",
    );
  }
  if (RISK_BLOCKS.includes(spec.block) && (w.cpvPrefixes.length > 0 || w.yearFrom !== null)) {
    caveats.push(
      "Indicele de risc și semnalele sunt calculate pe TOATĂ activitatea entității — filtrele de subiect/perioadă nu li se aplică.",
    );
  }

  // --- execute under guardrails
  const exec = async (): Promise<BlockData | { error: string }> => {
    return await sql.begin("read only", async (tx) => {
      await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
      const s = tx as unknown as DbSql;

      switch (spec.block) {
        case "stat": {
          if (dataset === "all") {
            const r = (await s`
              select d.src, coalesce(sum(d.closing_value), 0) v, count(*) n
              from ${txt} d
              where ${whereFrag()}
              group by d.src
            `) as unknown as { src: "da" | "contracts"; v: string; n: string }[];
            const byStream = r.map((x) => ({
              src: x.src,
              value: Number(x.v),
              count: Number(x.n),
            }));
            return {
              block: "stat",
              stat: {
                value: byStream.reduce((a, b) => a + b.value, 0),
                count: byStream.reduce((a, b) => a + b.count, 0),
                byStream,
              },
            };
          }
          const r = (await s`
            select coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag()}
          `) as unknown as { v: string; n: string }[];
          return {
            block: "stat",
            stat: { value: Number(r[0]?.v ?? 0), count: Number(r[0]?.n ?? 0) },
          };
        }

        case "timeseries": {
          const r = (await s`
            select substr(d.finalization_date, 1, 4) y,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag()}
            group by 1 order by 1
            limit 60
          `) as unknown as { y: string; v: string; n: string }[];
          return {
            block: "timeseries",
            series: r
              .filter((p) => /^\d{4}$/.test(p.y))
              .map((p) => ({ year: Number(p.y), value: Number(p.v), count: Number(p.n) })),
          };
        }

        case "map": {
          const r = (await s`
            select d.county c, coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag()} and d.county is not null
            group by 1 order by v desc
            limit 200
          `) as unknown as { c: string; v: string; n: string }[];
          return {
            block: "map",
            counties: r.map((p) => ({ county: p.c, value: Number(p.v), count: Number(p.n) })),
          };
        }

        case "table": {
          // No explicit topN → paged mode: full ranking, 25/page, sortable.
          const paged = spec.topN == null;
          const topN = spec.topN ?? 10;
          const page = paged ? Math.max(0, Math.floor(tableOpts.page ?? 0)) : 0;
          const limitFrag = paged
            ? s`limit ${TABLE_PAGE_SIZE} offset ${page * TABLE_PAGE_SIZE}`
            : s`limit ${topN}`;
          const dir = tableOpts.dir === "asc" ? s`asc nulls first` : s`desc nulls last`;
          const dim = spec.dim ?? "authority";
          const pagedMeta = (total: number) =>
            paged ? { total, page, pageSize: TABLE_PAGE_SIZE } : {};
          if (dim === "county") {
            const sortFrag = {
              name: s`c`,
              county: s`c`,
              value: s`v`,
              count: s`n`,
              percap: s`v`,
            }[tableOpts.sort ?? (spec.measure === "count" ? "count" : "value")];
            const cnt = paged
              ? ((await s`
                  select count(distinct d.county) t from ${txt} d
                  where ${whereFrag()} and d.county is not null
                `) as unknown as { t: string }[])
              : null;
            const r = (await s`
              select d.county c, coalesce(sum(d.closing_value), 0) v, count(*) n
              from ${txt} d
              where ${whereFrag()} and d.county is not null
              group by 1
              order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, c
              ${limitFrag}
            `) as unknown as { c: string; v: string; n: string }[];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: null,
                name: p.c,
                county: null,
                value: Number(p.v),
                count: Number(p.n),
                population: null,
              })),
              ...pagedMeta(Number(cnt?.[0]?.t ?? 0)),
            };
          }
          const idCol = dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const nameCol = dim === "authority" ? s`d.authority_name` : s`d.supplier_name`;
          if (spec.measure === "value_per_capita") {
            const sortFrag = {
              name: s`max(d.authority_name)`,
              county: s`max(d.county)`,
              value: s`coalesce(sum(d.closing_value), 0)`,
              count: s`count(*)`,
              percap: s`coalesce(sum(d.closing_value), 0) / max(ep.population)`,
            }[tableOpts.sort ?? "percap"];
            const cnt = paged
              ? ((await s`
                  select count(distinct d.authority_id) t
                  from ${txt} d
                  join marts.entity_profile ep
                    on ep.entity_id = d.authority_id and ep.role = 'authority'
                  where ${whereFrag()} and ep.population > 0
                `) as unknown as { t: string }[])
              : null;
            const r = (await s`
              select d.authority_id id, max(d.authority_name) nm, max(d.county) co,
                     coalesce(sum(d.closing_value), 0) v, count(*) n, max(ep.population) pop
              from ${txt} d
              join marts.entity_profile ep
                on ep.entity_id = d.authority_id and ep.role = 'authority'
              where ${whereFrag()} and ep.population > 0
              group by d.authority_id
              order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, d.authority_id
              ${limitFrag}
            `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string; pop: string }[];
            return {
              block: "table",
              rows: r.map((p) => ({
                entityId: String(p.id),
                name: p.nm,
                county: p.co,
                value: Number(p.v),
                count: Number(p.n),
                population: Number(p.pop),
              })),
              ...pagedMeta(Number(cnt?.[0]?.t ?? 0)),
            };
          }
          const sortFrag = {
            name: s`max(${nameCol})`,
            county: s`max(d.county)`,
            value: s`coalesce(sum(d.closing_value), 0)`,
            count: s`count(*)`,
            percap: s`coalesce(sum(d.closing_value), 0)`,
          }[tableOpts.sort ?? (spec.measure === "count" ? "count" : "value")];
          const cnt = paged
            ? ((await s`
                select count(distinct ${idCol}) t from ${txt} d
                where ${whereFrag()} and ${idCol} is not null
              `) as unknown as { t: string }[])
            : null;
          const r = (await s`
            select ${idCol} id, max(${nameCol}) nm, max(d.county) co,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag()} and ${idCol} is not null
            group by ${idCol}
            order by ${sortFrag} ${tableOpts.sort ? dir : s`desc`}, ${idCol}
            ${limitFrag}
          `) as unknown as { id: string; nm: string; co: string | null; v: string; n: string }[];
          return {
            block: "table",
            rows: r.map((p) => ({
              entityId: String(p.id),
              name: p.nm,
              county: p.co,
              value: Number(p.v),
              count: Number(p.n),
              population: null,
            })),
            ...pagedMeta(Number(cnt?.[0]?.t ?? 0)),
          };
        }

        case "compare": {
          const r = (await s`
            select ef.entity_id, ef.name_display, ef.county, ef.role, ef.n_das, ef.total_ron,
                   ef.cri, ef.n_flags, ef.flags, ep.population
            from marts.entity_flags ef
            left join marts.entity_profile ep
              on ep.entity_id = ef.entity_id and ep.role = ef.role
            where ef.role = ${focalRole} and ef.entity_id in ${s([focalId, compareId])}
          `) as unknown as {
            entity_id: string;
            name_display: string | null;
            county: string | null;
            role: string;
            n_das: number;
            total_ron: string | null;
            cri: string | null;
            n_flags: number;
            flags: string[] | null;
            population: string | null;
          }[];
          if (r.length < 2) {
            return {
              error:
                "Una dintre entități nu are activitate pe achiziții directe, deci nu pot construi comparația (profilurile de risc acoperă doar achizițiile directe).",
            };
          }
          // preserve the asked order: focal first
          const ordered = [...r].sort((a, b) =>
            String(a.entity_id) === String(focalId) ? -1 : String(b.entity_id) === String(focalId) ? 1 : 0,
          );
          return {
            block: "compare",
            entities: ordered.map((e) => ({
              entityId: String(e.entity_id),
              name: e.name_display ?? "?",
              county: e.county,
              role: e.role,
              value: Number(e.total_ron ?? 0),
              count: Number(e.n_das),
              cri: e.cri === null ? null : Number(e.cri),
              nFlags: Number(e.n_flags),
              flags: e.flags ?? [],
              population: e.population === null ? null : Number(e.population),
            })),
          };
        }

        case "distribution": {
          const buckets = (await s`
            select width_bucket(coalesce(ef.cri, 0), 0, 1.0000001, 10) b, count(*) n
            from marts.entity_flags ef
            where ${efWhere(focalRole, RISK_MIN_DAS)}
            group by 1 order by 1
          `) as unknown as { b: number; n: string }[];
          const focal = (await s`
            select ef.entity_id, ef.name_display, ef.cri
            from marts.entity_flags ef
            where ef.role = ${focalRole} and ef.entity_id = ${focalId}
          `) as unknown as { entity_id: string; name_display: string | null; cri: string | null }[];
          if (focal.length === 0) {
            return {
              error: `„${focalName}” nu are profil de risc (prea puține achiziții directe).`,
            };
          }
          const cri = focal[0]!.cri === null ? null : Number(focal[0]!.cri);
          let percentile: number | null = null;
          if (cri !== null) {
            const pct = (await s`
              select count(*) filter (where coalesce(ef.cri, 0) <= ${cri}) le, count(*) total
              from marts.entity_flags ef
              where ${efWhere(focalRole, RISK_MIN_DAS)}
            `) as unknown as { le: string; total: string }[];
            const total = Number(pct[0]?.total ?? 0);
            if (total > 0) percentile = Math.round((Number(pct[0]!.le) / total) * 100);
          }
          const byBucket = new Map(buckets.map((b) => [Number(b.b), Number(b.n)]));
          const totalEntities = buckets.reduce((sum, b) => sum + Number(b.n), 0);
          return {
            block: "distribution",
            distribution: {
              buckets: Array.from({ length: 10 }, (_, i) => ({
                from: i / 10,
                to: (i + 1) / 10,
                n: byBucket.get(i + 1) ?? 0,
              })),
              focal: {
                entityId: String(focal[0]!.entity_id),
                name: focal[0]!.name_display ?? focalName,
                cri,
                percentile,
              },
              role: focalRole,
              totalEntities,
            },
          };
        }

        case "breakdown": {
          // With a CPV subject: break down inside that subtree (4-digit groups);
          // otherwise: top-level divisions (2-digit).
          const stemLen = w.cpvPrefixes.length > 0 ? 4 : 2;
          const r = (await s`
            select substr(d.cpv_code, 1, ${stemLen}) stem,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag()} and d.cpv_code is not null
            group by 1 order by v desc
            limit 40
          `) as unknown as { stem: string; v: string; n: string }[];
          const top = r.slice(0, 8);
          const rest = r.slice(8);
          const names = await cpvNamesFor(s, top.map((t) => t.stem));
          return {
            block: "breakdown",
            slices: top.map((t) => ({
              code: t.stem,
              name: names.get(t.stem) ?? null,
              value: Number(t.v),
              count: Number(t.n),
            })),
            other: {
              value: rest.reduce((a, b) => a + Number(b.v), 0),
              count: rest.reduce((a, b) => a + Number(b.n), 0),
            },
          };
        }

        case "scatter": {
          const role: Dim = spec.dim === "supplier" ? "supplier" : "authority";
          const r = (await s`
            (select ef.entity_id, ef.name_display, ef.county, ef.total_ron, ef.cri, ef.n_flags
             from marts.entity_flags ef
             where ${efWhere(role as "authority" | "supplier", RISK_MIN_DAS)} and ef.cri is not null
             order by ef.cri desc, ef.total_ron desc limit 200)
            union
            (select ef.entity_id, ef.name_display, ef.county, ef.total_ron, ef.cri, ef.n_flags
             from marts.entity_flags ef
             where ${efWhere(role as "authority" | "supplier", RISK_MIN_DAS)} and ef.cri is not null
             order by ef.total_ron desc nulls last limit 200)
          `) as unknown as {
            entity_id: string;
            name_display: string | null;
            county: string | null;
            total_ron: string | null;
            cri: string;
            n_flags: number;
          }[];
          return {
            block: "scatter",
            points: r.map((p) => ({
              entityId: String(p.entity_id),
              name: p.name_display ?? "?",
              county: p.county,
              value: Number(p.total_ron ?? 0),
              cri: Number(p.cri),
              nFlags: Number(p.n_flags),
            })),
          };
        }

        case "sankey": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          const partnerId = focalRole === "authority" ? s`d.supplier_id` : s`d.authority_id`;
          const partnerName = focalRole === "authority" ? s`d.supplier_name` : s`d.authority_name`;
          const focalCol = focalRole === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const r = (await s`
            select ${partnerId} pid, max(${partnerName}) pnm,
                   substr(d.cpv_code, 1, 2) stem,
                   coalesce(sum(d.closing_value), 0) v
            from ${txt} d
            where ${whereFrag({ entityIds: false })} and ${focalCol} = ${focalId}
              and ${partnerId} is not null and d.cpv_code is not null
            group by 1, 3
            order by v desc
            limit 400
          `) as unknown as { pid: string; pnm: string; stem: string; v: string }[];
          if (r.length === 0) {
            return { error: `„${focalName}” nu are achiziții directe în datele filtrate.` };
          }
          // keep top 6 partners / top 5 categories, roll the rest up
          const byPartner = new Map<string, number>();
          const byCat = new Map<string, number>();
          for (const row of r) {
            byPartner.set(row.pid, (byPartner.get(row.pid) ?? 0) + Number(row.v));
            byCat.set(row.stem, (byCat.get(row.stem) ?? 0) + Number(row.v));
          }
          const topPartners = new Set(
            [...byPartner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k),
          );
          const topCats = new Set(
            [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
          );
          const agg = new Map<string, { partnerId: string; partner: string; categoryCode: string; value: number }>();
          for (const row of r) {
            const pk = topPartners.has(row.pid) ? row.pid : "_alt";
            const pn = topPartners.has(row.pid)
              ? (r.find((x) => x.pid === row.pid)?.pnm ?? "?")
              : "alți parteneri";
            const ck = topCats.has(row.stem) ? row.stem : "_alt";
            const key = `${pk}|${ck}`;
            const cur = agg.get(key);
            if (cur) cur.value += Number(row.v);
            else agg.set(key, { partnerId: pk, partner: pn, categoryCode: ck, value: Number(row.v) });
          }
          const catStems = [...topCats];
          const names = await cpvNamesFor(s, catStems);
          return {
            block: "sankey",
            flows: [...agg.values()]
              .sort((a, b) => b.value - a.value)
              .map((f) => ({
                partnerId: f.partnerId,
                partner: f.partner,
                categoryCode: f.categoryCode,
                category: f.categoryCode === "_alt" ? "alte categorii" : (names.get(f.categoryCode) ?? f.categoryCode),
                value: f.value,
              })),
            focal: { entityId: String(focalId), name: focalName, role: focalRole },
          };
        }

        case "network": {
          if (!focalId) return { error: "Lipsește entitatea centrală." };
          const partnerId = focalRole === "authority" ? s`d.supplier_id` : s`d.authority_id`;
          const partnerName = focalRole === "authority" ? s`d.supplier_name` : s`d.authority_name`;
          const focalCol = focalRole === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const r = (await s`
            select ${partnerId} pid, max(${partnerName}) pnm,
                   coalesce(sum(d.closing_value), 0) v, count(*) n
            from ${txt} d
            where ${whereFrag({ entityIds: false })} and ${focalCol} = ${focalId}
              and ${partnerId} is not null
            group by 1
            order by v desc
            limit 14
          `) as unknown as { pid: string; pnm: string; v: string; n: string }[];
          if (r.length === 0) {
            return { error: `„${focalName}” nu are achiziții directe în datele filtrate.` };
          }
          return {
            block: "network",
            nodes: r.map((p) => ({
              entityId: String(p.pid),
              name: p.pnm ?? "?",
              value: Number(p.v),
              count: Number(p.n),
            })),
            focal: { entityId: String(focalId), name: focalName, role: focalRole },
          };
        }

        case "entity_card": {
          const role = spec.dim === "supplier" ? ("supplier" as const) : ("authority" as const);
          const minDas = 20;
          const order =
            (spec.rankBy ?? "risk") === "risk"
              ? s`ef.cri desc nulls last, ef.total_ron desc nulls last`
              : s`ef.total_ron desc nulls last`;
          const r = (await s`
            select ef.entity_id, ef.name_display, ef.county, ef.role, ef.n_das, ef.total_ron,
                   ef.cri, ef.n_flags, ef.flags, ep.population
            from marts.entity_flags ef
            left join marts.entity_profile ep
              on ep.entity_id = ef.entity_id and ep.role = ef.role
            where ${efWhere(role, minDas)}
            order by ${order}
            limit 1
          `) as unknown as {
            entity_id: string;
            name_display: string | null;
            county: string | null;
            role: string;
            n_das: number;
            total_ron: string | null;
            cri: string | null;
            n_flags: number;
            flags: string[] | null;
            population: string | null;
          }[];
          if (r.length === 0) return { error: "Niciun rezultat pentru aceste filtre." };
          const e = r[0]!;
          return {
            block: "entity_card",
            card: {
              entityId: String(e.entity_id),
              name: e.name_display ?? "?",
              county: e.county,
              role: e.role,
              value: Number(e.total_ron ?? 0),
              count: Number(e.n_das),
              cri: e.cri === null ? null : Number(e.cri),
              nFlags: Number(e.n_flags),
              flags: e.flags ?? [],
              population: e.population === null ? null : Number(e.population),
            },
          };
        }

        case "fact_check": {
          const agg = (await s`
            select coalesce(sum(d.closing_value), 0) v, count(*) n,
                   min(substr(d.finalization_date, 1, 4)) y1,
                   max(substr(d.finalization_date, 1, 4)) y2
            from ${txt} d
            where ${whereFrag()}
          `) as unknown as { v: string; n: string; y1: string | null; y2: string | null }[];
          const n = Number(agg[0]?.n ?? 0);
          const samples =
            n > 0
              ? ((await s`
                  select ${codeCol} da_code, d.finalization_date, d.cpv_name, d.closing_value
                  from ${txt} d
                  where ${whereFrag()}
                  order by d.closing_value desc
                  limit 5
                `) as unknown as {
                  da_code: string | null;
                  finalization_date: string | null;
                  cpv_name: string | null;
                  closing_value: string;
                }[])
              : [];
          return {
            block: "fact_check",
            fact: {
              verdict: n > 0,
              authority: {
                entityId: String(authorityId),
                name: grounding.authority?.nameDisplay ?? "?",
              },
              supplier: {
                entityId: String(supplierId),
                name: grounding.supplier?.nameDisplay ?? "?",
              },
              count: n,
              value: Number(agg[0]?.v ?? 0),
              yearFirst: agg[0]?.y1 ? Number(agg[0].y1) : null,
              yearLast: agg[0]?.y2 ? Number(agg[0].y2) : null,
              samples: samples.map((x) => ({
                daCode: x.da_code,
                date: x.finalization_date ? x.finalization_date.slice(0, 10) : null,
                cpvName: x.cpv_name,
                value: Number(x.closing_value),
              })),
            },
          };
        }

        case "trend": {
          const yA = w.yearFrom ?? minY;
          const yB = w.yearTo ?? maxY;
          if (yA === yB) {
            return {
              error: `Pentru o comparație în timp am nevoie de doi ani diferiți (am primit doar ${yA}).`,
            };
          }
          const topN = spec.topN ?? 10;
          const dim = spec.dim ?? "authority";
          if (dim === "county") {
            const r = (await s`
              select d.county c,
                     coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0) va,
                     coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0) vb
              from ${txt} d
              where ${whereFrag({ years: false })} and d.county is not null
                and substr(d.finalization_date,1,4) in (${String(yA)}, ${String(yB)})
              group by 1
              order by abs(
                coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0)
                - coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0)
              ) desc
              limit ${topN}
            `) as unknown as { c: string; va: string; vb: string }[];
            return {
              block: "trend",
              yearA: yA,
              yearB: yB,
              rowsTrend: r.map((p) => ({
                entityId: null,
                name: p.c,
                county: null,
                valueA: Number(p.va),
                valueB: Number(p.vb),
              })),
            };
          }
          const idCol = dim === "authority" ? s`d.authority_id` : s`d.supplier_id`;
          const nameCol = dim === "authority" ? s`d.authority_name` : s`d.supplier_name`;
          const r = (await s`
            select ${idCol} id, max(${nameCol}) nm, max(d.county) co,
                   coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0) va,
                   coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0) vb
            from ${txt} d
            where ${whereFrag({ years: false })} and ${idCol} is not null
              and substr(d.finalization_date,1,4) in (${String(yA)}, ${String(yB)})
            group by ${idCol}
            order by abs(
              coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yB)}), 0)
              - coalesce(sum(d.closing_value) filter (where substr(d.finalization_date,1,4) = ${String(yA)}), 0)
            ) desc
            limit ${topN}
          `) as unknown as { id: string; nm: string; co: string | null; va: string; vb: string }[];
          return {
            block: "trend",
            yearA: yA,
            yearB: yB,
            rowsTrend: r.map((p) => ({
              entityId: String(p.id),
              name: p.nm,
              county: p.co,
              valueA: Number(p.va),
              valueB: Number(p.vb),
            })),
          };
        }
      }
    });
  };

  const data = await exec();
  if ("error" in data) return { error: data.error, caveats };
  return { data, displaySql, caveats, tookMs: Date.now() - started };
}

export interface DrillRow {
  daCode: string | null;
  date: string | null;
  authorityId: string | null;
  authority: string | null;
  supplierId: string | null;
  supplier: string | null;
  county: string | null;
  cpvName: string | null;
  value: number;
  /** Which channel the row came from. */
  src: "da" | "contracts";
  /** Source row id: sicap_da_id (da) / contract_id (contracts). */
  refId: string | null;
  /** SEAP award-notice id (contracts only) — builds the e-licitatie link. */
  caNoticeId: string | null;
  /** TED publication number of the confirmed twin (contracts only). */
  tedPubnum: string | null;
}
export interface DrillResult {
  rows: DrillRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Whitelisted sort keys → columns (everything else falls back to value). */
export const DRILL_SORTS = {
  value: "closing_value",
  date: "finalization_date",
  authority: "authority_name",
  supplier: "supplier_name",
  county: "county",
  cpv: "cpv_name",
} as const;
export type DrillSort = keyof typeof DRILL_SORTS;

export interface DrillOpts {
  sort?: DrillSort;
  dir?: "asc" | "desc";
  /** dataset "all" only: restrict the rows to one channel. */
  stream?: "da" | "contracts";
  /**
   * Server-internal (CSV export): fetch up to this many rows in one go instead
   * of a DRILL_PAGE_SIZE page. Always capped at CSV_MAX_ROWS.
   */
  limit?: number;
}

export const DRILL_PAGE_SIZE = 10;
/** Hard cap for full-result CSV exports (~15MB of CSV). */
export const CSV_MAX_ROWS = 100_000;
/** Blocks whose result is an aggregate over da_transactions — drillable to rows. */
export const DRILLABLE_BLOCKS: AskSpec["block"][] = [
  "table",
  "stat",
  "timeseries",
  "map",
  "breakdown",
  "sankey",
  "network",
  "fact_check",
  "trend",
];

/**
 * "Go to data": the underlying da_transactions rows behind an answer, paginated.
 * Same grounded filters as the aggregate — no derived number is a dead end.
 */
export async function runRows(
  sql: DbSql,
  spec: AskSpec,
  grounding: Grounding,
  page: number,
  opts: DrillOpts = {},
): Promise<DrillResult | { error: string }> {
  if (!DRILLABLE_BLOCKS.includes(spec.block)) {
    return { error: "Acest tip de răspuns nu are rânduri-sursă directe." };
  }
  const cpvPrefixes = grounding.cpv?.prefixes ?? [];
  if (spec.filters.cpvTerm && cpvPrefixes.length === 0) {
    return { error: `Nu am găsit CPV pentru „${spec.filters.cpvTerm}”.` };
  }
  if ((spec.filters.authorityName || spec.filters.authorityId) && !grounding.authority?.entityId) {
    return {
      error: `Nu am găsit autoritatea „${spec.filters.authorityName ?? spec.filters.authorityId}”.`,
    };
  }
  if ((spec.filters.supplierName || spec.filters.supplierId) && !grounding.supplier?.entityId) {
    return {
      error: `Nu am găsit firma „${spec.filters.supplierName ?? spec.filters.supplierId}”.`,
    };
  }
  if (spec.filters.county && !grounding.county?.canonical) {
    return { error: `Nu recunosc județul „${spec.filters.county}”.` };
  }
  if (
    (spec.filters.adminPersonKey || spec.filters.adminName) &&
    (!grounding.admin?.personKey || grounding.admin.supplierIds.length === 0)
  ) {
    return { error: "Nu am găsit firmele persoanei în date (filtrul «conduse de»)." };
  }
  if (spec.filters.uatSiruta && (!grounding.uat || grounding.uat.nAuthorities === 0)) {
    return {
      error: `Nu am găsit autorități pentru localitatea „${spec.filters.uatName ?? spec.filters.uatSiruta}”.`,
    };
  }
  const dataset = spec.dataset ?? "all";
  const txt = txFragment(sql, dataset);
  const codeCol = dataset === "contracts" ? sql`d.contract_no` : sql`d.da_code`;
  const tieCol =
    dataset === "contracts" ? sql`d.contract_id` : dataset === "da" ? sql`d.sicap_da_id` : sql`d.ref_id`;
  // extra provenance columns per dataset (link building in the UI)
  const provCols =
    dataset === "all"
      ? sql`d.src, d.ref_id, d.ca_notice_id, d.ted_pubnum`
      : dataset === "contracts"
        ? sql`'contracts' as src, d.contract_id as ref_id, d.ca_notice_id, d.ted_pubnum`
        : sql`'da' as src, d.sicap_da_id as ref_id, null::bigint as ca_notice_id, null::text as ted_pubnum`;
  const sortKey: DrillSort = opts.sort && opts.sort in DRILL_SORTS ? opts.sort : "value";
  const dirFrag = opts.dir === "asc" ? sql`asc nulls first` : sql`desc nulls last`;
  const sortFrag = {
    value: sql`d.closing_value`,
    date: sql`d.finalization_date`,
    authority: sql`d.authority_name`,
    supplier: sql`d.supplier_name`,
    county: sql`d.county`,
    cpv: sql`d.cpv_name`,
  }[sortKey];
  const stream = dataset === "all" ? (opts.stream ?? null) : null;
  const w: WhereParts = {
    cpvPrefixes,
    county: grounding.county?.canonical ?? null,
    kind: spec.filters.authorityKind ?? null,
    authorityId: grounding.authority?.entityId ?? null,
    supplierId: grounding.supplier?.entityId ?? null,
    uatSiruta: grounding.uat?.siruta ?? null,
    singleBidder: dataset === "contracts" && spec.filters.singleBidder === true,
    adminSupplierIds: grounding.admin ? grounding.admin.supplierIds : null,
    minEmployees: spec.filters.minEmployees ?? null,
    maxEmployees: spec.filters.maxEmployees ?? null,
    yearFrom: spec.filters.yearFrom ?? null,
    yearTo: spec.filters.yearTo ?? null,
    monthFrom: spec.filters.monthFrom ?? null,
    monthTo: spec.filters.monthTo ?? null,
    plafond:
      spec.measure === "count" || dataset === "contracts"
        ? "none"
        : dataset === "da"
          ? "strict"
          : "da-branch",
  };
  const p = Math.max(0, Math.floor(page));
  const pageSize =
    opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), CSV_MAX_ROWS) : DRILL_PAGE_SIZE;
  return await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    const s = tx as unknown as DbSql;
    const whereFrag = () => {
      const parts: ReturnType<DbSql>[] = [];
      parts.push(sql`d.closing_value > 0`);
      if (w.plafond === "strict") parts.push(sql`d.closing_value <= ${DA_PLAFOND_RON}`);
      if (w.plafond === "da-branch")
        parts.push(sql`(d.src = 'contracts' or d.closing_value <= ${DA_PLAFOND_RON})`);
      if (stream) parts.push(sql`d.src = ${stream}`);
      if (w.cpvPrefixes.length > 0) {
        const ors = w.cpvPrefixes
          .map((pre) => sql`d.cpv_code like ${pre + "%"}`)
          .reduce((a, b) => sql`${a} or ${b}`);
        parts.push(sql`(${ors})`);
      }
      if (w.county) parts.push(sql`lower(unaccent(d.county)) = ${fold(w.county)}`);
      if (w.kind) {
        const ors = KIND_PATTERNS[w.kind]
          .map((pat) => sql`lower(unaccent(d.authority_name)) like ${fold(pat)}`)
          .reduce((a, b) => sql`${a} or ${b}`);
        parts.push(sql`(${ors})`);
      }
      if (w.authorityId) parts.push(sql`d.authority_id = ${w.authorityId}`);
      if (w.supplierId) parts.push(sql`d.supplier_id = ${w.supplierId}`);
      if (w.uatSiruta !== null)
        parts.push(
          sql`d.authority_id in (select au.entity_id from reference.authority_uat au where au.uat_siruta = ${w.uatSiruta})`,
        );
      if (w.singleBidder) parts.push(sql`d.is_single_bidder = true`);
      if (w.adminSupplierIds !== null)
        parts.push(sql`d.supplier_id = any(${sql.array(w.adminSupplierIds)}::bigint[])`);
      if (w.minEmployees !== null || w.maxEmployees !== null)
        parts.push(employeesCond(sql, w.minEmployees, w.maxEmployees));
      if (w.yearFrom !== null) {
        if (w.monthFrom !== null)
          parts.push(
            sql`substr(d.finalization_date, 1, 7) >= ${`${w.yearFrom}-${String(w.monthFrom).padStart(2, "0")}`}`,
          );
        else parts.push(sql`substr(d.finalization_date, 1, 4) >= ${String(w.yearFrom)}`);
      }
      if (w.yearTo !== null) {
        if (w.monthTo !== null)
          parts.push(
            sql`substr(d.finalization_date, 1, 7) <= ${`${w.yearTo}-${String(w.monthTo).padStart(2, "0")}`}`,
          );
        else parts.push(sql`substr(d.finalization_date, 1, 4) <= ${String(w.yearTo)}`);
      }
      return parts.reduce((a, b) => sql`${a} and ${b}`);
    };
    const cnt = (await s`
      select count(*) n from ${txt} d where ${whereFrag()}
    `) as unknown as { n: string }[];
    const rows = (await s`
      select ${codeCol} da_code, d.finalization_date, d.authority_id, d.authority_name,
             d.supplier_id, d.supplier_name, d.county, d.cpv_name, d.closing_value,
             ${provCols}
      from ${txt} d
      where ${whereFrag()}
      order by ${sortFrag} ${dirFrag}, ${tieCol}
      limit ${pageSize} offset ${p * pageSize}
    `) as unknown as {
      da_code: string | null;
      finalization_date: string | null;
      authority_id: string | null;
      authority_name: string | null;
      supplier_id: string | null;
      supplier_name: string | null;
      county: string | null;
      cpv_name: string | null;
      closing_value: string;
      src: "da" | "contracts";
      ref_id: string | null;
      ca_notice_id: string | null;
      ted_pubnum: string | null;
    }[];
    return {
      rows: rows.map((r) => ({
        daCode: r.da_code,
        date: r.finalization_date ? r.finalization_date.slice(0, 10) : null,
        authorityId: r.authority_id === null ? null : String(r.authority_id),
        authority: r.authority_name,
        supplierId: r.supplier_id === null ? null : String(r.supplier_id),
        supplier: r.supplier_name,
        county: r.county,
        cpvName: r.cpv_name,
        value: Number(r.closing_value),
        src: r.src,
        refId: r.ref_id === null ? null : String(r.ref_id),
        caNoticeId: r.ca_notice_id === null ? null : String(r.ca_notice_id),
        tedPubnum: r.ted_pubnum,
      })),
      total: Number(cnt[0]?.n ?? 0),
      page: p,
      pageSize,
    };
  });
}

/**
 * Human-readable SQL for the "vezi interogarea (avansat)" toggle. Display-only —
 * execution always goes through the parameterized builder above.
 */
function buildDisplaySql(spec: AskSpec, w: WhereParts): string {
  const ds = spec.dataset ?? "all";
  const dtable =
    ds === "contracts"
      ? "marts.contract_transactions"
      : ds === "da"
        ? "marts.da_transactions"
        : "(marts.da_transactions ∪ marts.contract_transactions)  -- canale disjuncte";
  const conds: string[] = ["closing_value > 0"];
  if (w.plafond === "strict")
    conds.push(`closing_value <= ${DA_PLAFOND_RON}  -- plafon plauzibilitate`);
  if (w.plafond === "da-branch")
    conds.push(
      `(src = 'contracts' or closing_value <= ${DA_PLAFOND_RON})  -- plafon doar pe achizițiile directe`,
    );
  if (w.cpvPrefixes.length > 0)
    conds.push("(" + w.cpvPrefixes.map((p) => `cpv_code like '${p}%'`).join(" or ") + ")");
  if (w.county) conds.push(`unaccent(county) ilike '${fold(w.county)}'`);
  if (w.kind) conds.push(`-- doar ${KIND_LABEL[w.kind]} (filtru pe nume)`);
  if (w.authorityId) conds.push(`authority_id = ${w.authorityId}`);
  if (w.supplierId) conds.push(`supplier_id = ${w.supplierId}`);
  if (w.uatSiruta !== null)
    conds.push(
      `authority_id in (select entity_id from reference.authority_uat\n                   where uat_siruta = ${w.uatSiruta})  -- toate autoritățile din localitate`,
    );
  if (w.singleBidder) conds.push("is_single_bidder = true  -- un singur ofertant (din TED)");
  if (w.minEmployees !== null || w.maxEmployees !== null) {
    const b =
      w.minEmployees !== null && w.maxEmployees !== null
        ? `between ${w.minEmployees} and ${w.maxEmployees}`
        : w.minEmployees !== null
          ? `>= ${w.minEmployees}`
          : `<= ${w.maxEmployees}`;
    conds.push(
      `supplier_id in (select entity_id from marts.entity_profile\n` +
        `                where role = 'supplier' and employees ${b})  -- bilanț MF, ultimul depus`,
    );
  }
  if (w.adminSupplierIds !== null)
    conds.push(`supplier_id in (firmele reprezentate de persoana aleasă)  -- ONRC`);
  if (w.yearFrom !== null) {
    if (w.monthFrom !== null)
      conds.push(`luna >= '${w.yearFrom}-${String(w.monthFrom).padStart(2, "0")}'`);
    else conds.push(`an >= ${w.yearFrom}`);
  }
  if (w.yearTo !== null) {
    if (w.monthTo !== null)
      conds.push(`luna <= '${w.yearTo}-${String(w.monthTo).padStart(2, "0")}'`);
    else conds.push(`an <= ${w.yearTo}`);
  }
  const where = conds.join("\n  and ");
  const measure = spec.measure === "count" ? "count(*)" : "sum(closing_value)";
  const dim = spec.dim ?? "authority";
  const dimCol =
    dim === "county" ? "county" : dim === "authority" ? "authority_name" : "supplier_name";

  switch (spec.block) {
    case "stat":
      return `select ${measure}\nfrom ${dtable}\nwhere ${where};`;
    case "timeseries":
      return `select an, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by an order by an;`;
    case "map":
      return `select county, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by county;`;
    case "table": {
      const perCap = spec.measure === "value_per_capita";
      return (
        `select ${dimCol}, ${perCap ? "sum(closing_value) / populatie" : measure}\n` +
        `from ${dtable}${perCap ? "\njoin marts.entity_profile using (entity_id)  -- populație UAT" : ""}\n` +
        `where ${where}\n` +
        `group by ${dimCol}\norder by 2 desc\nlimit ${spec.topN ?? `${TABLE_PAGE_SIZE} offset <pagină>`};`
      );
    }
    case "compare":
      return `select name_display, total_ron, n_das, cri, n_flags, flags\nfrom marts.entity_flags\nwhere entity_id in (cele două entități);`;
    case "distribution":
      return `select width_bucket(cri, 0, 1, 10) interval_risc, count(*)\nfrom marts.entity_flags\nwhere n_das >= ${RISK_MIN_DAS}\ngroup by 1;\n-- + poziția entității tale în distribuție`;
    case "breakdown":
      return `select categoria_cpv, ${measure}\nfrom ${dtable}\nwhere ${where}\ngroup by categoria_cpv\norder by 2 desc;`;
    case "scatter":
      return `select name_display, total_ron, cri, n_flags\nfrom marts.entity_flags\nwhere n_das >= ${RISK_MIN_DAS} and cri is not null;`;
    case "sankey":
      return `select partener, categoria_cpv, sum(closing_value)\nfrom ${dtable}\nwhere ${where}\ngroup by partener, categoria_cpv;`;
    case "network":
      return `select partener, sum(closing_value), count(*)\nfrom ${dtable}\nwhere ${where}\ngroup by partener\norder by 2 desc;`;
    case "entity_card":
      return `select *\nfrom marts.entity_flags\nwhere n_das >= 20 ${w.kind ? `-- doar ${KIND_LABEL[w.kind]}` : ""}\norder by ${(spec.rankBy ?? "risk") === "risk" ? "cri" : "total_ron"} desc\nlimit 1;`;
    case "fact_check":
      return `select count(*), sum(closing_value)\nfrom ${dtable}\nwhere ${where};`;
    case "trend":
      return (
        `select ${dimCol},\n  sum(closing_value) filter (where an = ${w.yearFrom ?? "primul_an"}) inainte,\n` +
        `  sum(closing_value) filter (where an = ${w.yearTo ?? "ultimul_an"}) dupa\n` +
        `from ${dtable}\nwhere ${where}\ngroup by ${dimCol}\norder by abs(dupa - inainte) desc\nlimit ${spec.topN ?? 10};`
      );
  }
}
