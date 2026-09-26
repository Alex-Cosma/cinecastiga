import type { MonitoringScope } from "@/lib/monitoring-shared";
import { isHistoricalProfile } from "@/lib/ask/population";
import type { PopulationCondition } from "@/lib/ask/population";
import { formatExactDecimal } from "@/lib/format";
const kind = { comuna: "Comune", oras_municipiu: "Orașe și municipii", consiliu_judetean: "Consilii județene", spital: "Spitale", scoala: "Școli și licee" };
const names = { authority: "Instituția", supplier: "Firma", cpv: "Codul CPV", county: "Județul" };
function condition(c: PopulationCondition) {
  if ("value" in c) return c.field === "value" ? `Valoare ${c.op === "gte" ? "de cel puțin" : "de cel mult"} ${formatExactDecimal(c.value)} lei` : `Data achiziției ${c.op === "gte" ? "începând cu" : "până la"} ${c.value}`;
  return `${names[c.field]} ${c.op === "not_in" ? "nu este în" : "este în"}: ${c.values.map((value, i) => c.labels?.[i] && c.labels[i] !== value ? `${c.labels[i]} (${value})` : value).join(", ")}`;
}
export default function ScopeConditions({ scope }: { scope: MonitoringScope }) {
  const { spec, options } = scope, f = spec.filters, subgroup = options.scope;
  const items: { label: string; value: string }[] = [];
  if (f.authorityId || f.authorityName) items.push({ label: "Instituție", value: `${f.authorityName ?? "Identificator"}${f.authorityId ? ` · ${f.authorityId}` : ""}` });
  if (f.supplierId || f.supplierName) items.push({ label: "Firmă", value: `${f.supplierName ?? "Identificator"}${f.supplierId ? ` · ${f.supplierId}` : ""}` });
  if (f.compareWithId || f.compareWith) items.push({ label: "Comparație cu", value: `${f.compareWith ?? "Identificator"}${f.compareWithId ? ` · ${f.compareWithId}` : ""}` });
  if (f.cpvTerm) items.push({ label: "Domeniu / CPV", value: f.cpvTerm });
  if (f.county) items.push({ label: "Județ", value: f.county });
  if (f.uatSiruta || f.uatName) items.push({ label: "Localitate", value: `${f.uatName ?? "Localitate"} · SIRUTA ${f.uatSiruta ?? "nespecificat"}` });
  if (f.authorityKind) items.push({ label: "Tip instituție", value: kind[f.authorityKind] });
  if (f.adminName || f.adminPersonKey) items.push({ label: "Reprezentant legal", value: f.adminName ?? f.adminPersonKey! });
  items.push({ label: "Perioada întrebării", value: f.yearFrom || f.yearTo ? `${f.yearFrom ? `${f.yearFrom}${f.monthFrom ? `-${String(f.monthFrom).padStart(2, "0")}` : ""}` : "De la începutul datelor"} — ${f.yearTo ? `${f.yearTo}${f.monthTo ? `-${String(f.monthTo).padStart(2, "0")}` : ""}` : "fără limită finală"}` : "Fără limite de an în filtrele de pornire" });
  items.push({ label: "Sursele întrebării", value: isHistoricalProfile(spec) ? "Profiluri istorice: achiziții directe acceptate, cu valoare pozitivă de cel mult 2.000.000 lei" : spec.dataset === "da" ? "Achiziții directe" : spec.dataset === "contracts" ? "Contracte prin proceduri" : "Achiziții directe și contracte prin proceduri" });
  if (f.singleBidder) items.push({ label: "Concurență", value: "Doar proceduri cu un singur ofertant confirmat" });
  if (f.minEmployees !== undefined || f.maxEmployees !== undefined) items.push({ label: "Angajați", value: `${f.minEmployees ?? 0} — ${f.maxEmployees ?? "fără limită maximă"}` });
  if (spec.minimumRecords) items.push({ label: "Populație minimă", value: `${spec.minimumRecords.role === "authority" ? "Instituții" : "Firme"} cu cel puțin ${spec.minimumRecords.count} înregistrări în selecție` });
  const selection: { label: string; value: string }[] = [];
  if (options.stream) selection.push({ label: "Tip de achiziție", value: options.stream === "da" ? "Doar achiziții directe" : "Doar contracte prin proceduri" });
  if (options.search) selection.push({ label: "Căutare în surse", value: options.search });
  if (options.state) selection.push({ label: "Stare", value: options.state });
  if (subgroup?.entityIds) selection.push({ label: `Doar ${subgroup.role === "supplier" ? "firmele" : "instituțiile"}`, value: subgroup.entityIds.join(", ") });
  if (subgroup?.excludeEntityIds) selection.push({ label: `Exclude ${subgroup.role === "supplier" ? "firmele" : "instituțiile"}`, value: subgroup.excludeEntityIds.join(", ") });
  if (subgroup?.county) selection.push({ label: "Județ din rezultat", value: subgroup.county });
  if (subgroup?.cpvPrefixes) selection.push({ label: "Doar ramurile CPV", value: subgroup.cpvPrefixes.join(", ") });
  if (subgroup?.excludeCpvPrefixes) selection.push({ label: "Exclude ramurile CPV", value: subgroup.excludeCpvPrefixes.join(", ") });
  if (subgroup?.years) selection.push({ label: "Ani selectați din rezultat", value: subgroup.years.join(", ") });
  if (subgroup?.riskBucket) selection.push({ label: "Interval CRI", value: `${subgroup.riskBucket.from} — ${subgroup.riskBucket.to}` });
  const list = (rows: { label: string; value: string }[]) => <dl className="mon-scope-conditions">{rows.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
  return <>{list(items)}{spec.population && <div className="mon-population"><p>În plus față de filtrele întrebării, se aplică următoarele condiții:</p><strong>{spec.population.operator === "and" ? "Trebuie îndeplinite toate grupurile de mai jos:" : "Este suficient să fie îndeplinit unul dintre grupurile de mai jos:"}</strong>{spec.population.groups.map((group, i) => <div key={i}><span>Grupul {i + 1} · {group.operator === "and" ? "toate condițiile" : "oricare condiție"}</span><ul>{group.conditions.map((item, index) => <li key={index}>{condition(item)}</li>)}</ul></div>)}</div>}{selection.length > 0 && <div className="mon-selection"><p><strong>Din aceste rezultate, urmărim doar selecția de mai jos.</strong> Toate aceste restricții se aplică împreună, peste condițiile întrebării.</p>{list(selection)}</div>}</>;
}
