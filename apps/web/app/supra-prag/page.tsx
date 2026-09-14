import Link from "next/link";
import type { Metadata } from "next";
import { getTedStats, getTedAwards, type TedAward } from "@/lib/marts";
import { countryName, procedureName, TED_LABEL } from "@/lib/ted";
import { formatRon, formatInt, cleanName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Atribuiri publicate în TED",
  description: "Anunțuri de atribuire din Jurnalul Oficial al UE, cu sursele europene și potrivirile identificate în SEAP.",
};

const TED_NOTICE_URL = (pub: string | null) =>
  pub ? `https://ted.europa.eu/en/notice/${pub}/html` : null;

function winnerCell(a: TedAward) {
  return a.winnerNames.map((name, i) => {
    const id = a.winnerEntityIds[i];
    const country = a.winnerCountries[i] ?? a.winnerCountries[0];
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

export default async function SupraPragPage({
  searchParams,
}: {
  searchParams: Promise<{ etichetă?: string; extern?: string; unic?: string; tara?: string; sort?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const label = sp["etichetă"] === "also-in-seap" || sp["etichetă"] === "ted-only" ? sp["etichetă"] : undefined;
  const foreign = sp["extern"] === "1";
  const singleBidder = sp["unic"] === "1";
  const country = sp["tara"] || undefined;
  const sort = sp["sort"] === "date" ? "date" : "value";
  const page = Math.max(1, Number(sp["p"] ?? "1") || 1);
  const PAGE_SIZE = 60;

  const [stats, awards] = await Promise.all([
    getTedStats(),
    getTedAwards({
      ...(label ? { label } : {}),
      foreign,
      singleBidder,
      ...(country ? { country } : {}),
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(awards.total / PAGE_SIZE));

  // Filter links omit `p` (any filter change resets to page 1); pagination links
  // pass `p` explicitly to keep the current filters.
  const qstr = (patch: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      "etichetă": label,
      extern: foreign ? "1" : undefined,
      unic: singleBidder ? "1" : undefined,
      tara: country,
      sort: sort === "date" ? "date" : undefined,
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
            <div className="l">atribuiri TED</div>
          </div>
          <div className="stat">
            <div className="n">{formatInt(stats.tedOnly)}</div>
            <div className="l">{TED_LABEL["ted-only"]!.title}</div>
          </div>
          <div className="stat">
            <div className="n">{formatInt(stats.foreign)}</div>
            <div className="l">câștigate de firme străine</div>
          </div>
          <div className="stat">
            <div className="n">{formatInt(stats.singleBidder)}</div>
            <div className="l">cu ofertant unic</div>
          </div>
        </div>
      </section>

      {stats.byCountry.length > 0 ? (
        <section className="section">
          <h2>Firme străine câștigătoare, după țară</h2>
          <p className="hint">Valoare publicată în TED pentru loturi câștigate de firme din afara României.</p>
          <div className="filters" style={{ flexWrap: "wrap" }}>
            {stats.byCountry.slice(0, 12).map((c) => (
              <Link key={c.country} href={qstr({ tara: country === c.country ? undefined : c.country, extern: "1" })}
                className={country === c.country ? "on" : ""}>
                {countryName(c.country)} · {formatRon(c.totalRon)}
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
          <Link href={qstr({ extern: foreign ? undefined : "1" })} className={foreign ? "on" : ""}>
            Firme străine
          </Link>
          <Link href={qstr({ unic: singleBidder ? undefined : "1" })} className={singleBidder ? "on" : ""}>
            Ofertant unic
          </Link>
          <span className="filler" />
          <Link href={qstr({ sort: sort === "date" ? undefined : "date" })} className={sort === "date" ? "on" : ""}>
            {sort === "date" ? "↓ dată" : "↓ valoare"}
          </Link>
        </div>

        <table className="rank">
          <thead>
            <tr>
              <th>Autoritate → Câștigător</th>
              <th>Obiect</th>
              <th>Procedură</th>
              <th style={{ textAlign: "right" }}>Valoare</th>
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
                </td>
                <td className="county">
                  {a.title ? <div className="obj-title">{a.title}</div> : null}
                  {a.cpvName ?? a.cpvCode ?? "—"}
                  <div className="badges">
                    <span className={`ted-label ${a.label === "ted-only" ? "only" : "seap"}`} title={TED_LABEL[a.label]?.hint}>
                      {TED_LABEL[a.label]?.title ?? a.label}
                    </span>
                    {a.isSingleBidder ? <span className="badge warn">ofertant unic</span> : null}
                    {a.euFunded ? <span className="badge">fonduri UE</span> : null}
                  </div>
                </td>
                <td className="county">{procedureName(a.procedureType)}</td>
                <td className="num">
                  {a.awardedValue ? formatRon(a.awardedValue) : "—"}
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

        {totalPages > 1 ? (
          <div className="pager">
            {page > 1 ? <Link href={pageUrl(page - 1)}>← anterioarele</Link> : <span className="off">← anterioarele</span>}
            <span className="pager-pos">
              pagina {formatInt(page)} / {formatInt(totalPages)} · {formatInt(awards.total)} atribuiri
            </span>
            {page < totalPages ? <Link href={pageUrl(page + 1)}>următoarele →</Link> : <span className="off">următoarele →</span>}
          </div>
        ) : null}

        <p className="note">
          Potrivirile cu SEAP sunt identificate automat folosind cumpărătorul, valoarea, data și codul CPV.
          Verifică anunțurile originale și{" "}
          <Link href="/metodologie">metodologia</Link>.
        </p>
      </section>
    </>
  );
}
