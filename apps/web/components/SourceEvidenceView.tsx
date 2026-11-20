import Link from "next/link";
import type { ReactNode } from "react";
import type { SourceEvidence } from "@/lib/source-evidence";
import { evidenceLinks } from "@/lib/ask/evidence";
import Lei from "./Lei";
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
 * dd.mm.yyyy, values in lei to the leu with the exact amount on hover or tap (Decision A, owner, 20 November 2026),
 * recorded and not payments.
 */

const amount = (value: string) => <Lei value={value} unit={false} />;

/** What every record of a selection has in common (one institution, one notice, one CPV): said once above its table. */
function commonFacts(records: SourceEvidence["records"]) {
  const one = <T,>(values: T[]) => (values.length > 1 && values.every((v) => v === values[0]) && values[0] != null && values[0] !== "" ? values[0] : null);
  return {
    authority: one(records.map((r) => r.authorityId ?? r.authority)) !== null ? records[0]! : null,
    code: records.every((r) => r.src === "contracts") ? one(records.map((r) => r.daCode)) : null,
    cpv: one(records.map((r) => r.cpvCode)),
  };
}

/** One page of `size` rows, kept inside the pages there are (lib/source-groups.ts sourcePage, at a size of the page's own). */
function sizedPage<T>(rows: readonly T[], requested: number, size: number): { page: number; pages: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.max(0, Math.min(Number.isSafeInteger(requested) ? requested : 0, pages - 1));
  return { page, pages, rows: rows.slice(page * size, (page + 1) * size) };
}

