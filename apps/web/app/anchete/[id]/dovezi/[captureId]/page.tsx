import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { hostOrigin, readEvidenceSheet, sheetCitation, sheetSort, sheetSortWords, SHEET_PAGE, SHEET_SORT_CAP, type SheetSort } from "@/lib/evidence-sheet";
import { captureFingerprint, FINGERPRINT_ROW_CAP } from "@/lib/evidence-bundle";
import { clipHref, clipKindLabel, clipSourceUrl, clipTitle } from "@/lib/evidence-clip";
import { cleanName, formatExactDecimal, formatInt } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { privateDay, privateMoment, uniqueNotes } from "@/lib/private-format";
import { questionTitle } from "@/lib/ask/filters/title";
import type { AskSpec } from "@/lib/ask/spec";
import type { FrozenRecord } from "@/lib/evidence-captures-shared";
import { RecordHead, RecordSection, Facts } from "@/components/record/Record";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import PrivateTrail from "@/components/private/PrivateTrail";
import CopyCitation from "@/components/private/CopyCitation";
import ScopeConditions from "../../../../urmariri/ScopeConditions";
import PeerEvidenceSummary from "../../../PeerEvidenceSummary";
import "../../../workspace.css";
import "../../../../urmariri/monitoring.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Fișă de probă", robots: { index: false, follow: false } };

const recordHref = (r: FrozenRecord) => r.refId ? r.src === "da" ? `/achizitii/${r.refId}` : `/contracte/${r.refId}` : null;
const sortLinks: { id: SheetSort; label: string }[] = [{ id: "data", label: "Data" }, { id: "valoare", label: "Valoarea" }, { id: "captura", label: "Ordinea capturii" }];
const external = <><span aria-hidden="true"> ↗</span><span className="sr-only"> (filă nouă)</span></>;

/**
 * A frozen-sources page as a citable "fișă de probă" (owner, 7 November 2026), in the record template's look: the
 * saved item as the title, what was kept and when (version, records, exact total, fingerprint), the citation, the
 * rows in a stated order, and the selection in words. The raw JSON stays in the export.
 */
