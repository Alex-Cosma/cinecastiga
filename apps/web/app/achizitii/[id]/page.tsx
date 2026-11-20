import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcquisitionContext, getAcquisitionDetail } from "@/lib/acquisition-detail";
import { countWords } from "@/lib/ask/answer-text";
import { daUrl } from "@/lib/elicitatie";
import { formatExactDecimal, formatCalendarDate, formatInt, formatRon, cleanName, countyLabel } from "@/lib/format";
import { daState, durationLabel } from "@/lib/record-labels";
import { getAwardItemPrices, productHref, type ItemPrice } from "@/lib/unit-prices";
import { formatRatio, formatUnitPrice, ratioWords } from "@/lib/unit-prices-shared";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import InfoMark from "@/components/InfoMark";
import RecordTitle from "@/components/record/RecordTitle";
import ItemsMore from "@/components/record/ItemsMore";
import SeapDetails from "@/components/record/SeapDetails";
import { formatQuantity, itemsSum, lineTotal, productsTitle } from "@/lib/record-items";
import "@/components/record/record-pages.css";
import { Facts, MissingLine, PartyList, RecordHead, RecordPage, RecordSection, SignalList, Sources, pairHref, pairLines, type Party } from "@/components/record/Record";

export const dynamic = "force-dynamic";

/** One read per request: the tab title and the page share it. */
const acquisitionDetail = cache((id: string) => getAcquisitionDetail(id));

/** Its context (items, signals, pair) once per request too: the tab's title reads the products (Z7-17). */
const acquisitionContext = cache(async (id: string) => {
  const d = await acquisitionDetail(id);
  return d ? getAcquisitionContext(id, d) : null;
});

/**
 * The page's title: the acquisition's own, else its first products in the institution's words (UX audit Z7-17: "Ceapa,
 * morcovi, lamai și încă 31 de produse", not the CPV category "Ceapă"), else the CPV category, the code, the kind.
 */
const titleOf = (d: { title: string | null; cpvName: string | null; code: string | null }, items: readonly { name: string | null }[]) =>
  d.title ?? productsTitle(items.map((it) => it.name)) ?? d.cpvName ?? d.code ?? "Achiziție directă";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await acquisitionDetail(id);
  if (!d) return {};
  const x = await acquisitionContext(id);
  return { title: `${titleOf(d, x?.items ?? []).slice(0, 70)} · ${cleanName(d.authority) || "achiziție directă"}` };
}

/**
 * "La publicarea acestei achiziții, firma avea 6 zile de la înmatriculare." (owner, 13 November 2026): the firm's age
 * on this very award, under its first-month signal. Calendar days between two already normalized days; null when
 * either is missing or the award is dated before the registration.
 */
function firmAgeNote(registeredOn: unknown, awardDay: string | null): string | null {
  const day = (value: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === "string" ? value : ""); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
  const from = day(registeredOn), to = day(awardDay);
  if (from == null || to == null || to < from) return null;
  const days = Math.round((to - from) / 86_400_000);
  return days === 0 ? "Această achiziție a fost publicată chiar în ziua înmatriculării firmei."
    : `La publicarea acestei achiziții, firma avea ${countWords(days, "zi", "zile")} de la înmatriculare.`;
}

