import { and, eq } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import {
  tedLotResults,
  tedLotWinners,
  tedNotices,
} from "@seap/db";
import type { NormalizeCtx } from "./context.js";
import { resolveCpvPrefix } from "./cpv.js";
import { resolveEntity } from "./resolve-entity.js";

/**
 * TED eForms (UBL ContractAwardNotice) → core mapper. The raw payload is
 * `{ xml }`; we parse it to a tree, resolve the cross-referenced parties
 * (buyer + per-lot winners) into core.entities by CUI, and write one
 * ted_notices row + N ted_lot_results (+ winners). Idempotent under replay:
 * the notice upserts on publication-number, then its lots are deleted and
 * rewritten so a re-parse converges (never accumulates stale lots).
 *
 * eForms coverage for RO is 2023+ (older TED notices used the F-form schema
 * and are not in raw). All 62k RO CANs share these element paths; only the
 * eforms-sdk version differs (1.6 … 1.13), so no era-branching is needed.
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
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) ? String(n) : null;
};

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
  tendersReceived: number | null;
  winnerSelectionStatus: string | null;
  contractDate: Date | null;
  winnerOrgIds: string[];
  euFunded: boolean;
}

interface TedNotice {
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
  const lotTenderById = new Map<string, { payable: unknown; tpa: string | null }>();
  for (const lt of asArray(dig(noticeResult, "efac:LotTender"))) {
    const id = txt(dig(lt, "cbc:ID"));
    if (!id) continue;
    lotTenderById.set(id, {
      payable: dig(lt, "cac:LegalMonetaryTotal", "cbc:PayableAmount"),
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
  // TEN id → SettledContract IssueDate.
  const contractDateByTender = new Map<string, Date | null>();
  for (const sc of asArray(dig(noticeResult, "efac:SettledContract"))) {
    const ten = txt(dig(sc, "efac:LotTender", "cbc:ID"));
    if (ten) contractDateByTender.set(ten, tedDate(dig(sc, "cbc:IssueDate")));
  }

  // Per-lot procurement metadata (cpv/nature/title/estimated/eu-funded), keyed
  // by the notice-local lot id.
  interface LotMeta {
    cpvRaw: string | null;
    contractNature: string | null;
    title: string | null;
    estimated: string | null;
    euFunded: boolean;
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
      estimated: estimatedFrom(dig(proj, "cac:RequestedTenderTotal")),
      euFunded: funding != null && funding !== "no-eu-funds",
    });
  }

  // Assemble awarded lots from LotResult (the awarded grain).
  const lots: TedLot[] = [];
  for (const res of asArray(dig(noticeResult, "efac:LotResult"))) {
    const lotId = txt(dig(res, "efac:TenderLot", "cbc:ID"));
    if (!lotId) continue;
    const ten = txt(dig(res, "efac:LotTender", "cbc:ID"));
    const lt = ten ? lotTenderById.get(ten) : undefined;
    const winnerOrgIds = lt?.tpa ? (tenderingPartyById.get(lt.tpa) ?? []) : [];

    // tenders received (single-bid signal).
    let tendersReceived: number | null = null;
    for (const st of asArray(dig(res, "efac:ReceivedSubmissionsStatistics"))) {
      if (txt(dig(st, "efbc:StatisticsCode")) === "tenders") {
        const n = Number(txt(dig(st, "efbc:StatisticsNumeric")));
        tendersReceived = Number.isFinite(n) ? n : null;
      }
    }

    const awarded = firstAmount(
      lt?.payable,
      dig(res, "cbc:LowerTenderAmount"),
      dig(res, "cbc:HigherTenderAmount"),
      dig(res, "efac:FrameworkAgreementValues", "cbc:MaximumValueAmount"),
    );

    const meta = lotMetaById.get(lotId);
    lots.push({
      lotId,
      resultId: txt(dig(res, "cbc:ID")),
      cpvRaw: meta?.cpvRaw ?? null,
      contractNature: meta?.contractNature ?? null,
      title: meta?.title ?? null,
      estimated: meta?.estimated ?? null,
      awarded: awarded.value,
      currency: awarded.currency,
      tendersReceived,
      winnerSelectionStatus: txt(dig(res, "cbc:TenderResultCode")),
      contractDate: ten ? (contractDateByTender.get(ten) ?? null) : null,
      winnerOrgIds,
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

// ── loader (Parser.load) ─────────────────────────────────────────────────
export async function loadTedNotice(
  ctx: NormalizeCtx,
  rawId: bigint,
  payload: unknown,
): Promise<void> {
  const xml = (payload as { xml?: unknown })?.xml;
  if (typeof xml !== "string" || xml.length === 0) {
    throw new Error("ted payload missing xml");
  }
  const n = extractTedNotice(xml);
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

  // Rewrite lots (cascade drops old winners) so a re-parse converges cleanly.
  await ctx.tx.delete(tedLotResults).where(eq(tedLotResults.tedNoticeId, tedNoticeId));

  for (const lot of n.lots) {
    const lotCpv = resolveCpvPrefix(lot.cpvRaw, ctx.cpvByPrefix);
    const inserted = await ctx.tx
      .insert(tedLotResults)
      .values({
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
        currency: lot.currency,
        tendersReceived: lot.tendersReceived,
        isSingleBidder:
          lot.tendersReceived == null ? null : lot.tendersReceived === 1,
        winnerSelectionStatus: lot.winnerSelectionStatus,
        contractDate: lot.contractDate,
      })
      .returning({ id: tedLotResults.id });
    const lotResultId = inserted[0]!.id;

    for (const orgId of lot.winnerOrgIds) {
      const org = n.orgs.get(orgId);
      if (!org) continue;
      const entityId = await resolveEntity(ctx.tx, {
        cuiRaw: org.cui,
        nameDisplay: org.name,
        namespace: "winner",
        nutsCode: org.nuts,
        country: org.country,
        seenAt: lot.contractDate ?? seenAt,
      });
      await ctx.tx
        .insert(tedLotWinners)
        .values({ lotResultId, entityId })
        .onConflictDoNothing();
    }
  }
}
