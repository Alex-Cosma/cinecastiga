import { Fragment } from "react";
import Link from "next/link";
import EntityName from "@/components/EntityName";
import type { Metadata } from "next";
import { getTedStats, type TedAward } from "@/lib/marts";
import { getTedAwards } from "@/lib/ted-awards";
import { TED_COLUMNS } from "@/lib/ted-columns";
import { readFilters } from "@/lib/table-filters/codec";
import { UrlFilterBand, UrlFunnel } from "@/components/table-filters/UrlFilters";
import { PendingRegion, RegionLink } from "@/components/ghost/client";
import { ghostHold } from "@/lib/ghost-hold";
import { countryName, procedureName, TED_LABEL, TED_AMOUNT_LABEL, formatTedAmount, competitionLabel, tedAmountHeadline, tedCountryNeedsReview, tedCoverageNote, TED_COUNTRY_UNRESOLVED, TED_COUNTRY_REVIEW_LABEL } from "@/lib/ted";
import { getCoverage } from "@/lib/coverage";
import { formatInt, cleanName } from "@/lib/format";
import Term from "@/components/Term";
import { GLOSSARY } from "@/lib/glossary";
import { FOREIGN } from "@/lib/ted-columns";
import OpenFunnel from "./OpenFunnel";
import DiscoverNav from "@/components/discover/DiscoverNav";
import DiscoverPager from "@/components/discover/DiscoverPager";
import "./supra-prag.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Atribuiri publicate în TED",
  description: "Anunțuri de atribuire din Jurnalul Oficial al UE, cu sursele europene și potrivirile identificate în SEAP.",
};

/** A winner's name as TED's tender and award parts both spell it: no diacritics, case, punctuation or SC/SRL/SA. */
const winnerKey = (name: string) => cleanName(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SC(?=[A-Z0-9])/, "").replace(/(SRL|SA)$/, "");

/** What TED and "supra-prag" mean, said once beside the page's first mention of the EU journal. */
const TED_TERM = {
  title: "TED, peste prag",
  text: "TED este jurnalul oficial al UE pentru achiziții publice. Acolo apar procedurile peste pragurile europene („supra-prag”). De regulă ele sunt și în SEAP, de aceea valorile TED nu se adună la totaluri.",
};

const TED_NOTICE_URL = (pub: string | null) =>
  pub ? `https://ted.europa.eu/en/notice/${pub}/html` : null;

/** The winners, each a link to its page, a consortium's members apart (" · "), never glued into one name. */
function winnerCell(a: TedAward) {
  if (a.winnerSelectionStatus === "not-awarded" || a.winnerSelectionStatus === "clos-nw") return <span>Fără câștigător desemnat</span>;
  if (!a.winnerNames.length) return <span>Câștigător neidentificat în datele preluate</span>;
  return a.winnerNames.map((name, i) => {
    const id = a.winnerEntityIds[i];
    const country = a.amountKind ? a.winnerCountries[i] : null;
    const foreignTag =
      country && country !== "RO" ? (
        <span className="flag-tag">{countryName(country)}</span>
      ) : null;
    return (
      <span key={`${id}-${i}`} className="tp-winner">
        {i > 0 && <span className="tp-sep" aria-hidden="true"> · </span>}
        <EntityName id={id} role="supplier">{cleanName(name)}</EntityName>
        {foreignTag}
      </span>
    );
  });
}

function amountCell(a: TedAward) {
  const kind = a.amountKind ?? "legacy_unknown";
  const details = a.amountDetails;
  const label = TED_AMOUNT_LABEL[kind] ?? TED_AMOUNT_LABEL.legacy_unknown;
  const main = tedAmountHeadline(a);
  return <>
    <div className="tp-amount">{main}</div>
    <div className="county tp-amount-kind">{label}</div>
    {details?.missingTenderIds.length ? <div className="county tp-amount-kind">Referințe de ofertă nerezolvate: {details.missingTenderIds.join(", ")}</div> : null}
  </>;
}

/**
 * The amounts and references behind a value, on a row of their own across the table (a friend's remark, 13 November
 * 2026: opened in the value column, they left the rest of the row empty), each amount a card side by side.
 */
