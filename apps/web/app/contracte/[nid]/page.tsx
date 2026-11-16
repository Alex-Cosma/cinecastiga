import { CALLOFF_OVER_CEILING } from "@seap/db";
import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import Link from "next/link";
import ContractPublications from "@/components/ContractPublications";
import ContractFiles from "@/components/documents/ContractFiles";
import { getContractFiles } from "@/lib/documents/store";
import { sessionUserId } from "@/lib/session";
import { notFound } from "next/navigation";
import { getContractDetail, type ContractDetail } from "@/lib/marts";
import { getContractContext, tedNoticeUrl, tedPublicationNumber } from "@/lib/record-context";
import { CONTRACT_DATE_FLOOR } from "@seap/db";
import { formatRon, formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName, countyLabel } from "@/lib/format";
import { awardValueLabel, noticeContractsNote } from "@/lib/risk-presentation";
import { awardUrl } from "@/lib/elicitatie";
import { contractValueState, kindLabel, lotTitle, meaningfulLot, procedureLabel, recordHeadline } from "@/lib/record-labels";
import { countWords } from "@/lib/ask/answer-text";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { Facts, PartyList, RecordHead, RecordPage, RecordSection, SignalList, Sources, pairHref, pairLines, type Party, type RecordValue, type Source } from "@/components/record/Record";
import RecordSums, { type SumRow } from "@/components/record/RecordSums";
import SeapDetails from "@/components/record/SeapDetails";
import { consortiumShareLabel } from "@/lib/consortium";
import RecordTitle from "@/components/record/RecordTitle";
import "@/components/record/record-pages.css";
import { ghostHold } from "@/lib/ghost-hold";

/**
 * Contract detail: the plain-language twin of SEAP's award notice, keyed by SICAP's own contract id
 * (`ca_notice_contract_id`) so URLs survive re-normalizes. Record template of 7 November 2026: what was bought, who
 * from whom, the value with its notes, the signals, then the award's facts, the parties, the documents and the sources.
 */

export const dynamic = "force-dynamic";

/** One read per request: the tab title and the page share it. */
const contractDetail = cache(getContractDetail);

const headlineOf = (c: ContractDetail, noticeTitle: string | null) =>
  recordHeadline({ title: c.title, lot: c.lotsCaption, noticeTitle, cpvName: c.cpvName, noticeNo: c.noticeNo, kind: kindLabel(c.financialKind) });

/**
 * When every record of the notice carries this same title, the lot names what was bought: it becomes the page's
 * title and the shared title goes under it (UX audit Z7-03; the owner's head of 7 November otherwise stands).
 */
function titleParts(c: ContractDetail, noticeTitle: string | null) {
  const headline = cleanName(headlineOf(c, noticeTitle));
  const lot = c.noticeSameTitle && c.title && headline === cleanName(c.title.trim()) ? lotTitle(c.lotsCaption) : null;
  return lot ? { title: cleanName(lot.object), lotNo: lot.no, lotLine: headline, lotLabel: "Titlul comun al loturilor" }
    : { title: headline, lotNo: null, lotLine: meaningfulLot(c.lotsCaption, headline), lotLabel: "Lot" };
}

export async function generateMetadata({ params }: { params: Promise<{ nid: string }> }): Promise<Metadata> {
  const c = await contractDetail((await params).nid);
  return c ? { title: `${titleParts(c, null).title.slice(0, 70)} · ${cleanName(c.authority?.name) || "contract"}` } : {};
}

const moneyNote = (c: ContractDetail) => c.amountStatus === "converted" && c.valueRonExact !== null
  ? <>Echivalent verificat în SEAP: <strong>{formatExactDecimal(c.valueRonExact)} lei</strong> · curs {c.currencyRate}</>
  : !["ron", "converted", "legacy_ron"].includes(c.amountStatus)
    ? <>Valoarea în lei nu e verificată ({c.amountStatus === "legacy_unknown" ? "înregistrare istorică fără unitate confirmată" : c.amountStatus === "inconsistent" ? "sume sau monede neconcordante în sursă" : "date monetare incomplete"}); nu intră în totalurile în lei.</>
    : null;

