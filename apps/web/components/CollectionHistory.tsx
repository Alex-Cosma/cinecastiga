import { coverageDate, type Coverage } from "../lib/coverage";
import { collectionRecords } from "../lib/collection-record";
import { formatInt } from "../lib/format";

const IMPORT_LABELS: Record<string, string> = {
  "elicitatie:das": "SEAP · achiziții directe", "elicitatie:awards": "SEAP · atribuiri",
  "ted:can-standard": "TED · eForms", "ted:fforms": "TED · formulare istorice",
};
// "running" only says the import never recorded its end; it may have been interrupted.
const STATUS: Record<string, string> = { completed: "finalizat", failed: "eșuat", running: "neîncheiat" };
const STREAM_LABELS: Record<string, string> = {
  da: "SEAP · achiziții directe", awards: "SEAP · atribuiri și contracte", ted: "TED · anunțuri de atribuire",
};

function ImportRun({ run, label }: { run: Coverage["collections"][number]; label?: string }) {
  return <div className="coverage-run">
    <h4>{IMPORT_LABELS[run.source] ?? run.source}</h4>
    {label && <p className="note">{label}</p>}
    <p>Ultimul import reușit: <strong>{coverageDate(run.last_success)}</strong>. Ultimul import început: {coverageDate(run.latest_started)}, {STATUS[run.latest_status] ?? "stare necunoscută"}.</p>
    {/* Audit F17: the newest window a finished import covered says how recent the data is; the last
        started import may be an old backfill window. */}
    {run.completed_window_to === null
      ? <p className="note">Niciun import finalizat cu fereastră înregistrată.</p>
      : <p className="note">Cea mai nouă fereastră a unui import finalizat: {coverageDate(run.completed_window_from)} — {coverageDate(run.completed_window_to)}. Înregistrări preluate în acest import: {run.completed_fetched === null ? "necunoscut" : formatInt(run.completed_fetched)}; raportate de sursă: {run.completed_reported === null ? "necunoscut" : formatInt(run.completed_reported)}. {run.completed_deviation === null ? "Diferența nu a putut fi verificată." : `Diferență raportate − preluate: ${formatInt(run.completed_deviation)}.`}</p>}
  </div>;
}

/**
 * When each source was collected (audit F17): the continuous collector for the sources it has
 * collected, the windowed imports for the others (TED until its collector stream is enabled).
 */
export default function CollectionHistory({ collector, collections }: Pick<Coverage, "collector" | "collections">) {
  const { streams, currentImports, earlierImports } = collectionRecords(collector, collections);
  const batch = collector.batch;
  return <>
    {streams.map(s => <div className="coverage-run" key={s.stream}>
      <h4>{STREAM_LABELS[s.stream] ?? s.stream}</h4>
      <p>Colectare continuă. Ultima colectare reușită: <strong>{coverageDate(s.lastSuccessAt)}</strong>.</p>
      {batch && s.inBatch && <p className="note">Lotul curent cuprinde publicațiile până la {coverageDate(batch.endDay)}{batch.followLatest ? ", cu avans zilnic" : ""}: {s.open ? "în curs" : "fără sarcini în așteptare"}{s.gaps ? ", cu sarcini amânate sau eșuate" : ""}.</p>}
    </div>)}
    {currentImports.map(run => <ImportRun key={run.source} run={run} label="Importuri pe ferestre. Colectarea continuă nu a colectat încă această sursă." />)}
    {!streams.length && !currentImports.length && <p>Nu există un jurnal de colectare pentru sursele din acest instantaneu.</p>}
    {earlierImports.length > 0 && <details><summary>Importuri anterioare pe ferestre</summary>
      <p className="note">Pentru aceste surse, data colectării de mai sus vine din colectarea continuă. Importurile pe ferestre sunt înregistrate separat: data unui import arată doar când a rulat el, pentru fereastra lui.</p>
      {earlierImports.map(run => <ImportRun key={run.source} run={run} />)}
    </details>}
  </>;
}
