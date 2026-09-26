import { formatInt } from "../../lib/format";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sourceNames: Record<string, string> = { da: "Achiziții directe", contracts: "Contracte din proceduri", ted: "Publicații TED" };
function date(value: unknown) {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "necunoscută";
}
export default function RefreshCoverage({ checkpoint, title }: { checkpoint: Record<string, unknown> | null | undefined; title?: string }) {
  const coverage = checkpoint && object(checkpoint.sourceCoverage) ? checkpoint.sourceCoverage : {};
  const observations = Array.isArray(coverage.observations) ? coverage.observations.filter(object).filter(row => sourceNames[String(row.dataset)]) : [];
  const collections = Array.isArray(coverage.collections) ? coverage.collections.filter(object) : [];
  return <section>{title && <h3>{title}</h3>}{!observations.length ? <p className="mon-muted">Vechimea surselor nu este documentată pentru această versiune.</p> : <><div className="mon-table-wrap" role="region" aria-label={title ? `Vechimea surselor · ${title}` : "Vechimea surselor"} tabIndex={0}><table className="mon-diff"><thead><tr><th>Sursa</th><th>Date observate în sursă</th><th>Ultima colectare reușită consemnată</th></tr></thead><tbody>{observations.map(row => {
    const dataset = String(row.dataset), observation = object(row.observation) ? row.observation : {};
    const matching = collections.filter(item => dataset === "da" ? String(item.source).startsWith("elicitatie:da") : dataset === "contracts" ? item.source === "elicitatie:awards" : String(item.source).startsWith("ted:"));
    const success = matching.map(item => item.lastSucceededAt).filter((item): item is string => typeof item === "string").sort().at(-1);
    const failed = matching.some(item => item.latestStatus === "failed");
    return <tr key={dataset}><th scope="row">{sourceNames[dataset]}<div className="mon-muted">{typeof observation.available === "string" ? `${formatInt(observation.available)} înregistrări disponibile` : "Număr de înregistrări necunoscut"}</div></th><td>{date(observation.date_from)} – {date(observation.date_to)}<div className="mon-muted">Inventar calculat la {date(row.calculatedAt)}.</div></td><td>{date(success)}{failed && <div className="mon-caution">Cel puțin o sursă are ultima colectare nereușită.</div>}</td></tr>;
  })}</tbody></table></div><p className="mon-muted">Intervalele descriu datele existente în această versiune. Ultima colectare poate acoperi doar o parte a sursei; nu dovedește că inventarul este complet sau actualizat până astăzi.</p></>}</section>;
}
