import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcquisitionContext, getAcquisitionDetail } from "@/lib/acquisition-detail";
import { daUrl } from "@/lib/elicitatie";
import { formatExactDecimal, formatCalendarDate, formatInt, formatRon, cleanName, countyLabel } from "@/lib/format";
import { daState, durationLabel } from "@/lib/record-labels";
import { getAwardItemPrices, productHref } from "@/lib/unit-prices";
import { formatRatio, formatUnitPrice, ratioWords } from "@/lib/unit-prices-shared";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { Facts, MissingLine, PartyList, RecordHead, RecordPage, RecordSection, SignalList, Sources, pairHref, pairLines, type Party } from "@/components/record/Record";

export const dynamic = "force-dynamic";

/** One read per request: the tab title and the page share it. */
const acquisitionDetail = cache((id: string) => getAcquisitionDetail(id));

const titleOf = (d: { title: string | null; cpvName: string | null; code: string | null }) => d.title ?? d.cpvName ?? d.code ?? "Achiziție directă";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await acquisitionDetail((await params).id);
  return d ? { title: `${titleOf(d).slice(0, 70)} · ${cleanName(d.authority) || "achiziție directă"}` } : {};
}

/** A direct acquisition (owner, 7 November 2026: the record template, its signals, what it bought, the pair). */
export default async function Acquisition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await acquisitionDetail(id);
  if (!d) notFound();
  const [x, prices] = await Promise.all([getAcquisitionContext(id, d), getAwardItemPrices(id)]);
  const title = titleOf(d);
  const state = daState(d.state);
  // Only a refused or unaccepted offer is "not a purchase"; a state the source does not give stays a purchase in doubt.
  const purchase = state.kind !== "refused" && state.kind !== "unaccepted";
  const amount = (value: string | null) => value == null ? "Valoare neprecizată" : `${formatExactDecimal(value)} lei`;
  const authority = d.authorityId ? <EntityName id={d.authorityId} role="authority">{cleanName(d.authority)}</EntityName> : <span>{d.authority ?? "Instituție neprecizată"}</span>;
  const supplier = d.supplierId ? <EntityName id={d.supplierId} role="supplier">{cleanName(d.supplier)}</EntityName> : <span>{d.supplier ?? "furnizor neprecizat"}</span>;
  const sameParty = x.supplierIsAuthority || (!!d.supplierId && d.supplierId === d.authorityId);
  const closing = d.value == null ? null : Number(d.value);
  const duration = durationLabel(d.publishedAt, d.finalizedAt);
  const missing = [!d.title && "titlu", !d.cpvName && !d.cpvCode && "categorie CPV", !d.publishedAt && "data publicării", !d.finalizedAt && "data finalizării", d.estimate == null && "valoare estimată"].filter((f): f is string => !!f);

  const notes = [
    !purchase || x.counted || sameParty ? null : closing != null && closing > 2_000_000 ? "Nu intră în totaluri: peste 2 milioane lei, limita de plauzibilitate a site-ului." : closing != null && closing <= 0 ? "Nu intră în totaluri: valoare zero." : "Nu intră în totaluri.",
    x.valueSuspect === true && purchase && "Valoare neplauzibilă față de estimare: o verificăm separat.",
    sameParty && (purchase ? <>Furnizorul înregistrat este chiar instituția: neconcordanță în sursă. Rămâne în totalul instituției, nu la furnizori. <Link href="/metodologie#totaluri">Cum se formează totalurile</Link></> : "Ofertantul înregistrat este chiar instituția: neconcordanță în sursă."),
  ];
  const h = x.pairHistory, s = x.slicing;
  const supplierLines = [
    ...pairLines(x.pair),
    h && d.authorityId && d.supplierId && (h.nDa > 0 || h.nCt > 0) && <a href={pairHref({ id: d.authorityId, name: cleanName(d.authority) }, { id: d.supplierId, name: cleanName(d.supplier) })}>
      Alte {[h.nDa > 0 && `${formatInt(h.nDa)} ${h.nDa === 1 ? "achiziție directă" : "achiziții directe"}`, h.nCt > 0 && `${formatInt(h.nCt)} ${h.nCt === 1 ? "contract" : "contracte"}`].filter(Boolean).join(" și ")} cu instituția · {formatRon(h.totalRon)}</a>,
    s && <span className="warn">În aceeași fereastră de 60 de zile{s.cpvName ? `, ${s.cpvName.toLowerCase()}` : ", aceeași categorie"}: {formatInt(s.n)} achiziții · {formatExactDecimal(s.sumRon)} lei{s.ceilingRon ? ` față de plafonul de ${formatExactDecimal(s.ceilingRon)} lei` : ""}{s.from && s.to ? ` (${formatCalendarDate(s.from)} – ${formatCalendarDate(s.to)})` : ""}</span>,
  ];
  const parties: Party[] = [
    { key: "a", role: "Instituția", name: authority, lines: [countyLabel(x.authorityCounty)] },
    { key: "s", role: purchase ? "Furnizorul" : "Ofertantul", name: supplier, lines: supplierLines },
  ];

  return <RecordPage className="acquisition-detail">
    <RecordHead
      title={title}
      status={!purchase ? <>{state.label} · nu e o achiziție, nu intră în totaluri <Term tip id="oferta-refuzata" /></> : null}
      parties={<>{authority} {purchase ? "a cumpărat direct de la" : "· ofertă de la"} {supplier}</>}
      value={{ amount: amount(d.value), label: purchase ? <Term tip id="valoare-inregistrata">Valoare de închidere</Term> : "Valoarea ofertei", notes }}
      meta={[<span className="record-kind" key="k">Achiziție directă</span>,
        !d.title && d.cpvName && <span key="t">titlu din categoria CPV <Term tip id="titlu-cpv" /></span>,
        d.finalizedAt ? `Finalizată ${formatCalendarDate(d.finalizedAt)}` : d.publishedAt ? `Publicată ${formatCalendarDate(d.publishedAt)}` : null,
        purchase ? state.label : null, d.code ?? `ID SEAP ${id}`]}
      actions={<>
        <a className="record-seap" href={daUrl(id)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>
        <ClipButton kind="da" refId={id} label={title} />
      </>}
      signals={x.flags.length}
    />
    <SignalList flags={x.flags} authorityId={d.authorityId} />
    <RecordSection id="date" title="Datele achiziției">
      <Facts facts={[
        d.estimate != null && { label: "Valoare estimată", value: amount(d.estimate) },
        (d.publishedAt || d.finalizedAt) && { label: "Publicată → finalizată (ora României)", value: <>{d.publishedAt ? formatCalendarDate(d.publishedAt, true) : "—"} → {d.finalizedAt ? formatCalendarDate(d.finalizedAt, true) : "—"}{duration && <small>în {duration}</small>}</> },
        (d.cpvName || d.cpvCode) && { label: "Domeniu CPV", value: <>{d.cpvName ?? "Denumire neprecizată"}{d.cpvCode && <small>{d.cpvCode}</small>}</> },
        d.acquisitionType && { label: "Tipul achiziției", value: d.acquisitionType },
      ]} />
      <MissingLine fields={missing} />
    </RecordSection>
    {x.items.length > 0 && <RecordSection id="produse" title="Ce s-a cumpărat">
      <table className="record-items">
        <thead><tr><th scope="col">Produs sau serviciu</th><th scope="col" className="record-num">Cantitate</th><th scope="col">Unitate</th><th scope="col" className="record-num">Preț unitar</th></tr></thead>
        <tbody>{x.items.map((it, i) => <tr key={i}>
          <td>{it.name ?? "Denumire neprecizată"}{(() => {
            // The line's price per kilogram, litre or piece beside its product's median that year (unit prices, owner 11 November 2026).
            const p = prices[it.itemId];
            if (!p) return null;
            const ratio = p.median ? p.pricePerUnit / p.median : null;
            return <span className={`record-unit-price${ratio != null && ratio >= 2 ? " is-lead" : ""}`}>
              {formatUnitPrice(p.pricePerUnit)} {p.per}
              {p.median != null && <> · mediana {p.year}: {formatUnitPrice(p.median)}{ratio != null && ratio >= 1.25 && <b> · {ratio >= 2 ? ratioWords(ratio) : formatRatio(ratio)}</b>}</>}
              {" · "}<Link href={productHref(p.family, p.pack, p.year)} prefetch={false}>{p.packLabel ? `${p.name}, ${p.packLabel}` : p.name}</Link>
            </span>;
          })()}</td>
          <td className="record-num" data-label="Cantitate:">{it.quantity ?? "—"}</td>
          <td data-label="Unitate:">{it.unit ?? "—"}</td>
          <td className="record-num" data-label="Preț unitar:">{it.unitPriceRon != null ? `${formatExactDecimal(it.unitPriceRon)} lei` : "—"}</td>
        </tr>)}</tbody>
      </table>
      <p className="record-missing">Așa cum le-a scris instituția în SEAP; unitățile nu sunt standardizate.</p>
    </RecordSection>}
    <RecordSection id="parti" title={purchase ? "Instituție și furnizor" : "Instituție și ofertant"}>
      <PartyList parties={parties} />
    </RecordSection>
    <Sources sources={[{ href: daUrl(id), label: `Achiziția directă ${d.code ?? id} în SEAP`, external: true }]} />
  </RecordPage>;
}
