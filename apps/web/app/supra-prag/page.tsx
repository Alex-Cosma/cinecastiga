import Link from "next/link";
import type { Metadata } from "next";
import { getTedStats, getTedAwards, type TedAward } from "@/lib/marts";
import { countryName, procedureName, TED_LABEL, TED_AMOUNT_LABEL, formatTedAmount, competitionLabel, tedAmountHeadline, tedCountryNeedsReview, TED_COUNTRY_UNRESOLVED, TED_COUNTRY_REVIEW_LABEL } from "@/lib/ted";
import { formatInt, cleanName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Atribuiri publicate în TED",
  description: "Anunțuri de atribuire din Jurnalul Oficial al UE, cu sursele europene și potrivirile identificate în SEAP.",
};

const TED_NOTICE_URL = (pub: string | null) =>
  pub ? `https://ted.europa.eu/en/notice/${pub}/html` : null;

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
      <div key={`${id}-${i}`}>
        {id ? <Link href={`/entitati/${id}`}>{cleanName(name)}</Link> : cleanName(name)}
        {foreignTag}
      </div>
    );
  });
}

function amountCell(a: TedAward) {
  const kind = a.amountKind ?? "legacy_unknown";
  const details = a.amountDetails;
  const label = TED_AMOUNT_LABEL[kind] ?? TED_AMOUNT_LABEL.legacy_unknown;
  const main = tedAmountHeadline(a);
  return <>
    <div>{main}</div>
    <div className="county">{label}</div>
    {details?.amounts.length ? <details style={{ textAlign: "left", marginTop: "0.5rem", maxWidth: "24rem" }}>
      <summary>Valorile și referințele din sursă</summary>
      {details.amounts.map((v, i) => {
        const tender = details.tenders.find((t) => t.id === v.tenderId);
        return <div key={`${v.tenderId ?? v.resultId}-${v.kind}-${i}`} className="county" style={{ marginTop: "0.5rem", overflowWrap: "anywhere" }}>
          <strong>{TED_AMOUNT_LABEL[v.kind] ?? v.kind}: {formatTedAmount(v.value, v.currency)}</strong>
          {v.tenderId ? <div>{v.tenderId}{tender?.winnerNames?.length ? ` · ${tender.winnerNames.map(cleanName).join(", ")}` : ""}</div> : null}
          {v.resultId ? <div>{v.resultId}</div> : null}
          {tender?.sharedAcrossLots ? <div>Aceeași ofertă este referită de mai multe loturi; nu o însumăm.</div> : null}
          <div>Câmp TED: {v.source}</div>
        </div>;
      })}
      <p className="county">Valorile ofertelor, intervalele și plafoanele sunt păstrate separat. Nu reprezintă plăți verificate.</p>
    </details> : null}
    {details?.missingTenderIds.length ? <div className="county">Referințe de ofertă nerezolvate: {details.missingTenderIds.join(", ")}</div> : null}
  </>;
}

