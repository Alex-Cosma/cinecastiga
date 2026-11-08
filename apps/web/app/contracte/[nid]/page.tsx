import { CALLOFF_OVER_CEILING } from "@seap/db";
import type { Metadata } from "next";
import { cache } from "react";
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
import { kindLabel, meaningfulLot, procedureLabel, recordHeadline } from "@/lib/record-labels";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { Facts, PartyList, RecordHead, RecordPage, RecordSection, SignalList, Sources, pairHref, pairLines, type Party, type Source } from "@/components/record/Record";
import { consortiumShareLabel } from "@/lib/consortium";
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

export async function generateMetadata({ params }: { params: Promise<{ nid: string }> }): Promise<Metadata> {
  const c = await contractDetail((await params).nid);
  return c ? { title: `${cleanName(headlineOf(c, null)).slice(0, 70)} · ${cleanName(c.authority?.name) || "contract"}` } : {};
}

const moneyNote = (c: ContractDetail) => c.amountStatus === "converted" && c.valueRonExact !== null
  ? <>Echivalent verificat în SEAP: <strong>{formatExactDecimal(c.valueRonExact)} lei</strong> · curs {c.currencyRate}</>
  : !["ron", "converted", "legacy_ron"].includes(c.amountStatus)
    ? <>Valoarea în lei nu e verificată ({c.amountStatus === "legacy_unknown" ? "înregistrare istorică fără unitate confirmată" : c.amountStatus === "inconsistent" ? "sume sau monede neconcordante în sursă" : "date monetare incomplete"}); nu intră în totalurile în lei.</>
    : null;

const valueLabel = (c: ContractDetail) => c.financialKind === "framework" ? <>Plafon publicat <Term tip id="plafon-acord-cadru" /></>
  : c.financialKind === "amendment" ? <>Valoarea actului adițional <Term tip id="act-aditional" /></>
  : c.amountStatus === "legacy_ron" ? <Term tip id="valoare-inregistrata">Valoare înregistrată</Term>
  : <Term tip id="valoare-inregistrata">Valoarea contractului</Term>;

/**
 * Declared call-offs over their framework (owner, 8 November 2026): what SEAP holds is shown as declared, with how many
 * times the ceiling it is and, when orders repeat the whole ceiling, that it is most likely a data-entry error; the
 * totals count them scaled to the ceiling (contract-reporting-5). The same bounds as the totals and the signal.
 */
