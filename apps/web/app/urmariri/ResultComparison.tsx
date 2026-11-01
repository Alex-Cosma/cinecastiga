"use client";
import { useMemo, useState } from "react";
import { comparableMethodologies, type MonitoringRunDetail } from "../../lib/monitoring-shared";
import { answerCore, KEY_VERSION_NOTES, KEY_VERSIONS } from "../../lib/ask/answer-core";
import { formatExactDecimal } from "../../lib/format";
import { countyName } from "../../lib/counties";
import { countWords } from "../../lib/ask/answer-text";
import { FLAG_META, flagLabel } from "../../lib/flags";
import { TREND_EQUAL_LABEL, TREND_LIST_LABELS } from "../../lib/ask/filters/defs/trend";

const labels: Record<string, string> = {
  stat: "Totalul selecției", rows: "Clasament", series: "Evoluția în timp", counties: "Distribuția pe județe",
  entities: "Entitățile comparate", distribution: "Distribuția riscului", buckets: "Intervalele de risc",
  focal: "Entitatea urmărită", slices: "Domeniile achizițiilor", other: "Celelalte domenii", unknown: "Fără județ cunoscut",
  points: "Entitățile din diagramă", density: "Distribuția întregii populații", cells: "Grupele statistice",
  flows: "Relațiile comerciale pe domenii", nodes: "Partenerii comerciali", card: "Profilul entității",
  fact: "Relația comercială verificată", samples: "Exemplele din rezultat", rowsTrend: "Comparația dintre ani", byStream: "Canalele de achiziție",
  value: "Valoare înregistrată", valueA: "Valoare în primul an", valueB: "Valoare în al doilea an",
  count: "Număr de înregistrări", total: "Număr total de rezultate", totalEntities: "Entități comparate",
  population: "Populație de referință", cri: "Risc (scara 0–1)", score: "Riscul", nFlags: "Număr de tipare", flags: "Semnale active",
  name: "Denumire", county: "Județ", role: "Rol", code: "Cod CPV", categoryCode: "Cod CPV", category: "Domeniu",
  partner: "Partener comercial", year: "An", yearA: "Primul an", yearB: "Al doilea an", yearFirst: "Prima achiziție · an",
  yearLast: "Ultima achiziție · an", date: "Data achiziției", daCode: "Codul achiziției", cpvName: "Ce s-a cumpărat",
  src: "Ce fel de achiziție", verdict: "Există achiziții între cele două entități", authority: "Autoritatea", supplier: "Furnizorul",
  percentile: "Entități cu risc cel mult egal · procent", from: "Limita inferioară", to: "Limita superioară", n: "Entități în interval",
  minLog: "Valoare minimă · scară logaritmică", maxLog: "Valoare maximă · scară logaritmică",
  valueBand: "Grupa valorii", riskBand: "Grupa de risc",
  version: "Versiunea metodologiei", riskVersion: "Versiunea calculului de risc", values: "Interpretarea valorilor",
  contracts: "Valorile contractelor", completeness: "Completitudinea selecției", sources: "Păstrarea surselor",
  risk: "Interpretarea semnalelor", identity: "Identitatea înregistrărilor", discovery: "Momentul observării",
  classification: "Clasificarea schimbărilor", refresh: "Metodologia actualizării datelor", monitoring: "Versiunea monitorizării",
  tedNormalization: "Versiunea prelucrării TED", transactionPopulation: "Definiția selecției de achiziții",
  answer: "Versiunea răspunsului", question: "Calculul întrebării", conditions: "Condiții cu versiune proprie",
  // trend-2 (F2): the chosen group, its months and its totals; a group watch's fixed members.
  list: "Grupa afișată", change: "Felul schimbării", months: "Lunile comparate", mode: "Cum s-au ales lunile",
  composition: "Totalurile grupei", groups: "Grupele", members: "Grupa fixată", frozen: "Membri fixați", frozenAt: "Fixată la",
  // The groups in the trend's vocabulary (defs/trend.ts), as on the answer's buttons.
  ...TREND_LIST_LABELS, equal: TREND_EQUAL_LABEL, eligible: `${TREND_LIST_LABELS.up} de la pragul ales`,
  // distribution-2 (F6a): the group, the criteria ("tipare" since rf-2026.18) and the position among the others.
  status: "Starea comparației", criteria: "Tiparele", nDas: "Achiziții directe acceptate", inGroup: "Entitatea face parte din grup",
  ticks: "Grupul ales", legacy: "Condiții din link", others: "Ceilalți membri", memberIds: "Membrii grupului",
  position: "Poziția în grup", more: "Cu mai multe tipare", same: "Cu tot atâtea tipare", fewer: "Cu mai puține tipare",
  hist: "Membrii după numărul de tipare", k: "Număr de tipare", perCriterion: "Tipar cu tipar",
  // fact_check-2 (F6a): the verdict and what the sums leave out.
  state: "Verdictul", undated: "Contracte fără dată plauzibilă", channels: "Pe canale", frameworks: "Acorduri-cadru (plafoane)",
  ceiling: "Plafon", excluded: "Rânduri în afara sumelor",
  // entity_card-2 (F6c): the podium's places and total, the group at the top of the old index (its level 0–1).
  // entity_card-3 (rf-2026.18): on the risk axis the first profiles by the score, and how many share the best one.
  ranking: "Primii după risc", topCount: "La egalitate pe primul loc",
  podium: "Podiumul", places: "Locurile 1–3", totals: "Totalul selecției", categoryTotals: "Totalul categoriei", ties: "Grupul de la egalitate pe primul loc", level: "Riscul maxim", maxFlags: "Tipare la riscul maxim",
};
/** scatter-2 (F6b): the risk cloud's group, its signals and its list, in the answer's words (its keys say other things elsewhere). */
const scatterLabels: Record<string, string> = {
  scatter: "Norul de risc", version: "Versiunea răspunsului", group: "Grupul", n: "Profiluri în nor", nList: "Profiluri în listă",
  small: "Prea puține pentru un nor", criteria: "Profiluri cu fiecare semnal", chosen: "Cu semnalul ales", list: "Lista",
  rankBy: "Primele după", flag: "Semnalul ales", flags: "Semnale", nFlags: "Număr de tipare", value: "Valoare înregistrată (achiziții directe)",
  // scatter-3 (rf-2026.18): each listed profile's place and score.
  place: "Locul", score: "Risc (%)",
};
const POSITION_LABELS: Readonly<Record<string, string>> = { higher: "Cu risc mai mare", equal: "La egalitate", lower: "Cu risc mai mic" };
/** A group's count is of its entities or counties, not of records (TrendPartTotals.count); a distribution's members are its group. */
const fieldName = (key: string, path: readonly string[]) => key === "count" && path.includes("composition") ? "Număr în grupă"
  : key === "count" && path.includes("ties") ? "Profiluri la riscul maxim"
  // distribution-3: the others with a higher, the same and a lower displayed score (a trend's "equal" is its own group).
  : path.includes("position") && POSITION_LABELS[key] ? POSITION_LABELS[key]!
  : key === "places" && path.includes("ranking") ? "Locurile"
  : key === "members" && path.includes("distribution") ? "Membrii grupului" : key === "others" && path.includes("perCriterion") ? "La ceilalți membri"
    : path[0] === "scatter" && scatterLabels[key] ? scatterLabels[key]! : FLAG_META[key] ? flagLabel(key) : name(key);
