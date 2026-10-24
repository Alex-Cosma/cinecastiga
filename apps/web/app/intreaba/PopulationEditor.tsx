"use client";
import { useEffect, useId, useState } from "react";
import type { EntityHit } from "@/lib/search";
import { COUNTIES } from "@/lib/counties";
import { validatePopulation, type PopulationCondition, type QueryPopulation } from "@/lib/ask/population";
import Term from "@/components/Term";
import { countWords } from "@/lib/ask/answer-text";
import "./query-recipes.css";

const fields = { date:"Data achiziției", value:"Valoarea pe câștigător (lei)", authority:"Instituții", supplier:"Firme", cpv:"Coduri CPV", county:"Județul instituției" };
const OPS = { gte:"Cel puțin / începând cu", lte:"Cel mult / până la", in:"Include oricare din listă", not_in:"Exclude toate din listă" } as const;
/** A field and the rules a question offers for it ("⋯ › Selecție avansată": lib/ask/filters/blocks.ts advancedFields). */
export interface EditorField { field: PopulationCondition["field"]; ops: readonly PopulationCondition["op"][] }
const ALL_FIELDS: readonly EditorField[] = [
  { field:"value", ops:["gte", "lte"] }, { field:"date", ops:["gte", "lte"] }, { field:"authority", ops:["in", "not_in"] },
  { field:"supplier", ops:["in", "not_in"] }, { field:"cpv", ops:["in", "not_in"] }, { field:"county", ops:["in", "not_in"] },
];
/** A new condition on a field, with its first offered rule. */
const newCondition = (field:PopulationCondition["field"], op:PopulationCondition["op"]): PopulationCondition =>
  field === "date" || field === "value" ? { field, op:op as "gte" | "lte", value:"" } : { field, op:op as "in" | "not_in", values:[] };
const isBlank = (c:PopulationCondition) => "value" in c ? c.value.trim() === "" : c.values.length === 0;

function EntitySet({ condition, onChange, disabled }: { condition:Extract<PopulationCondition, { values:string[] }>; onChange:(value:PopulationCondition)=>void; disabled:boolean }) {
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setHits([]); setError("");
    if (search.trim().length < 2) { setBusy(false); return () => controller.abort(); }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`, { signal:controller.signal });
        if (!response.ok) throw new Error("Căutarea nu este disponibilă. Încearcă din nou.");
        const data = await response.json() as { hits:EntityHit[] };
        if (!controller.signal.aborted) setHits(data.hits.filter(h => h.roles.includes(condition.field)));
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Căutare indisponibilă."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [search, condition.field]);
  return <div className="qp-entity-set"><div className="qp-selected">{condition.values.map((id, index) => <span key={id}><a href={`/entitati/${id}`} target="_blank" rel="noreferrer">{condition.labels?.[index] ?? `Entitatea #${id}`}</a><button type="button" disabled={disabled} aria-label={`Scoate ${condition.labels?.[index] ?? id}`} onClick={() => onChange({ ...condition, values:condition.values.filter(v => v !== id), labels:condition.values.filter(v => v !== id).map(v => condition.labels?.[condition.values.indexOf(v)] ?? `Entitatea #${v}`) })}>Scoate</button></span>)}</div><label>Caută și adaugă {condition.field === "authority" ? "instituții" : "firme"}<input type="search" autoComplete="off" placeholder="Nume sau CUI" value={search} disabled={disabled || condition.values.length >= 100} onChange={e => { setSearch(e.target.value); setHits([]); setBusy(e.target.value.trim().length >= 2); }} /></label>{search.trim().length >= 2 && <div className="qp-entity-results" aria-busy={busy}><p role="status">{busy ? "Caut în date…" : error || (!hits.length ? "Nicio potrivire. Încearcă numele complet sau CUI-ul." : "Selectează o entitate pentru a o adăuga.")}</p>{!busy && hits.map(hit => <button key={hit.id} type="button" disabled={disabled || condition.values.includes(String(hit.id))} onClick={() => { onChange({ ...condition, values:[...condition.values, String(hit.id)], labels:[...condition.values.map((v, i) => condition.labels?.[i] ?? `Entitatea #${v}`), hit.name] }); setSearch(""); }}><strong>{hit.name}</strong><small>{[hit.cui && `CUI ${hit.cui}`, hit.county].filter(Boolean).join(" · ")}</small></button>)}</div>}</div>;
}

/**
 * The precise selection. `fields` are the fields and rules a question offers
 * (default: all six, each with both rules); a condition already there on
 * another field or rule (an old link's) keeps showing its own, so it can be
 * read and removed, but no new one is written with it.
 */
