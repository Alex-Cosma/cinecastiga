/*
 * The extra context of a record page (contract, direct acquisition), owner decisions of 7 November 2026: the lot's
 * real object and kind, signals on direct acquisitions, TED context, the firm–institution pair, what a direct
 * acquisition bought, framework ↔ call-offs and a CNSC mention. Every field is optional evidence: null means
 * "not in the data", never zero, and the page says so.
 */

/** Other records of one institution–supplier pair, both channels, WITHOUT the record on the page. Same filters as
 * the totals: direct acquisitions 0 < value ≤ 2 mil. lei, procedure contracts value > 0 (marts.da_transactions,
 * marts.contract_transactions; a consortium contract counts the winner's split share). */
export interface PairHistory {
  nDa: number;
  nCt: number;
  totalRon: number;
  /** The same sum as an exact decimal string. */
  totalRonExact: string;
}

/** One firm seen from one institution: how much of the firm's recorded public contracts come from it, and its size. */
export interface PairContext {
  supplierId: string;
  /** marts.supplier_dependency (all years, both channels): the institution's share of the firm's recorded public
   * contracts and direct acquisitions — "contracte publice înregistrate", not its revenue. Includes this record. */
  dependence: {
    /** 0..1, value at this institution / value at all institutions (v_all / v_total, capped at 1). */
    share: number | null;
    /** Records at this institution, both channels (n_here + n_da_here). */
    nHere: number;
    nContractsHere: number;
    nDaHere: number;
    /** v_all: both channels at this institution. */
    valueHereRon: string | null;
    /** v_total: both channels at every institution. */
    valueAllRon: string | null;
    /** n_auth: institutions the firm has records with. */
    institutions: number | null;
    firstYear: number | null;
    lastYear: number | null;
  } | null;
  /** reference.company_financials for the record's year, or the latest year before it (only for a corroborated CUI). */
  size: { year: number; employees: number | null; turnoverRon: string | null } | null;
  /** Other records of the pair, without this one. */
  history: PairHistory;
}

/** TED context of an above-threshold contract (core.award_links → core.ted_lot_results → core.ted_notices). */
export interface TedContext {
  /** "link": a confirmed crosswalk link (is_primary, score ≥ 0.9, the tier marts.contract_transactions.ted_pubnum
   * uses) with lot-level fields; "sicap": only the TED number SICAP itself declares (raw.ca_notice_ted), with the
   * notice-level fields when that notice is in core.ted_notices — lot fields are then null. */
  basis: "link" | "sicap";
  /** TED publication number, e.g. "157568-2026" (SICAP's "2020/S 190-458412" converted). */
  publicationNumber: string | null;
  url: string | null;
  /** The TED estimate in RON, without VAT (SICAP's own "estimate" repeats the awarded value, data audit F22).
   * Lot estimate; the notice estimate only when the TED notice has a single lot. */
  estimateRon: string | null;
  euFunded: boolean | null;
  /** Tenders TED reports for the linked lot. */
  tendersReceived: number | null;
  lotTitle: string | null;
  /** TED lot id, e.g. "LOT-0009". */
  lotId: string | null;
  awardDate: string | null;
  /** The TED notice's publication date (YYYY-MM-DD). */
  publishedOn: string | null;
  /** award_links.match_score of the chosen link; null for basis "sicap". */
  matchScore: number | null;
  /** Distinct TED notices confirmed-linked to this contract (> 1: also in a later TED notice, e.g. a republication). */
  linkedNotices: number;
}

/** A framework agreement and its call-offs, or a call-off and its framework (matching is imperfect: missing = unknown).
 * Matched within the award notice and its republications (same buyer and notice number), on the lot caption (equal,
 * or one of the framework's comma-separated lots) and a shared winner. */