function sourceValues(a: TedAward) {
  const details = a.amountDetails;
  if (!details?.amounts.length) return null;
  return <details className="tp-src">
      <summary>Valorile și referințele din sursă</summary>
      <div className="tp-src-grid">
      {details.amounts.map((v, i) => {
        const tender = details.tenders.find((t) => t.id === v.tenderId);
        return <div key={`${v.tenderId ?? v.resultId}-${v.kind}-${i}`} className="county tp-src-row">
          <strong>{TED_AMOUNT_LABEL[v.kind] ?? v.kind}: {formatTedAmount(v.value, v.currency)}</strong>
          {v.tenderId ? <div>{v.tenderId}{tender?.winnerNames?.length ? <> · {tender.winnerNames.map((name, j) => {
            const at = a.winnerNames.findIndex((winner) => winnerKey(winner) === winnerKey(name));
            return <span key={`${name}-${j}`}>{j > 0 && ", "}<EntityName id={at >= 0 ? a.winnerEntityIds[at] : null} role="supplier">{cleanName(name)}</EntityName></span>;
          })}</> : null}</div> : null}
          {v.resultId ? <div>{v.resultId}</div> : null}
          {tender?.sharedAcrossLots ? <div>Aceeași ofertă este referită de mai multe loturi; nu o însumăm.</div> : null}
          <div className="tp-src-field">Câmp TED: {v.source}</div>
        </div>;
      })}
      </div>
      <p className="county">Valorile ofertelor, intervalele și plafoanele sunt păstrate separat. Nu reprezintă plăți verificate.</p>
    </details>;
}

