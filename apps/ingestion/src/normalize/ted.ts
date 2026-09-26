import { eq } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import {
  tedLotWinners,
  tedNotices,
  type TedAmountDetails,
  type TedSourceAmount,
} from "@seap/db";
import type { NormalizeCtx } from "./context.js";
import { resolveCpvPrefix } from "./cpv.js";
import { resolveEntity } from "./resolve-entity.js";
import { insertTedWinners, replaceTedLots, tryReplaceTedAmounts } from "./ted-load.js";

/**
 * TED eForms (UBL ContractAwardNotice) → core mapper. The raw payload is
 * `{ xml }`; we parse it to a tree, resolve the cross-referenced parties
 * (buyer + per-lot winners) into core.entities by CUI, and write one
 * ted_notices row + N ted_lot_results (+ winners). Idempotent under replay:
 * the notice and lots upsert on their source identities; stale lots and winner
 * edges are removed. Replay retains lot IDs and invalidates old match scores.
 *
 * eForms coverage for RO is 2023+; older F-forms use the sibling mapper.
 * Source cardinality and amount kinds remain explicit across SDK versions.
 */

// ── XML tree helpers ─────────────────────────────────────────────────────
// Namespaced tags keep their prefix (efac:/cbc:/cac:). Values stay strings
// (parseTagValue:false) so a bare-numeric CompanyID never becomes a JS number.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export type Node = Record<string, unknown>;

/** Shared eForms/legacy XML parser config (see `parser` above semantics). */
export function makeTedXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
}

/** Coerce a possibly-single / possibly-array child into an array. */
export function asArray(v: unknown): Node[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]) as Node[];
}

/** Text content of an element, whether it's a bare string or `{ '#text' }`. */
export function txt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v || null;
  if (typeof v === "object") {
    const t = (v as Node)["#text"];
    return typeof t === "string" ? t || null : null;
  }
  return null;
}

/** Attribute value of an element (elements carrying attrs are objects). */
export function attr(v: unknown, name: string): string | null {
  if (v && typeof v === "object") {
    const a = (v as Node)[`@_${name}`];
    return typeof a === "string" ? a : null;
  }
  return null;
}

/** Walk a chain of child keys; returns the node or undefined. */
export function dig(node: unknown, ...path: string[]): unknown {
  let cur: unknown = node;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Node)[key];
  }
  return cur;
}