const ignored = new Set(["block", "tookMs", "displaySql", "page", "pageSize", "entityId", "partnerId", "nx", "ny", "rowFacts", "noun"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const name = (key: string) => labels[key] ?? KEY_VERSIONS[key]?.label ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
const channels: Record<string, string> = { da: "Achiziții directe", contracts: "Contracte din proceduri", authority: "Autoritate", supplier: "Furnizor" };
export interface ResultDifference { key: string; context: string; field: string; fieldKey: string; before: unknown; after: unknown }
/** Ids to names, from the whole stored answers: a compared core keeps a row's id alone (scatter-2), the reader needs its name. */
export type EntityNames = ReadonlyMap<string, string>;
export function entityNames(...results: unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!object(value)) return;
    if (value.entityId != null && typeof value.name === "string") names.set(String(value.entityId), value.name);
    Object.values(value).forEach(visit);
  };
  results.forEach(visit);
  return names;
}

function identity(value: unknown, index: number): string {
  if (object(value)) {
    if (value.partnerId != null && value.categoryCode != null) return `flow:${value.partnerId}:${value.categoryCode}`;
    if (value.from != null && value.to != null) return `bucket:${value.from}:${value.to}`;
    if (value.valueBand != null && value.riskBand != null) return `cell:${value.valueBand}:${value.riskBand}`;
    for (const key of ["entityId", "code", "year", "county", "src", "daCode", "name"]) if (value[key] != null) return `${key}:${value[key]}`;
  }
  return `position:${index}`;
}
function rowContext(value: unknown, index: number, names?: EntityNames): string {
  if (!object(value)) return `Elementul ${index + 1}`;
  if (value.partner != null) return `${value.partner}${value.category || value.categoryCode ? ` · ${value.category ?? `CPV ${value.categoryCode}`}` : ""}`;
  if (value.name != null) return String(value.name);
  if (value.entityId != null && names?.has(String(value.entityId))) return names.get(String(value.entityId))!;
  // distribution-1's buckets of the old index (0–1), read as the percentages an old link's criMin/criMax select.
  if (value.from != null && value.to != null) return `Risc ${riskShare(value.from)}–${riskShare(value.to)}%`;
  if (value.valueBand != null && value.riskBand != null) return `Grupa valorii ${value.valueBand} · grupa de risc ${value.riskBand}`;
  if (value.county != null) return countyName(String(value.county));
  if (value.year != null) return `Anul ${value.year}`;
  if (value.src != null) return channels[String(value.src)] ?? String(value.src);
  if (value.daCode != null) return String(value.daCode);
  if (value.code != null) return `CPV ${value.code}`;
  if (value.date != null || value.cpvName != null) return [value.date, value.cpvName].filter(Boolean).join(" · ");
  return `Elementul ${index + 1}`;
}
/** A bound of the old index (0–1) as a whole percentage: 0.3 → "30". */
const riskShare = (value: unknown): string => formatExactDecimal(String(Math.round(Number(value) * 1000) / 10), { money: false });
function indexed(values: unknown[], field: string) {
  const map = new Map<string, { value: unknown; index: number }>();
  values.forEach((original, index) => {
    const value = field === "cells" && Array.isArray(original) ? { valueBand: original[0], riskBand: original[1], count: original[2] } : original;
    const key = identity(value, index); map.set(map.has(key) ? `${key}:occurrence:${index}` : key, { value, index });
  });
  return map;
}

