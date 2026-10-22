import Link from "next/link";
import { notFound } from "next/navigation";
import { getAwardNoticeDetail } from "@/lib/marts";
import { CONTRACT_DATE_FLOOR } from "@seap/db";
import { formatRon, formatRonFull, formatInt, formatCalendarDate, cleanName } from "@/lib/format";
import { awardUrl } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";

/**
 * Award-notice page — the "mother" of its contracts: one procedure, N lots.
 * Keyed by SICAP's ca_notice_id. Each lot links to its /contracte page; big
 * frameworks (max ~2.700 lots) paginate via ?p=.
 *
 * SEAP republishes an award notice under the same number when it adds
 * call-offs (new caNoticeId, new contract ids, new state date). The date shown
 * is that of this version, next to the first contract of the notice across
 * its versions (owner decision of 21 October 2026).
 */

export const dynamic = "force-dynamic";

function tedPubnum(no: string): string | null {
  const m = /^(\d{4})\/S\s+\d+-(\d+)$/.exec(no.trim());
  return m ? `${m[2]}-${m[1]}` : null;
}

export default async function NoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ caid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { caid } = await params;
  const sp = await searchParams;
  const pageNo = Math.max(1, Number(sp["p"]) || 1);
  const n = await getAwardNoticeDetail(caid, pageNo);
  if (!n) notFound();

  const ted = n.tedNoticeNo ? tedPubnum(n.tedNoticeNo) : null;
  const pages = Math.max(1, Math.ceil(n.nLots / n.pageSize));

  return (
    <>
      <div className="profile-head">
        <h1>{n.cpvName ? cleanName(n.cpvName) : `Anunț de atribuire ${n.noticeNo ?? caid}`}</h1>
        <ClipButton kind="notice" refId={String(caid)} label={n.noticeNo ?? String(caid)} />
        <div>
          <span className="badge plain">anunț de atribuire</span>
          {n.procedureType && <span className="badge plain">{n.procedureType}</span>}
          {n.noticeNo && <span className="note">nr. {n.noticeNo}</span>}{" "}
          {n.versionDate && <span className="note">data acestei versiuni: {formatCalendarDate(n.versionDate)}</span>}{" "}
          <span className="note">
            primul contract din anunț: {n.firstContractDate ? formatCalendarDate(n.firstContractDate) : "fără dată plauzibilă"}
          </span>
        </div>
        {n.versions.length > 1 && (
          <p className="note">
            SEAP a publicat acest anunț în {formatInt(n.versions.length)} versiuni sub același număr, de regulă când
            adaugă contracte subsecvente. Fiecare versiune are propriile înregistrări; nu le aduna. Versiuni:{" "}
            {n.versions.map((v, i) => (
              <span key={v.caNoticeId}>
                {i > 0 && ", "}
                {v.caNoticeId === n.caNoticeId ? (
                  <span aria-current="page">{formatCalendarDate(v.versionDate)} (aceasta)</span>
                ) : (
                  <Link href={`/anunturi/${v.caNoticeId}`}>{formatCalendarDate(v.versionDate)}</Link>
                )}
              </span>
            ))}
            .
          </p>
        )}
        {n.authority && (
          <p className="note">
            Autoritate:{" "}
            <Link href={`/entitati/${n.authority.entityId}?rol=autoritate`}>
              {cleanName(n.authority.name)}
            </Link>
            {n.authority.county ? ` · ${n.authority.county}` : ""}
          </p>
        )}
        <div className="ext-links">
          <a href={awardUrl(n.caNoticeId)} target="_blank" rel="noopener noreferrer">
            anunțul pe e-licitatie.ro ↗
          </a>
          {ted && (
            <a
              href={`https://ted.europa.eu/en/notice/-/detail/${ted}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              TED {n.tedNoticeNo} ↗
            </a>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{formatInt(n.nLots)}</div>
          <div className="l">Înregistrări publicate</div>
        </div>
        <div className="stat">
          <div className="n">
            {n.totalContractValue != null ? formatRon(n.totalContractValue) : "—"}
          </div>
          <div className="l">Contracte și comenzi identificate</div>
        </div>
        <div className="stat">
          <div className="n">{n.awardValueRon != null ? formatRon(n.awardValueRon) : "—"}</div>
          <div className="l">Valoare atribuită (anunț)</div>
        </div>
        {n.lowestOfferRon != null && n.highestOfferRon != null && n.highestOfferRon > 0 && (
          <div className="stat">
            <div className="n">
              {formatRon(n.lowestOfferRon)} – {formatRon(n.highestOfferRon)}
            </div>
            <div className="l">Interval oferte (min–max)</div>
          </div>
        )}
      </div>

      <section className="section">
        <h2 id="inregistrari" className="list-anchor">Înregistrările din acest anunț</h2>
        {pages > 1 && (
          <p className="hint">
            {formatInt(n.nLots)} înregistrări · pagina {n.page} din {formatInt(pages)} · ordonate
            după valoare
          </p>
        )}
        <table className="rank">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Obiect</th>
              <th>Câștigător</th>
              <th>Data</th>
              <th style={{ textAlign: "right" }}>Valoare</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {n.lots.map((l) => (
              <tr key={l.natId}>
                <td className="county">{l.contractNo ?? "—"}</td>
                <td>
                  {cleanName(l.title) || "—"}
                  {l.financialKind === 'framework' && (
                    <span className="county"> · plafon, nu comandă</span>
                  )}
                  {l.financialKind === 'amendment' && <span className="county"> · act adițional, neaditiv</span>}
                  {l.temporarilyExcluded && <span className="county"> · exclus temporar din totaluri; motivul este în pagina contractului</span>}
                  {l.financialKind === 'review' && <span className="county"> · tip neclar, de verificat</span>}
                </td>
                <td>
                  {l.winners.length === 0
                    ? "—"
                    : l.winners.map((w, i) => (
                        <span key={w.entityId}>
                          {i > 0 && ", "}
                          <Link href={`/entitati/${w.entityId}?rol=furnizor`}>
                            {cleanName(w.name)}
                          </Link>
                        </span>
                      ))}
                </td>
                <td className="county">{l.contractDate ? l.contractDate.slice(0, 10) : "—"}{l.contractDate && l.contractDate < CONTRACT_DATE_FLOOR && <small> dată sursă improbabilă</small>}</td>
                <td className="num">{formatRonFull(l.contractValue)}</td>
                <td>
                  <Link href={`/contracte/${l.natId}`}>detalii →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="pager">
            {n.page > 1 && <Link href={`?p=${n.page - 1}#inregistrari`}>← Anterior</Link>}
            <span className="note">
              Pagina {n.page} din {formatInt(pages)}
            </span>
            {n.page < pages && <Link href={`?p=${n.page + 1}#inregistrari`}>Următor →</Link>}
          </div>
        )}
      </section>

      <p className="note">
        „Valoare atribuită” este cifra declarată pe anunț. „Contracte și comenzi identificate” însumează
        contractele și subsecventele acestei publicații; plafoanele, actele adiționale și tipurile neclare sunt separate.
        {n.frameworkValue != null && <> Plafoane publicate: {formatRonFull(n.frameworkValue)}.</>}
        {" "}Lipsa comenzilor identificate nu înseamnă cheltuieli zero. Nu aduna totalurile republicărilor
        aceluiași contract; profilurile folosesc identitățile verificate. Valorile nu dovedesc plăți.
      </p>
    </>
  );
}