/** A direct acquisition (owner, 7 November 2026: the record template, its signals, what it bought, the pair). */
export default async function Acquisition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await acquisitionDetail(id);
  if (!d) notFound();
  // Each compared line's price against its product's median: for every reader since 20 November 2026 (owner).
  const [x, prices] = await Promise.all([acquisitionContext(id).then((c) => c!), getAwardItemPrices(id)]);
  const title = titleOf(d, x.items);
  const namedByProducts = !d.title && title !== d.cpvName && title !== d.code && title !== "Achiziție directă";
  const sums = itemsSum(x.items, d.value);
  const state = daState(d.state);
  // Only a refused or unaccepted offer is "not a purchase"; a state the source does not give stays a purchase in doubt.
  const purchase = state.kind !== "refused" && state.kind !== "unaccepted";
  const amount = (value: string | null) => value == null ? "Valoare neprecizată" : `${formatExactDecimal(value)} lei`;
  const authority = d.authorityId ? <EntityName id={d.authorityId} role="authority">{cleanName(d.authority)}</EntityName> : <span>{d.authority ?? "Instituție neprecizată"}</span>;
  const supplier = d.supplierId ? <EntityName id={d.supplierId} role="supplier">{cleanName(d.supplier)}</EntityName> : <span>{d.supplier ?? "furnizor neprecizat"}</span>;
  const sameParty = x.supplierIsAuthority || (!!d.supplierId && d.supplierId === d.authorityId);
  const closing = d.value == null ? null : Number(d.value);
  const duration = durationLabel(d.publishedAt, d.finalizedAt);
  // A missing title is said once, in the identity line, when the page names it after its products or its category.
  const missing = [!d.title && !namedByProducts && !d.cpvName && "titlu", !d.cpvName && !d.cpvCode && "categorie CPV", !d.publishedAt && "data publicării", !d.finalizedAt && "data finalizării", d.estimate == null && "valoare estimată"].filter((f): f is string => !!f);

  // Why it stays out of the totals opens from a mark (owner, 17 November 2026: less small print); the fact stays.
  const outWhy = closing != null && closing > 2_000_000 ? "Peste 2 milioane lei, limita de plauzibilitate a site-ului." : closing != null && closing <= 0 ? "Valoare zero." : null;
  const notes = [
    !purchase || x.counted || sameParty ? null : outWhy ? <>Nu intră în totaluri <InfoMark title="Motivul" text={outWhy} /></> : "Nu intră în totaluri.",
    x.valueSuspect === true && purchase && "Valoare neplauzibilă față de estimare: o verificăm separat.",
    // The method page is Complet only (owner, 18 November 2026): its link goes, the note stays.
    sameParty && (purchase ? <>Furnizorul înregistrat este chiar instituția: neconcordanță în sursă. Rămâne în totalul instituției, nu la furnizori. <Link href="/metodologie#totaluri" data-only="complet">Cum se formează totalurile</Link></> : "Ofertantul înregistrat este chiar instituția: neconcordanță în sursă."),
  ];
  const h = x.pairHistory, s = x.slicing;
  // The same order as on a contract (Z7-12): the history with the institution, then its share of the firm, its size.
  const supplierLines = [
    h && d.authorityId && d.supplierId && (h.nDa > 0 || h.nCt > 0) && <a href={pairHref({ id: d.authorityId, name: cleanName(d.authority) }, { id: d.supplierId, name: cleanName(d.supplier) })}>
      {(h.nDa > 0 ? h.nDa : h.nCt) === 1 ? "Încă" : "Alte"} {[h.nDa > 0 && (h.nDa === 1 ? "o achiziție directă" : countWords(h.nDa, "achiziție directă", "achiziții directe")), h.nCt > 0 && (h.nCt === 1 ? "un contract" : countWords(h.nCt, "contract", "contracte"))].filter(Boolean).join(" și ")} cu instituția · {formatRon(h.totalRon)}</a>,
    ...pairLines(x.pair),
    s && <span className="warn">În aceeași fereastră de 60 de zile{s.cpvName ? `, ${s.cpvName.toLowerCase()}` : ", aceeași categorie"}: {countWords(s.n, "achiziție", "achiziții")} · {formatExactDecimal(s.sumRon)} lei{s.ceilingRon ? ` față de plafonul de ${formatExactDecimal(s.ceilingRon)} lei` : ""}{s.from && s.to ? ` (${formatCalendarDate(s.from)} – ${formatCalendarDate(s.to)})` : ""}</span>,
  ];
  const parties: Party[] = [
    { key: "s", role: purchase ? "Furnizorul" : "Ofertantul", name: supplier, lines: supplierLines },
  ];

  return <RecordPage className="record-entry acquisition-detail">
    <RecordHead
      title={title}
      heading={<RecordTitle>{title}</RecordTitle>}
      status={!purchase ? <>{state.label} · nu e o achiziție, nu intră în totaluri <Term tip id="oferta-refuzata" /></> : null}
      parties={<>{authority} {purchase ? "a cumpărat direct de la" : "· ofertă de la"} {supplier}</>}
      value={{ amount: d.value == null ? <span className="record-amount-words is-quiet">Valoare neprecizată</span> : amount(d.value),
        // "nu e plată" once on the page, beside the figure (UX audit Z7-08, Z7-09).
        label: purchase ? <>Valoare de închidere{d.value != null && <> <span className="record-not-paid">· nu e plată</span></>} <Term tip id="valoare-inregistrata" /></> : "Valoarea ofertei", notes }}
      meta={[<span className="record-kind" key="k">Achiziție directă</span>,
        namedByProducts ? <span key="t">fără titlu în SEAP <Term tip title="Fără titlu în SEAP" text="Titlul lipsește în SEAP; numim achiziția după primele ei produse, cu cuvintele instituției. Categoria CPV e în Datele achiziției." /></span>
          : !d.title && d.cpvName && <span key="t">titlu din categoria CPV <Term tip id="titlu-cpv" /></span>,
        // An accepted offer is the default state (a refused one has its own row); the code is in Sources (Z7-07, Z7-29).
        d.finalizedAt ? `Finalizată ${formatCalendarDate(d.finalizedAt)}` : d.publishedAt ? `Publicată ${formatCalendarDate(d.publishedAt)}` : null,
        purchase && state.kind !== "accepted" ? state.label : null]}
      actions={<>
        <a className="record-seap" href={daUrl(id)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>
        <ClipButton kind="da" refId={id} label={title} />
      </>}
    />
    <SignalList flags={x.flags} authorityId={d.authorityId} supplierId={d.supplierId} modeMarks
      note={(f) => f.code === "da_first_month" ? firmAgeNote(f.evidence?.registered_on, d.publishedAt ?? d.finalizedAt) : null} />
    {/* Complet only (owner, 18 November 2026): the head has the date. Without any date the section keeps its one line
        „Lipsesc din sursă: …”, the only place that says the date is missing. */}
    <RecordSection id="date" title="Datele achiziției" only={d.publishedAt || d.finalizedAt ? "complet" : undefined}>
      <Facts facts={[
        d.estimate != null && { label: "Valoare estimată", value: amount(d.estimate), only: "complet" },
        (d.publishedAt || d.finalizedAt) && { label: "Publicată → finalizată (ora României)", value: <>{d.publishedAt ? formatCalendarDate(d.publishedAt, true) : "—"} → {d.finalizedAt ? formatCalendarDate(d.finalizedAt, true) : "—"}{duration && <small>în {duration}</small>}</>, only: "complet" },
        (d.cpvName || d.cpvCode) && { label: "Domeniu CPV", value: d.cpvName ?? <span className="record-quiet">Denumire neprecizată</span>, only: "complet" },
        d.acquisitionType && { label: "Tipul achiziției", value: d.acquisitionType, only: "complet" },
      ]} />
      <MissingLine fields={missing} />
      {/* The codes, for citing and checking (Z7-29). */}
      <SeapDetails only="complet" facts={[
        d.code && { label: "Cod SEAP", value: d.code },
        { label: "ID SEAP", value: id },
        d.cpvCode && { label: "Cod CPV", value: d.cpvCode },
      ]} />
    </RecordSection>
    {/* How the lines are written opens from a mark beside the heading (owner, 17 November 2026: less small print). */}
    {x.items.length > 0 && <RecordSection id="produse" title={<>Ce s-a cumpărat <InfoMark title="Liniile" text="Așa cum le-a scris instituția în SEAP; unitățile nu sunt standardizate." /></>}>
      {/* Each line's total and their sum, as the institution wrote them (UX audit Z7-16); on a phone one short row per
          product and the first ten, then the rest on demand. */}
      <ItemsMore count={x.items.length}>
      <table className="record-items">
        <thead><tr><th scope="col">Produs sau serviciu</th><th scope="col" className="record-num">Cantitate</th><th scope="col">Unitate</th><th scope="col" className="record-num" data-only="complet">Preț unitar</th><th scope="col" className="record-num">Total</th></tr></thead>
        <tbody>{x.items.map((it, i) => { const total = lineTotal(it.quantity, it.unitPriceRon); return <tr key={i} className={i >= 10 ? "record-item-later" : undefined}>
          <td>{it.name ?? "Denumire neprecizată"}{(() => {
            // The line's price per kilogram, litre or piece beside its product's median that year (unit prices, owner 11 November 2026).
            const p = prices[it.itemId];
            if (!p) return null;
            const ratio = p.median ? p.pricePerUnit / p.median : null;
            // Marked only for the mart's lead (p.lead), never from the multiple alone.
            // Price context: Complet only (owner, 18 November 2026).
            return <span className={`record-unit-price${p.lead ? " is-lead" : ""}`} data-only="complet">
              {formatUnitPrice(p.pricePerUnit)} {p.per}
              {p.median != null && <> · mediana {p.year}: {formatUnitPrice(p.median)}{ratio != null && ratio >= 1.25 && <b> · {p.lead ? ratioWords(ratio) : formatRatio(ratio)}</b>}</>}
              {" · "}<Link href={d.authorityId
                // The way back opens this institution's row among the product's buyers (every buyer when it is not a lead).
                ? `${productHref(p.family, p.pack, p.year, { ...(p.lead ? {} : { toate: "1" }), deschis: `${d.authorityId}-${p.year}` })}#institutie-${d.authorityId}-${p.year}`
                : productHref(p.family, p.pack, p.year)} prefetch={false}>{p.packLabel ? `${p.name}, ${p.packLabel}` : p.name}</Link>
            </span>;
          })()}</td>
          <td className="record-num" data-label="Cantitate:">{formatQuantity(it.quantity)}</td>
          <td data-label="Unitate:">{it.unit ?? "—"}</td>
          <td className="record-num" data-label="Preț unitar:" data-only="complet">{it.unitPriceRon != null ? `${formatExactDecimal(it.unitPriceRon)} lei` : "—"}</td>
          <td className="record-num" data-label="Total:">{total != null ? `${formatExactDecimal(total)} lei` : "—"}</td>
          <td className="record-item-line">{formatQuantity(it.quantity)} {it.unit ?? ""} × {it.unitPriceRon != null ? `${formatExactDecimal(it.unitPriceRon)} lei` : "preț nepublicat"}{total != null && <> = <b>{formatExactDecimal(total)} lei</b></>}</td>
        </tr>; })}</tbody>
        {/* The sum's label spans the columns before Total: four in Complet, three in Esențial (no unit price). */}
        {sums.counted > 0 && <tfoot><tr>{([[4, "complet"], [3, "esential"]] as const).map(([span, only]) => <td key={only} colSpan={span} data-only={only}>{sums.counted === sums.lines ? `Suma celor ${countWords(sums.lines, "linie", "linii")}` : `Suma celor ${countWords(sums.counted, "linie", "linii")} cu preț, din ${sums.lines}`}</td>)}<td className="record-num">{formatExactDecimal(sums.sum)} lei</td></tr></tfoot>}
      </table>
      {/* A sum equal to the closing value is seen in the sum row and the head's figure; a difference is said. */}
      {sums.note && sums.note !== "Egală cu valoarea de închidere." && <p className="record-items-note">{sums.note}</p>}
      </ItemsMore>
    </RecordSection>}
    <RecordSection id="parti" title={purchase ? "Instituție și furnizor" : "Instituție și ofertant"} only="complet">
      <PartyList institution={{ name: authority, place: countyLabel(x.authorityCounty) }} parties={parties} />
    </RecordSection>
    {/* The same link as the head's „Verifică în SEAP”: Complet only (owner, 18 November 2026). */}
    <Sources sources={[{ href: daUrl(id), label: `Achiziția directă ${d.code ?? id} în SEAP`, external: true }]} only="complet" />
  </RecordPage>;
}
