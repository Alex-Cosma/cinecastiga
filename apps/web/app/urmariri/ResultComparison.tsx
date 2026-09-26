"use client";
import { useMemo, useState } from "react";
import type { MonitoringRunDetail } from "@/lib/monitoring-shared";
import { formatExactDecimal } from "../../lib/format";
import { FLAG_META } from "../../lib/flags";

const labels: Record<string, string> = {
  stat: "Totalul selecției", rows: "Clasament", series: "Evoluția în timp", counties: "Distribuția pe județe",
  entities: "Entitățile comparate", distribution: "Distribuția riscului", buckets: "Intervalele de risc",
  focal: "Entitatea urmărită", slices: "Domeniile achizițiilor", other: "Celelalte domenii",
  points: "Entitățile din diagramă", density: "Distribuția întregii populații", cells: "Grupele statistice",
  flows: "Relațiile comerciale pe domenii", nodes: "Partenerii comerciali", card: "Profilul entității",
  fact: "Relația comercială verificată", samples: "Exemplele din rezultat", rowsTrend: "Comparația dintre ani", byStream: "Canalele de achiziție",
  value: "Valoare înregistrată", valueA: "Valoare în primul an", valueB: "Valoare în al doilea an",
  count: "Număr de înregistrări", total: "Număr total de rezultate", totalEntities: "Entități comparate",
  population: "Populație de referință", cri: "Indice de risc (CRI)", nFlags: "Număr de semnale", flags: "Semnale active",
  name: "Denumire", county: "Județ", role: "Rol", code: "Cod CPV", categoryCode: "Cod CPV", category: "Domeniu",
  partner: "Partener comercial", year: "An", yearA: "Primul an", yearB: "Al doilea an", yearFirst: "Prima achiziție · an",
  yearLast: "Ultima achiziție · an", date: "Data achiziției", daCode: "Codul achiziției", cpvName: "Domeniul achiziției",
  src: "Canal", verdict: "Există achiziții între cele două entități", authority: "Autoritatea", supplier: "Furnizorul",
  percentile: "Entități cu indice cel mult egal · procent", from: "Limita inferioară", to: "Limita superioară", n: "Entități în interval",
  minLog: "Valoare minimă · scară logaritmică", maxLog: "Valoare maximă · scară logaritmică",
  valueBand: "Grupa valorii", riskBand: "Grupa de risc",
  version: "Versiunea metodologiei", riskVersion: "Versiunea indicatorilor de risc", values: "Interpretarea valorilor",
  contracts: "Valorile contractelor", completeness: "Completitudinea selecției", sources: "Păstrarea surselor",
  risk: "Interpretarea semnalelor", identity: "Identitatea înregistrărilor", discovery: "Momentul observării",
  classification: "Clasificarea schimbărilor", refresh: "Metodologia actualizării datelor", monitoring: "Versiunea monitorizării",
  tedNormalization: "Versiunea prelucrării TED", transactionPopulation: "Definiția selecției de achiziții",
};
const ignored = new Set(["block", "tookMs", "displaySql", "page", "pageSize", "entityId", "partnerId", "nx", "ny"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const name = (key: string) => labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
const channels: Record<string, string> = { da: "Achiziții directe", contracts: "Contracte din proceduri", authority: "Autoritate", supplier: "Furnizor" };
export interface ResultDifference { key: string; context: string; field: string; fieldKey: string; before: unknown; after: unknown }

function identity(value: unknown, index: number): string {
  if (object(value)) {
    if (value.partnerId != null && value.categoryCode != null) return `flow:${value.partnerId}:${value.categoryCode}`;
    if (value.from != null && value.to != null) return `bucket:${value.from}:${value.to}`;
    if (value.valueBand != null && value.riskBand != null) return `cell:${value.valueBand}:${value.riskBand}`;
    for (const key of ["entityId", "code", "year", "county", "src", "daCode", "name"]) if (value[key] != null) return `${key}:${value[key]}`;
  }
  return `position:${index}`;
}
function rowContext(value: unknown, index: number): string {
  if (!object(value)) return `Elementul ${index + 1}`;
  if (value.partner != null) return `${value.partner}${value.category || value.categoryCode ? ` · ${value.category ?? `CPV ${value.categoryCode}`}` : ""}`;
  if (value.name != null) return String(value.name);
  if (value.from != null && value.to != null) return `Indice ${formatResultValue(value.from, "cri")}–${formatResultValue(value.to, "cri")}`;
  if (value.valueBand != null && value.riskBand != null) return `Grupa valorii ${value.valueBand} · grupa de risc ${value.riskBand}`;
  if (value.county != null) return String(value.county);
  if (value.year != null) return `Anul ${value.year}`;
  if (value.src != null) return channels[String(value.src)] ?? String(value.src);
  if (value.daCode != null) return String(value.daCode);
  if (value.code != null) return `CPV ${value.code}`;
  if (value.date != null || value.cpvName != null) return [value.date, value.cpvName].filter(Boolean).join(" · ");
  return `Elementul ${index + 1}`;
}
function indexed(values: unknown[], field: string) {
  const map = new Map<string, { value: unknown; index: number }>();
  values.forEach((original, index) => {
    const value = field === "cells" && Array.isArray(original) ? { valueBand: original[0], riskBand: original[1], count: original[2] } : original;
    const key = identity(value, index); map.set(map.has(key) ? `${key}:occurrence:${index}` : key, { value, index });
  });
  return map;
}

/** Match named rows by identity, so a reordered ranking does not compare different firms. */
export function resultDifferences(before: unknown, after: unknown): ResultDifference[] {
  const differences: ResultDifference[] = [];
  function visit(a: unknown, b: unknown, path: string[], context: string[]) {
    if (Object.is(a, b)) return;
    const key = path.at(-1) ?? "result";
    if (ignored.has(key)) return;
    if (Array.isArray(a) || Array.isArray(b)) {
      const oldValues = Array.isArray(a) ? a : [], newValues = Array.isArray(b) ? b : [];
      if ([...oldValues, ...newValues].every(item => !object(item) && !Array.isArray(item))) {
        if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) differences.push({ key: path.join("/"), context: context.join(" · ") || "Rezultatul întrebării", field: name(key), fieldKey: key, before: a, after: b });
        return;
      }
      const oldRows = indexed(oldValues, key), newRows = indexed(newValues, key);
      for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
        const oldRow = oldRows.get(id), newRow = newRows.get(id), row = newRow ?? oldRow!;
        visit(oldRow?.value, newRow?.value, [...path, id], [...context, name(key), rowContext(row.value, row.index)]);
      }
      return;
    }
    if (object(a) || object(b)) {
      const left = object(a) ? a : {}, right = object(b) ? b : {};
      const nextContext = path.length && !path.at(-1)!.includes(":") ? [...context, name(key)] : context;
      for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) visit(left[field], right[field], [...path, field], nextContext);
      return;
    }
    differences.push({ key: path.join("/"), context: context.join(" · ") || "Rezultatul întrebării", field: name(key), fieldKey: key, before: a, after: b });
  }
  visit(before, after, [], []);
  return differences;
}

