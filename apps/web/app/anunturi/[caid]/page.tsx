import Link from "next/link";
import { notFound } from "next/navigation";
import { getAwardNoticeDetail } from "@/lib/marts";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { awardUrl } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";

/**
 * Award-notice page — the "mother" of its contracts: one procedure, N lots.
 * Keyed by SICAP's ca_notice_id. Each lot links to its /contracte page; big
 * frameworks (max ~2.700 lots) paginate via ?p=.
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
          {n.stateDate && <span className="note">{n.stateDate.slice(0, 10)}</span>}
        </div>
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
          <div className="l">{n.nLots === 1 ? "Contract atribuit" : "Contracte atribuite (loturi)"}</div>
        </div>
        <div className="stat">
          <div className="n">
            {n.totalContractValue != null ? formatRon(n.totalContractValue) : "—"}
          </div>
          <div className="l">Suma contractelor</div>
        </div>
        <div className="stat">
          <div className="n">{n.awardValueRon != null ? formatRon(n.awardValueRon) : "—"}</div>
          <div className="l">Valoare atribuită (anunț)</div>
        </div>
        <div className="stat">
          <div className="n">
            {n.estimatedValueRon != null ? formatRon(n.estimatedValueRon) : "—"}
          </div>
          <div className="l">Valoare estimată</div>
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
        <h2>Contractele din acest anunț</h2>
        {pages > 1 && (
          <p className="hint">
            {formatInt(n.nLots)} contracte · pagina {n.page} din {formatInt(pages)} · ordonate
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
                  {l.title && /acord[- ]cadru/i.test(l.title) && !/subsecvent/i.test(l.title) && (
                    <span className="county"> · plafon, nu comandă</span>
                  )}
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
                <td className="county">{l.contractDate ? l.contractDate.slice(0, 10) : "—"}</td>
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
            {n.page > 1 && <Link href={`?p=${n.page - 1}`}>← Anterior</Link>}
            <span className="note">
              Pagina {n.page} din {formatInt(pages)}
            </span>
            {n.page < pages && <Link href={`?p=${n.page + 1}`}>Următor →</Link>}
          </div>
        )}
      </section>

      <p className="note">
        „Valoare atribuită” e cifra declarată pe anunț; „Suma contractelor” adună valorile
        contractelor individuale — pot diferi (acorduri-cadru cu plafoane, loturi neatribuite).
        Rândurile „acord-cadru” sunt plafoane: banii efectivi sunt contractele subsecvente, iar în
        statisticile noastre plafonul nu se adună când comenzile lui sunt și ele publicate.
      </p>
    </>
  );
}
