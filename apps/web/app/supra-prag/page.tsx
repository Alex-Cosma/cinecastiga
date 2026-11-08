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
    {details?.amounts.length ? <details className="tp-src">
      <summary>Valorile și referințele din sursă</summary>
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
          <div>Câmp TED: {v.source}</div>
        </div>;
      })}
      <p className="county">Valorile ofertelor, intervalele și plafoanele sunt păstrate separat. Nu reprezintă plăți verificate.</p>
    </details> : null}
    {details?.missingTenderIds.length ? <div className="county tp-amount-kind">Referințe de ofertă nerezolvate: {details.missingTenderIds.join(", ")}</div> : null}
  </>;
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

  return (
    <>
      <h1 className="page-title">Atribuiri publicate în TED</h1>
      <p className="page-sub ted-tip-line">
        Anunțuri de atribuire din Jurnalul Oficial al UE. Valorile TED <strong>nu se adaugă</strong> totalurilor <span className="tp-nowrap">SEAP.<Term tip title={TED_TERM.title} text={TED_TERM.text} /></span>
      </p>
      <p className="hint ted-tip-line">
        {coverageNote.line}{coverageNote.tip && <Term tip title="Acoperire TED" text={coverageNote.tip} />}{" · "}
        <Link href="/metodologie#acoperire">Acoperire →</Link>
      </p>

      <section className="section">
        <div className="stat-row ted-stats">
          <div className="stat">
            <div className="n">{formatInt(stats.total)}</div>
            <div className="l">rezultate de loturi TED <Term id="rezultat-lot-ted" tip /></div>
          </div>
          <div className="stat">
            <div className="n">{formatInt(stats.tedOnly)}</div>
            <div className="l">{TED_LABEL["ted-only"]!.title}</div>
          </div>
          <div className="stat">
            <div className="n">{stats.foreign == null ? "—" : formatInt(stats.foreign)}</div>
            <div className="l">marcate cu un câștigător străin</div>
          </div>
          <div className="stat">
            <div className="n">{formatInt(stats.singleBidder)}</div>
            <div className="l">cu o singură ofertă primită</div>
          </div>
        </div>
        <p className="hint">
          {stats.notices != null ? `${formatInt(stats.notices)} anunțuri · ` : ""}
          {stats.unknownCompetition != null ? `${formatInt(stats.unknownCompetition)} rezultate fără număr de oferte` : "rezultatele fără număr de oferte: statistică în curs de actualizare"}
        </p>
        {stats.foreignCountryUnresolved > 0 ? <p className="note">
          În {formatInt(stats.foreignCountryUnresolved)} rezultate, marcajul „străin” nu este confirmat de țara
          câștigătorilor din datele preluate. {" "}
          <Link href={`/supra-prag?tara=${TED_COUNTRY_UNRESOLVED}`}>Vezi înregistrările de verificat</Link>.
        </p> : null}
        {stats.legacyAmounts == null || stats.legacyAmounts > 0 ? <p className="note">
          {stats.legacyAmounts != null ? `${formatInt(stats.legacyAmounts)} rezultate așteaptă verificarea tipului valorii. ` : "Clasificarea valorilor este în curs de actualizare. "}
          Aceste sume sunt marcate separat și nu intră în comparația valorilor RON.
        </p> : null}
      </section>

      {/* The country chips, the funnels, the sort and the pager change the list: it stays in place, dimmed, while the
          next one comes (owner, 6 November 2026); the pager still opens the next page at the start of the list. */}
      <PendingRegion label="Se încarcă atribuirile…">
      {stats.byCountry.length > 0 ? (
        <section className="section">
          <h2 className="ted-tip-line">Firme străine câștigătoare, după țară <Term id="ted-tari" tip /></h2>
          <div className="filters" style={{ flexWrap: "wrap" }}>
            {stats.byCountry.slice(0, 12).map((c) => (
              <RegionLink key={c.country} scroll={false} href={qstr({ tara: countries.includes(c.country) ? undefined : c.country, extern: undefined })}
                className={countries.includes(c.country) ? "on" : ""}>
                {countryName(c.country)} · {formatInt(c.n)} rezultate
              </RegionLink>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>Explorează atribuirile</h2>
        <UrlFilterBand table="ted" />
        <p className="hint">{formatInt(awards.total)} rezultate · {sort === "value" ? "după valoare, doar sumele în lei" : "cele mai noi întâi"}</p>
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
            {awards.rows.map((a) => (
              <tr key={a.tedLotResultId}>
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
            ))}
          </tbody>
        </table>
        </div>

        {awards.rows.length === 0 ? <p className="note">Niciun rezultat cu filtrele alese. <RegionLink href="/supra-prag" scroll>Vezi toate rezultatele TED</RegionLink>.</p> : null}

        {totalPages > 1 ? (
          <div className="pager">
            {page > 1 ? <RegionLink href={pageUrl(page - 1)} scroll>← anterioarele</RegionLink> : <span className="off">← anterioarele</span>}
            <span className="pager-pos">
              pagina {formatInt(page)} / {formatInt(totalPages)} · {formatInt(awards.total)} rezultate
            </span>
            {page < totalPages ? <RegionLink href={pageUrl(page + 1)} scroll>următoarele →</RegionLink> : <span className="off">următoarele →</span>}
          </div>
        ) : null}

        <p className="note ted-tip-line ted-tip-up">
          Potrivirile posibile sunt marcate separat de cele confirmate <Term id="potrivire-ted" tip /> · <Link href="/metodologie">Metodologia →</Link>
        </p>
      </section>
      </PendingRegion>
    </>
  );
}
