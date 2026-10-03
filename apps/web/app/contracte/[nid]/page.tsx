import Link from "next/link";
import ContractPublications from "@/components/ContractPublications";
import ContractFiles from "@/components/documents/ContractFiles";
import { getContractFiles } from "@/lib/documents/store";
import { sessionUserId } from "@/lib/session";
import { notFound } from "next/navigation";
import { getContractDetail } from "@/lib/marts";
import { formatRon, formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName } from "@/lib/format";
import { FLAG_META } from "@/lib/flags";
import { awardUrl } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";
import { encodeSpec } from "@/lib/ask/permalink";

/**
 * Contract detail — the plain-language twin of SEAP's award-notice page,
 * keyed by SICAP's own contract id (`ca_notice_contract_id`), so URLs survive
 * re-normalizes. Phase 1: parties, money (with winner-split honesty),
 * competition context, pair history, award-level red flags, source links.
 * Lots/criteria/documents wait on the eForms detail mapping.
 */

export const dynamic = "force-dynamic";

/** "2020/S 190-458412" → TED's canonical pubnum "458412-2020". */
function tedPubnum(no: string): string | null {
  const m = /^(\d{4})\/S\s+\d+-(\d+)$/.exec(no.trim());
  return m ? `${m[2]}-${m[1]}` : null;
}

function pairDrillUrl(
  authority: { id: string; name: string },
  supplier: { id: string; name: string },
): string {
  const spec = {
    block: "stat",
    measure: "value",
    filters: {
      authorityName: authority.name,
      supplierName: supplier.name,
      authorityId: Number(authority.id),
      supplierId: Number(supplier.id),
    },
  };
  return `/?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1`;
}

