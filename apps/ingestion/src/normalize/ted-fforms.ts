import { eq } from "drizzle-orm";
import { tedLotWinners, tedNotices, type TedAmountDetails, type TedSourceAmount } from "@seap/db";
import type { NormalizeCtx } from "./context.js";
import { resolveCpvPrefix } from "./cpv.js";
import { resolveEntity } from "./resolve-entity.js";
import { insertTedWinners, replaceTedLots, tryReplaceTedAmounts } from "./ted-load.js";
import {
  asArray,
  attr,
  dec,
  dig,
  makeTedXmlParser,
  txt,
  tenderCount,
  TED_NORMALIZATION_VERSION,
  type Node,
} from "./ted.js";

/**
 * Legacy TED (TED_EXPORT R2.0.9, F03 contract-award form) → core mapper. This
 * is the pre-2023 sibling of the eForms mapper (ted.ts): same three core tables,
 * same CUI-based entity resolution, so legacy above-threshold awards unify with
 * the eForms + e-licitatie entity graph. Writes endpoint_version 'ted-fforms:v1'.
 *
 * F03 differs from eForms UBL: buyer + winners are INLINE address blocks (no ORG
 * cross-refs), values are `VAL_TOTAL` / `VAL_RANGE_TOTAL/LOW`, single-bid is
 * `AWARDED_CONTRACT/TENDERS/NB_TENDERS_RECEIVED`, procedure/nature are numeric
 * TED codes. Scope: RO, 2018-2022 (matches SEAP's above-threshold span).
 */

const parser = makeTedXmlParser();

// TED PR_PROC code → eForms-style procedure token (aligns legacy with modern
// so a marts group-by mixes cleanly). Unknown codes fall back to the label text.
const PROC_CODE: Record<string, string> = {
  "1": "open",
  "2": "restricted",
  "3": "restricted",
  "4": "neg-w-call",
  "5": "neg-w-call",
  "6": "comp-dial",
  "7": "neg-wo-call",
  "8": "innovation",
  T: "comp-tend", // competitive tendering (utilities, with call)
  V: "neg-wo-call", // award without prior publication — key single-source red flag
};

/** 'YYYYMMDD' (CODED_DATA dates) → Date. */
function ymdDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD…' (form dates) → Date. */
function isoDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** F03 amount: element with @CURRENCY holding text, or a LOW/HIGH range. */
function f03Amount(v: unknown): { value: string | null; currency: string | null } {
  if (v == null) return { value: null, currency: null };
  const currency = attr(v, "CURRENCY");
  const low = dig(v, "LOW");
  if (low != null) return { value: dec(low), currency };
  return { value: dec(v), currency };
}

/** TITLE/P may be a single P or an array of P; take the first paragraph. */
function firstP(node: unknown): string | null {
  const ps = asArray(dig(node, "P"));
  return ps.length > 0 ? txt(ps[0]) : txt(node);
}

interface F03Party {
  cui: string | null;
  name: string;
  nuts: string | null;
  country: string | null;
}

interface F03Lot {
  lotId: string;
  resultId: string | null;
  cpvRaw: string | null;
  title: string | null;
  estimated: string | null;
  awarded: string | null;
  currency: string | null;
  amountKind: string;
  amountDetails: TedAmountDetails;
  tendersReceived: number | null;
  contractDate: Date | null;
  awarded_ok: boolean;
  winners: F03Party[];
}

interface F03Notice {
  publicationNumber: string | null;
  ojsNoticeId: string | null;
  regulatoryDomain: string | null;
  procedureType: string | null;
  buyer: F03Party | null;
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
}

/** Pick the ORIGINAL-language award form (F03, else F06 utilities). */
function findAwardForm(root: Node): Node | null {
  const section = dig(root, "FORM_SECTION");
  for (const key of ["F03_2014", "F06_2014"]) {
    const forms = asArray(dig(section, key));
    if (forms.length === 0) continue;
    return (forms.find((f) => attr(f, "CATEGORY") === "ORIGINAL") ??
      forms[0]) as Node;
  }
  return null;
}

