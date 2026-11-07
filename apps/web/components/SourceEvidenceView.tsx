import Link from "next/link";
import type { ReactNode } from "react";
import type { SourceEvidence } from "@/lib/source-evidence";
import { evidenceLinks, formatEvidenceAmount } from "@/lib/ask/evidence";
import { countWords } from "@/lib/ask/answer-text";
import { cleanName, formatCalendarDate, formatInt } from "@/lib/format";
import { groupSourceRecords, sharedTitleStart, sourcePage } from "@/lib/source-groups";
import ClipButton from "./ClipButton";
import EntityName from "./EntityName";
import SourceCaptureTip from "./SourceCaptureTip";
import Term from "./Term";
import "./source-evidence.css";

/*
 * The records behind a finding (a signal's sources, a Radiografie pattern's), owner 7 November 2026: one row per
 * record, a consortium contract's halves under one contract; each row opens its own page here first (a direct
 * acquisition /achizitii, a contract /contracte), with SEAP and TED beside it as the external sources. Dates
 * dd.mm.yyyy, values exact, in lei, recorded and not payments.
 */

const amount = (value: string) => formatEvidenceAmount(value, true).replace(/ lei$/, "");

export default function SourceEvidenceView({ evidence, href, page: requestedPage = 0, kind, refId, spec, heading, titles, notes, save = true }: {
  evidence: SourceEvidence; href: string; page?: number;
  kind: "signal" | "radiografie"; refId: string; spec?: unknown;
  /** The block's heading: the finding's title by default; null when the page's section already names it. */
  heading?: ReactNode | null;
  /** Published titles by `${src}:${refId}` (readRecordTitles), for the rows on this page. */
  titles?: Readonly<Record<string, string>>;
  /** One more line under a row's record, by `${src}:${refId}` (a single bid's TED lot and offers). */
  notes?: Readonly<Record<string, ReactNode>>;
  /** Saving in an investigation from this block; false when the page's head holds the button. */
  save?: boolean;
}) {
  const groups = groupSourceRecords(evidence.records);
  const { page, pages, rows } = sourcePage(groups, requestedPage);
  // The pager sits below the table: the next page opens at the start of the list.
  const pageHref = (p: number) => `${href}${href.includes("?") ? "&" : "?"}p=${p}#surse-lista`;
  const csvQuery = new URLSearchParams({ kind, id: refId });
  if (kind === "radiografie" && spec && typeof spec === "object") for (const [key, value] of Object.entries(spec)) if (typeof value === "string") csvQuery.set(key, value);
  const urls = Array.isArray(evidence.context.sourceUrls) ? evidence.context.sourceUrls.filter((value): value is string => typeof value === "string" && /^https:\/\/(e-licitatie\.ro|ted\.europa\.eu)\//.test(value)) : [];
  const grouped = groups.length < evidence.sourceCount;
  const contractsOnly = evidence.records.every((r) => r.src === "contracts");
  const title = heading === undefined ? evidence.title : heading;
  // The lots of one notice often repeat its whole title: said once above the table, each row keeps its lot.
  const shared = sharedTitleStart(rows.map((g) => titles?.[g.key]));
  return <div className="source-evidence">
    <div className="source-evidence-intro">
      <div>
        {title !== null && <h2>{title}</h2>}
        <p className="source-evidence-count">{countWords(evidence.sourceCount, "înregistrare", "înregistrări")}{grouped && ` în ${countWords(groups.length, contractsOnly ? "contract" : "rând", contractsOnly ? "contracte" : "rânduri")}`} · <strong>{formatEvidenceAmount(evidence.totalExact, true)}</strong></p>
      </div>
      {save && <div className="source-evidence-save"><ClipButton kind={kind} refId={refId} spec={spec} label={evidence.title} /><SourceCaptureTip /></div>}
    </div>
    <a className="source-evidence-csv" href={`/api/evidence/sources?${csvQuery}`} download>Descarcă înregistrările · CSV <span aria-hidden="true">↓</span></a>
    {evidence.warnings.length > 0 && <details className="source-evidence-notes" open><summary>Ce trebuie verificat înainte de a cita</summary><ul>{evidence.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    <p className="hint source-evidence-basis"><Term tip title="Valori înregistrate" text="Sume înregistrate în SEAP; nu dovedesc plăți.">Valori înregistrate, nu plăți</Term>{grouped && <> · La o asociere, fiecare câștigător are cota lui <Term tip id="consortiu" /></>}</p>
    {shared && <p className="source-evidence-shared">{shared.lots ? <>Titlul comun al loturilor: „{shared.start}”.</> : <>Titlurile încep la fel: „{shared.start} …”. Rândurile arată continuarea.</>}</p>}
    {rows.length > 0 ? <div className="ask-tablewrap rank-stack list-anchor" id="surse-lista"><table className="rank source-evidence-table"><thead><tr><th scope="col">Înregistrarea</th><th scope="col">Instituție și furnizor</th><th scope="col">Data</th><th scope="col" className="num">Valoare · lei</th></tr></thead><tbody>
      {rows.map((group) => {
        const row = group.first;
        const links = evidenceLinks(row);
        const internal = row.refId ? `/${row.src === "da" ? "achizitii" : "contracte"}/${row.refId}` : null;
        const kindWord = row.src === "da" ? "Achiziție directă" : "Contract";
        const full = titles?.[group.key] ?? null;
        const name = full ? (shared?.rest.has(full) ? `${shared.lots ? "" : "… "}${shared.rest.get(full)}` : full) : row.cpvName ?? kindWord;
        const winners = row.nWinners ?? 1;
        const note = notes?.[group.key];
        return <tr key={group.key}>
          <td className="se-record">
            {internal ? <Link className="se-title" href={internal} prefetch={false} title={full && full !== name ? full : undefined}>{name}</Link> : <span className="se-title">{name}</span>}
            <span className="se-code">{row.daCode ?? row.refId ?? "Fără cod"} · {kindWord}{row.cpvCode ? ` · CPV ${row.cpvCode}` : ""}</span>
            {note && <span className="se-note">{note}</span>}
            {(links.seap || links.ted) && <span className="source-evidence-links">
              {links.seap && <a href={links.seap} target="_blank" rel="noopener noreferrer">SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>}
              {links.ted && <a href={links.ted} target="_blank" rel="noopener noreferrer">TED <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>}
            </span>}
          </td>
          <td className="se-parties" data-label="Instituție și furnizor">
            <span className="se-party"><span className="se-role">Instituția</span>{row.authority ? <EntityName id={row.authorityId} role="authority">{cleanName(row.authority)}</EntityName> : "Neidentificată"}</span>
            {group.records.map((r, i) => <span className="se-party" key={`${r.supplierId ?? r.supplier}:${i}`}>
              <span className="se-role">{winners > 1 ? (group.records.length > 1 ? `Câștigătorul ${i + 1} din ${winners}` : `Unul din ${winners} câștigători`) : row.src === "da" ? "Furnizorul" : "Câștigătorul"}</span>
              {r.supplier ? <EntityName id={r.supplierId} role="supplier">{cleanName(r.supplier)}</EntityName> : "Neidentificat"}
              {winners > 1 && <span className="se-share"> · cotă {r.originalValueExact === null ? "nepublicată" : `${amount(r.valueExact)} lei`}</span>}
            </span>)}
          </td>
          <td data-label="Data">{row.date ? formatCalendarDate(row.date.slice(0, 10)) : "Neprecizată"}</td>
          <td className="num" data-label="Valoare · lei">{group.missingValue && group.records.length === 1 ? "Valoare lipsă" : amount(group.valueExact)}
            {winners > 1 && <span className="se-note">{group.records.length >= winners ? `${formatInt(winners)} cote egale` : group.records.length > 1 ? `${formatInt(group.records.length)} cote din ${formatInt(winners)}` : "cota firmei"}</span>}
            {group.missingValue && group.records.length > 1 && <span className="se-note">fără cotele nepublicate</span>}</td>
        </tr>;
      })}
    </tbody></table></div> : <p className="source-evidence-empty">Nu există înregistrări verificabile în selecția curentă. Contextul și limitele rămân; lipsa surselor e spusă, nu ascunsă.</p>}
    {pages > 1 && <nav className="pager" aria-label="Paginarea înregistrărilor">{page > 0 && <Link href={pageHref(page - 1)}>← Anterioara</Link>}<span>Pagina {page + 1} din {pages}</span>{page + 1 < pages && <Link href={pageHref(page + 1)}>Următoarea →</Link>}</nav>}
    {urls.length > 0 && <details className="source-evidence-notes"><summary>Referințe păstrate în calcul · {formatInt(urls.length)}</summary><ul>{urls.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url.includes("/direct-acquisition/") ? "Achiziție SEAP" : "Anunț sursă"} {url.split("/").at(-1)} <span aria-hidden="true">↗</span></a></li>)}</ul></details>}
  </div>;
}
