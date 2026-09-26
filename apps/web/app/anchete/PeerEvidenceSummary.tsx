import { formatExactDecimal, formatInt } from "@/lib/format";
import type { BoundPeerEvidence } from "@/lib/peers-evidence";
import { peerPeriodLabel, peerDomainLabel } from "@/lib/peers-shared";
import type { PeerPopulation } from "@/lib/peers-shared";

function PopulationSource({ population }: { population: PeerPopulation }) {
  return <div className="iw-muted">
    {population.unitName} · {population.referenceDate} · <a href={population.sourceUrl} target="_blank" rel="noreferrer">Sursa populației, rândul {formatInt(population.sourceRow)}</a>
  </div>;
}

/** Frozen server context; no live cohort query or substituted present-day totals. */
export default function PeerEvidenceSummary({ context }: { context: unknown }) {
  if (!context || typeof context !== "object" || !("focal" in context) || !("cohort" in context) || !("filters" in context)) return null;
  const peer = context as BoundPeerEvidence["context"];
  const { focal, cohort, filters } = peer;
  if (!focal?.entity || !cohort || !filters) return null;
  const channel = filters.dataset === "da" ? "achiziții directe" : filters.dataset === "contracts" ? "contracte atribuite" : "achiziții directe și contracte atribuite";
  const populationMethod = filters.method === "population", manualMethod = filters.method === "manual";
  const populationColumns = populationMethod || manualMethod;
  const observed = cohort.observedMemberCount ?? cohort.count;
  return <div className="iw-peer-summary">
    <p>{peer.description}</p>
    <p className="iw-muted">{peerPeriodLabel(filters.year)} · {peerDomainLabel(filters.cpv)} · {channel} · {filters.county ? `${populationMethod ? "teritoriul administrațiilor" : "sediul celorlalți membri"}: ${filters.county}` : "toate județele"}.
      {populationMethod ? " Membrii au fost selectați după apropierea populației, independent de numărul achizițiilor." : manualMethod ? " Membrii au fost aleși manual." : ` Activitate: între ${formatInt(cohort.minimumRecords)} și ${formatInt(cohort.maximumRecords)} înregistrări eligibile per membru.`}
    </p>
    {focal.population && <p>Populația comunității analizate: <strong>{formatInt(focal.population.value)} locuitori</strong>. <a href={focal.population.sourceUrl} target="_blank" rel="noreferrer">Sursa: recensământ, {focal.population.referenceDate}, rândul {formatInt(focal.population.sourceRow)}</a>.</p>}
    <div className="iw-source-table" role="region" aria-label="Comparația păstrată" tabIndex={0}><table className="rank"><thead><tr><th>Reper păstrat</th><th className="num">Valoare totală · lei</th><th className="num">Media pe înregistrare · lei</th></tr></thead><tbody>
      <tr><td>{focal.entity.name}<div className="iw-muted">Entitatea analizată · {formatInt(focal.recordCount)} înregistrări</div></td><td className="num">{focal.recordCount ? formatExactDecimal(focal.totalExact) : "Fără date eligibile"}</td><td className="num">{focal.recordCount ? formatExactDecimal(focal.meanRounded) : "—"}</td></tr>
      {cohort.enoughPeers && <tr><td>Mediana celor {formatInt(observed)} alți membri cu date<div className="iw-muted">Entitatea analizată și membrii fără înregistrări sunt excluși</div></td><td className="num">{cohort.medianTotalExact === null ? "Indisponibilă" : formatExactDecimal(cohort.medianTotalExact)}</td><td className="num">{cohort.medianMeanRounded === null ? "Indisponibilă" : formatExactDecimal(cohort.medianMeanRounded)}</td></tr>}
    </tbody></table></div>
    {!cohort.enoughPeers && <p className="iw-caution">{formatInt(observed)} alți membri cu înregistrări eligibile: grup prea mic pentru interpretare comparativă. Sunt necesari cel puțin cinci.</p>}
    {observed < cohort.count && <p className="iw-caution">{formatInt(cohort.count - observed)} {cohort.count - observed === 1 ? "membru fără înregistrări eligibile" : "membri fără înregistrări eligibile"}. Lipsa datelor în această selecție nu înseamnă cheltuieli zero.</p>}
    <p className="iw-muted">Valori înregistrate, nu plăți. Media este rotunjită la doi zecimali și nu reprezintă un preț unitar comparabil. Diferențele nu stabilesc o neregulă.</p>
    {peer.members?.length > 0 && <details><summary>{peer.selectionKind === "comparison" ? `Cei ${formatInt(peer.members.length)} alți membri păstrați` : "Membrul ale cărui surse sunt păstrate"}</summary><div className="iw-source-table" role="region" aria-label="Membrii păstrați" tabIndex={0}><table className="rank"><thead><tr><th>Membru</th>{populationColumns && <th className="num">Populație · diferență</th>}<th className="num">Înregistrări eligibile</th><th className="num">Valoare totală · lei</th></tr></thead><tbody>{peer.members.map(member => <tr key={member.entity.id}>
      <td>{member.entity.name}<div className="iw-muted">{member.entity.county ?? "Județ necunoscut"}{member.selectionReason === "manual" ? " · Ales manual" : member.selectionReason === "population" ? " · Populație apropiată" : ""}</div>{member.population && <PopulationSource population={member.population} />}</td>
      {populationColumns && <td className="num">{member.population ? <>{formatInt(member.population.value)}<div className="iw-muted">{member.population.differencePercent === null ? "Diferență indisponibilă" : `${member.population.differencePercent > 0 ? "+" : ""}${member.population.differencePercent.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`}</div></> : "Populație neidentificată"}</td>}
      <td className="num">{formatInt(member.recordCount)}</td><td className="num">{member.recordCount ? formatExactDecimal(member.totalExact) : "Fără date eligibile"}</td>
    </tr>)}</tbody></table></div>{filters.populationVersion && <p className="iw-muted">Versiunea sursei de populație păstrate: {filters.populationVersion}.</p>}</details>}
  </div>;
}