export default async function EvidenceSheetPage({ params, searchParams }: { params: Promise<{ id: string; captureId: string }>; searchParams: Promise<{ ordine?: string; pagina?: string }> }) {
  const { id, captureId } = await params, query = await searchParams; const user = await sessionUserId();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/anchete/${id}/dovezi/${captureId}`)}`);
  const asked = sheetSort(query.ordine), requested = Number(query.pagina ?? 1), page = Number.isSafeInteger(requested) && requested >= 1 ? requested - 1 : 0;
  const sheet = await readEvidenceSheet(user, id, captureId, asked, page); if (!sheet) notFound();
  const { capture, clip, rows, sort } = sheet, summary = capture.summary ?? {};
  const fingerprint = await captureFingerprint(capture.id, capture.rowCount);
  const origin = hostOrigin((await headers()).get("host"));
  const citation = sheetCitation(clip, capture, fingerprint, id, origin);
  const side = summary.monitoringSide === "before" ? "Sursele înainte de modificare" : summary.monitoringSide === "after" ? "Sursele după modificare" : null;
  const kind = side ?? clipKindLabel[clip.kind] ?? "Dovadă";
  const limits = uniqueNotes(Array.isArray(summary.warnings) ? summary.warnings : []);
  const connection = summary.connectionContext && typeof summary.connectionContext === "object" ? summary.connectionContext as Record<string, unknown> : null;
  const peer = summary.peerContext && typeof summary.peerContext === "object" ? summary.peerContext as Record<string, unknown> : null;
  const href = clipHref(clip), seap = clipSourceUrl(clip);
  const capturedAt = typeof summary.capturedAt === "string" ? summary.capturedAt : capture.completedAt;
  const methodology = capture.methodology ?? {};
  const spec = summary.effectiveSpec && typeof summary.effectiveSpec === "object" ? summary.effectiveSpec as AskSpec : null;
  const options = { ...(summary.evidenceScope && typeof summary.evidenceScope === "object" && Object.keys(summary.evidenceScope).length ? { scope: summary.evidenceScope } : {}),
    ...(summary.evidenceOptions && typeof summary.evidenceOptions === "object" ? Object.fromEntries(Object.entries(summary.evidenceOptions).filter(([, v]) => v)) : {}) };
  const parties = clip.kind === "contract" || clip.kind === "da" ? rows[0] : null;
  const subjectId = clip.kind === "entity" && clip.refId ? String(clip.refId) : null;
  const suppliers = clip.kind === "contract" && Array.isArray(summary.suppliers) ? summary.suppliers as { id: string | null; name: string | null }[] : [];
  const sortHref = (next: SheetSort) => `/anchete/${id}/dovezi/${captureId}${next === "data" ? "" : `?ordine=${next}`}#inregistrari`;
  const pageHref = (n: number) => `/anchete/${id}/dovezi/${captureId}?${new URLSearchParams({ ...(sort === "data" ? {} : { ordine: sort }), ...(n > 0 ? { pagina: String(n + 1) } : {}) })}#inregistrari`;
  const first = page * SHEET_PAGE + 1, last = page * SHEET_PAGE + rows.length;
  const pageName = clip.kind === "contract" ? "Pagina contractului" : clip.kind === "da" ? "Pagina achiziției" : clip.kind === "entity" ? "Pagina entității" : clip.kind === "notice" ? "Pagina anunțului" : "Deschide pe site";
  return <div className="private-shell iw-shell iw-sheet">
    <PrivateTrail current="anchete" />
    <Link className="iw-back" href={`/anchete/${id}?sectiune=evidence#clip-${clip.id}`}>← {sheet.investigationTitle}</Link>
    <article className="record iw-sheet-record">
      <RecordHead title={clipTitle(clip)}
        parties={parties ? <><EntityName id={parties.authorityId} role="authority">{cleanName(parties.authority) || "Instituție necunoscută"}</EntityName><span className="record-quiet"> → </span>{suppliers.length > 1
          ? suppliers.map((s, i) => <span key={i}>{i > 0 && ", "}<EntityName id={s.id} role="supplier">{cleanName(s.name) || "Furnizor necunoscut"}</EntityName></span>)
          : <EntityName id={parties.supplierId} role="supplier">{cleanName(parties.supplier) || "Furnizor necunoscut"}</EntityName>}</> : undefined}
        value={{ amount: capture.totalExact === null ? "Total necunoscut" : `${formatExactDecimal(capture.totalExact)} lei`,
          label: <>{capture.rowCount === null ? "Înregistrări păstrate" : countWords(capture.rowCount, "înregistrare păstrată", "înregistrări păstrate")} · <Term tip id="valoare-inregistrata">valori înregistrate</Term></>,
          notes: [clip.kind === "contract" && typeof summary.contractValueFull === "string" && summary.contractValueFull !== capture.totalExact ? <>Valoarea contractului: {formatExactDecimal(summary.contractValueFull)} lei</> : null,
            Number(summary.unknownValues ?? 0) > 0 ? <>{countWords(Number(summary.unknownValues), "înregistrare fără valoare publicată", "înregistrări fără valoare publicată")}: lipsa nu este zero.</> : null] }}
        meta={[<span className="record-kind" key="k">Fișă de probă · {kind}</span>, `Versiunea ${capture.version}`, `Păstrată la ${privateMoment(capturedAt, "moment necunoscut")}`]}
        actions={<>
          <CopyCitation text={citation} />
          <a className="record-seap" href={`/api/anchete/${id}/captures/${capture.id}/csv`} download>Descarcă înregistrările · CSV</a>
          {href && <Link className="record-seap" href={href}>{pageName} →</Link>}
          {seap && <a className="record-seap" href={seap} target="_blank" rel="noopener noreferrer">SEAP{external}</a>}
        </>} />

      {connection && <RecordSection id="legatura" title={typeof connection.title === "string" ? connection.title : "Legătura documentată"}>{typeof connection.description === "string" && <p className="record-lead">{connection.description}</p>}</RecordSection>}
      {peer && <RecordSection id="comparatie" title={typeof peer.title === "string" ? peer.title : "Comparația păstrată"}><PeerEvidenceSummary context={peer} /></RecordSection>}

      <RecordSection id="pastrare" title="Ce s-a păstrat">
        <Facts facts={[
          { label: "Păstrată la", value: <>{privateMoment(capturedAt, "moment necunoscut")} <small>ora României</small></> },
          { label: "Versiunea", value: sheet.versions.length > 1 ? <>{capture.version} din {sheet.versions.length} <small>{sheet.versions.filter((v) => v.id !== capture.id).map((v, i) => <span key={v.id}>{i > 0 && " · "}<Link href={`/anchete/${id}/dovezi/${v.id}`}>versiunea {v.version}, {privateDay(v.completedAt)}</Link></span>)}</small></> : String(capture.version) },
          { label: "Înregistrări", value: capture.rowCount === null ? "Număr necunoscut" : countWords(capture.rowCount, "înregistrare", "înregistrări") },
          { label: "Total exact", value: capture.totalExact === null ? "Necunoscut: există valori nepublicate" : `${formatExactDecimal(capture.totalExact)} lei` },
          typeof summary.capturedAt === "string" && clip.kind === "monitoring" && { label: "Observată în urmărire la", value: <>{privateMoment(summary.capturedAt)} <small>Copierea în dosar nu a recalculat datele.</small></> },
          { label: <>Amprentă <Term tip title="Amprentă" text="SHA-256 al fișierului rows.csv, același în manifest.json din export. Dacă se schimbă un singur rând, se schimbă amprenta." /></>, value: fingerprint ? <code className="iw-hash">{fingerprint}</code> : (capture.rowCount ?? 0) > FINGERPRINT_ROW_CAP ? "În manifest.json din exportul dosarului" : "Indisponibilă", wide: true },
          { label: "Metodologie", value: [methodology.version, methodology.riskVersion ? `risc ${String(methodology.riskVersion)}` : null].filter(Boolean).join(" · ") || "Nedocumentată" },
        ]} />
      </RecordSection>

      {limits.all.length > 0 && <RecordSection id="limite" title="Limite">
        <ul className="iw-limits">{limits.shown.map((note, i) => <li key={i}>{note}</li>)}</ul>
        {limits.rest.length > 0 && <details className="iw-limits-more"><summary>Toate limitele ({limits.all.length})</summary><ul className="iw-limits">{limits.rest.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
      </RecordSection>}

      <RecordSection id="inregistrari" title="Înregistrările păstrate">
        <div className="iw-sheet-sort">
          <p className="record-lead">Ordonate {sheetSortWords[sort]}{capture.rowCount && rows.length ? <> · {first === last ? first : `${first}–${last}`} din {countWords(capture.rowCount, "înregistrare", "înregistrări")}</> : null}</p>
          {sheet.sortable ? <nav aria-label="Ordinea înregistrărilor">{sortLinks.map((s) => <Link key={s.id} href={sortHref(s.id)} aria-current={s.id === sort ? "true" : undefined}>{s.label}</Link>)}</nav>
            : <p className="iw-muted">Peste {formatInt(SHEET_SORT_CAP)} de înregistrări: ordonează-le în CSV.</p>}
        </div>
        {rows.length ? <table className="record-items iw-sheet-rows"><thead><tr><th scope="col">Înregistrarea</th><th scope="col">{subjectId ? "Partenerul" : "Instituție → firmă"}</th><th scope="col">Data</th><th scope="col">CPV</th><th scope="col" className="record-num">Valoare · lei</th></tr></thead><tbody>
          {rows.map((r) => { const link = recordHref(r), code = r.daCode ?? `${r.src === "da" ? "Achiziția" : "Contractul"} ${r.refId ?? ""}`.trim(); return <tr key={r.rowNo}>
            <td className="iw-sheet-code">{link ? <Link className="iw-code" href={link}>{code}</Link> : <span className="iw-code">{code}</span>}{r.sourceUrl && <a className="iw-ext" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">SEAP{external}</a>}{r.tedUrl && <a className="iw-ext" href={r.tedUrl} target="_blank" rel="noopener noreferrer">TED{external}</a>}</td>
            {/* The saved entity is on every row of its own capture: the row names only its partner. */}
            <td data-label={subjectId && r.authorityId === subjectId ? "Firma" : subjectId && r.supplierId === subjectId ? "Instituția" : "Instituție → firmă"}>
              {!(subjectId && r.authorityId === subjectId) && <EntityName id={r.authorityId} role="authority">{cleanName(r.authority) || "Instituție necunoscută"}</EntityName>}
              {!subjectId || (r.authorityId !== subjectId && r.supplierId !== subjectId) ? <span className="record-quiet"> → </span> : null}
              {!(subjectId && r.supplierId === subjectId) && <EntityName id={r.supplierId} role="supplier">{cleanName(r.supplier) || "Furnizor necunoscut"}</EntityName>}</td>
            <td data-label="Data" className="iw-nowrap">{privateDay(r.date, "Necunoscută")}</td>
            <td data-label="CPV"><span className="iw-code">{r.cpvCode ?? "Necunoscut"}</span>{r.cpvName && <span className="record-quiet"> {r.cpvName}</span>}</td>
            <td data-label="Valoare · lei" className="record-num">{r.valueExact === null ? "Nepublicată" : formatExactDecimal(r.valueExact)}{(r.nWinners ?? 1) > 1 && r.contractValueFull && <small className="iw-share">cotă din {formatExactDecimal(r.contractValueFull)}</small>}</td>
          </tr>; })}
        </tbody></table> : <p className="record-lead">Nu există înregistrări pe această pagină.</p>}
        {(page > 0 || sheet.hasMore) && <nav className="iw-source-pager" aria-label="Paginile înregistrărilor">{page > 0 ? <Link href={pageHref(page - 1)}>← Cele {SHEET_PAGE} dinainte</Link> : <span />}{sheet.hasMore && <Link href={pageHref(page + 1)}>Următoarele {SHEET_PAGE} →</Link>}</nav>}
        <p className="iw-sheet-note">Rândurile sunt cele păstrate la capturare; paginile SEAP se pot schimba. Pentru contracte în asociere, rândul este cota unui furnizor.</p>
      </RecordSection>

      <RecordSection id="selectie" title="Selecția păstrată">
        {clip.kind === "entity" ? <p>Toate înregistrările entității {clipTitle(clip)}, ca instituție și ca firmă, din toți anii{summary.county ? ` · ${String(summary.county)}` : ""}.</p>
          : clip.kind === "person" ? <p>Înregistrările firmelor pe care {clipTitle(clip)} le reprezintă, după registrul ONRC.</p>
          : spec ? <><p className="iw-sheet-question">{questionTitle(spec)}</p><ScopeConditions scope={{ spec, options }} /></>
          : <p>{clip.kind === "contract" ? "Toate cotele furnizorilor din acest contract." : clip.kind === "da" ? "Această achiziție directă." : clip.kind === "notice" ? `Toate contractele anunțului${summary.noticeNo ? ` ${String(summary.noticeNo)}` : ""}.` : clip.kind === "monitoring" ? "Înregistrările afectate de actualizare, exact cum au fost observate." : "Înregistrările selecției salvate."}</p>}
        <p className="iw-sheet-note">Selecția exactă, metodologia și rezultatul (JSON) sunt în exportul dosarului, la captures/{capture.id}/metadata.json. <a href={`/api/anchete/${id}/export?format=zip`} download>Descarcă dosarul întreg · ZIP</a></p>
      </RecordSection>
    </article>
  </div>;
}
