import { CALLOFF_OVER_CEILING, contractKind, contractRonValue, corroboratedCui, createDb, type DbSql } from "@seap/db";
import { daPurchaseType } from "@seap/domain";
import type { ContractDetail } from "./marts";
import type { CnscMention, ContractContext, FrameworkLink, PairContext, PairHistory, TedContext } from "./record-types";
import { contractNotice } from "./documents/store";
import { awardDocumentsKey } from "./documents/shared";
import { effectiveClassification } from "./documents/classify";
import type { Classification, ClassifiablePart } from "./documents/classification";

/*
 * The extra context of the record pages (owner decisions, 7 November 2026): TED, framework ↔ call-offs, CNSC, and the
 * firm–institution pair. Every query is a keyed lookup (primary key or index prefix) and they run in parallel; a part
 * that fails is logged and left empty so the record itself still renders.
 */

const g = globalThis as unknown as { __seapSql?: DbSql };
function db(): DbSql {
  if (!g.__seapSql) g.__seapSql = createDb().sql;
  return g.__seapSql;
}

const ID = /^[1-9]\d{0,17}$/;
/** The site's plausibility limit for one direct acquisition, as in every total. */
const DA_LIMIT_RON = 2_000_000;
/** The confirmed TED crosswalk tier (is_primary, score ≥ 0.9), the only one surfaced as fact (ted-mart.ts). */
const TED_CONFIRMED_SCORE = 0.9;

async function settle<T>(label: string, work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.error(`record-context: ${label}`, error);
    return fallback;
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** A TED publication number ("157568-2026", "030917-2022") from TED's own form or SICAP's OJ S form ("2020/S 190-458412"). */
export function tedPublicationNumber(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  // SICAP also carries typos ("1067/S …", "9995/S …"): only this century's years make a TED address.
  if (/^\d{1,8}-20\d{2}$/.test(s)) return s;
  const oj = /^(20\d{2})\s*\/\s*S\s*\d{1,3}\s*-\s*(\d{1,8})$/i.exec(s);
  return oj ? `${oj[2]}-${oj[1]}` : null;
}

/** The TED page of a notice, in the form the contract page and the evidence exports already use. */
export function tedNoticeUrl(raw: string | null | undefined): string | null {
  const pub = tedPublicationNumber(raw);
  return pub ? `https://ted.europa.eu/en/notice/-/detail/${pub}` : null;
}

/** A calendar day from SEAP's file dates ("2025-10-01T…", "01.10.2025 10:20"); anything else is dropped. */
export function calendarDay(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ro = /^(\d{2})[./](\d{2})[./](\d{4})/.exec(s);
  return ro ? `${ro[3]}-${ro[2]}-${ro[1]}` : null;
}

const foldName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface ClassifiedDocument {
  id: string;
  filename: string | null;
  publishedAt: string | null;
  sourceType: string | null;
  categories: readonly string[];
}

/** The procedure's complaint documents: the first naming CNSC (file name or SEAP type), else the first complaint, by date. */
export function pickCnscDocument(docs: readonly ClassifiedDocument[]): CnscMention | null {
  const complaints = docs.filter((d) => d.categories.includes("complaints"));
  if (complaints.length === 0) return null;
  const names = (d: ClassifiedDocument) => /\bcnsc\b/.test(foldName(`${d.filename ?? ""} ${d.sourceType ?? ""}`).replace(/[_\-.]+/g, " "));
  const ranked = complaints
    .map((d) => ({ d, cnsc: names(d), day: calendarDay(d.publishedAt) }))
    .sort((a, b) => Number(b.cnsc) - Number(a.cnsc) || (a.day ?? "9999").localeCompare(b.day ?? "9999") || a.d.id.localeCompare(b.d.id));
  const first = ranked[0]!;
  return { documentId: first.d.id, filename: first.d.filename, date: first.day, mentionsCnsc: first.cnsc, complaints: complaints.length };
}

const ceilingKey = (cpv: string | null, acquisitionType: string | null) => {
  const type = daPurchaseType(cpv, acquisitionType);
  return type === "works" ? "da_ceiling_works" : type === "goods_services" ? "da_ceiling_goods_services" : null;
};

/**
 * Whether a direct acquisition is one of the purchases of its pair's marts.da_slicing window: same CPV class and
 * ceiling type, finalized inside the window, plausible and under the ceiling (the rules of daSlicingSelectSql). The
 * window's ceiling is the highest in it, so an acquisition on an era boundary may be misjudged.
 */
export function inSlicingWindow(
  da: { cpvCode: string | null; acquisitionType: string | null; day: string | null; value: number | null; valueSuspect: boolean | null },
  window: { cpvClass: string | null; acquisitionType: string | null; from: string | null; to: string | null; ceiling: number | null },
): boolean {
  const cpv = da.cpvCode?.trim() ?? "";
  if (!da.day || !window.from || !window.to || !window.cpvClass || da.valueSuspect !== false) return false;
  if (da.value == null || !(da.value > 0) || (window.ceiling != null && !(da.value < window.ceiling))) return false;
  if (cpv.slice(0, 4) !== window.cpvClass) return false;
  if (ceilingKey(cpv, da.acquisitionType) !== window.acquisitionType) return false;
  return da.day >= window.from && da.day <= window.to;
}

const yearOf = (date: string | null | undefined): number | null => {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y > 1990 && y < 2100 ? y : null;
};
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));