/** eForms dates are 'YYYY-MM-DD±hh:mm'. Take the date part; drop the sentinel. */
function tedDate(v: unknown, dropSentinel = false): Date | null {
  const s = txt(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (dropSentinel && iso === "2000-01-01") return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** numeric column value: keep as string, Postgres numeric preserves precision. */
export const dec = (v: unknown): string | null => {
  const s = txt(v);
  if (s == null) return null;
  const clean = s.replace(/\s/g, "");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean) ? clean.replace(/^\+/, "") : null;
};

export const TED_NORMALIZATION_VERSION = 2;

/** Missing, invalid or contradictory statistics must never become "multiple bids". */
export function tenderCount(values: unknown[]): number | null {
  const texts = values.map(txt);
  if (!texts.length || texts.some((v) => v == null || !/^\d+$/.test(v))) return null;
  const counts = texts.map(Number);
  if (counts.some((n) => !Number.isSafeInteger(n) || n > 2_147_483_647)) return null;
  return new Set(counts).size === 1 ? counts[0]! : null;
}

/** ojs '00063449-2026' → publication-number '63449-2026' (zero-trimmed). */
function ojsToPublicationNumber(ojs: string | null): string | null {
  if (!ojs) return null;
  const m = /^0*(\d+)-(\d{4})$/.exec(ojs.trim());
  return m ? `${m[1]}-${m[2]}` : ojs.trim();
}

// ── structured extraction ────────────────────────────────────────────────
interface TedOrg {
  cui: string | null;
  name: string;
  nuts: string | null;
  country: string | null;
}

interface TedLot {
  lotId: string;
  resultId: string | null;
  cpvRaw: string | null;
  contractNature: string | null;
  title: string | null;
  estimated: string | null;
  awarded: string | null;
  currency: string | null;
  amountKind: string;
  amountDetails: TedAmountDetails;
  tendersReceived: number | null;
  winnerSelectionStatus: string | null;
  contractDate: Date | null;
  winnerOrgIds: string[];
  euFunded: boolean;
}

interface TedNotice {
  amountReplaySafe: boolean;
  publicationNumber: string | null;
  ojsNoticeId: string | null;
  noticeType: string | null;
  regulatoryDomain: string | null;
  contractFolderId: string | null;
  noticeUuid: string | null;
  procedureType: string | null;
  buyerOrgId: string | null;
  buyerLegalType: string | null;
  buyerActivity: string | null;
  cpvRaw: string | null;
  contractNature: string | null;
  title: string | null;
  estimated: string | null;
  currency: string | null;
  awardedTotal: string | null;
  publicationDate: Date | null;
  issueDate: Date | null;
  awardDate: Date | null;
  orgs: Map<string, TedOrg>;
  lots: TedLot[];
}

/** The top-level EformsExtension (the one carrying NoticeResult/Organizations). */
function findEformsExt(root: unknown): Node | null {
  for (const ext of asArray(dig(root, "ext:UBLExtensions", "ext:UBLExtension"))) {
    const e = dig(ext, "ext:ExtensionContent", "efext:EformsExtension");
    if (e && typeof e === "object" && (e as Node)["efac:NoticeResult"]) {
      return e as Node;
    }
  }
  return null;
}

/** Value + currency of an amount element (`{ '#text', '@_currencyID' }`). */
function amount(v: unknown): { value: string | null; currency: string | null } {
  return { value: dec(v), currency: attr(v, "currencyID") };
}

/** First non-null amount in a preference list; carries its currency. */
function firstAmount(
  ...vs: unknown[]
): { value: string | null; currency: string | null } {
  for (const v of vs) {
    const a = amount(v);
    if (a.value != null) return a;
  }
  return { value: null, currency: null };
}

/** Estimated value from a RequestedTenderTotal node (nested eForms extension). */
function estimatedFrom(reqTotal: unknown): string | null {
  const fw = dig(
    reqTotal,
    "ext:UBLExtensions",
    "ext:UBLExtension",
    "ext:ExtensionContent",
    "efext:EformsExtension",
    "efbc:FrameworkMaximumAmount",
  );
  return (
    dec(fw) ??
    dec(dig(reqTotal, "cbc:EstimatedOverallContractAmount")) ??
    dec(dig(reqTotal, "cbc:TotalAmount"))
  );
}

/** Conservative proof that repaired parsing leaves the old winner graph unchanged.
 * Source shape must be unambiguous; DB lot identities/dates are checked separately.
 */
function unchangedWinnerMapping(root: Node, ext: Node, lots: TedLot[]): boolean {
  const result = dig(ext, "efac:NoticeResult");
  const results = asArray(dig(result, "efac:LotResult"));
  const tenders = asArray(dig(result, "efac:LotTender"));
  const parties = asArray(dig(result, "efac:TenderingParty"));
  const organizations = asArray(dig(ext, "efac:Organizations", "efac:Organization"));
  const ids = (nodes: Node[], path: string[]) => nodes.map((node) => txt(dig(node, ...path)));
  const unique = (values: (string | null)[]) => values.every((id) => id != null) && new Set(values).size === values.length;
  const orgIds = ids(organizations, ["efac:Company", "cac:PartyIdentification", "cbc:ID"]);
  if (!lots.length || results.length !== lots.length || !unique(ids(tenders, ["cbc:ID"]))
    || !unique(ids(parties, ["cbc:ID"])) || !unique(orgIds)
    || !unique(ids(results, ["cbc:ID"]))
    || !unique(ids(results, ["efac:TenderLot", "cbc:ID"]))
    || !unique(ids(asArray(root["cac:ProcurementProjectLot"]), ["cbc:ID"]))) return false;
  const settledRefs = new Set<string>();
  for (const contract of asArray(dig(result, "efac:SettledContract"))) {
    const ref = dig(contract, "efac:LotTender");
    const id = txt(dig(ref, "cbc:ID"));
    if (Array.isArray(ref) || !id || settledRefs.has(id)) return false;
    settledRefs.add(id);
  }
  const byTender = new Map(tenders.map((t) => [txt(dig(t, "cbc:ID")), t]));
  const byParty = new Map(parties.map((t) => [txt(dig(t, "cbc:ID")), t]));
  const byLot = new Map(lots.map((l) => [l.lotId, l]));
  const used = new Set<string>();
  return results.every((res) => {
    const reference = dig(res, "efac:LotTender");
    const id = txt(dig(reference, "cbc:ID"));
    if (Array.isArray(reference) || !id || used.has(id) || txt(dig(res, "cbc:TenderResultCode")) !== "selec-w") return false;
    used.add(id);
    const tender = byTender.get(id);
    const rank = txt(dig(tender, "cbc:RankCode")) ?? txt(dig(tender, "cbc:TenderRank"));
    if (!tender || rank == null || !/^[1-9]\d*$/.test(rank)) return false;
    const party = byParty.get(txt(dig(tender, "efac:TenderingParty", "cbc:ID")));
    const original = ids(asArray(dig(party, "efac:Tenderer")), ["cbc:ID"]);
    const lot = byLot.get(txt(dig(res, "efac:TenderLot", "cbc:ID")) ?? "");
    if (!original.length || !unique(original) || original.some((org) => !orgIds.includes(org)) || !lot) return false;
    // This reproduces the former single-reference winner-org lookup exactly.
    return original.length === lot.winnerOrgIds.length && original.every((org) => lot.winnerOrgIds.includes(org!));
  });
}

export function extractTedNotice(xml: string): TedNotice {
  const doc = parser.parse(xml) as Node;
  const root = (doc["ContractAwardNotice"] ?? {}) as Node;
  const ext = findEformsExt(root) ?? ({} as Node);

  // Organizations index: ORG id → { cui, name, nuts }.
  const orgs = new Map<string, TedOrg>();
  for (const org of asArray(dig(ext, "efac:Organizations", "efac:Organization"))) {
    const company = dig(org, "efac:Company");
    const orgId = txt(dig(company, "cac:PartyIdentification", "cbc:ID"));
    if (!orgId) continue;
    orgs.set(orgId, {
      cui: txt(dig(company, "cac:PartyLegalEntity", "cbc:CompanyID")),
      name: txt(dig(company, "cac:PartyName", "cbc:Name")) ?? "(necunoscut)",
      nuts: txt(dig(company, "cac:PostalAddress", "cbc:CountrySubentityCode")),
      country: txt(
        dig(company, "cac:PostalAddress", "cac:Country", "cbc:IdentificationCode"),
      ),
    });
  }

  const noticeResult = dig(ext, "efac:NoticeResult");

  // TEN id → { payable node, tpaRef }.
  const lotTenderById = new Map<string, { payable: unknown; tpa: string | null; rank: string | null }>();
  for (const lt of asArray(dig(noticeResult, "efac:LotTender"))) {
    const id = txt(dig(lt, "cbc:ID"));
    if (!id) continue;
    lotTenderById.set(id, {
      payable: dig(lt, "cac:LegalMonetaryTotal", "cbc:PayableAmount"),
      rank: txt(dig(lt, "cbc:RankCode")) ?? txt(dig(lt, "cbc:TenderRank")),
      tpa: txt(dig(lt, "efac:TenderingParty", "cbc:ID")),
    });
  }
  // TPA id → [ORG ids] (consortium = many).
  const tenderingPartyById = new Map<string, string[]>();
  for (const tp of asArray(dig(noticeResult, "efac:TenderingParty"))) {
    const id = txt(dig(tp, "cbc:ID"));
    if (!id) continue;
    const tenderers = asArray(dig(tp, "efac:Tenderer"))
      .map((t) => txt(dig(t, "cbc:ID")))
      .filter((x): x is string => x != null);
    tenderingPartyById.set(id, tenderers);
  }
  // A settled contract and a result can each reference several tenders.
  const contractDatesByTender = new Map<string, Set<string>>();
  for (const sc of asArray(dig(noticeResult, "efac:SettledContract"))) {
    const date = tedDate(dig(sc, "cbc:IssueDate"), true)?.toISOString().slice(0, 10);
    for (const ref of asArray(dig(sc, "efac:LotTender"))) {
      const ten = txt(dig(ref, "cbc:ID"));
      if (!ten || !date) continue;
      const dates = contractDatesByTender.get(ten) ?? new Set<string>();
      dates.add(date);
      contractDatesByTender.set(ten, dates);
    }
  }

  // Per-lot procurement metadata (cpv/nature/title/estimated/eu-funded), keyed
  // by the notice-local lot id.
  interface LotMeta {
    cpvRaw: string | null;
    contractNature: string | null;
    title: string | null;
    estimated: string | null;
    euFunded: boolean;
    framework: boolean;
  }
  const lotMetaById = new Map<string, LotMeta>();
  for (const lot of asArray(root["cac:ProcurementProjectLot"])) {
    const lotId = txt(dig(lot, "cbc:ID"));
    if (!lotId) continue;
    const proj = dig(lot, "cac:ProcurementProject");
    const funding = txt(
      dig(lot, "cac:TenderingTerms", "cbc:FundingProgramCode"),
    );
    lotMetaById.set(lotId, {
      cpvRaw: txt(
        dig(proj, "cac:MainCommodityClassification", "cbc:ItemClassificationCode"),
      ),
      contractNature: txt(dig(proj, "cbc:ProcurementTypeCode")),
      title: txt(dig(proj, "cbc:Name")),
      framework: asArray(dig(lot, "cac:TenderingProcess", "cac:ContractingSystem")).some((sys) => {
        const code = dig(sys, "cbc:ContractingSystemTypeCode");
        return attr(code, "listName") === "framework-agreement" && txt(code) != null && txt(code) !== "none";
      }),
      estimated: estimatedFrom(dig(proj, "cac:RequestedTenderTotal")),
      euFunded: funding != null && funding !== "no-eu-funds",
    });
  }

  // Keep one stable row per notice/lot, retaining every result and tender ref.
  // Repeated references are references, not additional monetary transactions.
  const resultsByLot = new Map<string, Node[]>();
  const lotsByTender = new Map<string, Set<string>>();
  for (const res of asArray(dig(noticeResult, "efac:LotResult"))) {
    const lotId = txt(dig(res, "efac:TenderLot", "cbc:ID"));
    if (!lotId) continue;
    resultsByLot.set(lotId, [...(resultsByLot.get(lotId) ?? []), res]);
    for (const ref of asArray(dig(res, "efac:LotTender"))) {
      const id = txt(dig(ref, "cbc:ID"));
      if (id) lotsByTender.set(id, new Set([...(lotsByTender.get(id) ?? []), lotId]));
    }
  }
  const lots: TedLot[] = [];
  for (const [lotId, results] of resultsByLot) {
    const refs = [...new Set(results.flatMap((res) => asArray(dig(res, "efac:LotTender"))
      .map((ref) => txt(dig(ref, "cbc:ID"))).filter((id): id is string => id != null)))];
    const amounts: TedSourceAmount[] = [];
    const addAmount = (node: unknown, kind: TedSourceAmount["kind"], source: string,
      refs: { tenderId?: string; resultId?: string } = {}) => {
      const a = amount(node);
      if (a.value != null) amounts.push({ ...a, value: a.value, kind, source, ...refs });
    };
    const missingTenderIds: string[] = [];
    const tenders = refs.map((id) => {
      const lt = lotTenderById.get(id);
      if (!lt) missingTenderIds.push(id);
      addAmount(lt?.payable, "payable", "NoticeResult/LotTender/LegalMonetaryTotal/PayableAmount", { tenderId: id });
      return {
        id,
        winnerOrgIds: [...new Set(lt?.tpa && lt.rank !== "0" ? tenderingPartyById.get(lt.tpa) ?? [] : [])],
        winnerNames: (lt?.tpa && lt.rank !== "0" ? tenderingPartyById.get(lt.tpa) ?? [] : [])
          .map((orgId) => orgs.get(orgId)?.name).filter((name): name is string => name != null),
        contractDates: [...(contractDatesByTender.get(id) ?? [])].sort(),
        sharedAcrossLots: (lotsByTender.get(id)?.size ?? 0) > 1,
      };
    });
    const stats: unknown[] = [];
    const resultIds: string[] = [];
    const statuses = new Set<string>();
    for (const res of results) {
      const resultId = txt(dig(res, "cbc:ID"));
      if (resultId) resultIds.push(resultId);
      const sourceRef = resultId ? { resultId } : {};
      addAmount(dig(res, "cbc:LowerTenderAmount"), "tender_lower", "NoticeResult/LotResult/LowerTenderAmount", sourceRef);
      addAmount(dig(res, "cbc:HigherTenderAmount"), "tender_upper", "NoticeResult/LotResult/HigherTenderAmount", sourceRef);
      addAmount(dig(res, "efac:FrameworkAgreementValues", "cbc:MaximumValueAmount"), "framework_ceiling",
        "NoticeResult/LotResult/FrameworkAgreementValues/MaximumValueAmount", sourceRef);
      const status = txt(dig(res, "cbc:TenderResultCode"));
      if (status) statuses.add(status);
      const resultStats = asArray(dig(res, "efac:ReceivedSubmissionsStatistics"))
        .filter((st) => txt(dig(st, "efbc:StatisticsCode")) === "tenders")
        .map((st) => dig(st, "efbc:StatisticsNumeric"));
      // One result lacking a statistic makes a merged result's count unknown.
      stats.push(...(resultStats.length ? resultStats : [""]));
    }
    const framework = lotMetaById.get(lotId)?.framework === true || amounts.some((a) => a.kind === "framework_ceiling");
    const payable = amounts.filter((a) => a.kind === "payable");
    const uniquePayable = refs.length === 1 && payable.length === 1 && !missingTenderIds.length;
    const amountKind = refs.length > 1 ? "multiple_tenders"
      : uniquePayable ? framework ? "framework_offer" : "payable"
      : framework ? "framework_ceiling"
      : amounts.some((a) => a.kind === "tender_lower" || a.kind === "tender_upper") ? "tender_range" : "missing";
    const matchEligible = amountKind === "payable" && results.length === 1
      && tenders.every((t) => !t.sharedAcrossLots) && statuses.size === 1 && statuses.has("selec-w");
    const contractDates = [...new Set(tenders.flatMap((t) => t.contractDates))];
    const meta = lotMetaById.get(lotId);
    lots.push({
      lotId, resultId: resultIds.length === 1 ? resultIds[0]! : null,
      cpvRaw: meta?.cpvRaw ?? null, contractNature: meta?.contractNature ?? null,
      title: meta?.title ?? null, estimated: meta?.estimated ?? null,
      // No offer-range endpoint, framework ceiling or sum of offers is an award.
      awarded: amountKind === "payable" ? payable[0]!.value : null,
      currency: amountKind === "payable" ? payable[0]!.currency : null,
      amountKind,
      amountDetails: { version: 2, amounts, tenders, resultIds: [...new Set(resultIds)], missingTenderIds, framework, matchEligible },
      tendersReceived: results.length === 1 ? tenderCount(stats) : null,
      winnerSelectionStatus: statuses.size === 1 ? [...statuses][0]! : null,
      contractDate: contractDates.length === 1 ? new Date(`${contractDates[0]}T00:00:00Z`) : null,
      winnerOrgIds: statuses.size === 1 && statuses.has("selec-w")
        ? [...new Set(tenders.flatMap((t) => t.winnerOrgIds))] : [],
      euFunded: meta?.euFunded ?? false,
    });
  }

  // Notice-level fields.
  const project = dig(root, "cac:ProcurementProject");
  const overall = firstAmount(
    dig(noticeResult, "efbc:OverallMaximumFrameworkContractsAmount"),
    dig(noticeResult, "efbc:OverallApproximateFrameworkContractsAmount"),
  );
  const publication = dig(ext, "efac:Publication");
  const contractDates = lots
    .map((l) => l.contractDate)
    .filter((d): d is Date => d != null);
  const publicationDate = tedDate(dig(publication, "efbc:PublicationDate"));
  const fallbackAward =
    contractDates.length > 0
      ? new Date(Math.max(...contractDates.map((d) => d.getTime())))
      : publicationDate;

  return {
    amountReplaySafe: unchangedWinnerMapping(root, ext, lots),
    publicationNumber: ojsToPublicationNumber(
      txt(dig(publication, "efbc:NoticePublicationID")),
    ),
    ojsNoticeId: txt(dig(publication, "efbc:NoticePublicationID")),
    noticeType: txt(dig(root, "cbc:NoticeTypeCode")),
    regulatoryDomain: txt(dig(root, "cbc:RegulatoryDomain")),
    contractFolderId: txt(dig(root, "cbc:ContractFolderID")),
    noticeUuid: txt(dig(root, "cbc:ID")),
    procedureType: txt(dig(root, "cac:TenderingProcess", "cbc:ProcedureCode")),
    buyerOrgId: txt(
      dig(root, "cac:ContractingParty", "cac:Party", "cac:PartyIdentification", "cbc:ID"),
    ),
    buyerLegalType: txt(
      dig(root, "cac:ContractingParty", "cac:ContractingPartyType", "cbc:PartyTypeCode"),
    ),
    buyerActivity: txt(
      dig(root, "cac:ContractingParty", "cac:ContractingActivity", "cbc:ActivityTypeCode"),
    ),
    cpvRaw: txt(
      dig(project, "cac:MainCommodityClassification", "cbc:ItemClassificationCode"),
    ),
    contractNature: txt(dig(project, "cbc:ProcurementTypeCode")),
    title: txt(dig(project, "cbc:Name")),
    estimated: estimatedFrom(dig(project, "cac:RequestedTenderTotal")),
    currency: overall.currency,
    awardedTotal: overall.value,
    publicationDate,
    issueDate: tedDate(dig(root, "cbc:IssueDate")),
    awardDate:
      tedDate(dig(root, "cac:TenderResult", "cbc:AwardDate"), true) ??
      fallbackAward,
    orgs,
    lots,
  };
}

function eformsLotValues(n: TedNotice, ctx: NormalizeCtx, tedNoticeId: bigint) {
  return n.lots.map((lot) => {
    const lotCpv = resolveCpvPrefix(lot.cpvRaw, ctx.cpvByPrefix);
    return {
        tedNoticeId,
        lotId: lot.lotId,
        resultId: lot.resultId,
        cpvCode: lotCpv.cpvCode,
        cpvValid: lotCpv.cpvValid,
        cpvRaw: lotCpv.cpvRaw,
        contractNature: lot.contractNature,
        title: lot.title,
        estimatedValueRon: lot.estimated,
        awardedValue: lot.awarded,
        amountKind: lot.amountKind,
        amountDetails: lot.amountDetails,
        currency: lot.currency,
        tendersReceived: lot.tendersReceived,
        isSingleBidder:
          lot.tendersReceived == null ? null : lot.tendersReceived === 1,
        winnerSelectionStatus: lot.winnerSelectionStatus,
        contractDate: lot.contractDate,
      };
  });
}

/** Replay only; caller holds the current notice row lock and reads its current raw. */
export async function tryReplayTedAmounts(ctx: NormalizeCtx, noticeId: bigint, publication: string,
  rawId: bigint, payload: unknown): Promise<{ replayed: boolean; parsed: TedNotice }> {
  const xml = (payload as { xml?: unknown })?.xml;
  if (typeof xml !== "string" || !xml) throw new Error("TED eForms replay missing XML");
  const n = extractTedNotice(xml);
  if (n.publicationNumber !== publication) throw new Error("TED replay publication does not match current source");
  if (!n.amountReplaySafe || !await tryReplaceTedAmounts(ctx.tx, noticeId, eformsLotValues(n, ctx, noticeId), true)) return { replayed: false, parsed: n };
  await ctx.tx.update(tedNotices).set({ rawId, normalizationVersion: TED_NORMALIZATION_VERSION,
    estimatedValueRon: n.estimated, awardedValueTotal: n.awardedTotal, currency: n.currency })
    .where(eq(tedNotices.id, noticeId));
  return { replayed: true, parsed: n };
}

// ── loader (Parser.load) ─────────────────────────────────────────────────
export async function loadTedNotice(
  ctx: NormalizeCtx,
  rawId: bigint,
  payload: unknown,
  parsed?: TedNotice,
): Promise<void> {
  const xml = (payload as { xml?: unknown })?.xml;
  if (typeof xml !== "string" || xml.length === 0) {
    throw new Error("ted payload missing xml");
  }
  const n = parsed ?? extractTedNotice(xml);
  if (!n.publicationNumber) throw new Error("ted notice missing publication-number");

  const seenAt = n.awardDate ?? n.publicationDate ?? n.issueDate;

  // Buyer entity (resolves by CUI into shared core.entities).
  let buyerEntityId: bigint | null = null;
  const buyer = n.buyerOrgId ? n.orgs.get(n.buyerOrgId) : undefined;
  if (buyer) {
    buyerEntityId = await resolveEntity(ctx.tx, {
      cuiRaw: buyer.cui,
      nameDisplay: buyer.name,
      namespace: "authority",
      nutsCode: buyer.nuts,
      country: buyer.country,
      seenAt,
    });
  }

  const cpv = resolveCpvPrefix(n.cpvRaw, ctx.cpvByPrefix);
  const euFunded = n.lots.some((l) => l.euFunded);

  const header = {
    rawId,
    normalizationVersion: TED_NORMALIZATION_VERSION,
    ojsNoticeId: n.ojsNoticeId,
    noticeType: n.noticeType,
    regulatoryDomain: n.regulatoryDomain,
    contractFolderId: n.contractFolderId,
    noticeUuid: n.noticeUuid,
    procedureType: n.procedureType,
    buyerEntityId,
    buyerLegalType: n.buyerLegalType,
    buyerActivity: n.buyerActivity,
    cpvCode: cpv.cpvCode,
    cpvValid: cpv.cpvValid,
    cpvRaw: cpv.cpvRaw,
    contractNature: n.contractNature,
    title: n.title,
    estimatedValueRon: n.estimated,
    currency: n.currency,
    awardedValueTotal: n.awardedTotal,
    euFunded,
    lotCount: n.lots.length,
    publicationDate: n.publicationDate,
    issueDate: n.issueDate,
    awardDate: n.awardDate,
  };

  const upserted = await ctx.tx
    .insert(tedNotices)
    .values({ ...header, publicationNumber: n.publicationNumber })
    .onConflictDoUpdate({ target: tedNotices.publicationNumber, set: header })
    .returning({ id: tedNotices.id });
  const tedNoticeId = upserted[0]!.id;

  // Crosswalk scores were computed using previous values/winners. Invalidate them;
  // replay must be followed by reconciliation and mart refresh. Keep stable lot IDs.
  const values = eformsLotValues(n, ctx, tedNoticeId);
  const lotIds = await replaceTedLots(ctx.tx, tedNoticeId, values);
  const winnerEntities = new Map<string, bigint>();
  const winnerRows: (typeof tedLotWinners.$inferInsert)[] = [];
  for (const lot of n.lots) {
    const lotResultId = lotIds.get(lot.lotId)!;
    for (const orgId of lot.winnerOrgIds) {
      const org = n.orgs.get(orgId);
      if (!org) continue;
      const winnerSeenAt = lot.contractDate ?? seenAt;
      const cacheKey = `${orgId}:${winnerSeenAt?.toISOString() ?? ""}`;
      let entityId = winnerEntities.get(cacheKey);
      if (entityId == null) entityId = await resolveEntity(ctx.tx, {
        cuiRaw: org.cui,
        nameDisplay: org.name,
        namespace: "winner",
        nutsCode: org.nuts,
        country: org.country,
        seenAt: winnerSeenAt,
      });
      winnerEntities.set(cacheKey, entityId);
      winnerRows.push({ lotResultId, entityId });
    }
  }
  await insertTedWinners(ctx.tx, winnerRows);
}