export default function PopulationEditor({ value, onChange, disabled = false, embedded = false, fields: offered = ALL_FIELDS }: { value?:QueryPopulation | undefined; onChange:(value:QueryPopulation | undefined)=>void; disabled?:boolean; embedded?:boolean; fields?: readonly EditorField[] }) {
  const id = useId();
  const first = offered[0] ?? ALL_FIELDS[0]!;
  const blank = (): PopulationCondition => newCondition(first.field, first.ops[0]!);
  const opsOf = (field:PopulationCondition["field"]) => offered.find(f => f.field === field)?.ops ?? [];
  const [open, setOpen] = useState(Boolean(value));
  const count = value?.groups.reduce((n, g) => n + g.conditions.length, 0) ?? 0;
  // A condition still empty is unfinished, not wrong: judge only what has been filled in.
  const filled = value && { ...value, groups:value.groups.map(g => ({ ...g, conditions:g.conditions.filter(c => !isBlank(c)) })).filter(g => g.conditions.length > 0) };
  const validation = filled && filled.groups.length > 0 ? validatePopulation(filled) : null;
  function updateGroup(index:number, next:QueryPopulation["groups"][number]) { if (value) onChange({ ...value, groups:value.groups.map((g, i) => i === index ? next : g) }); }
  return <section className="qp-editor" aria-label={embedded ? "Selecție avansată" : "Selecție precisă"}>{embedded ? <h3 className="qp-section-title">Condiții <Term id="selectie-precisa" tip /></h3> : <button className="qp-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}><span>Selecție precisă{count > 0 ? ` · ${countWords(count, "condiție", "condiții")}` : ""}</span><span>{open ? "Restrânge" : "Date, valori și grupuri"}</span></button>}{(embedded || open) && <div id={id} className="qp-body">{!value ? <div className="qp-start"><button type="button" disabled={disabled} onClick={() => onChange({ operator:"and", groups:[{ operator:"and", conditions:[blank()] }] })}>+ Prima condiție</button></div> : <><label className="qp-operator">Între grupuri<select value={value.operator} disabled={disabled} onChange={e => onChange({ ...value, operator:e.target.value as "and" | "or" })}><option value="and">ȘI — trebuie îndeplinite toate grupurile</option><option value="or">SAU — ajunge oricare dintre grupuri</option></select></label>{value.groups.map((group, gi) => <fieldset key={gi} className="qp-group" disabled={disabled}><legend>Grupul {gi + 1}</legend><div className="qp-group-head"><label>În acest grup<select value={group.operator} onChange={e => updateGroup(gi, { ...group, operator:e.target.value as "and" | "or" })}><option value="and">Toate condițiile (ȘI)</option><option value="or">Oricare condiție (SAU)</option></select></label><button type="button" onClick={() => { const groups = value.groups.filter((_, i) => i !== gi); onChange(groups.length ? { ...value, groups } : undefined); }}>Scoate grupul</button></div>{group.conditions.map((condition, ci) => {
      const update = (next:PopulationCondition) => updateGroup(gi, { ...group, conditions:group.conditions.map((c, i) => i === ci ? next : c) });
      return <div className="qp-condition" key={ci}><div className="qp-condition-main"><label>Condiția {ci + 1}<select value={condition.field} onChange={e => { const field = e.target.value as PopulationCondition["field"]; update(newCondition(field, opsOf(field)[0] ?? (field === "date" || field === "value" ? "gte" : "in"))); }}>{(Object.keys(fields) as PopulationCondition["field"][]).filter(field => field === condition.field || opsOf(field).length).map(field => <option key={field} value={field}>{fields[field]}</option>)}</select></label><label>Regulă<select value={condition.op} onChange={e => update({ ...condition, op:e.target.value } as PopulationCondition)}>{(("value" in condition ? ["gte", "lte"] : ["in", "not_in"]) as PopulationCondition["op"][]).filter(op => op === condition.op || opsOf(condition.field).includes(op)).map(op => <option key={op} value={op}>{OPS[op]}</option>)}</select></label><button type="button" className="qp-remove" aria-label={`Scoate condiția ${ci + 1} din grupul ${gi + 1}`} onClick={() => { const conditions = group.conditions.filter((_, i) => i !== ci); if (conditions.length) updateGroup(gi, { ...group, conditions }); else { const groups = value.groups.filter((_, i) => i !== gi); onChange(groups.length ? { ...value, groups } : undefined); } }}>Scoate</button></div>{"value" in condition ? <label>{condition.field === "date" ? "Data calendaristică (inclusiv)" : "Valoarea în lei, cu punct pentru zecimale"}<input type={condition.field === "date" ? "date" : "text"} inputMode={condition.field === "value" ? "decimal" : undefined} value={condition.value} onChange={e => update({ ...condition, value:e.target.value })} placeholder={condition.field === "value" ? "50000.00" : undefined} /></label> : condition.field === "authority" || condition.field === "supplier" ? <EntitySet condition={condition} onChange={update} disabled={disabled} /> : condition.field === "county" ? <label>Județe (se pot alege mai multe)<select multiple value={condition.values} size={5} onChange={e => update({ ...condition, values:Array.from(e.target.selectedOptions, option => option.value) })}>{COUNTIES.map(county => <option key={county} value={county}>{county}</option>)}</select></label> : <label>Coduri CPV, separate prin virgulă<input value={condition.values.join(", ")} placeholder="45, 7731" onChange={e => update({ ...condition, values:e.target.value.split(",").map(v => v.trim()) })} /><small>Prefixe de 2–8 cifre, fără cifra de control. Un prefix include toate codurile sale.</small></label>}</div>;
    })}<button type="button" disabled={disabled || group.conditions.length >= 8 || count >= 32} onClick={() => updateGroup(gi, { ...group, conditions:[...group.conditions, blank()] })}>+ Condiție în grup</button></fieldset>)}<div className="qp-actions"><button type="button" disabled={disabled || value.groups.length >= 8 || count >= 32} onClick={() => onChange({ ...value, groups:[...value.groups, { operator:"and", conditions:[blank()] }] })}>+ Grup</button><button type="button" disabled={disabled} onClick={() => onChange(undefined)}>Scoate toate condițiile</button></div>{validation && "error" in validation && <p role="status" className="qp-error">{validation.error}</p>}</>}</div>}</section>;
}