/** Match named rows by identity, so a reordered ranking does not compare different firms. */
export function resultDifferences(before: unknown, after: unknown, names?: EntityNames): ResultDifference[] {
  const differences: ResultDifference[] = [];
  function visit(a: unknown, b: unknown, path: string[], context: string[]) {
    if (Object.is(a, b)) return;
    const key = path.at(-1) ?? "result";
    if (ignored.has(key)) return;
    if (Array.isArray(a) || Array.isArray(b)) {
      const oldValues = Array.isArray(a) ? a : [], newValues = Array.isArray(b) ? b : [];
      if ([...oldValues, ...newValues].every(item => !object(item) && !Array.isArray(item))) {
        if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) differences.push({ key: path.join("/"), context: context.join(" · ") || "Rezultatul întrebării", field: fieldName(key, path), fieldKey: key, before: a, after: b });
        return;
      }
      const oldRows = indexed(oldValues, key), newRows = indexed(newValues, key);
      for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
        const oldRow = oldRows.get(id), newRow = newRows.get(id), row = newRow ?? oldRow!;
        visit(oldRow?.value, newRow?.value, [...path, id], [...context, fieldName(key, path), rowContext(row.value, row.index, names)]);
      }
      return;
    }
    if (object(a) || object(b)) {
      const left = object(a) ? a : {}, right = object(b) ? b : {};
      const nextContext = path.length && !path.at(-1)!.includes(":") ? [...context, fieldName(key, path)] : context;
      for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) visit(left[field], right[field], [...path, field], nextContext);
      return;
    }
    differences.push({ key: path.join("/"), context: context.join(" · ") || "Rezultatul întrebării", field: fieldName(key, path), fieldKey: key, before: a, after: b });
  }
  visit(before, after, [], []);
  return differences;
}