export type FrameworkLink =
  | {
      role: "framework";
      /** Identified call-offs counted in the totals (marts.contract_transactions). 0 = none identified, not "none". */
      calloffs: number;
      /** Their RON sum as the totals count it (all winners; scaled to the ceiling when they declare more, contract-reporting-5), null when none is counted. */
      calloffsRon: string | null;
      /** The same call-offs' declared RON values, summed (what SEAP holds). */
      declaredRon: string | null;
      /** Identified call-off publications, counted or not (republications, amendments-as-call-offs excluded by kind). */
      publications: number;
      /** The framework's own RON ceiling (contractRonValue), null when not in verified lei. */
      ceilingRon: string | null;
      /** Counted call-offs whose own value is the whole ceiling (within 1%): the ceiling likely copied into each order. */
      repeats: number;
      /** The largest counted call-off's declared RON value (a ceiling it exceeds CALLOFF_OVER_CEILING.credible times is not credible). */
      topRon: string | null;
    }
  | {
      role: "calloff";
      frameworkNatId: string;
      frameworkTitle: string | null;
      frameworkDate: string | null;
      /** Framework publications matching (> 1: republications, or an ambiguous match — the first is shown). */
      candidates: number;
      /** The framework's RON ceiling, and its counted call-offs (this one included): their number and declared sum. */
      ceilingRon: string | null;
      calloffs: number;
      /** As the totals count them (scaled to the ceiling when over), and as declared in SEAP. */
      calloffsRon: string | null;
      declaredRon: string | null;
      /** This call-off declares the framework's whole ceiling (within 1%). */
      repeatsCeiling: boolean;
      /** The largest counted call-off's declared RON value. */
      topRon: string | null;
    };

/** A complaint / CNSC document among the procedure's stored documents (classified from the file name or SEAP's type:
 * may be wrong). The first one naming CNSC, else the first complaint. */
export interface CnscMention {
  documentId: string;
  filename: string | null;
  /** SEAP's publication date of the file (YYYY-MM-DD), often missing. */
  date: string | null;
  /** The file name or SEAP type names CNSC (else it is only a "contestație"). */
  mentionsCnsc: boolean;
  /** Documents of the "complaints" category (contestații și decizii CNSC). */
  complaints: number;
}

/** A red flag with the evidence the page shows in one line. */
export interface RecordFlag { code: string; severity: number | null; evidence: Record<string, unknown> | null }

/** What a direct acquisition's page adds to its source fields. */
export interface AcquisitionContext {
  /** Present in marts.da_transactions (only "Oferta acceptata" is). */
  inMart: boolean;
  /** Counted in the totals: in the mart and 0 < value ≤ 2 mil. lei (the site's plausibility limit). */
  counted: boolean;
  /** "accepted" counts; "refused" / "unaccepted" are offers that never became purchases. */
  stateKind: "accepted" | "refused" | "unaccepted" | "other";
  /** Publication → finalization, whole minutes (null when a timestamp is missing or the order is inverted). */
  durationMinutes: number | null;
  /** core.flags of this acquisition (da_round, da_above_ceiling) and the pair's da_split year whose evidence lists it. */
  flags: RecordFlag[];
  /** marts.da_transactions.value_suspect (implausible against the estimate); null when not in the mart. */
  valueSuspect: boolean | null;
  /** core.da_items, raw (units are not standard). Only for acquisitions whose SICAP detail was collected. */
  items: {
    name: string | null;
    cpvCode: string | null;
    quantity: string | null;
    unit: string | null;
    /** itemClosingPrice: the unit price at closing. */
    unitPriceRon: string | null;
    /** catalogItemPrice: the catalogue's unit price. */
    catalogPriceRon: string | null;
  }[];
  /** Other records of the same institution–supplier pair, both channels, without this one (= pair.history). */
  pairHistory: PairHistory | null;
  /** marts.da_slicing: the pair's densest 60-day window over the ceiling, when this acquisition is inside it. */
  slicing: {
    n: number;
    sumRon: string;
    ceilingRon: string | null;
    from: string | null;
    to: string | null;
    cpvClass: string | null;
    cpvName: string | null;
  } | null;
  authorityCounty: string | null;
  /** SICAP records the institution itself as the supplier: no pair. */
  supplierIsAuthority: boolean;
  pair: PairContext | null;
}

/** What a contract's page adds to getContractDetail. */
export interface ContractContext {
  ted: TedContext | null;
  /** Only on a framework or a call-off; null when the kind is neither or no lot caption allows a match. */
  framework: FrameworkLink | null;
  cnsc: CnscMention | null;
  /** One per winner that is a supplier (not the institution itself), in detail.winners order. */
  pairs: PairContext[];
}