function party(addr: unknown): F03Party | null {
  if (addr == null) return null;
  return {
    cui: txt(dig(addr, "NATIONALID")),
    name: txt(dig(addr, "OFFICIALNAME")) ?? "(necunoscut)",
    nuts: attr(dig(addr, "n2016:NUTS"), "CODE"),
    country: attr(dig(addr, "COUNTRY"), "VALUE"),
  };
}

export function extractF03Notice(xml: string): F03Notice & { lots: F03Lot[] } {
  const doc = parser.parse(xml) as Node;
  const root = (doc["TED_EXPORT"] ?? {}) as Node;
  const coded = dig(root, "CODED_DATA_SECTION");
  const noticeData = dig(coded, "NOTICE_DATA");
  const codif = dig(coded, "CODIF_DATA");
  const form = findAwardForm(root);
  const object = dig(form, "OBJECT_CONTRACT");

  // Notice-level CPV: form CPV_MAIN, else first ORIGINAL_CPV in coded data.
  const cpvRaw =
    attr(dig(object, "CPV_MAIN", "CPV_CODE"), "CODE") ??
    attr(asArray(dig(noticeData, "ORIGINAL_CPV"))[0], "CODE") ??
    txt(asArray(dig(noticeData, "ORIGINAL_CPV"))[0]);

  const procCode = attr(dig(codif, "PR_PROC"), "CODE");
  const procedureType =
    (procCode ? PROC_CODE[procCode] : null) ??
    txt(dig(codif, "PR_PROC"))?.toLowerCase() ??
    null;

  const nature =
    attr(dig(object, "TYPE_CONTRACT"), "CTYPE")?.toLowerCase() ?? null;

  // Notice totals: awarded from procurement total, estimated where present.
  const total = f03Amount(
    dig(object, "VAL_TOTAL") ??
      dig(object, "VAL_RANGE_TOTAL") ??
      dig(noticeData, "VALUES", "VALUE_RANGE"),
  );
  const est = f03Amount(dig(object, "VAL_ESTIMATED_TOTAL"));

  // Per-lot object metadata (cpv/title) keyed by LOT_NO.
  const objByLot = new Map<string, { cpv: string | null; title: string | null }>();
  for (const od of asArray(dig(object, "OBJECT_DESCR"))) {
    const lotNo = txt(dig(od, "LOT_NO"));
    if (!lotNo) continue;
    objByLot.set(lotNo, {
      cpv:
        attr(dig(od, "CPV_ADDITIONAL", "CPV_CODE"), "CODE") ??
        attr(dig(od, "CPV_MAIN", "CPV_CODE"), "CODE"),
      title: firstP(dig(od, "TITLE")),
    });
  }

  // Awarded lots.
  const lots: F03Lot[] = [];
  const awardContracts = asArray(dig(form, "AWARD_CONTRACT"));
  awardContracts.forEach((ac, idx) => {
    const item = attr(ac, "ITEM") ?? String(idx + 1);
    const lotNo = txt(dig(ac, "LOT_NO"));
    const awarded = dig(ac, "AWARDED_CONTRACT");
    const meta = lotNo ? objByLot.get(lotNo) : undefined;

    const winners: F03Party[] = [];
    for (const c of asArray(dig(awarded, "CONTRACTORS", "CONTRACTOR"))) {
      const p = party(dig(c, "ADDRESS_CONTRACTOR"));
      if (p) winners.push(p);
    }

    const amounts: TedSourceAmount[] = [];
    const totalNode = dig(awarded, "VALUES", "VAL_TOTAL");
    const rangeNode = dig(awarded, "VALUES", "VAL_RANGE_TOTAL");
    const addAmount = (node: unknown, kind: TedSourceAmount["kind"], source: string, currency: string | null) => {
      const value = dec(node);
      if (value != null) amounts.push({ kind, source, value, currency, resultId: `ITEM-${item}` });
    };
    addAmount(totalNode, "contract_value", "AWARD_CONTRACT/AWARDED_CONTRACT/VALUES/VAL_TOTAL", attr(totalNode, "CURRENCY"));
    addAmount(dig(rangeNode, "LOW"), "tender_lower", "AWARD_CONTRACT/AWARDED_CONTRACT/VALUES/VAL_RANGE_TOTAL/LOW", attr(rangeNode, "CURRENCY"));
    addAmount(dig(rangeNode, "HIGH"), "tender_upper", "AWARD_CONTRACT/AWARDED_CONTRACT/VALUES/VAL_RANGE_TOTAL/HIGH", attr(rangeNode, "CURRENCY"));
    const actual = amounts.find((a) => a.kind === "contract_value");
    const amountKind = actual ? "contract_value" : amounts.length ? "tender_range" : "missing";
    const lotEst = f03Amount(dig(awarded, "VALUES", "VAL_ESTIMATED_TOTAL"));
    const nb = dig(awarded, "TENDERS", "NB_TENDERS_RECEIVED");

    lots.push({
      lotId: `ITEM-${item}`,
      resultId: lotNo ? `LOT-${lotNo}` : null,
      cpvRaw: meta?.cpv ?? cpvRaw ?? null,
      title: meta?.title ?? firstP(dig(ac, "TITLE")),
      estimated: lotEst.value,
      awarded: actual?.value ?? null,
      currency: actual?.currency ?? null,
      amountKind,
      amountDetails: { version: 2, amounts, tenders: [], resultIds: [`ITEM-${item}`], missingTenderIds: [],
        framework: false, matchEligible: amountKind === "contract_value" && awarded != null },
      tendersReceived: tenderCount([nb]),
      contractDate: isoDate(txt(dig(awarded, "DATE_CONCLUSION_CONTRACT"))),
      awarded_ok: awarded != null,
      winners,
    });
  });

  return {
    publicationNumber: attr(root, "DOC_ID"),
    ojsNoticeId: txt(dig(noticeData, "NO_DOC_OJS")),
    regulatoryDomain: attr(dig(form, "LEGAL_BASIS"), "VALUE"),
    procedureType,
    buyer: party(dig(form, "CONTRACTING_BODY", "ADDRESS_CONTRACTING_BODY")),
    buyerLegalType: attr(dig(form, "CONTRACTING_BODY", "CA_TYPE"), "VALUE"),
    buyerActivity: attr(dig(form, "CONTRACTING_BODY", "CA_ACTIVITY"), "VALUE"),
    cpvRaw,
    contractNature: nature,
    title: firstP(dig(object, "TITLE")),
    estimated: est.value,
    currency: total.currency ?? est.currency,
    awardedTotal: total.value,
    publicationDate: ymdDate(txt(dig(coded, "REF_OJS", "DATE_PUB"))),
    issueDate: ymdDate(txt(dig(codif, "DS_DATE_DISPATCH"))),
    lots,
  };
}