// ── Firm ↔ institution ──────────────────────────────────────────────────────

/**
 * One PairContext per supplier (input order, duplicates and non-numeric ids dropped): its dependence on the
 * institution (marts.supplier_dependency), its size in `year` or the latest year before it (MF balance sheets, a
 * corroborated CUI only), and the pair's other records without the one on the page (`exclude`).
 */
export async function getPairContexts(
  authorityId: string,
  supplierIds: readonly string[],
  year: number | null,
  exclude: { contractIds?: readonly string[]; daId?: string | null } = {},
  database?: DbSql,
): Promise<PairContext[]> {
  const ids = [...new Set(supplierIds.filter((s) => ID.test(s) && s !== authorityId))];
  if (!ID.test(authorityId) || ids.length === 0) return [];
  const q = database ?? db();
  const contractIds = (exclude.contractIds ?? []).filter((s) => ID.test(s));
  const daId = exclude.daId && ID.test(exclude.daId) ? exclude.daId : "0";
  const finYear = year != null && Number.isInteger(year) ? year : null;
  type Dep = { sid: string; v_all: string | null; v_total: string | null; n_here: number; n_da_here: number; n_auth: number | null; y0: number | null; y1: number | null };
  type Fin = { sid: string; year: number; employees: number | null; turnover: string | null };
  type Hist = { sid: string; n_da: number; n_ct: number; total: string };
  const [deps, fins, hist] = await Promise.all([
    settle("supplier_dependency", q<Dep[]>`
      select supplier_id::text sid, v_all::text, v_total::text, n_here::int, n_da_here::int, n_auth::int, y0, y1
      from marts.supplier_dependency
      where authority_id = ${authorityId} and supplier_id = any(${q.array(ids)}::bigint[])`, [] as Dep[]),
    settle("company_financials", q<Fin[]>`
      select e.id::text sid, f.year, f.employees, f.net_turnover::text turnover
      from core.entities e
      join lateral (
        select fc.year, fc.employees, fc.net_turnover from reference.company_financials fc
        where fc.cui = ${corroboratedCui(q, "e")} and (${finYear}::int is null or fc.year <= ${finYear}::int)
          and (fc.employees is not null or fc.net_turnover is not null)
        order by fc.year desc limit 1
      ) f on true
      where e.id = any(${q.array(ids)}::bigint[])`, [] as Fin[]),
    settle("pair history", q<Hist[]>`
      select supplier_id::text sid,
        count(*) filter (where src = 'da')::int n_da, count(*) filter (where src = 'ct')::int n_ct,
        coalesce(sum(cv), 0)::text total
      from (
        select supplier_id, 'da' src, closing_value cv from marts.da_transactions
        where authority_id = ${authorityId} and supplier_id = any(${q.array(ids)}::bigint[])
          and closing_value > 0 and closing_value <= ${DA_LIMIT_RON} and sicap_da_id <> ${daId}
        union all
        select supplier_id, 'ct', closing_value from marts.contract_transactions
        where authority_id = ${authorityId} and supplier_id = any(${q.array(ids)}::bigint[])
          and closing_value > 0 and contract_id <> all(${q.array(contractIds.length ? contractIds : ["0"])}::bigint[])
      ) u group by supplier_id`, [] as Hist[]),
  ]);
  const depBy = new Map(deps.map((d) => [d.sid, d]));
  const finBy = new Map(fins.map((f) => [f.sid, f]));
  const histBy = new Map(hist.map((h) => [h.sid, h]));
  return ids.map((sid): PairContext => {
    const d = depBy.get(sid), f = finBy.get(sid), h = histBy.get(sid);
    const all = num(d?.v_all), total = num(d?.v_total);
    const history: PairHistory = { nDa: h?.n_da ?? 0, nCt: h?.n_ct ?? 0, totalRon: Number(h?.total ?? 0), totalRonExact: h?.total ?? "0" };
    return {
      supplierId: sid,
      dependence: d ? {
        share: all != null && total != null && total > 0 ? Math.min(1, all / total) : null,
        nHere: Number(d.n_here ?? 0) + Number(d.n_da_here ?? 0),
        nContractsHere: Number(d.n_here ?? 0),
        nDaHere: Number(d.n_da_here ?? 0),
        valueHereRon: d.v_all,
        valueAllRon: d.v_total,
        institutions: d.n_auth == null ? null : Number(d.n_auth),
        firstYear: d.y0 == null ? null : Number(d.y0),
        lastYear: d.y1 == null ? null : Number(d.y1),
      } : null,
      size: f ? { year: Number(f.year), employees: f.employees == null ? null : Number(f.employees), turnoverRon: f.turnover } : null,
      history,
    };
  });
}