/** The head figure's label; "nu e plată" once on the page, beside the figure it qualifies (UX audit Z7-08, Z7-09). */
function valueLabel(c: ContractDetail, shown: boolean) {
  const notPaid = shown ? <> <span className="record-not-paid">· nu e plată</span></> : null;
  return c.financialKind === "framework" ? <>{shown ? "Plafon publicat" : "Plafonul acordului-cadru"}{notPaid} <Term tip id="plafon-acord-cadru" /></>
    : c.financialKind === "amendment" ? <>Valoarea actului adițional{notPaid} <Term tip id="act-aditional" /></>
    : <>{c.amountStatus === "legacy_ron" ? "Valoare înregistrată" : "Valoarea contractului"}{notPaid} <Term tip id="valoare-inregistrata" /></>;
}

/**
 * The head's figure. A value SEAP gives in another currency, without a confirmed rate, is published but never converted
 * (contract-money: "foreign legacy values … never guessed"): it is named so, not "nepublicată" (UX audit Z7-valuta).
 * A missing value is said in words in body type, never as a figure, and without a note on a currency it does not have
 * (Z7-10, bug "notă despre înregistrare istorică" on a 2024 contract).
 */
function headValue(c: ContractDetail, currency: string): RecordValue {
  const totals = totalsNote(c);
  const state = contractValueState(c);
  if (state === "amount") return { amount: `${formatExactDecimal(c.contractValueExact!)} ${currency}`, label: valueLabel(c, true), notes: [moneyNote(c), totals] };
  if (state === "foreign") return {
    amount: <span className="record-amount-words">Valoare în valută, neconvertită</span>, label: valueLabel(c, false),
    notes: [`SEAP o dă în ${c.currency}, fără curs confirmat; n-o convertim în lei${totals ? "." : " și nu intră în totaluri."}`, totals],
  };
  return {
    amount: <span className="record-amount-words is-quiet">Valoare nepublicată</span>, label: valueLabel(c, false),
    notes: [c.amountStatus === "legacy_unknown" ? null : moneyNote(c), c.financialKind === "framework" ? "SEAP nu publică valoarea acestui acord-cadru; se numără comenzile lui." : totals],
  };
}

const fx = (value: string) => `${formatExactDecimal(value)} lei`;

/**
 * Declared call-offs over their framework (owner, 8 November 2026): what SEAP holds is shown as declared, with how many
 * times the ceiling it is and, when orders repeat the whole ceiling, that it is most likely a data-entry error; the
 * totals count them scaled to the ceiling (contract-reporting-5). The same bounds as the totals and the signal.
 */
function overCeiling(declared: string | null, ceiling: string | null, top: string | null): string | null {
  const d = Number(declared), c = Number(ceiling);
  if (declared === null || ceiling === null || !(c > 0) || !(d > CALLOFF_OVER_CEILING.ratio * c) || d - c < CALLOFF_OVER_CEILING.minExcess) return null;
  // A ceiling a single call-off exceeds more than `credible` times is not credible (owner, 9 November 2026): no warning.
  if (top !== null && Number(top) > CALLOFF_OVER_CEILING.credible * c) return null;
  return (Math.round((d / c) * 10) / 10).toFixed(1).replace(".", ",");
}

/** The totals already count less than SEAP declares (contract-reporting-5 applied by the last processing): until the run
 * after a deploy rebuilds the marts, they still hold the declared sum, and the page must not say they were reduced. */
function countedBelow(counted: string | null, declared: string | null): boolean {
  return counted !== null && declared !== null && Number(counted) < Number(declared) - 0.005;
}

/** Why this value stays out of the totals, said once, beside the value. */
const totalsNote = (c: ContractDetail) =>
  c.financialKind === "framework" ? "Separat de totaluri: se numără comenzile subsecvente."
  : c.financialKind === "amendment" ? "Act adițional: nu se adaugă la totaluri."
  : c.financialKind === "review" ? "Tip de contract neclar: în afara totalurilor până la verificare."
  : c.excludedIdentity ? <>Exclus temporar din totaluri: identitatea față de alte publicații nu e lămurită. <Link href={`/metodologie/excluderi?grup=${c.excludedIdentity}&din=${c.natId}`}>Motivul</Link></>
  : c.winnerIsAuthority ? <>Câștigătorul înregistrat e chiar instituția: în afara totalurilor și clasamentelor. <Link href="/metodologie#totaluri">Cum se formează totalurile</Link></>
  : c.aboveValueCap ? <>Peste 1 mld. lei: filtru al site-ului, în afara totalurilor. <Link href="/metodologie#totaluri">Cum se formează totalurile</Link></>
  : null;

