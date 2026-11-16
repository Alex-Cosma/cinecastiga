import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAwardNoticeDetail, type AwardNoticeDetail } from "@/lib/marts";
import { CONTRACT_DATE_FLOOR } from "@seap/db";
import { formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName, countyLabel } from "@/lib/format";
import { awardUrl } from "@/lib/elicitatie";
import { isGenericTitle, lotTitle, meaningfulLot, noticeGapNote, procedureLabel, recordHeadline } from "@/lib/record-labels";
import { awardValueLabel, noticeContractsNote } from "@/lib/risk-presentation";
import { countWords } from "@/lib/ask/answer-text";
import { tedNoticeUrl, tedPublicationNumber } from "@/lib/record-context";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { LOT_COLUMNS } from "@/lib/notice-lots-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import { PendingRegion } from "@/components/ghost/client";
import ListPager from "@/components/record/ListPager";
import SeapDetails from "@/components/record/SeapDetails";
import { Facts, RecordHead, RecordPage, RecordSection, SignalList, Sources, type Source } from "@/components/record/Record";
import RecordTitle from "@/components/record/RecordTitle";
import "@/components/record/record-pages.css";
import "./notice.css";

/**
 * Award-notice page, the "mother" of its contracts: one procedure, N records, keyed by SICAP's ca_notice_id. Each
 * record links to its /contracte page; big frameworks (max ~2.700 records) paginate via ?p=. SEAP republishes an award
 * notice under the same number when it adds call-offs; the date shown is this version's, next to the first contract
 * across its versions (owner, 21 October 2026). Record template of 7 November 2026.
 */

export const dynamic = "force-dynamic";

/** One read per request and address: the tab title and the page share it (the query string keys the filters). */
const noticeDetail = cache((caid: string, query: string) => {
  const sp = Object.fromEntries(new URLSearchParams(query));
  return getAwardNoticeDetail(caid, Math.max(1, Number(sp["p"]) || 1), 50, readFilters(LOT_COLUMNS, (key) => sp[key]));
});
const queryOf = (sp: Record<string, string | undefined>) => new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] !== undefined)).toString();

/** The title most of the notice's records carry, when at least half do: what the procedure is called (Z7-19, Z7-22). */
const sharedTitle = (n: AwardNoticeDetail) => n.commonTitle && n.nLots > 0 && n.commonTitle.n * 2 >= n.nLots ? n.commonTitle.title : null;

/**
 * The notice's title (UX audit Z7-19): its own in SEAP, else the title its records share, cleaned as on a contract,
 * and only then the CPV category (a generic title like "Contract" falls through; record-labels isGenericTitle).
 */