// ── TED ─────────────────────────────────────────────────────────────────────

async function tedContext(q: DbSql, contractIds: string[], sicapTedNo: string | null): Promise<TedContext | null> {
  const sicapPub = tedPublicationNumber(sicapTedNo);
  type Link = { pub: string; estimate: string | null; eu_funded: boolean | null; tenders: number | null; lot_title: string | null; lot_id: string | null; award_date: string | null; published_on: string | null; score: number; linked: number };
  type Notice = { pub: string; estimate: string | null; eu_funded: boolean | null; award_date: string | null; published_on: string | null };
  const [links, notices] = await Promise.all([
    // Materialized so the planner starts from the contract (award_links_contract_idx): with ORDER BY score LIMIT 1
    // it otherwise walks award_links_score_idx, 1.6 s on a framework with 1,620 links.
    q<Link[]>`
      with links as materialized (
        select l.ted_lot_result_id, l.match_score from core.award_links l
        where l.contract_id = any(${q.array(contractIds)}::bigint[]) and l.is_primary and l.match_score >= ${TED_CONFIRMED_SCORE}::real
      )
      select n.publication_number pub,
        coalesce(r.estimated_value_ron, case when n.lot_count = 1 then n.estimated_value_ron end)::text estimate,
        n.eu_funded, r.tenders_received tenders, nullif(btrim(r.title), '') lot_title, r.lot_id,
        to_char(n.award_date at time zone 'UTC', 'YYYY-MM-DD') award_date,
        to_char(n.publication_date at time zone 'UTC', 'YYYY-MM-DD') published_on,
        round(l.match_score::numeric, 4)::float8 score,
        (select count(distinct r2.ted_notice_id)::int from links l2 join core.ted_lot_results r2 on r2.id = l2.ted_lot_result_id) linked
      from links l
      join core.ted_lot_results r on r.id = l.ted_lot_result_id
      join core.ted_notices n on n.id = r.ted_notice_id
      -- the order of marts.contract_competition, so the number matches ted_pubnum elsewhere on the site
      order by l.match_score desc, l.ted_lot_result_id
      limit 1`,
    sicapPub
      ? q<Notice[]>`
          select publication_number pub, case when lot_count = 1 then estimated_value_ron end::text estimate, eu_funded,
            to_char(award_date at time zone 'UTC', 'YYYY-MM-DD') award_date,
            to_char(publication_date at time zone 'UTC', 'YYYY-MM-DD') published_on
          from core.ted_notices where publication_number = ${sicapPub}`
      : Promise.resolve([] as Notice[]),
  ]);
  const l = links[0];
  if (l) {
    return {
      basis: "link", publicationNumber: l.pub, url: tedNoticeUrl(l.pub), estimateRon: l.estimate, euFunded: l.eu_funded,
      tendersReceived: l.tenders == null ? null : Number(l.tenders), lotTitle: l.lot_title, lotId: l.lot_id,
      awardDate: l.award_date, publishedOn: l.published_on, matchScore: Number(l.score), linkedNotices: Number(l.linked),
    };
  }
  if (!sicapPub) return null;
  const n = notices[0];
  return {
    basis: "sicap", publicationNumber: sicapPub, url: tedNoticeUrl(sicapPub), estimateRon: n?.estimate ?? null,
    euFunded: n?.eu_funded ?? null, tendersReceived: null, lotTitle: null, lotId: null,
    awardDate: n?.award_date ?? null, publishedOn: n?.published_on ?? null, matchScore: null, linkedNotices: 0,
  };
}