function f03LotValues(n: ReturnType<typeof extractF03Notice>, ctx: NormalizeCtx, tedNoticeId: bigint) {
  return n.lots.map((lot) => {
    const lotCpv = resolveCpvPrefix(lot.cpvRaw, ctx.cpvByPrefix);
    return {
        tedNoticeId,
        lotId: lot.lotId,
        resultId: lot.resultId,
        cpvCode: lotCpv.cpvCode,
        cpvValid: lotCpv.cpvValid,
        cpvRaw: lotCpv.cpvRaw,
        contractNature: n.contractNature,
        title: lot.title,
        estimatedValueRon: lot.estimated,
        awardedValue: lot.awarded,
        amountKind: lot.amountKind,
        amountDetails: lot.amountDetails,
        currency: lot.currency,
        tendersReceived: lot.tendersReceived,
        isSingleBidder:
          lot.tendersReceived == null ? null : lot.tendersReceived === 1,
        winnerSelectionStatus: lot.awarded_ok ? "awarded" : "not-awarded",
        contractDate: lot.contractDate,
      };
  });
}

/** Replay only: the F03 winner parser is unchanged; verify lot identities first. */
export async function tryReplayF03Amounts(ctx: NormalizeCtx, noticeId: bigint, publication: string,
  rawId: bigint, payload: unknown): Promise<boolean> {
  const xml = (payload as { xml?: unknown })?.xml;
  if (typeof xml !== "string" || !xml) throw new Error("TED F03 replay missing XML");
  const n = extractF03Notice(xml);
  if (n.publicationNumber !== publication) throw new Error("TED replay publication does not match current source");
  if (!await tryReplaceTedAmounts(ctx.tx, noticeId, f03LotValues(n, ctx, noticeId))) return false;
  await ctx.tx.update(tedNotices).set({ rawId, normalizationVersion: TED_NORMALIZATION_VERSION,
    estimatedValueRon: n.estimated, awardedValueTotal: n.awardedTotal, currency: n.currency })
    .where(eq(tedNotices.id, noticeId));
  return true;
}