/** A signal's name; the retired "Finalizare rapidă" of an older watch too (rf-2026.18, as scatter-shared's scatterFlagLabel). */
const signalName = (code: string): string => code === "da_rapid" ? "Finalizare rapidă" : flagLabel(code);
/** Expand exponent notation without changing the stored numeric digits. */
function expandedNumber(value: number): string {
  const text = String(value), match = text.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!match) return text;
  const sign = match[1]!, whole = match[2]!, fraction = match[3] ?? "", digits = whole + fraction, point = whole.length + Number(match[4]);
  return sign + (point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`);
}
export function formatResultValue(value: unknown, field: string): string {
  // scatter-2: the strip's choices in its own words ("Tot grupul" is no signal chosen).
  if (field === "flag" && value !== undefined) return value === null ? "Tot grupul" : signalName(String(value));
  // scatter-3 orders "risk" by the score; a scatter-2's "risk" was its criteria, a risk order too.
  if (field === "rankBy" && (value === "risk" || value === "value")) return value === "risk" ? "Risc" : "Valoare";
  if (value === undefined) return "Nu figura în această versiune";
  if (value === null) return "Necunoscut / indisponibil";
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (Array.isArray(value)) return value.length ? value.map(item => field === "flags" ? flagLabel(String(item)) : formatResultValue(item, field)).join("; ") : "Niciunul";
  if (typeof value === "number" || typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const text = typeof value === "number" ? expandedNumber(value) : value;
    if (["year", "yearA", "yearB", "yearFirst", "yearLast", "code", "categoryCode", "daCode"].includes(field)) return text;
    const money = ["value", "valueA", "valueB", "valueExact", "contractValueFull"].includes(field);
    const numeric = formatExactDecimal(text, { money });
    return money ? `${numeric} lei` : field === "percentile" || field === "score" ? `${numeric}%` : numeric;
  }
  return channels[String(value)] ?? String(value);
}

function ChangedValues({ before, after, label, names }: { before: unknown; after: unknown; label: string; names?: EntityNames }) {
  const differences = useMemo(() => resultDifferences(before, after, names), [before, after, names]);
  const [visible, setVisible] = useState(12);
  return <>{differences.length ? <><div className="mon-table-wrap" role="region" aria-label={label} tabIndex={0}><table className="mon-diff mon-stack mon-stack-pair"><thead><tr><th>Unde în rezultat</th><th>Ce s-a schimbat</th><th>Înainte</th><th>După</th></tr></thead><tbody>{differences.slice(0, visible).map(row => <tr key={row.key}><th scope="row">{row.context}</th><td data-label="Ce s-a schimbat">{row.field}</td><td data-label="Înainte">{formatResultValue(row.before, row.fieldKey)}</td><td data-label="După">{formatResultValue(row.after, row.fieldKey)}</td></tr>)}</tbody></table></div>{visible < differences.length && <><p className="mon-muted" role="status">Sunt afișate {visible} din {countWords(differences.length, "câmp modificat", "câmpuri modificate")}.</p><button type="button" onClick={() => setVisible(count => count + 12)}>Arată încă {countWords(Math.min(12, differences.length - visible), "modificare", "modificări")}</button></>}</> : <p className="mon-muted">Valorile afișate sunt neschimbate. Diferența privește ordinea sau metadatele de prezentare ale rezultatului.</p>}<details className="mon-small-details"><summary>Datele complete ale comparației · detalii tehnice</summary><div className="mon-result-pair"><section><h3>Înainte</h3><pre>{JSON.stringify(before, null, 2)}</pre></section><section><h3>După</h3><pre>{JSON.stringify(after, null, 2)}</pre></section></div></details></>;
}

/** The new shape of an answer in words (the owner's terse copy): never the engine's version slug. */
export const RESHAPED_WORDS: Readonly<Record<string, string>> = {
  "distribution-2": "criteriile față de un grup ales",
  "fact_check-2": "verdict în trei forme, cu profilul relației",
  "trend-2": "grupele schimbării",
  "entity_card-2": "podiumul sau grupul de la egalitate pe primul loc",
  "scatter-2": "semnale pe grup și lista cu locuri",
  // rf-2026.18: the risk score over 100 replaces the index (the answers' -3 versions).
  "distribution-3": "riscul față de un grup ales",
  "entity_card-3": "primii după risc",
  "scatter-3": "riscul în procente și lista cu locuri",
  "compare-2": "profilul de risc al fiecăruia, în procente",
};

/**
 * The answer's version moved between the two checks (distribution-1 → distribution-2,
 * trend-1 → trend-2): the two results have another shape, so a field-by-field list
 * would be a false list of changes (plan §4.11). Null when the version is the same.
 */
export function reshapedAnswer(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { from: string; to: string } | null {
  const question = (m: Record<string, unknown> | null) => (m?.answer as { question?: unknown } | undefined)?.question;
  const from = question(before), to = question(after);
  return typeof from === "string" && typeof to === "string" && from !== to ? { from, to } : null;
}

export default function ResultComparison({ detail }: { detail: MonitoringRunDetail }) {
  // What the check compared (plan §2.8): the core of each answer, and the methodologies with their answer versions read alike.
  const block = detail.watch.spec.block;
  const [previousMethodology, methodology] = useMemo(() => comparableMethodologies(detail.previousMethodology, detail.methodology, block), [detail, block]);
  const reshaped = reshapedAnswer(previousMethodology, methodology);
  // The compared cores keep a row's id; its name comes from the stored answers (the newer spelling wins).
  const names = useMemo(() => entityNames(detail.previousResult, detail.result), [detail]);
  // What a key version bumped between the two checks changed, in words (KEY_VERSION_NOTES).
  const notes = useMemo(() => {
    const conditions = (m: Record<string, unknown> | null) => ((m?.answer as { conditions?: Record<string, string> } | undefined)?.conditions ?? {});
    const before = conditions(previousMethodology), after = conditions(methodology);
    return Object.entries(after).filter(([id, version]) => before[id] !== version).map(([, version]) => KEY_VERSION_NOTES[version]).filter((note): note is string => Boolean(note));
  }, [previousMethodology, methodology]);
  return <>{detail.run.resultChanged && <details className="mon-settings" open><summary>Ce s-a schimbat în rezultatul întrebării</summary>{reshaped
    ? <p>Răspunsul are acum altă formă{RESHAPED_WORDS[reshaped.to] ? `: ${RESHAPED_WORDS[reshaped.to]}` : ""}, deci nu îl comparăm câmp cu câmp. Rezultatul nou e cel de pe pagina întrebării; ce s-a schimbat în calcul e mai jos.</p>
    : <><p>Comparăm valorile păstrate la cele două verificări. Sumele exacte ale înregistrărilor se verifică în listele de surse.</p><ChangedValues key={`${detail.run.id}-result`} before={answerCore(block, detail.previousResult)} after={answerCore(block, detail.result)} names={names} label="Rezultatul întrebării, înainte și după" /></>}</details>}{detail.run.methodologyChanged && <details className="mon-settings" open><summary>Ce s-a schimbat în metodologie</summary><p>Aceste diferențe descriu modul de calcul. Ele nu reprezintă, în sine, modificări ale contractelor.</p>{notes.map(note => <p key={note}>{note}</p>)}<ChangedValues key={`${detail.run.id}-methodology`} before={previousMethodology} after={methodology} label="Metodologia, înainte și după" /></details>}</>;
}