const headlineOf = (n: AwardNoticeDetail) => recordHeadline({ title: n.awardTitle, noticeTitle: sharedTitle(n), cpvName: n.cpvName, noticeNo: n.noticeNo, kind: `Anunț de atribuire ${n.noticeNo ?? n.caNoticeId}` });
const fold = (t: string | null | undefined) => (t ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export async function generateMetadata({ params, searchParams }: { params: Promise<{ caid: string }>; searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const n = await noticeDetail((await params).caid, queryOf(await searchParams));
  return n ? { title: `${cleanName(headlineOf(n)).slice(0, 70)} · ${cleanName(n.authority?.name) || "anunț de atribuire"}` } : {};
}

export default async function NoticePage({ params, searchParams }: {
  params: Promise<{ caid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { caid } = await params;
  const sp = await searchParams;
  // The records' column funnels (owner, 4 November 2026; lib/notice-lots-columns.ts) and the page, from the address.
  const n = await noticeDetail(caid, queryOf(sp));
  if (!n) notFound();

  const ted = n.tedNoticeNo ? tedPublicationNumber(n.tedNoticeNo) : null;
  const pages = Math.max(1, Math.ceil(n.nShown / n.pageSize));
  const scope = { caid: String(caid) };
  // No #anchor in the address: the pager brings the list into view from code, so Back from a record returns to its row
  // (UX audit Z7-20).
  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] !== undefined));
    q.set("p", String(p));
    return `?${q.toString()}`;
  };
  // Rows that carry the notice's shared title show their lot instead, the shared title said once above (Z7-22).
  const shared = sharedTitle(n);
  const rowLot = (l: AwardNoticeDetail["lots"][number]) => shared && n.commonTitle!.n >= 2 && fold(l.title) === fold(shared) ? lotTitle(l.lotsCaption) : null;
  const anyLotRow = n.lots.some((l) => rowLot(l));
  const none = n.nLots === 0;
  const headline = cleanName(headlineOf(n));
  const procedure = procedureLabel(n.procedureType);
  // Exact sums on a record's page (UX audit Z7-11), as on the contract and the acquisition.
  const lei = (value: string) => `${formatExactDecimal(value)} lei`;
  const e = n.exact;
  const offers = e.lowestOffer != null && e.highestOffer != null && Number(e.highestOffer) > 0
    ? (Number(e.lowestOffer) === Number(e.highestOffer) ? lei(e.lowestOffer) : `${lei(e.lowestOffer)} – ${lei(e.highestOffer)}`) : null;
  const awarded = e.award != null && Number(e.award) > 0 ? e.award : null;
  // The contracts found against the value the notice declares, when both count the same things (Z7-09).
  const gapNote = noticeGapNote(e);
  const sources: Source[] = [
    { href: awardUrl(n.caNoticeId), label: `Anunțul de atribuire${n.noticeNo ? ` ${n.noticeNo}` : ""} în SEAP`, external: true },
    ...(ted ? [{ href: tedNoticeUrl(ted)!, label: `Publicarea în TED ${ted}`, external: true }] : []),
  ];

  return (
    <RecordPage className="record-entry notice-record">
      <RecordHead
        title={headline}
        heading={<RecordTitle>{headline}</RecordTitle>}
        parties={n.authority ? <><EntityName id={n.authority.entityId} role="authority">{cleanName(n.authority.name)}</EntityName>{countyLabel(n.authority.county) && <span className="record-quiet"> · {countyLabel(n.authority.county)}</span>} {none ? " a publicat anunțul" : <> a atribuit {n.nLots === 1 ? "o înregistrare" : countWords(n.nLots, "înregistrare", "înregistrări")}</>}</> : null}
        value={{
          // No contract found is said in words, in body type, not as a figure (Z7-10, Z7-21).
          amount: e.total != null ? lei(e.total) : <span className="record-amount-words is-quiet">{none ? "Niciun contract găsit" : "Nicio valoare identificată"}</span>,
          // "nu e plată" once on the page, beside the figure (Z7-08, Z7-09).
          label: <>Contracte și comenzi identificate{e.total != null && <> <span className="record-not-paid">· nu e plată</span></>} <Term tip id="comenzi-identificate" /></>,
          notes: [
            e.frameworks != null && <>Plafoane de acord-cadru publicate: {lei(e.frameworks)}, separate de totaluri.</>,
            n.versions.length > 1 && "Republicările aceluiași anunț nu se adună.",
          ],
        }}
        meta={[
          <span className="record-kind" key="k">Anunț de atribuire</span>,
          // The procedure is in Atribuirea (Z7-07); on a phone the number gives way (it is in Sources).
          n.noticeNo && <span key="n" className={n.versionDate ? "record-meta-wide" : undefined}>{n.noticeNo}</span>,
          n.versionDate && <span key="v">Versiunea din {formatCalendarDate(n.versionDate)}</span>,
        ]}
        actions={<>
          <a className="record-seap" href={awardUrl(n.caNoticeId)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (anunțul de atribuire, filă nouă)</span></a>
          <ClipButton kind="notice" refId={String(caid)} label={headline} />
        </>}
      />

      {/* The award's signals, as on its contracts (Z7-18): whoever arrives on the notice first sees the lead. */}
      <SignalList flags={n.flags} authorityId={n.authority?.entityId ?? null}
        fallbackEvidence={(f) => f.evidence?.["value"] != null ? <>{procedureLabel(String(f.evidence?.["procedure"] ?? n.procedureType ?? ""))} · {awardValueLabel(f.evidence)}: {formatRonFull(Number(f.evidence?.["value"]))}{noticeContractsNote(f.evidence!) ? ` · ${noticeContractsNote(f.evidence!).trim()}` : ""}</> : null} />

      <RecordSection id="atribuire" title="Atribuirea">
        <Facts facts={[
          awarded && { label: <Term tip id="valoare-atribuita">Valoarea atribuită în anunț</Term>, value: <>{lei(awarded)}{gapNote && <small>{gapNote}</small>}</>, wide: !!gapNote },
          offers && { label: "Oferte, de la cea mai mică la cea mai mare", value: offers },
          procedure && { label: <Term tip id="contract-procedura">Procedura</Term>, value: procedure },
          (n.cpvName || n.cpvCode) && { label: "Domeniu CPV", value: n.cpvName ?? <span className="record-quiet">Denumire neprecizată</span> },
          // Only a notice with several records has a "first" one (Z7-29).
          n.nLots > 1 && { label: "Primul contract din anunț", value: n.firstContractDate ? formatCalendarDate(n.firstContractDate) : <span className="record-quiet">Fără dată plauzibilă</span> },
          n.versions.length > 1 && { label: <Term tip id="versiuni-anunt">Versiuni SEAP</Term>, wide: true, value: n.versions.map((v, i) => <span key={v.caNoticeId}>{i > 0 && ", "}{v.caNoticeId === n.caNoticeId
            ? <span aria-current="page">{formatCalendarDate(v.versionDate)} (aceasta)</span>
            : <Link prefetch={false} href={`/anunturi/${v.caNoticeId}`}>{formatCalendarDate(v.versionDate)}</Link>}</span>) },
        ]} />
        <SeapDetails facts={[
          n.cpvCode && { label: "Cod CPV", value: n.cpvCode },
          { label: "ID SEAP al anunțului", value: n.caNoticeId },
        ]} />
      </RecordSection>

      {/* The funnels and the pager keep the records in place, dimmed, while the next ones come (owner, 6 November 2026). */}
      <PendingRegion as="section" className="record-section notice-lots" label="Se încarcă înregistrările…">
        <h2 id="inregistrari" className="list-anchor">Înregistrările din acest anunț</h2>
        {none ? <div className="record-empty">
          <p>Nu am găsit contractele acestui anunț în date.</p>
          <p>Pot lipsi din arhiva colectată sau pot fi publicate altfel în SEAP. <a href={awardUrl(n.caNoticeId)} target="_blank" rel="noopener noreferrer">Vezi anunțul în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a></p>
        </div> : <>
        <UrlFilterBand table="loturi" scope={scope} />
        {(pages > 1 || n.nShown !== n.nLots) && (
          <p className="record-lead">
            {n.nShown !== n.nLots ? `${formatInt(n.nShown)} din ${countWords(n.nLots, "înregistrare", "înregistrări")}` : countWords(n.nLots, "înregistrare", "înregistrări")}
            {pages > 1 ? ` · pagina ${n.page} din ${formatInt(pages)}` : ""} · ordonate după valoare
          </p>
        )}
        {/* Said once above the rows, unless it is already the page's title. */}
        {anyLotRow && fold(cleanName(shared)) !== fold(headline) && <p className="record-shared-title"><span>{n.commonTitle!.n === n.nLots ? "Titlul comun al loturilor" : `Titlul a ${countWords(n.commonTitle!.n, "înregistrare", "înregistrări")} din ${formatInt(n.nLots)}`}</span> {cleanName(shared)}</p>}
        <table className="record-lots">
          <thead>
            <tr>
              <th scope="col"><UrlFunnel table="loturi" column="tip" label="Obiect · tip" scope={scope} /></th>
              <th scope="col"><UrlFunnel table="loturi" column="castigator" label="Câștigător" scope={scope} /></th>
              <th scope="col"><UrlFunnel table="loturi" column="data" label="Data" scope={scope} /></th>
              <th scope="col" className="lot-value"><UrlFunnel table="loturi" column="valoare" label="Valoare" align="end" scope={scope} /></th>
            </tr>
          </thead>
          <tbody>
            {n.lots.map((l) => {
              const lot = rowLot(l);
              return <tr key={l.natId}>
                <th scope="row" className="lot-object">
                  <Link prefetch={false} href={`/contracte/${l.natId}`} title={lot ? cleanName(l.title) : undefined}>{lot
                    ? <>{lot.no && <span className="lot-no">Lot {lot.no}</span>}{cleanName(lot.object)}</>
                    : cleanName(isGenericTitle(l.title) ? meaningfulLot(l.lotsCaption, null) ?? l.title : l.title) || (l.contractNo ? `Contractul nr. ${l.contractNo}` : "Contractul")}</Link>
                  <small>{[l.contractNo && `nr. ${l.contractNo}`, l.financialKind === "framework" && "plafon de acord-cadru", l.financialKind === "calloff" && "comandă subsecventă", l.financialKind === "amendment" && "act adițional, neadăugat", l.financialKind === "review" && "tip neclar, de verificat", l.temporarilyExcluded && "exclus temporar din totaluri"].filter(Boolean).join(" · ")}</small>
                </th>
                <td data-label="Câștigător">
                  {l.winners.length === 0 ? "—" : l.winners.map((w, i) => (
                    <span key={w.entityId}>{i > 0 && ", "}<EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName></span>
                  ))}
                </td>
                <td data-label="Data">{l.contractDate ? formatCalendarDate(l.contractDate.slice(0, 10)) : "—"}{l.contractDate && l.contractDate < CONTRACT_DATE_FLOOR && <small> dată improbabilă</small>}</td>
                <td data-label="Valoare" className="lot-value">{formatRonFull(l.contractValue)}</td>
              </tr>;
            })}
          </tbody>
        </table>
        {n.lots.length === 0 && n.nShown !== n.nLots && <p className="record-missing">Nicio înregistrare cu filtrele alese.</p>}
        {pages > 1 && <ListPager page={n.page} pages={pages} prev={n.page > 1 ? pageHref(n.page - 1) : null} next={n.page < pages ? pageHref(n.page + 1) : null} target="inregistrari" label="Paginile înregistrărilor" />}
        </>}
      </PendingRegion>

      <Sources sources={sources} />
    </RecordPage>
  );
}