export default function SourceEvidenceView({ evidence, href, page: requestedPage = 0, pageSize, kind, refId, spec, heading, titles, notes, save = true, notesOpen = true, common, total = true, essential = false }: {
  evidence: SourceEvidence; href: string; page?: number;
  /**
   * Rows per page, when the page wants fewer than the shared 50 (lib/source-groups.ts): a signal's page shows 10 (owner,
   * 18 November 2026, in both modes). The page reads its rows' titles for the same rows.
   */
  pageSize?: number;
  kind: "signal" | "radiografie"; refId: string; spec?: unknown;
  /** The block's heading: the finding's title by default; null when the page's section already names it. */
  heading?: ReactNode | null;
  /** Published titles by `${src}:${refId}` (readRecordTitles), for the rows on this page. */
  titles?: Readonly<Record<string, string>>;
  /** One more line under a row's record, by `${src}:${refId}` (a single bid's TED lot and offers). */
  notes?: Readonly<Record<string, ReactNode>>;
  /** Saving in an investigation from this block; false when the page's head holds the button. */
  save?: boolean;
  /** „Ce trebuie verificat înainte de a cita” open at first (the default) or closed, its count in the summary. */
  notesOpen?: boolean;
  /**
   * Say once, above the table, what every row would repeat (UX audit Z6-24, a case's sources): the institution, the
   * notice, the CPV, and the page's own `extra` facts (one TED notice, one procedure); the rows keep the rest.
   * `authorityId`: the institution the page already names (its head), left out of that line when it is every row's.
   */
  common?: { extra?: ReactNode[]; authorityId?: string | null };
  /** The records' count and sum under the heading; false when the page's head shows the same sum (owner, 17 November 2026). */
  total?: boolean;
  /**
   * The page stays in Esențial (lib/view-mode.ts): what is technical here is marked as Complet's (owner, 18 November
   * 2026): the CSV, each row's codes, the codes common to all rows (the institution they share stays), the raw
   * references kept in the calculation. Off for the pages that belong to Complet (the Radiografie sources).
   */
  essential?: boolean;
}) {
  const groups = groupSourceRecords(evidence.records);
  const { page, pages, rows } = pageSize ? sizedPage(groups, requestedPage, pageSize) : sourcePage(groups, requestedPage);
  const complet = essential ? { "data-only": "complet" } : {};
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
  const same = common ? commonFacts(evidence.records) : { authority: null, code: null, cpv: null };
  const commonAuthority = !!(common && same.authority && !(common.authorityId && same.authority.authorityId === common.authorityId));
  const commonLine = common ? [
    commonAuthority && same.authority && <b key="a">{same.authority.authority ? <EntityName id={same.authority.authorityId} role="authority">{cleanName(same.authority.authority)}</EntityName> : "Instituție neidentificată"}</b>,
    same.code && <span key="c">anunțul {same.code}</span>, same.cpv && <span key="p">CPV {same.cpv}</span>, ...(common.extra ?? []),
  ].filter(Boolean) : [];
  return <div className="source-evidence">
    {(title !== null || total || save) && <div className="source-evidence-intro">
      <div>
        {title !== null && <h2>{title}</h2>}
        {total && <p className="source-evidence-count">{countWords(evidence.sourceCount, "înregistrare", "înregistrări")}{grouped && ` în ${countWords(groups.length, contractsOnly ? "contract" : "rând", contractsOnly ? "contracte" : "rânduri")}`} · <strong><Lei value={evidence.totalExact} /></strong></p>}
      </div>
      {save && <div className="source-evidence-save"><ClipButton kind={kind} refId={refId} spec={spec} label={evidence.title} /><SourceCaptureTip /></div>}
    </div>}
    <a className="source-evidence-csv" {...complet} href={`/api/evidence/sources?${csvQuery}`} download>Descarcă înregistrările · CSV <span aria-hidden="true">↓</span></a>
    {evidence.warnings.length > 0 && <details className="source-evidence-notes" open={notesOpen}><summary>Ce trebuie verificat înainte de a cita{!notesOpen && <span className="source-evidence-n"> · {countWords(evidence.warnings.length, "punct", "puncte")}</span>}</summary><ul>{evidence.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    {/* „Valori înregistrate, nu plăți” is the site footer's (owner, 17 November 2026); a consortium's shares stay said here. */}
    {grouped && <p className="hint source-evidence-basis">La o asociere, fiecare câștigător are cota lui <Term tip id="consortiu" /></p>}
    {shared && <p className="source-evidence-shared">{shared.lots ? <>Titlul comun al loturilor: „{shared.start}”.</> : <>Titlurile încep la fel: „{shared.start} …”. Rândurile arată continuarea.</>}</p>}
    {/* Without the codes the line keeps the institution every row shares (the rows do not name it), else it goes. */}
    {commonLine.length > 0 && <p className="source-evidence-common" {...(commonAuthority ? {} : complet)}>Toate rândurile: {commonLine.map((f, i) => <span key={i} {...(commonAuthority && i === 0 ? {} : complet)}>{i > 0 && " · "}{f}</span>)}</p>}
    {rows.length > 0 ? <div className="ask-tablewrap rank-stack list-anchor" id="surse-lista"><table className={`rank source-evidence-table${common ? " se-compact" : ""}`}><thead><tr><th scope="col">Înregistrarea</th><th scope="col">{same.authority ? (evidence.records.every((r) => r.src === "da") ? "Furnizorul" : "Câștigătorul") : "Instituție și furnizor"}</th><th scope="col">Data</th><th scope="col" className="num">Valoare · lei</th></tr></thead><tbody>
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
            {!(same.code && same.cpv) && <span className="se-code" {...complet}>{same.code ? kindWord : <>{row.daCode ?? row.refId ?? "Fără cod"} · {kindWord}</>}{row.cpvCode && !same.cpv ? ` · CPV ${row.cpvCode}` : ""}</span>}
            {note && <span className="se-note">{note}</span>}
            {(links.seap || links.ted) && <span className="source-evidence-links">
              {links.seap && <a href={links.seap} target="_blank" rel="noopener noreferrer">SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>}
              {links.ted && <a href={links.ted} target="_blank" rel="noopener noreferrer">TED <span aria-hidden="true">↗</span><span className="sr-only"> (filă nouă)</span></a>}
            </span>}
          </td>
          <td className="se-parties" data-label={same.authority ? "Câștigătorul" : "Instituție și furnizor"}>
            {!same.authority && <span className="se-party"><span className="se-role">Instituția</span>{row.authority ? <EntityName id={row.authorityId} role="authority">{cleanName(row.authority)}</EntityName> : "Neidentificată"}</span>}
            {group.records.map((r, i) => <span className="se-party" key={`${r.supplierId ?? r.supplier}:${i}`}>
              {(!same.authority || winners > 1) && <span className="se-role">{winners > 1 ? (group.records.length > 1 ? `Câștigătorul ${i + 1} din ${winners}` : `Unul din ${countWords(winners, "câștigător", "câștigători")}`) : row.src === "da" ? "Furnizorul" : "Câștigătorul"}</span>}
              {r.supplier ? <EntityName id={r.supplierId} role="supplier">{cleanName(r.supplier)}</EntityName> : "Neidentificat"}
              {winners > 1 && <span className="se-share"> · cotă {r.originalValueExact === null ? "nepublicată" : <Lei value={r.valueExact} />}</span>}
            </span>)}
          </td>
          <td data-label="Data">{row.date ? formatCalendarDate(row.date.slice(0, 10)) : "Neprecizată"}</td>
          <td className="num" data-label="Valoare · lei">{group.missingValue && group.records.length === 1 ? "Valoare lipsă" : amount(group.valueExact)}
            {winners > 1 && <span className="se-note">{group.records.length >= winners ? `${countWords(winners, "cotă egală", "cote egale")}` : group.records.length > 1 ? `${countWords(group.records.length, "cotă", "cote")} din ${formatInt(winners)}` : "cota firmei"}</span>}
            {group.missingValue && group.records.length > 1 && <span className="se-note">fără cotele nepublicate</span>}</td>
        </tr>;
      })}
    </tbody></table></div> : <p className="source-evidence-empty">Nu există înregistrări verificabile în selecția curentă. Contextul și limitele rămân; lipsa surselor e spusă, nu ascunsă.</p>}
    {pages > 1 && <nav className="pager" aria-label="Paginarea înregistrărilor">{page > 0 && <Link href={pageHref(page - 1)}>← Anterioara</Link>}<span>Pagina {page + 1} din {pages}</span>{page + 1 < pages && <Link href={pageHref(page + 1)}>Următoarea →</Link>}</nav>}
    {urls.length > 0 && <details className="source-evidence-notes" {...complet}><summary>Referințe păstrate în calcul · {formatInt(urls.length)}</summary><ul>{urls.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url.includes("/direct-acquisition/") ? "Achiziție SEAP" : "Anunț sursă"} {url.split("/").at(-1)} <span aria-hidden="true">↗</span></a></li>)}</ul></details>}
  </div>;
}