export default async function ContractPage({ params }: { params: Promise<{ nid: string }> }) {
  await ghostHold();
  const { nid } = await params;
  const c = await contractDetail(nid);
  if (!c) notFound();

  const [files, userId, x] = await Promise.all([getContractFiles(nid), sessionUserId(), getContractContext(c)]);
  const { title: headline, lotNo, lotLine: lot, lotLabel } = titleParts(c, files.notice?.title ?? null);
  // The way to the notice and, for a call-off, to its framework agreement: the first row of the head (Z7-03, Z7-04).
  const noticeHref = c.caNoticeId && c.noticeLotCount > 1 ? `/anunturi/${c.caNoticeId}` : null;
  const noticeRecords = countWords(c.noticeLotCount, "înregistrare", "înregistrări");
  const kind = kindLabel(c.financialKind);
  const procedure = procedureLabel(c.procedureType);
  const tedNo = x.ted?.publicationNumber ?? (c.tedNoticeNo ? tedPublicationNumber(c.tedNoticeNo) : null);
  const tedHref = x.ted?.url ?? (tedNo ? tedNoticeUrl(tedNo) : null);
  const multiWinner = c.winners.length > 1 || c.nWinners > 1;
  const splitLabel = consortiumShareLabel(c.nWinners, c.splitFromRonExact ? `${formatExactDecimal(c.splitFromRonExact)} lei` : null);
  const currency = c.currency?.toUpperCase() === "RON" ? "lei" : c.currency ?? "(monedă neprecizată)";
  const authority = c.authority ? <EntityName id={c.authority.entityId} role="authority">{cleanName(c.authority.name)}</EntityName> : <span>Instituție neprecizată</span>;
  const winnerNames = c.winners.map((w, i) => <span key={w.entityId}>{i > 0 && (i === c.winners.length - 1 ? " și " : ", ")}<EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName></span>);
  // The award's own figures are the whole notice's: shown only when they add something to this contract's value.
  const award = c.awardValueExact != null && Number(c.awardValueExact) > 0 && c.noticeLotCount > 1 ? c.awardValueExact : null;
  // The mart's count holds only when every confirmed TED link agrees; one TED lot's count is the fallback.
  const tenders = c.tendersReceived ?? x.ted?.tendersReceived ?? null;
  const singleBidSignal = c.flags.some((f) => f.code === "award_single_bid");
  // What can explain call-offs over the ceiling is the signal's to say when the page shows it (Z7-07).
  const overCeilingWhy = c.flags.some((f) => f.code === "award_calloffs_over_ceiling") ? " Vezi semnalul de mai sus." : " Poate fi o depășire reală sau o eroare de completare în SEAP.";

  const parties: Party[] = [
    ...c.winners.map((w, i): Party => {
      const pair = x.pairs.find((p) => p.supplierId === w.entityId);
      const others = pair ? pair.history.nDa + pair.history.nCt : 0;
      return {
        key: w.entityId,
        role: c.winners.length > 1 ? `Câștigătorul ${i + 1} din ${c.winners.length}` : "Câștigătorul",
        name: <EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName>,
        place: countyLabel(w.county),
        lines: [
          multiWinner && w.shareRonExact != null && <><Term tip id="consortiu">Cotă estimată</Term>: {formatExactDecimal(w.shareRonExact)} lei{splitLabel ? ` (${splitLabel})` : ""}</>,
          c.authority && others > 0 && <a href={pairHref({ id: c.authority.entityId, name: cleanName(c.authority.name) }, { id: w.entityId, name: cleanName(w.name) })}>
            Încă {others === 1 ? "o înregistrare" : countWords(others, "înregistrare", "înregistrări")} cu instituția · {formatRon(pair!.history.totalRon)}</a>,
          ...pairLines(pair),
          c.winnerIsAuthority && <span className="warn">E chiar instituția: neconcordanță în sursă. Verifică furnizorul real în SEAP.</span>,
        ],
      };
    }),
  ];

  // Every sum of the record in the order it happens, each with what it covers (UX audit Z7-09; exact values, Z7-11).
  const whole = c.noticeLotCount > 1 ? "tot anunțul; " : "";
  const fw = x.framework?.role === "framework" ? x.framework : null;
  const sums: SumRow[] = [];
  if (x.ted?.estimateRon != null) sums.push({ key: "ted", label: <>Estimarea, în TED <Term tip id="estimare-ted" /></>, scope: x.ted.lotTitle ? <span title={x.ted.lotTitle}>fără TVA, doar acest lot</span> : "fără TVA", value: fx(x.ted.estimateRon) });
  if (c.lowestOfferExact != null && c.highestOfferExact != null && Number(c.highestOfferExact) > 0) sums.push(Number(c.lowestOfferExact) === Number(c.highestOfferExact)
    ? { key: "of", label: "Ofertele", scope: `${whole}cea mai mică = cea mai mare`, value: fx(c.lowestOfferExact) }
    : { key: "of", label: "Ofertele", scope: `${whole}de la cea mai mică la cea mai mare`, value: <><span>{fx(c.lowestOfferExact)}</span> – <span>{fx(c.highestOfferExact)}</span></> });
  if (award) sums.push({ key: "aw", label: <>Atribuită în anunț <Term tip id="valoare-atribuita" /></>, scope: <>toate cele {noticeHref ? <Link prefetch={false} href={noticeHref}>{noticeRecords}</Link> : noticeRecords}, cum a declarat-o instituția</>, value: fx(award) });
  const own = c.financialKind === "framework" ? "Acest acord-cadru: plafonul" : c.financialKind === "calloff" ? "Această comandă" : c.financialKind === "amendment" ? "Acest act adițional" : "Acest contract";
  sums.push({ key: "own", main: true, label: own, scope: `cifra din antet${c.financialKind === "framework" ? "; separat de totaluri" : c.financialKind === "amendment" ? "; nu se adaugă la totaluri" : ""}`,
    value: c.contractValueExact != null ? `${formatExactDecimal(c.contractValueExact)} ${currency}` : <span className="record-quiet">{contractValueState(c) === "foreign" ? "în valută, neconvertită" : "nepublicată"}</span> });
  let sumsNote: ReactNode = null;
  if (fw) {
    const times = overCeiling(fw.declaredRon, fw.ceilingRon, fw.topRon), reduced = countedBelow(fw.calloffsRon, fw.declaredRon);
    const orders = countWords(fw.calloffs, "comandă", "comenzi");
    if (fw.calloffs === 0) sums.push({ key: "co", label: <>Comenzile lui <Term tip id="comenzi-identificate" /></>, value: <span className="record-quiet">niciuna găsită</span> });
    else if (fw.declaredRon != null && (times || reduced)) {
      sums.push({ key: "co", label: "Comenzile lui, declarate în SEAP", scope: orders, value: fx(fw.declaredRon), aside: times ? `de ${times} ori plafonul` : null, warn: !!times });
      if (reduced && fw.calloffsRon != null) sums.push({ key: "ct", label: <>Numărate în totaluri <Term tip id="comenzi-identificate" /></>, scope: "comenzile, reduse până la plafon", value: fx(fw.calloffsRon) });
    } else sums.push({ key: "co", label: <>Comenzile lui, identificate <Term tip id="comenzi-identificate" /></>, scope: `${orders}; se numără în totaluri`, value: fw.calloffsRon != null ? fx(fw.calloffsRon) : fw.declaredRon != null ? fx(fw.declaredRon) : "—" });
    if (times) sumsNote = fw.repeats >= 2 ? `${countWords(fw.repeats, "comandă", "comenzi")} au exact suma plafonului: probabil plafonul copiat în fiecare comandă, o eroare de completare în SEAP.`
      : `Comenzile declarate trec de plafon:${overCeilingWhy.replace(" Vezi", " vezi").replace(" Poate", " poate")}`;
  }
  const sumsTitle = `Sumele, de la ${x.ted?.estimateRon != null ? "estimare" : sums.some((r) => r.key === "of") ? "oferte" : "anunț"} la ${fw && fw.calloffs > 0 ? "comenzi" : c.financialKind === "calloff" ? "comandă" : c.financialKind === "framework" ? "acordul-cadru" : c.financialKind === "amendment" ? "actul adițional" : "contract"}`;

  const republished = c.publications.length > 1;
  const awardSourceLabel = `Anunțul de atribuire${c.noticeNo ? ` ${c.noticeNo}` : ""} în SEAP`;
  const sources: Source[] = [
    ...(c.caNoticeId ? [{ href: awardUrl(c.caNoticeId), label: awardSourceLabel, external: true }] : []),
    ...(files.notice ? [{ href: files.notice.url, label: `Anunțul de participare ${files.notice.noticeNo ?? ""} în SEAP`.replace("  ", " "), external: true }] : []),
    ...(tedHref ? [{ href: tedHref, label: `Publicarea în TED ${tedNo ?? ""}`.trim(), external: true }] : []),
    ...(noticeHref ? [{ href: noticeHref, label: `Anunțul, cu toate cele ${noticeRecords}` }] : []),
  ];

  return (
    <RecordPage className="record-entry contract-record">
      <RecordHead
        title={headline}
        heading={<RecordTitle>{headline}</RecordTitle>}
        context={(noticeHref || x.framework?.role === "calloff") && <>
          {x.framework?.role === "calloff" && <Link prefetch={false} href={`/contracte/${x.framework.frameworkNatId}`} title={cleanName(x.framework.frameworkTitle) || undefined}>Comandă din acordul-cadru <span aria-hidden="true">→</span></Link>}
          {noticeHref && (lotNo
            ? <span>Lotul {lotNo} din <Link prefetch={false} href={noticeHref}>anunțul{c.noticeNo ? ` ${c.noticeNo}` : ""} · {noticeRecords} <span aria-hidden="true">→</span></Link></span>
            : <Link prefetch={false} href={noticeHref}>Anunțul{c.noticeNo ? ` ${c.noticeNo}` : " de atribuire"} · {noticeRecords} <span aria-hidden="true">→</span></Link>)}
        </>}
        lot={lot}
        lotLabel={lotLabel}
        parties={<>{authority} a contractat cu {winnerNames.length ? winnerNames : "un câștigător neprecizat"}</>}
        value={headValue(c, currency)}
        meta={[
          <span className="record-kind" key="k">{kind}</span>,
          c.contractDate && <span key="d">Semnat {formatCalendarDate(c.contractDate)}{c.contractDate < CONTRACT_DATE_FLOOR && <span className="record-quiet" title="Data din sursă e anterioară arhivei (2018): valoarea rămâne în totaluri, fără an."> · dată improbabilă</span>}</span>,
          // The procedure and the single offer are said in Atribuirea, the lead in the signal (Z7-07): once each.
          c.contractNo && <span key="n">nr. {c.contractNo}</span>,
        ]}
        actions={<>
          {c.caNoticeId && <a className="record-seap" href={awardUrl(c.caNoticeId)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (anunțul de atribuire, filă nouă)</span></a>}
          <ClipButton kind="contract" refId={String(nid)} label={headline} />
        </>}
      />

      <ContractPublications publications={c.publications} currentId={nid} countedOnce={c.countedOnce} />

      <SignalList flags={c.flags} authorityId={c.authority?.entityId ?? null}
        fallbackEvidence={(f) => f.evidence?.["value"] != null ? <>{procedureLabel(String(f.evidence?.["procedure"] ?? c.procedureType ?? ""))} · {awardValueLabel(f.evidence)}: {formatRonFull(Number(f.evidence?.["value"]))}{noticeContractsNote(f.evidence!) ? ` · ${noticeContractsNote(f.evidence!).trim()}` : ""}</> : null} />

      <RecordSection id="atribuire" title="Atribuirea">
        {sums.length > 1 && <RecordSums title={sumsTitle} rows={sums} note={sumsNote} />}
        <Facts facts={[
          // A single offer is said where the lead is (Z7-07): by the signal when the page has it, here otherwise.
          { label: "Oferte primite", value: tenders != null ? <>{formatInt(tenders)}{tenders === 1 && !singleBidSignal ? " · un singur ofertant" : ""}</>
            : c.isSingleBidder === true && !singleBidSignal ? "Un singur ofertant" : <span className="record-quiet">Număr nepublicat</span> },
          x.ted?.euFunded != null && { label: "Fonduri UE", value: x.ted.euFunded ? "Da, potrivit TED" : "Nu, potrivit TED" },
          procedure && { label: <Term tip id="contract-procedura">Procedura</Term>, value: procedure },
          (c.cpvName || c.cpvCode) && { label: `Domeniu CPV${c.cpvFromNotice ? " (din anunț)" : ""}`, value: c.cpvName ?? <span className="record-quiet">Denumire neprecizată</span> },
          // A republished notice's version date matters (its versions are listed above); otherwise it is folded (Z7-29).
          republished && c.stateDate && { label: "Data acestei versiuni a anunțului", value: formatCalendarDate(c.stateDate.slice(0, 10)) },
          x.framework?.role === "calloff" && { label: "Acordul-cadru", value: <><Link prefetch={false} href={`/contracte/${x.framework.frameworkNatId}`}>{cleanName(x.framework.frameworkTitle) || "Acordul-cadru al comenzii"}</Link>
            {(() => { const f = x.framework, times = overCeiling(f.declaredRon, f.ceilingRon, f.topRon); return times && <small className="record-warn">Comenzile lui declarate în SEAP ({formatInt(f.calloffs)}) însumează {formatExactDecimal(f.declaredRon!)} lei, de {times} ori plafonul de {formatExactDecimal(f.ceilingRon!)} lei.{f.repeatsCeiling ? " Comanda aceasta declară chiar tot plafonul: probabil o eroare de completare în SEAP." : overCeilingWhy}{countedBelow(c.splitFromRonExact, c.valueRonExact ?? (c.amountStatus === "ron" || c.amountStatus === "legacy_ron" ? c.contractValueExact : null)) ? ` În totaluri, comanda se numără cu ${formatExactDecimal(c.splitFromRonExact)} lei: comenzile acordului sunt reduse proporțional până la plafon.` : ""}</small>; })()}</>, wide: overCeiling(x.framework.declaredRon, x.framework.ceilingRon, x.framework.topRon) !== null },
          x.cnsc && { label: "Contestații", value: <>{x.cnsc.complaints > 1 ? `${formatInt(x.cnsc.complaints)} documente de contestație` : "Un document de contestație"} printre documentele procedurii{x.cnsc.mentionsCnsc ? ", cu mențiunea CNSC" : ""} · <a href="#fisiere">Documente</a><small>Recunoscute după numele fișierului: pot fi greșit clasificate.</small></>, wide: true },
        ]} />
        <SeapDetails facts={[
          !republished && c.stateDate && { label: "Data acestei versiuni a anunțului", value: formatCalendarDate(c.stateDate.slice(0, 10)) },
          c.cpvCode && { label: "Cod CPV", value: c.cpvCode },
          { label: "ID SEAP al contractului", value: c.natId },
          c.caNoticeId && { label: "ID SEAP al anunțului de atribuire", value: c.caNoticeId },
        ]} />
      </RecordSection>

      <RecordSection id="parti" title="Instituție și câștigători">
        <PartyList institution={{ name: authority, place: countyLabel(c.authority?.county) }} parties={parties} />
      </RecordSection>

      {/* Each SEAP document keeps one name on the page, the one in Sources (UX audit Z7-13). */}
      <ContractFiles nid={nid} initial={files} authenticated={!!userId} {...(c.caNoticeId ? { sourceUrl: awardUrl(c.caNoticeId), sourceLabel: awardSourceLabel } : {})} />

      <Sources sources={sources} />
    </RecordPage>
  );
}