// ── Framework ↔ call-offs ───────────────────────────────────────────────────

/** The award notice and its republications: same buyer and notice number (frameworkHasCalloffs in packages/db). */
const family = (q: DbSql, caNoticeId: string) => q`
  select ca_notice_id from core.awards where ca_notice_id = ${caNoticeId}
  union
  select p.ca_notice_id from core.awards parent
  join core.awards p on p.notice_no = parent.notice_no and p.authority_entity_id = parent.authority_entity_id
  where parent.ca_notice_id = ${caNoticeId} and parent.notice_no is not null`;

/** `inner` is one lot of `outer`'s caption: equal, or one of its comma-separated lots. */
const lotWithin = (q: DbSql, outer: ReturnType<DbSql>, inner: ReturnType<DbSql>) =>
  q`strpos(', ' || ${outer} || ',', ', ' || ${inner} || ',') > 0`;

/** Some winner in common, or no winner recorded on `contractId`. */
const sharesWinner = (q: DbSql, contractId: string, alias: string) => q`(
  not exists (select 1 from core.contract_winners w0 where w0.contract_id = ${contractId})
  or exists (select 1 from core.contract_winners wx join core.contract_winners w0 on w0.entity_id = wx.entity_id
             where wx.contract_id = ${q(alias)}.id and w0.contract_id = ${contractId}))`;


/**
 * One framework's call-offs: over the notice's versions, one of its lots (or all), a winner in common, counted as the
 * totals count them; with the framework's RON ceiling and how many call-offs declare that whole ceiling (the
 * award_calloffs_over_ceiling signal reads the same match, apps/ingestion/src/flags/competition.ts).
 */
async function frameworkCalloffs(q: DbSql, caNoticeId: string, frameworkId: string, lots: string) {
  const [r] = await q<{ publications: number; counted: number; declared: string | null; ron: string | null; ceiling: string | null; repeats: number }[]>`
    with fam as (${family(q, caNoticeId)}),
    ceiling as (select ${contractRonValue(q)} v from core.contracts c where c.id = ${frameworkId}),
    calloffs as (
      -- The call-off's own declared RON value (contractRonValue, on alias x).
      select distinct x.id, (case when x.amount_status in ('ron','converted') and x.amount_raw_id = x.raw_id then x.value_ron
          when x.amount_status is null and upper(trim(x.currency)) = 'RON' then x.contract_value end) value
      from fam join core.contracts x on x.ca_notice_id = fam.ca_notice_id
      where x.id <> ${frameworkId} and nullif(btrim(x.lots_caption), '') is not null
        and ${lotWithin(q, q`${lots}::text`, q`x.lots_caption`)}
        and ${contractKind(q, "x")} = 'calloff' and ${sharesWinner(q, frameworkId, "x")}
    ),
    counted as (
      select c.id, c.value, sum(ct.closing_value) ron from calloffs c join marts.contract_transactions ct on ct.contract_id = c.id group by 1, 2
    )
    select (select count(*)::int from calloffs) publications, count(*)::int counted,
      sum(value)::text declared, sum(ron)::text ron, (select v::text from ceiling) ceiling,
      count(*) filter (where abs(value - (select v from ceiling)) <= ${CALLOFF_OVER_CEILING.repeat}::numeric * (select v from ceiling))::int repeats
    from counted`;
  return { publications: Number(r?.publications ?? 0), counted: Number(r?.counted ?? 0), declared: r?.declared ?? null, ron: r?.ron ?? null,
    ceiling: r?.ceiling ?? null, repeats: Number(r?.repeats ?? 0) };
}

