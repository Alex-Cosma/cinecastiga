import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAwardNoticeDetail, type AwardNoticeDetail } from "@/lib/marts";
import { CONTRACT_DATE_FLOOR } from "@seap/db";
import { formatRon, formatRonFull, formatInt, formatCalendarDate, cleanName, countyLabel } from "@/lib/format";
import { awardUrl } from "@/lib/elicitatie";
import { isGenericTitle, meaningfulLot, procedureLabel, recordHeadline } from "@/lib/record-labels";
import { tedNoticeUrl, tedPublicationNumber } from "@/lib/record-context";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { LOT_COLUMNS } from "@/lib/notice-lots-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import { PendingRegion, RegionLink } from "@/components/ghost/client";
import { Facts, RecordHead, RecordPage, RecordSection, Sources, type Source } from "@/components/record/Record";
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

const headlineOf = (n: AwardNoticeDetail) => recordHeadline({ cpvName: n.cpvName, noticeNo: n.noticeNo, kind: `Anunț de atribuire ${n.noticeNo ?? n.caNoticeId}` });

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
  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] !== undefined));
    q.set("p", String(p));
    return `?${q.toString()}#inregistrari`;
  };
  const headline = cleanName(headlineOf(n));
  const procedure = procedureLabel(n.procedureType);
  const offers = n.lowestOfferRon != null && n.highestOfferRon != null && n.highestOfferRon > 0
    ? (n.lowestOfferRon === n.highestOfferRon ? formatRon(n.lowestOfferRon) : `${formatRon(n.lowestOfferRon)} – ${formatRon(n.highestOfferRon)}`) : null;
  const sources: Source[] = [
    { href: awardUrl(n.caNoticeId), label: `Anunțul de atribuire${n.noticeNo ? ` ${n.noticeNo}` : ""} în SEAP`, external: true },
    ...(ted ? [{ href: tedNoticeUrl(ted)!, label: `Publicarea în TED ${ted}`, external: true }] : []),
  ];

  return (
    <RecordPage className="notice-record">
      <RecordHead
        title={headline}
        parties={n.authority ? <><EntityName id={n.authority.entityId} role="authority">{cleanName(n.authority.name)}</EntityName>{countyLabel(n.authority.county) && <span className="record-quiet"> · {countyLabel(n.authority.county)}</span>} a atribuit {n.nLots === 1 ? "o înregistrare" : `${formatInt(n.nLots)} înregistrări`}</> : null}
        value={{
          amount: n.totalContractValue != null ? formatRon(n.totalContractValue) : "Nicio valoare identificată",
          label: <Term tip id="comenzi-identificate">Contracte și comenzi identificate</Term>,
          notes: [
            n.frameworkValue != null && <>Plafoane de acord-cadru publicate: {formatRonFull(n.frameworkValue)}, separate de totaluri.</>,
            n.versions.length > 1 && "Republicările aceluiași anunț nu se adună.",
          ],
        }}
        meta={[
          <span className="record-kind" key="k">Anunț de atribuire</span>,
          procedure && <span key="p">{procedure}</span>,
          n.noticeNo && <span key="n">{n.noticeNo}</span>,
          n.versionDate && <span key="v">Versiunea din {formatCalendarDate(n.versionDate)}</span>,
        ]}
        actions={<>
          <a className="record-seap" href={awardUrl(n.caNoticeId)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (anunțul de atribuire, filă nouă)</span></a>
          <ClipButton kind="notice" refId={String(caid)} label={n.noticeNo ?? String(caid)} />
        </>}
      />

      <RecordSection id="atribuire" title="Atribuirea">
        <Facts facts={[
          n.awardValueRon != null && n.awardValueRon > 0 && { label: <Term tip id="valoare-atribuita">Valoarea atribuită în anunț</Term>, value: formatRon(n.awardValueRon) },
          offers && { label: "Oferte, de la cea mai mică la cea mai mare", value: offers },
          procedure && { label: <Term tip id="contract-procedura">Procedura</Term>, value: procedure },
          (n.cpvName || n.cpvCode) && { label: "Domeniu CPV", value: <>{n.cpvName ?? "Denumire neprecizată"}{n.cpvCode && <small>{n.cpvCode}</small>}</> },
          { label: "Primul contract din anunț", value: n.firstContractDate ? formatCalendarDate(n.firstContractDate) : <span className="record-quiet">Fără dată plauzibilă</span> },
          n.versions.length > 1 && { label: <Term tip id="versiuni-anunt">Versiuni SEAP</Term>, wide: true, value: n.versions.map((v, i) => <span key={v.caNoticeId}>{i > 0 && ", "}{v.caNoticeId === n.caNoticeId
            ? <span aria-current="page">{formatCalendarDate(v.versionDate)} (aceasta)</span>
            : <Link href={`/anunturi/${v.caNoticeId}`}>{formatCalendarDate(v.versionDate)}</Link>}</span>) },
        ]} />
      </RecordSection>

      {/* The funnels and the pager keep the records in place, dimmed, while the next ones come (owner, 6 November 2026). */}
      <PendingRegion as="section" className="record-section notice-lots" label="Se încarcă înregistrările…">
        <h2 id="inregistrari" className="list-anchor">Înregistrările din acest anunț</h2>
        <UrlFilterBand table="loturi" scope={scope} />
        {(pages > 1 || n.nShown !== n.nLots) && (
          <p className="record-lead">
            {n.nShown !== n.nLots ? `${formatInt(n.nShown)} din ${formatInt(n.nLots)}` : formatInt(n.nLots)} înregistrări
            {pages > 1 ? ` · pagina ${n.page} din ${formatInt(pages)}` : ""} · ordonate după valoare
          </p>
        )}
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
            {n.lots.map((l) => (
              <tr key={l.natId}>
                <th scope="row" className="lot-object">
                  <Link href={`/contracte/${l.natId}`}>{cleanName(isGenericTitle(l.title) ? meaningfulLot(l.lotsCaption, null) ?? l.title : l.title) || (l.contractNo ? `Contractul nr. ${l.contractNo}` : "Contractul")}</Link>
                  <small>{[l.contractNo && `nr. ${l.contractNo}`, l.financialKind === "framework" && "plafon de acord-cadru", l.financialKind === "calloff" && "comandă subsecventă", l.financialKind === "amendment" && "act adițional, neadăugat", l.financialKind === "review" && "tip neclar, de verificat", l.temporarilyExcluded && "exclus temporar din totaluri"].filter(Boolean).join(" · ")}</small>
                </th>
                <td data-label="Câștigător">
                  {l.winners.length === 0 ? "—" : l.winners.map((w, i) => (
                    <span key={w.entityId}>{i > 0 && ", "}<EntityName id={w.entityId} role="supplier">{cleanName(w.name)}</EntityName></span>
                  ))}
                </td>
                <td data-label="Data">{l.contractDate ? formatCalendarDate(l.contractDate.slice(0, 10)) : "—"}{l.contractDate && l.contractDate < CONTRACT_DATE_FLOOR && <small> dată improbabilă</small>}</td>
                <td data-label="Valoare" className="lot-value">{formatRonFull(l.contractValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {n.lots.length === 0 && n.nShown !== n.nLots && <p className="record-missing">Nicio înregistrare cu filtrele alese.</p>}
        {pages > 1 && (
          <div className="pager">
            {n.page > 1 && <RegionLink href={pageHref(n.page - 1)} scroll>← Anterior</RegionLink>}
            <span className="note">Pagina {n.page} din {formatInt(pages)}</span>
            {n.page < pages && <RegionLink href={pageHref(n.page + 1)} scroll>Următor →</RegionLink>}
          </div>
        )}
      </PendingRegion>

      <Sources sources={sources}><p>Valori contractate, nu plăți.</p></Sources>
    </RecordPage>
  );
}