// ── loader (Parser.load) ─────────────────────────────────────────────────
export async function loadF03Notice(
  ctx: NormalizeCtx,
  rawId: bigint,
  payload: unknown,
): Promise<void> {
  const xml = (payload as { xml?: unknown })?.xml;
  if (typeof xml !== "string" || xml.length === 0) {
    throw new Error("ted f03 payload missing xml");
  }
  const n = extractF03Notice(xml);
  if (!n.publicationNumber) throw new Error("ted f03 notice missing publication-number");

  const seenAt = n.publicationDate ?? n.issueDate;

  let buyerEntityId: bigint | null = null;
  if (n.buyer) {
    buyerEntityId = await resolveEntity(ctx.tx, {
      cuiRaw: n.buyer.cui,
      nameDisplay: n.buyer.name,
      namespace: "authority",
      nutsCode: n.buyer.nuts,
      country: n.buyer.country,
      seenAt,
    });
  }

  const cpv = resolveCpvPrefix(n.cpvRaw, ctx.cpvByPrefix);

  const header = {
    rawId,
    normalizationVersion: TED_NORMALIZATION_VERSION,
    ojsNoticeId: n.ojsNoticeId,
    noticeType: "can-standard", // legacy F03 award == eForms can-standard (semantic)
    regulatoryDomain: n.regulatoryDomain,
    contractFolderId: null,
    noticeUuid: null,
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
    euFunded: null,
    lotCount: n.lots.length,
    publicationDate: n.publicationDate,
    issueDate: n.issueDate,
    awardDate:
      n.lots.map((l) => l.contractDate).filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? n.publicationDate,
  };

  const upserted = await ctx.tx
    .insert(tedNotices)
    .values({ ...header, publicationNumber: n.publicationNumber })
    .onConflictDoUpdate({ target: tedNotices.publicationNumber, set: header })
    .returning({ id: tedNotices.id });
  const tedNoticeId = upserted[0]!.id;

  const values = f03LotValues(n, ctx, tedNoticeId);
  const lotIds = await replaceTedLots(ctx.tx, tedNoticeId, values);
  const winnerEntities = new Map<string, bigint>();
  const winnerRows: (typeof tedLotWinners.$inferInsert)[] = [];
  for (const lot of n.lots) {
    const lotResultId = lotIds.get(lot.lotId)!;
    for (const w of lot.winners) {
      const winnerSeenAt = lot.contractDate ?? seenAt;
      const cacheKey = JSON.stringify([w.cui, w.name, w.nuts, w.country, winnerSeenAt]);
      let entityId = winnerEntities.get(cacheKey);
      if (entityId == null) entityId = await resolveEntity(ctx.tx, {
        cuiRaw: w.cui,
        nameDisplay: w.name,
        namespace: "winner",
        nutsCode: w.nuts,
        country: w.country,
        seenAt: winnerSeenAt,
      });
      winnerEntities.set(cacheKey, entityId);
      winnerRows.push({ lotResultId, entityId });
    }
  }
  await insertTedWinners(ctx.tx, winnerRows);
}
