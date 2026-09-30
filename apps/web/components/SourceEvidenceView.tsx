import Link from "next/link";
import type { SourceEvidence } from "@/lib/source-evidence";
import { evidenceLinks, formatEvidenceAmount } from "@/lib/ask/evidence";
import { formatInt } from "@/lib/format";
import ReportProblem from "./feedback/ReportProblem";
import ClipButton from "./ClipButton";
import "./source-evidence.css";

export default function SourceEvidenceView({ evidence, href, page: requestedPage = 0, kind, refId, spec }: {
  evidence: SourceEvidence; href: string; page?: number;
  kind: "signal" | "radiografie"; refId: string; spec?: unknown;
}) {
  const pages = Math.max(1, Math.ceil(evidence.sourceCount / 50));
  const page = Math.max(0, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 0, pages - 1));
  const pageHref = (p: number) => `${href}${href.includes("?") ? "&" : "?"}p=${p}`;
  const csvQuery = new URLSearchParams({ kind, id: refId });
  if (kind === "radiografie" && spec && typeof spec === "object") for (const [key, value] of Object.entries(spec)) if (typeof value === "string") csvQuery.set(key, value);
  const urls = Array.isArray(evidence.context.sourceUrls) ? evidence.context.sourceUrls.filter((value): value is string => typeof value === "string" && /^https:\/\/(e-licitatie\.ro|ted\.europa\.eu)\//.test(value)) : [];
  return <div className="source-evidence">
    <div className="source-evidence-intro">
      <div><h2>{evidence.title}</h2><p>{formatInt(evidence.sourceCount)} înregistrări disponibile · <strong>{formatEvidenceAmount(evidence.totalExact, true)}</strong></p></div>
      <ClipButton kind={kind} refId={refId} spec={spec} label={evidence.title} />
    </div>
    <p className="source-evidence-purpose">Verifică sursele, apoi păstrează această versiune în anchetă. Captura include toate înregistrările selecției, nu doar pagina afișată.</p>
    <a href={`/api/evidence/sources?${csvQuery}`} download>Descarcă înregistrările disponibile · CSV ↓</a>
    <div><ReportProblem /></div>
    {evidence.warnings.length > 0 && <details className="source-evidence-notes" open><summary>Ce trebuie verificat înainte de a cita</summary><ul>{evidence.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    <p className="hint">Metodologie: {evidence.methodology}. Sumele sunt valori înregistrate, nu plăți. Pentru consorții, rândul reprezintă cota alocată unui furnizor.</p>
    {evidence.records.length > 0 ? <div className="ask-tablewrap"><table className="rank source-evidence-table"><thead><tr><th scope="col">Înregistrare și sursă</th><th scope="col">Autoritate / furnizor</th><th scope="col">Data</th><th scope="col" className="num">Valoare exactă · lei</th></tr></thead><tbody>
      {evidence.records.slice(page * 50, (page + 1) * 50).map((row, index) => {
        const links = evidenceLinks(row);
        return <tr key={`${row.src}:${row.refId}:${row.supplierId}:${index}`}>
          <td><strong>{row.daCode ?? row.refId}</strong><small>{row.src === "da" ? "Achiziție directă" : "Contract"} · {row.cpvCode ?? "CPV neprecizat"}</small>
            <span className="source-evidence-links">{links.seap && <a href={links.seap} target="_blank" rel="noreferrer">SEAP ↗</a>}{links.ted && <a href={links.ted} target="_blank" rel="noreferrer">TED ↗</a>}{row.src === "contracts" && <Link href={`/contracte/${row.refId}`}>Detalii →</Link>}</span></td>
          <td>{row.authorityId ? <Link href={`/entitati/${row.authorityId}`}>{row.authority}</Link> : row.authority ?? "Autoritate neidentificată"}<small>{row.supplierId ? <Link href={`/entitati/${row.supplierId}`}>{row.supplier}</Link> : row.supplier ?? "Furnizor neidentificat"}</small></td>
          <td>{row.date ?? "Neprecizată"}</td><td className="num">{row.originalValueExact === null ? "Valoare lipsă" : formatEvidenceAmount(row.valueExact, true).replace(/ lei$/, "")}{(row.nWinners ?? 1) > 1 && <small>Cotă · {row.nWinners} câștigători</small>}</td>
        </tr>;
      })}
    </tbody></table></div> : <p className="source-evidence-empty">Nu există înregistrări verificabile în selecția curentă. Contextul și limitele semnalului pot fi păstrate; lipsa surselor rămâne explicită.</p>}
    {pages > 1 && <nav className="pager" aria-label="Paginarea înregistrărilor">{page > 0 && <Link href={pageHref(page - 1)}>← Anterioara</Link>}<span>Pagina {page + 1} din {pages}</span>{page + 1 < pages && <Link href={pageHref(page + 1)}>Următoarea →</Link>}</nav>}
    {urls.length > 0 && <details className="source-evidence-notes"><summary>Referințe păstrate în calcul · {formatInt(urls.length)}</summary><ul>{urls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url.includes("/direct-acquisition/") ? "Achiziție SEAP" : "Anunț sursă"} {url.split("/").at(-1)} ↗</a></li>)}</ul></details>}
  </div>;
}