function overCeiling(declared: string | null, ceiling: string | null): string | null {
  const d = Number(declared), c = Number(ceiling);
  if (declared === null || ceiling === null || !(c > 0) || !(d > CALLOFF_OVER_CEILING.ratio * c) || d - c < CALLOFF_OVER_CEILING.minExcess) return null;
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
  : c.excludedIdentity ? <>Exclus temporar din totaluri: identitatea față de alte publicații nu e lămurită. <Link href={`/metodologie/excluderi?grup=${c.excludedIdentity}`}>Motivul</Link></>
  : c.winnerIsAuthority ? <>Câștigătorul înregistrat e chiar instituția: în afara totalurilor și clasamentelor. <Link href="/metodologie#totaluri">Cum se formează totalurile</Link></>
  : c.aboveValueCap ? <>Peste 1 mld. lei: filtru al site-ului, în afara totalurilor. <Link href="/metodologie#totaluri">Cum se formează totalurile</Link></>
  : null;

export default async function ContractPage({ params }: { params: Promise<{ nid: string }> }) {
  await ghostHold();
  const { nid } = await params;
  const c = await contractDetail(nid);
  if (!c) notFound();

  const [files, userId, x] = await Promise.all([getContractFiles(nid), sessionUserId(), getContractContext(c)]);
  const headline = cleanName(headlineOf(c, files.notice?.title ?? null));
  const lot = meaningfulLot(c.lotsCaption, headline);
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
  const award = c.awardValueRon != null && c.awardValueRon > 0 && c.noticeLotCount > 1 ? c.awardValueRon : null;
  const offers = c.lowestOfferRon != null && c.highestOfferRon != null && c.highestOfferRon > 0
    ? (c.lowestOfferRon === c.highestOfferRon ? formatRon(c.lowestOfferRon) : `${formatRon(c.lowestOfferRon)} – ${formatRon(c.highestOfferRon)}`) : null;
  // The mart's count holds only when every confirmed TED link agrees; one TED lot's count is the fallback.
  const tenders = c.tendersReceived ?? x.ted?.tendersReceived ?? null;

  const parties: Party[] = [
    { key: "a", role: "Instituția", name: authority, lines: [countyLabel(c.authority?.county)] },
    ...c.winners.map((w, i): Party => {
      const pair = x.pairs.find((p) => p.supplierId === w.entityId);
      const others = pair ? pair.history.nDa + pair.history.nCt : 0;
      return {
        key: w.entityId,
        role: c.winners.length > 1 ? `Câștigătorul ${i + 1} din ${c.winners.length}` : "Câștigătorul",
        name: <EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName>,
        lines: [
          countyLabel(w.county),
          multiWinner && w.shareRonExact != null && <><Term tip id="consortiu">Cotă estimată</Term>: {formatExactDecimal(w.shareRonExact)} lei{splitLabel ? ` (${splitLabel})` : ""}</>,
          c.authority && others > 0 && <a href={pairHref({ id: c.authority.entityId, name: cleanName(c.authority.name) }, { id: w.entityId, name: cleanName(w.name) })}>
            Încă {others === 1 ? "o înregistrare" : `${formatInt(others)} înregistrări`} cu instituția · {formatRon(pair!.history.totalRon)}</a>,
          ...pairLines(pair),
          c.winnerIsAuthority && <span className="warn">E chiar instituția: neconcordanță în sursă. Verifică furnizorul real în SEAP.</span>,
        ],
      };
    }),
  ];

  const sources: Source[] = [
    ...(c.caNoticeId ? [{ href: awardUrl(c.caNoticeId), label: `Anunțul de atribuire${c.noticeNo ? ` ${c.noticeNo}` : ""} în SEAP`, external: true }] : []),
    ...(files.notice ? [{ href: files.notice.url, label: `Anunțul de participare ${files.notice.noticeNo ?? ""} în SEAP`.replace("  ", " "), external: true }] : []),
    ...(tedHref ? [{ href: tedHref, label: `Publicarea în TED ${tedNo ?? ""}`.trim(), external: true }] : []),
    ...(c.caNoticeId && c.noticeLotCount > 1 ? [{ href: `/anunturi/${c.caNoticeId}`, label: `Anunțul, cu toate cele ${formatInt(c.noticeLotCount)} înregistrări` }] : []),
  ];

  return (
    <RecordPage className="contract-record">
      <RecordHead
        title={headline}
        lot={lot}
        parties={<>{authority} a contractat cu {winnerNames.length ? winnerNames : "un câștigător neprecizat"}</>}
        value={{
          amount: c.contractValueExact != null ? `${formatExactDecimal(c.contractValueExact)} ${currency}` : "Valoare nepublicată",
          label: valueLabel(c),
          notes: [moneyNote(c), totalsNote(c)],
        }}
        meta={[
          <span className="record-kind" key="k">{kind}</span>,
          c.contractDate && <span key="d">Semnat {formatCalendarDate(c.contractDate)}{c.contractDate < CONTRACT_DATE_FLOOR && <span className="record-quiet" title="Data din sursă e anterioară arhivei (2018): valoarea rămâne în totaluri, fără an."> · dată improbabilă</span>}</span>,
          procedure && <span key="p">{procedure}</span>,
          c.isSingleBidder === true && <span key="o">un singur ofertant</span>,
          c.contractNo && <span key="n">nr. {c.contractNo}</span>,
        ]}
        actions={<>
          {c.caNoticeId && <a className="record-seap" href={awardUrl(c.caNoticeId)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (anunțul de atribuire, filă nouă)</span></a>}
          <ClipButton kind="contract" refId={String(nid)} label={headline} />
        </>}
        signals={c.flags.length}
      />

      <ContractPublications publications={c.publications} currentId={nid} countedOnce={c.countedOnce} />

      <SignalList flags={c.flags} authorityId={c.authority?.entityId ?? null}
        fallbackEvidence={(f) => f.evidence?.["value"] != null ? <>{procedureLabel(String(f.evidence?.["procedure"] ?? c.procedureType ?? ""))} · {awardValueLabel(f.evidence)}: {formatRonFull(Number(f.evidence?.["value"]))}{noticeContractsNote(f.evidence!) ? ` · ${noticeContractsNote(f.evidence!).trim()}` : ""}</> : null} />

      <RecordSection id="atribuire" title="Atribuirea">
        <Facts facts={[
          award != null && { label: "Valoarea anunțului (toate contractele)", value: <>{formatRon(award)}<small>{formatInt(c.noticeLotCount)} înregistrări în anunț</small></> },
          { label: "Oferte primite", value: tenders != null ? <>{formatInt(tenders)}{tenders === 1 ? " · un singur ofertant" : ""}</> : <span className="record-quiet">Număr nepublicat</span> },
          offers && { label: c.noticeLotCount > 1 ? "Oferte, de la cea mai mică la cea mai mare (tot anunțul)" : "Oferte, de la cea mai mică la cea mai mare", value: offers },
          x.ted?.estimateRon != null && { label: <Term tip id="estimare-ted">Estimarea din TED, fără TVA</Term>, value: <>{formatExactDecimal(x.ted.estimateRon)} lei{x.ted.lotTitle && <small>{x.ted.lotTitle}</small>}</> },
          x.ted?.euFunded != null && { label: "Fonduri UE", value: x.ted.euFunded ? "Da, potrivit TED" : "Nu, potrivit TED" },
          procedure && { label: <Term tip id="contract-procedura">Procedura</Term>, value: procedure },
          (c.cpvName || c.cpvCode) && { label: `Domeniu CPV${c.cpvFromNotice ? " (din anunț)" : ""}`, value: <>{c.cpvName ?? "Denumire neprecizată"}{c.cpvCode && <small>{c.cpvCode}</small>}</> },
          c.stateDate && { label: "Data acestei versiuni a anunțului", value: formatCalendarDate(c.stateDate.slice(0, 10)) },
          x.framework?.role === "framework" && { label: <Term tip id="comenzi-identificate">Comenzi subsecvente identificate</Term>, value: x.framework.calloffs > 0 ? <>{formatInt(x.framework.calloffs)}{x.framework.calloffsRon != null && ` · ${formatExactDecimal(x.framework.calloffsRon)} lei`}
            {(() => { const f = x.framework, times = overCeiling(f.declaredRon, f.ceilingRon); return times && <small className="record-warn">Comenzile declarate în SEAP însumează {formatExactDecimal(f.declaredRon!)} lei, de {times} ori plafonul acordului-cadru.{f.repeats >= 2 ? ` ${formatInt(f.repeats)} comenzi au exact suma plafonului: probabil plafonul copiat în fiecare comandă, o eroare de completare în SEAP.` : " Poate fi o depășire reală sau o eroare de completare în SEAP."}{countedBelow(f.calloffsRon, f.declaredRon) ? " În totaluri se numără cel mult plafonul: comenzile sunt reduse proporțional." : ""}</small>; })()}</> : <span className="record-quiet">Niciuna găsită (nu înseamnă zero)</span>, wide: overCeiling(x.framework.declaredRon, x.framework.ceilingRon) !== null },
          x.framework?.role === "calloff" && { label: "Acordul-cadru", value: <><Link href={`/contracte/${x.framework.frameworkNatId}`}>{cleanName(x.framework.frameworkTitle) || "Acordul-cadru al comenzii"}</Link>
            {(() => { const f = x.framework, times = overCeiling(f.declaredRon, f.ceilingRon); return times && <small className="record-warn">Comenzile lui declarate în SEAP ({formatInt(f.calloffs)}) însumează {formatExactDecimal(f.declaredRon!)} lei, de {times} ori plafonul de {formatExactDecimal(f.ceilingRon!)} lei.{f.repeatsCeiling ? " Comanda aceasta declară chiar tot plafonul: probabil o eroare de completare în SEAP." : " Poate fi o depășire reală sau o eroare de completare în SEAP."}{countedBelow(c.splitFromRonExact, c.valueRonExact ?? (c.amountStatus === "ron" || c.amountStatus === "legacy_ron" ? c.contractValueExact : null)) ? ` În totaluri, comanda se numără cu ${formatExactDecimal(c.splitFromRonExact)} lei: comenzile acordului sunt reduse proporțional până la plafon.` : ""}</small>; })()}</>, wide: overCeiling(x.framework.declaredRon, x.framework.ceilingRon) !== null },
          x.cnsc && { label: "Contestații", value: <>{x.cnsc.complaints > 1 ? `${formatInt(x.cnsc.complaints)} documente de contestație` : "Un document de contestație"} printre documentele procedurii{x.cnsc.mentionsCnsc ? ", cu mențiunea CNSC" : ""} · <a href="#fisiere">Documente</a><small>Recunoscute după numele fișierului: pot fi greșit clasificate.</small></>, wide: true },
        ]} />
      </RecordSection>

      <RecordSection id="parti" title="Instituție și câștigători">
        <PartyList parties={parties} />
      </RecordSection>

      <ContractFiles nid={nid} initial={files} authenticated={!!userId} {...(c.caNoticeId ? { sourceUrl: awardUrl(c.caNoticeId) } : {})} />

      <Sources sources={sources} />
    </RecordPage>
  );
}