/** Titles like "Contract", "Contract 707" carry no information — lead with CPV. */
function isGenericTitle(t: string | null): boolean {
  if (!t) return true;
  const s = t.trim();
  return s.length < 12 || /^(contract|acord[- ]cadru)[\s\d./-]*$/i.test(s);
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ nid: string }>;
}) {
  const { nid } = await params;
  const c = await getContractDetail(nid);
  if (!c) notFound();

  const [files, userId] = await Promise.all([getContractFiles(nid), sessionUserId()]);
  const headline = isGenericTitle(c.title) ? (files.notice?.title ?? c.cpvName ?? c.title ?? "Contract") : c.title!;
  const ted = c.tedNoticeNo ? tedPubnum(c.tedNoticeNo) : null;
  const multiWinner = c.winners.length > 1 || c.nWinners > 1;

  return (
    <>
      <div className="profile-head">
        <h1>{cleanName(headline)}</h1>
        <ClipButton kind="contract" refId={String(nid)} label={cleanName(headline)} />
        <div>
          <span className="badge plain">contract atribuit prin procedură</span>
          {c.procedureType && <span className="badge plain">{c.procedureType}</span>}
          {c.isSingleBidder === true && <span className="flag-tag">un singur ofertant</span>}
          {c.contractNo && <span className="note">nr. {c.contractNo}</span>}{" "}
          {c.contractDate && <span className="note">semnat {formatCalendarDate(c.contractDate)}</span>}
        </div>
        {(c.cpvName || c.cpvCode) && (
          <p className="note">
            Domeniu CPV{c.cpvFromNotice ? " din anunț" : ""}: {c.cpvName ?? "Denumire neprecizată"}
            {c.cpvCode ? ` (${c.cpvCode})` : ""}
          </p>
        )}
        <div className="ext-links">
          {c.caNoticeId && c.noticeLotCount > 1 && (
            <Link href={`/anunturi/${c.caNoticeId}`}>
              parte dintr-un anunț cu {formatInt(c.noticeLotCount)} contracte — vezi-le pe toate →
            </Link>
          )}
          {c.caNoticeId && (
            <a href={awardUrl(c.caNoticeId)} target="_blank" rel="noopener noreferrer">
              anunțul de atribuire pe e-licitatie.ro ↗
            </a>
          )}
          {ted && (
            <a
              href={`https://ted.europa.eu/en/notice/-/detail/${ted}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              TED {c.tedNoticeNo} ↗
            </a>
          )}
        </div>
      </div>

      <ContractPublications publications={c.publications} currentId={nid} countedOnce={c.countedOnce} />
      <nav className="ext-links" aria-label="Secțiunile contractului"><a href="#fisiere">Fișiere și căutare în documente ↓</a></nav>
      {c.amountStatus === 'converted' && c.valueRonExact !== null && <p className="note">Echivalent verificat în sursa SEAP: <strong>{formatExactDecimal(c.valueRonExact)} lei</strong> · curs raportat {c.currencyRate}. Această valoare este folosită pentru calculele în lei, dacă înregistrarea îndeplinește și celelalte criterii de includere.</p>}
      {!['ron','converted','legacy_ron'].includes(c.amountStatus) && <p className="note">Valoarea în lei nu este verificată ({c.amountStatus === 'legacy_unknown' ? 'înregistrare istorică fără unitate confirmată' : c.amountStatus === 'inconsistent' ? 'sume sau monede neconcordante în sursă' : 'date monetare incomplete sau de reverificat'}). Înregistrarea este exclusă din totalurile în lei după recalculare. Verifică documentele SEAP.</p>}
      <div className="stat-grid">
        <div className="stat">
          <div className="n">{c.contractValueExact != null ? `${formatExactDecimal(c.contractValueExact)} ${c.currency?.toUpperCase() === "RON" ? "lei" : c.currency ?? "(monedă neprecizată)"}` : "—"}</div>
          <div className="l">
            {c.amountStatus === 'legacy_ron' ? 'Valoare înregistrată' : 'Valoare originală'}{c.currency && c.currency !== "RON" ? ` (${c.currency})` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="n">{c.awardValueRon != null ? formatRon(c.awardValueRon) : "—"}</div>
          <div className="l">Valoare atribuită (tot anunțul)</div>
        </div>
        <div className="stat">
          <div className="n">
            {c.estimatedValueRon != null ? formatRon(c.estimatedValueRon) : "—"}
          </div>
          <div className="l">Valoare estimată</div>
        </div>
        <div className="stat">
          <div className="n">{c.tendersReceived != null ? formatInt(c.tendersReceived) : "—"}</div>
          <div className="l">Oferte primite</div>
        </div>
        {c.lowestOfferRon != null && c.highestOfferRon != null && c.highestOfferRon > 0 && (
          <div className="stat">
            <div className="n">
              {formatRon(c.lowestOfferRon)} – {formatRon(c.highestOfferRon)}
            </div>
            <div className="l">Interval oferte (min–max)</div>
          </div>
        )}
      </div>

      <section className="section">
        <h2>Cine cu cine</h2>
        <table className="rank">
          <tbody>
            <tr>
              <td className="county" style={{ width: 140 }}>
                Autoritate
              </td>
              <td>
                {c.authority ? (
                  <Link href={`/entitati/${c.authority.entityId}?rol=autoritate`}>
                    {cleanName(c.authority.name)}
                  </Link>
                ) : (
                  "—"
                )}
                {c.authority?.county && <span className="county"> · {c.authority.county}</span>}
              </td>
            </tr>
            {c.winners.map((w, i) => (
              <tr key={w.entityId}>
                <td className="county">
                  {c.winners.length > 1 ? `Câștigător ${i + 1}` : "Câștigător"}
                </td>
                <td>
                  <Link href={`/entitati/${w.entityId}?rol=furnizor`}>{cleanName(w.name)}</Link>
                  {w.county && <span className="county"> · {w.county}</span>}
                  {multiWinner && w.shareRon != null && (
                    <span className="county"> · {multiWinner ? "cotă estimată" : "valoare alocată"}: {formatExactDecimal(w.shareRonExact)} lei</span>
                  )}
                  {c.authority && (w.pairNDa > 0 || w.pairNCt > 0) && (
                    <>
                      {" — istoric cu autoritatea: "}
                      <a
                        href={pairDrillUrl(
                          { id: c.authority.entityId, name: cleanName(c.authority.name) },
                          { id: w.entityId, name: cleanName(w.name) },
                        )}
                        target="_blank"
                        rel="noopener"
                      >
                        {w.pairNDa + w.pairNCt === 1
                          ? "o tranzacție"
                          : `${formatInt(w.pairNDa + w.pairNCt)} tranzacții`}{" "}
                        · {formatRon(w.pairTotalRon)} ↗
                      </a>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {multiWinner && (
          <p className="note">
            Anunțul are {formatInt(Math.max(c.nWinners, c.winners.length))} câștigători — valoarea
            atribuită acoperă tot anunțul, iar în statisticile noastre fiecare câștigător poartă
            doar partea sa (împărțire egală), ca banii să nu fie numărați de două ori.
          </p>
        )}
      </section>

      <ContractFiles nid={nid} initial={files} authenticated={!!userId} {...(c.caNoticeId?{sourceUrl:awardUrl(c.caNoticeId)}:{})} />

      {c.flags.length > 0 && (
        <section className="section">
          <h2>Semnale pe această atribuire</h2>
          {c.flags.map((f) => {
            const m = FLAG_META[f.code];
            const val = f.evidence?.["value"];
            return (
              <div className="role-card" key={f.code}>
                <h3>{m?.title ?? f.code}</h3>
                <p>{m?.short}</p>
                {val != null && (
                  <p className="note">
                    {String(f.evidence?.["procedure"] ?? c.procedureType ?? "")} ·{" "}
                    {formatRonFull(Number(val))}
                  </p>
                )}
                {m?.caveat && <p className="note">{m.caveat}</p>}
              </div>
            );
          })}
        </section>
      )}

      {c.title && /acord[- ]cadru/i.test(c.title) && !/subsecvent/i.test(c.title) && (
        <p className="note">
          Acesta e un <b>acord-cadru</b> — un plafon sub care se dau comenzi, nu o plată în sine.
          Comenzile efective sunt „contractele subsecvente”
          {c.caNoticeId && c.noticeLotCount > 1 ? " din același anunț (vezi mai sus)" : ""}; când
          ele sunt publicate, plafonul nu se adună în statisticile noastre.
        </p>
      )}
      <p className="note">
        Date din anunțul de atribuire SICAP{c.noticeNo ? ` ${c.noticeNo}` : ""}. Documentele disponibile și starea preluării lor sunt afișate în secțiunea Fișiere. Pentru detalii nepreluate, consultă anunțul oficial.
      </p>
    </>
  );
}