export default async function SupraPragPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await ghostHold();
  const sp = await searchParams;
  // The table's filters are its column funnels (owner, 4 November 2026; lib/ted-columns.ts), the old links' parameters read too.
  const filters = readFilters(TED_COLUMNS, (key) => sp[key]);
  const countries = filters["tara"]?.kind === "options" ? filters["tara"].values : [];
  const sort = sp["sort"] === "value" ? "value" : "date";
  const requestedPage = Number(sp["p"] ?? "1");
  // Ten results a page (owner, 8 November 2026: a shorter list, the pager below it).
  const PAGE_SIZE = 10;

  const [stats, coverage, awards] = await Promise.all([
    getTedStats(),
    getCoverage(),
    getTedAwards({ filters, sort, page: requestedPage, pageSize: PAGE_SIZE }),
  ]);
  const page = awards.page;
  const coverageNote = tedCoverageNote(coverage);
  const totalPages = Math.max(1, Math.ceil(awards.total / PAGE_SIZE));

  // A sort or a country link keeps the address's filters and drops the page; pagination links keep both.
  const qstr = (patch: Record<string, string | undefined>) => {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, p: undefined, ...patch })) if (v) qp.set(k, v);
    const s = qp.toString();
    return s ? `/supra-prag?${s}` : "/supra-prag";
  };
  // The pager sits below the table: the next page opens at the start of the list.
  const pageUrl = (n: number) => `${qstr({ p: n > 1 ? String(n) : undefined })}#atribuiri-lista`;
  // Three figures are the table's own filters (UX audit Z6-10): a click applies it (or takes it off) and opens the list.
  const has = (key: string, value: string) => filters[key]?.kind === "options" && filters[key].values.includes(value);
  const toggle = (key: string, value: string) => `${qstr({ [key]: has(key, value) ? undefined : value, ...(key === "tara" ? { extern: undefined } : key === "oferte" ? { unic: undefined } : { "etichetă": undefined }) })}#atribuiri-lista`;
  const statLinks = [
    { key: "potrivire", n: stats.tedOnly, label: TED_LABEL["ted-only"]!.title, on: has("potrivire", "ted-only"), href: toggle("potrivire", "ted-only") },
    { key: "tara", n: stats.foreign, label: "marcate cu un câștigător străin", on: has("tara", FOREIGN), href: toggle("tara", FOREIGN) },
    { key: "oferte", n: stats.singleBidder, label: "cu o singură ofertă primită", on: has("oferte", "unu"), href: toggle("oferte", "unu") },
  ];

  return (
    <>
      <DiscoverNav current="supra-prag" />
      <h1 className="page-title">Atribuiri publicate în TED</h1>
      <p className="page-sub ted-tip-line">
        Anunțuri de atribuire din Jurnalul Oficial al UE. Valorile TED <strong>nu se adaugă</strong> totalurilor <span className="tp-nowrap">SEAP.<Term tip title={TED_TERM.title} text={TED_TERM.text} /></span>
      </p>
      <p className="hint ted-tip-line">
        {coverageNote.line}{coverageNote.tip && <Term tip title="Acoperire TED" text={coverageNote.tip} />}{" · "}
        <Link href="/metodologie#acoperire">Acoperire →</Link>
      </p>

      {/* The table's filters behind three of the four figures are links to them (UX audit Z6-10); the counts behind the
          first one and the „străin” left to check are in its (?) and in the „Țara” funnel, so the table comes up. The
          figures, the chips, the funnels, the sort and the pager change the list: it stays in place, dimmed, while the
          next one comes (owner, 6 November 2026); the figures and the pager open the list at its start. */}
      <PendingRegion label="Se încarcă atribuirile…">
      <section className="section">
        <div className="stat-row ted-stats">
          <div className="stat">
            <div className="n">{formatInt(stats.total)}</div>
            <div className="l">rezultate de loturi TED <Term tip title={GLOSSARY["rezultat-lot-ted"].title} text={<>{GLOSSARY["rezultat-lot-ted"].text}{" "}
              {stats.notices != null ? `${formatInt(stats.notices)} anunțuri. ` : ""}{stats.unknownCompetition != null ? `${formatInt(stats.unknownCompetition)} rezultate fără număr de oferte.` : ""}</>} /></div>
          </div>
          {statLinks.map((f) => <div className="stat" key={f.key}>
            <RegionLink scroll className={`tp-stat-link${f.on ? " on" : ""}`} href={f.href} aria-current={f.on ? "true" : undefined}
              title={f.on ? "Scoate filtrul din tabel" : "Arată-le în tabel"}>
              <div className="n">{f.n == null ? "—" : formatInt(f.n)}</div>
              <div className="l">{f.label}</div>
            </RegionLink>
          </div>)}
        </div>
        {stats.legacyAmounts == null || stats.legacyAmounts > 0 ? <p className="note">
          {stats.legacyAmounts != null ? `${formatInt(stats.legacyAmounts)} rezultate așteaptă verificarea tipului valorii. ` : "Clasificarea valorilor este în curs de actualizare. "}
          Aceste sume sunt marcate separat și nu intră în comparația valorilor RON.
        </p> : null}
        {/* The country chips stay as the summary (4 November 2026), on one labelled row: the first six (three on a phone)
            and „Toate țările”, which opens the „Țara” funnel. */}
        {stats.byCountry.length > 0 ? (
          <div className="filters tp-countries">
            <span className="tp-countries-label ted-tip-line">Câștigători străini: <Term id="ted-tari" tip /></span>
            {stats.byCountry.slice(0, 6).map((c, i) => (
              <RegionLink key={c.country} scroll={false} href={qstr({ tara: countries.includes(c.country) ? undefined : c.country, extern: undefined })}
                className={`${countries.includes(c.country) ? "on" : ""}${i >= 3 ? " tp-wide-only" : ""}`}>
                {countryName(c.country)} · {formatInt(c.n)}
              </RegionLink>
            ))}
            <OpenFunnel label="Filtrează după țara câștigătorului">Toate țările</OpenFunnel>
          </div>
        ) : null}
      </section>

      <section className="section">
        <h2>Explorează atribuirile</h2>
        <UrlFilterBand table="ted" />
        <p className="hint">{formatInt(awards.total)} rezultate · {sort === "value" ? "după valoarea în lei; la final, cele fără o valoare de contract în lei" : "cele mai noi întâi"}</p>
        {countries.includes(TED_COUNTRY_UNRESOLVED) ? <p className="hint">
          Sunt afișate rezultatele marcate „străin” pentru care țările câștigătorilor sunt România sau nu sunt
          precizate. Verifică sursa TED; identitatea și țara nu au fost corectate automat.
        </p> : null}
        {/* On a phone each result is a card (rank-stack) and the header's funnels wrap above the cards as a filter bar. */}
        <div className="ask-tablewrap rank-stack tp-stack">
        <table className="rank list-anchor" id="atribuiri-lista">
          <thead>
            <tr>
              {/* Each part of a header has its funnel (owner, 4 November 2026). */}
              <th><span className="th-filter"><UrlFunnel table="ted" column="autoritate" label="Autoritate" /><span className="th-sep" aria-hidden="true">→</span><UrlFunnel table="ted" column="castigator" label="Câștigător" /><span className="th-sep" aria-hidden="true">·</span><UrlFunnel table="ted" column="tara" label="Țara" /></span></th>
              <th><span className="th-filter"><UrlFunnel table="ted" column="cpv" label="Obiect" /><span className="th-sep" aria-hidden="true">·</span><UrlFunnel table="ted" column="potrivire" label="SEAP" /><Term id="ted-fara-potrivire" tip className="ted-tip-above" /><span className="th-sep" aria-hidden="true">·</span><UrlFunnel table="ted" column="oferte" label="Oferte" /></span></th>
              <th><UrlFunnel table="ted" column="procedura" label="Procedură" /></th>
              <th className="num">
                <span className="th-filter">
                  <RegionLink scroll={false} href={qstr({ sort: sort === "value" ? undefined : "value" })} title={sort === "value" ? "Înapoi la cele mai noi" : "Ordonează după valoarea în lei"}>
                    Valoare{sort === "value" ? " ▾" : ""}
                  </RegionLink>
                  <UrlFunnel table="ted" column="valoare" align="end" /><Term id="ted-valori" tip />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {awards.rows.map((a, i) => { const source = sourceValues(a); const at = (page - 1) * PAGE_SIZE + i; return (
              <Fragment key={a.tedLotResultId}>
              {/* By value, the rows without a lei contract value come last, under one line (UX audit Z6-11). */}
              {awards.valued !== undefined && at >= awards.valued && (at === awards.valued || i === 0) ? <tr className="tp-sep-row"><td colSpan={4}>
                Fără o valoare de contract în lei · {formatInt(awards.total - awards.valued)}{at > awards.valued ? " (continuare)" : ""}
                <Term tip title="Fără o valoare de contract în lei" text="Sume în altă monedă, plafoane de acord-cadru sau rezultate fără sumă: nu se compară cu valorile în lei, așa că vin după ele, cele mai noi întâi." /></td></tr> : null}
              <tr className={source ? "tp-has-src" : undefined}>
                <td>
                  <EntityName id={a.buyerEntityId} role="authority">{cleanName(a.buyerName)}</EntityName>
                  <div className="arrow-to tp-winners">→ {winnerCell(a)}</div>
                  {a.buyerCounty ? <div className="county">{a.buyerCounty}</div> : null}
                  {tedCountryNeedsReview(a.isForeign, a.winnerCountries) ? <div className="county">{TED_COUNTRY_REVIEW_LABEL}</div> : null}
                </td>
                <td className="county" data-label="Obiect">
                  {a.title ? <div className="obj-title">{a.title}</div> : null}
                  {a.cpvName ?? a.cpvCode ?? "—"}
                  {a.lotId ? <div>Lot: {a.lotId}</div> : null}
                  <div className="badges">
                    <span className={`ted-label ${a.label === "ted-only" ? "only" : "seap"}`} title={TED_LABEL[a.label]?.hint}>
                      {TED_LABEL[a.label]?.title ?? a.label}
                    </span>
                    <span className={`badge ${a.tendersReceived === 1 ? "warn" : ""}`}>{competitionLabel(a.tendersReceived)}</span>
                    {a.euFunded ? <span className="badge">fonduri UE</span> : null}
                  </div>
                </td>
                <td className="county" data-label="Procedură">{procedureName(a.procedureType)}</td>
                <td className="num tp-value" data-label="Valoare">
                  {amountCell(a)}
                  {a.publicationNumber ? (
                    <div className="src">
                      <a href={TED_NOTICE_URL(a.publicationNumber)!} target="_blank" rel="noopener noreferrer">
                        TED {a.publicationNumber} <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  ) : null}
                </td>
              </tr>
              {source ? <tr className="tp-src-tr"><td colSpan={4}>{source}</td></tr> : null}
              </Fragment>
            ); })}
          </tbody>
        </table>
        </div>

        {awards.rows.length === 0 ? <p className="note">Niciun rezultat cu filtrele alese. <RegionLink href="/supra-prag" scroll>Vezi toate rezultatele TED</RegionLink>.</p> : null}

        {/* The pager of the „Descoperă” pages (UX audit Z6-14); the last page is read from the end, as quick as the first. */}
        {totalPages > 1 ? <DiscoverPager page={page - 1} pageSize={PAGE_SIZE} total={awards.total} unit={["rezultat", "rezultate"]} href={(p) => pageUrl(p + 1)} link={RegionLink} scroll bottom className="tp-pager" /> : null}

        <p className="note ted-tip-line ted-tip-up">
          Potrivirile posibile sunt marcate separat de cele confirmate <Term id="potrivire-ted" tip /> · <Link href="/metodologie">Metodologia →</Link>
        </p>
      </section>
      </PendingRegion>
    </>
  );
}