async function frameworkLink(q: DbSql, detail: ContractDetail, lots: string | null): Promise<FrameworkLink | null> {
  const kind = detail.financialKind;
  if ((kind !== "framework" && kind !== "calloff") || !detail.caNoticeId || !lots) return null;
  if (kind === "framework") {
    const r = await frameworkCalloffs(q, detail.caNoticeId, detail.contractId, lots);
    return { role: "framework", calloffs: r.counted, calloffsRon: r.ron, declaredRon: r.declared, publications: r.publications, ceilingRon: r.ceiling, repeats: r.repeats };
  }
  const [r] = await q<{ id: string; ca_notice_id: string; lots: string; nat_id: string; title: string | null; framework_day: string | null; candidates: number }[]>`
    with fam as (${family(q, detail.caNoticeId)})
    select f.id::text id, f.ca_notice_id::text ca_notice_id, f.lots_caption lots, f.ca_notice_contract_id::text nat_id, nullif(btrim(f.title), '') title,
      to_char(f.contract_date at time zone 'Europe/Bucharest', 'YYYY-MM-DD') framework_day, count(*) over ()::int candidates
    from fam join core.contracts f on f.ca_notice_id = fam.ca_notice_id
    where f.id <> ${detail.contractId} and nullif(btrim(f.lots_caption), '') is not null
      and ${lotWithin(q, q`f.lots_caption`, q`${lots}::text`)}
      and ${contractKind(q, "f")} = 'framework' and ${sharesWinner(q, detail.contractId, "f")}
    order by (f.ca_notice_id = ${detail.caNoticeId}) desc, f.contract_date nulls last, f.id
    limit 1`;
  if (!r) return null;
  const sums = await frameworkCalloffs(q, r.ca_notice_id, r.id, r.lots);
  const own = detail.valueRonExact ?? (detail.amountStatus === "ron" || detail.amountStatus === "legacy_ron" ? detail.contractValueExact : null);
  const repeatsCeiling = own !== null && sums.ceiling !== null && Math.abs(Number(own) - Number(sums.ceiling)) <= CALLOFF_OVER_CEILING.repeat * Number(sums.ceiling);
  return { role: "calloff", frameworkNatId: r.nat_id, frameworkTitle: r.title, frameworkDate: r.framework_day, candidates: Number(r.candidates),
    ceilingRon: sums.ceiling, calloffs: sums.counted, calloffsRon: sums.ron, declaredRon: sums.declared, repeatsCeiling };
}

// ── CNSC ────────────────────────────────────────────────────────────────────

async function cnscMention(q: DbSql, detail: ContractDetail): Promise<CnscMention | null> {
  const notice = await contractNotice(detail.natId, q);
  const keys = [notice?.key, detail.caNoticeId ? awardDocumentsKey(detail.caNoticeId) : null].filter((k): k is string => !!k);
  if (keys.length === 0) return null;
  type Doc = { id: string; filename: string; published_at: string | null; source_type: string | null; section: string | null; classification: Classification | null; contents: ClassifiablePart[] | null };
  const docs = await q<Doc[]>`
    select id::text, filename, published_at, source_type, section, classification, contents
    from app.procurement_documents where notice_key = any(${q.array(keys)}::text[])`;
  return pickCnscDocument(docs.map((d) => ({
    id: d.id, filename: d.filename, publishedAt: d.published_at, sourceType: d.source_type,
    categories: effectiveClassification({ filename: d.filename, classification: d.classification, contents: d.contents, section: d.section, sourceType: d.source_type }).categories,
  })));
}

// ── Contract ────────────────────────────────────────────────────────────────

/** Everything getContractDetail does not read, in parallel; `lots` is the contract's raw lot caption. */
export async function getContractContext(detail: ContractDetail, database?: DbSql): Promise<ContractContext> {
  const q = database ?? db();
  const contractIds = [...new Set([detail.contractId, detail.statisticsContractId].filter((s) => ID.test(s)))];
  const authorityId = detail.authority?.entityId ?? null;
  const supplierIds = detail.winners.map((w) => w.entityId).filter((s) => s !== authorityId);
  const year = yearOf(detail.contractDate) ?? yearOf(detail.stateDate);
  const lots = detail.lotsCaption && detail.lotsCaption.trim() ? detail.lotsCaption : null;
  const [ted, framework, cnsc, pairs] = await Promise.all([
    settle("ted", tedContext(q, contractIds, detail.tedNoticeNo), null),
    settle("framework", frameworkLink(q, detail, lots), null),
    settle("cnsc", cnscMention(q, detail), null),
    authorityId ? settle("pairs", getPairContexts(authorityId, supplierIds, year, { contractIds }, q), []) : Promise.resolve([]),
  ]);
  return { ted, framework, cnsc, pairs };
}