export default async function SupraPragPage({
  searchParams,
}: {
  searchParams: Promise<{ etichetă?: string; extern?: string; unic?: string; tara?: string; sort?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const label = sp["etichetă"] === "also-in-seap" || sp["etichetă"] === "ted-only" || sp["etichetă"] === "possible-match" ? sp["etichetă"] : undefined;
  const foreign = sp["extern"] === "1";
  const singleBidder = sp["unic"] === "1";
  const country = sp["tara"] || undefined;
  const sort = sp["sort"] === "value" ? "value" : "date";
  const requestedPage = Number(sp["p"] ?? "1");
  const PAGE_SIZE = 60;

  const [stats, awards] = await Promise.all([
    getTedStats(),
    getTedAwards({
      ...(label ? { label } : {}),
      foreign,
      singleBidder,
      ...(country ? { country } : {}),
      sort,
      page: requestedPage,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const page = awards.page;
  const totalPages = Math.max(1, Math.ceil(awards.total / PAGE_SIZE));

  // Filter links omit `p` (any filter change resets to page 1); pagination links
  // pass `p` explicitly to keep the current filters.
  const qstr = (patch: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      "etichetă": label,
      extern: foreign ? "1" : undefined,
      unic: singleBidder ? "1" : undefined,
      tara: country,
      sort: sort === "value" ? "value" : undefined,
      ...patch,
    };
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) qp.set(k, v);
    const s = qp.toString();
    return s ? `/supra-prag?${s}` : "/supra-prag";
  };
  const pageUrl = (n: number) => qstr({ p: n > 1 ? String(n) : undefined });

  return (
    <>
      <h1 className="page-title">Atribuiri publicate în TED</h1>
      <p className="page-sub">
        Anunțuri de atribuire din Jurnalul Oficial al UE. Consultă sursa europeană și potrivirile identificate
        în SEAP. Valorile TED <strong>nu se adaugă totalurilor SEAP</strong>.
      </p>

      <section className="section">
        <div className="stat-row">
          <div className="stat">
            <div className="n">{formatInt(stats.total)}</div>
            <div className="l">rezultate de loturi TED</div>
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
          {stats.notices != null ? `${formatInt(stats.notices)} anunțuri distincte. ` : ""}
          {stats.unknownCompetition != null ? `Numărul de oferte este necunoscut pentru ${formatInt(stats.unknownCompetition)} rezultate. ` : "Statistica privind datele de competiție lipsă este în curs de actualizare. "}
          Un anunț poate conține mai multe loturi; un lot poate reuni mai multe rezultate publicate.
        </p>
        {stats.foreignCountryUnresolved > 0 ? <p className="note">
          În {formatInt(stats.foreignCountryUnresolved)} rezultate, marcajul „străin” nu este confirmat de țara
          câștigătorilor din datele preluate. {" "}
          <Link href={`/supra-prag?extern=1&tara=${TED_COUNTRY_UNRESOLVED}`}>Vezi înregistrările de verificat</Link>.
        </p> : null}
        {stats.legacyAmounts == null || stats.legacyAmounts > 0 ? <p className="note">
          {stats.legacyAmounts != null ? `${formatInt(stats.legacyAmounts)} rezultate așteaptă verificarea tipului valorii. ` : "Clasificarea valorilor este în curs de actualizare. "}
          Aceste sume sunt marcate separat și nu intră în comparația valorilor RON.
        </p> : null}
      </section>

      {stats.byCountry.length > 0 ? (
        <section className="section">
          <h2>Firme străine câștigătoare, după țară</h2>
          <p className="hint">Număr de rezultate cu cel puțin un câștigător din țara indicată. Consorțiile multinaționale apar în fiecare țară relevantă; țările nu se însumează.</p>
          <div className="filters" style={{ flexWrap: "wrap" }}>
            {stats.byCountry.slice(0, 12).map((c) => (
              <Link key={c.country} href={qstr({ tara: country === c.country ? undefined : c.country, extern: "1" })}
                className={country === c.country ? "on" : ""}>
                {countryName(c.country)} · {formatInt(c.n)} rezultate
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2>Explorează atribuirile</h2>
        <p className="hint" id="ted-matching-note">
          <strong>{TED_LABEL["ted-only"]!.title}</strong> înseamnă că nu am identificat încă o înregistrare
          corespunzătoare în datele SEAP analizate. Atribuirea poate exista în SEAP chiar dacă potrivirea lipsește.
        </p>
        <div className="filters" style={{ flexWrap: "wrap" }} aria-describedby="ted-matching-note">
          <Link href={qstr({ "etichetă": undefined })} className={!label ? "on" : ""}>Toate</Link>
          <Link href={qstr({ "etichetă": "ted-only" })} className={label === "ted-only" ? "on" : ""}>
            {TED_LABEL["ted-only"]!.title}
          </Link>
          <Link href={qstr({ "etichetă": "also-in-seap" })} className={label === "also-in-seap" ? "on" : ""}>
            {TED_LABEL["also-in-seap"]!.title}
          </Link>
          <Link href={qstr({ "etichetă": "possible-match" })} className={label === "possible-match" ? "on" : ""}>
            {TED_LABEL["possible-match"]!.title}
          </Link>
          <Link href={qstr({ extern: foreign ? undefined : "1" })} className={foreign ? "on" : ""}>
            Marcate „străin”
          </Link>
          {stats.foreignCountryUnresolved > 0 || country === TED_COUNTRY_UNRESOLVED ? (
            <Link href={qstr({ tara: country === TED_COUNTRY_UNRESOLVED ? undefined : TED_COUNTRY_UNRESOLVED })}
              className={country === TED_COUNTRY_UNRESOLVED ? "on" : ""}>
              {TED_COUNTRY_REVIEW_LABEL}
            </Link>
          ) : null}
          <Link href={qstr({ unic: singleBidder ? undefined : "1" })} className={singleBidder ? "on" : ""}>
            Ofertant unic
          </Link>
          <span className="filler" />
          <Link href={qstr({ sort: undefined })} className={sort === "date" ? "on" : ""}>După dată</Link>
          <Link href={qstr({ sort: "value" })} className={sort === "value" ? "on" : ""}>Valori RON, descrescător</Link>
        </div>

        {country === TED_COUNTRY_UNRESOLVED ? <p className="hint">
          Sunt afișate rezultatele marcate „străin” pentru care țările câștigătorilor sunt România sau nu sunt
          precizate. Verifică sursa TED; identitatea și țara nu au fost corectate automat.
        </p> : null}
        <p className="hint">{sort === "value"
          ? "Comparația include numai valori de ofertă / rezultat și valori de contract publicate în RON. Exclude intervalele, ofertele multiple, plafoanele și tipurile încă neverificate."
          : "Valorile rămân în moneda și forma publicate: ofertă, interval sau plafon. Nu calculăm un total comun."}</p>
        <table className="rank">
          <thead>
            <tr>
              <th>Autoritate → Câștigător</th>
              <th>Obiect</th>
              <th>Procedură</th>
              <th style={{ textAlign: "right" }}>Valoare și sursă</th>
            </tr>
          </thead>
          <tbody>
            {awards.rows.map((a) => (
              <tr key={a.tedLotResultId}>
                <td>
                  {a.buyerEntityId ? (
                    <Link href={`/entitati/${a.buyerEntityId}`}>{cleanName(a.buyerName)}</Link>
                  ) : (
                    cleanName(a.buyerName)
                  )}
                  <div className="arrow-to">→ {winnerCell(a)}</div>
                  {a.buyerCounty ? <div className="county">{a.buyerCounty}</div> : null}
                  {tedCountryNeedsReview(a.isForeign, a.winnerCountries) ? <div className="county">{TED_COUNTRY_REVIEW_LABEL}</div> : null}
                </td>
                <td className="county">
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
                <td className="county">{procedureName(a.procedureType)}</td>
                <td className="num" style={{ whiteSpace: "normal" }}>
                  {amountCell(a)}
                  {a.publicationNumber ? (
                    <div className="src">
                      <a href={TED_NOTICE_URL(a.publicationNumber)!} target="_blank" rel="noreferrer">
                        TED {a.publicationNumber}
                      </a>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {awards.rows.length === 0 ? <p className="note">Nu sunt rezultate pentru aceste filtre. <Link href="/supra-prag">Vezi toate rezultatele TED</Link>.</p> : null}

        {totalPages > 1 ? (
          <div className="pager">
            {page > 1 ? <Link href={pageUrl(page - 1)}>← anterioarele</Link> : <span className="off">← anterioarele</span>}
            <span className="pager-pos">
              pagina {formatInt(page)} / {formatInt(totalPages)} · {formatInt(awards.total)} rezultate
            </span>
            {page < totalPages ? <Link href={pageUrl(page + 1)}>următoarele →</Link> : <span className="off">următoarele →</span>}
          </div>
        ) : null}

        <p className="note">
          Potrivirile cu SEAP folosesc cumpărătorul, câștigătorii, valori comparabile în aceeași monedă, data și codul CPV. Legăturile posibile sunt marcate separat de cele confirmate automat.
          Verifică anunțurile originale și{" "}
          <Link href="/metodologie">metodologia</Link>.
        </p>
      </section>
    </>
  );
}