/** Expand exponent notation without changing the stored numeric digits. */
function expandedNumber(value: number): string {
  const text = String(value), match = text.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!match) return text;
  const sign = match[1]!, whole = match[2]!, fraction = match[3] ?? "", digits = whole + fraction, point = whole.length + Number(match[4]);
  return sign + (point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`);
}
export function formatResultValue(value: unknown, field: string): string {
  if (value === undefined) return "Nu figura în această versiune";
  if (value === null) return "Necunoscut / indisponibil";
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (Array.isArray(value)) return value.length ? value.map(item => field === "flags" ? FLAG_META[String(item)]?.title ?? String(item) : formatResultValue(item, field)).join("; ") : "Niciunul";
  if (typeof value === "number" || typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const text = typeof value === "number" ? expandedNumber(value) : value;
    if (["year", "yearA", "yearB", "yearFirst", "yearLast", "code", "categoryCode", "daCode"].includes(field)) return text;
    const numeric = formatExactDecimal(text);
    return ["value", "valueA", "valueB", "valueExact", "contractValueFull"].includes(field) ? `${numeric} lei` : field === "percentile" ? `${numeric}%` : numeric;
  }
  return channels[String(value)] ?? String(value);
}

function ChangedValues({ before, after, label }: { before: unknown; after: unknown; label: string }) {
  const differences = useMemo(() => resultDifferences(before, after), [before, after]);
  const [visible, setVisible] = useState(12);
  return <>{differences.length ? <><p className="mon-scroll-hint">Glisează tabelul orizontal pentru a compara toate coloanele →</p><div className="mon-table-wrap" role="region" aria-label={label} tabIndex={0}><table className="mon-diff"><thead><tr><th>Unde în rezultat</th><th>Ce s-a schimbat</th><th>Înainte</th><th>După</th></tr></thead><tbody>{differences.slice(0, visible).map(row => <tr key={row.key}><th scope="row">{row.context}</th><td>{row.field}</td><td>{formatResultValue(row.before, row.fieldKey)}</td><td>{formatResultValue(row.after, row.fieldKey)}</td></tr>)}</tbody></table></div>{visible < differences.length && <><p className="mon-muted" role="status">Sunt afișate {visible} din {differences.length} câmpuri modificate.</p><button type="button" onClick={() => setVisible(count => count + 12)}>Arată următoarele {Math.min(12, differences.length - visible)} modificări</button></>}</> : <p className="mon-muted">Valorile afișate sunt neschimbate. Diferența privește ordinea sau metadatele de prezentare ale rezultatului.</p>}<details className="mon-small-details"><summary>Datele complete ale comparației · detalii tehnice</summary><div className="mon-result-pair"><section><h3>Înainte</h3><pre>{JSON.stringify(before, null, 2)}</pre></section><section><h3>După</h3><pre>{JSON.stringify(after, null, 2)}</pre></section></div></details></>;
}

export default function ResultComparison({ detail }: { detail: MonitoringRunDetail }) {
  return <>{detail.run.resultChanged && <details className="mon-settings" open><summary>Ce s-a schimbat în rezultatul întrebării</summary><p>Comparăm valorile păstrate la cele două verificări. Sumele exacte ale înregistrărilor se verifică în listele de surse.</p><ChangedValues key={`${detail.run.id}-result`} before={detail.previousResult} after={detail.result} label="Rezultatul întrebării, înainte și după" /></details>}{detail.run.methodologyChanged && <details className="mon-settings" open><summary>Ce s-a schimbat în metodologie</summary><p>Aceste diferențe descriu modul de calcul. Ele nu reprezintă, în sine, modificări ale contractelor.</p><ChangedValues key={`${detail.run.id}-methodology`} before={detail.previousMethodology} after={detail.methodology} label="Metodologia, înainte și după" /></details>}</>;
}
