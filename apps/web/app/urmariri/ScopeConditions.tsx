import type { MonitoringScope } from "@/lib/monitoring-shared";
import { describeConditions } from "@/lib/ask/filters/describe";
import { TREND_CHANGE_LABELS, trendGroupLabel } from "@/lib/ask/filters/defs/trend";
import { countWords } from "@/lib/ask/answer-text";
import { formatBucharestDay } from "@/lib/format";
export default function ScopeConditions({ scope }: { scope: MonitoringScope }) {
  const { spec, options } = scope, subgroup = options.scope, members = options.members;
  // The question's conditions in the words of describeConditions; the receipt keeps a precise selection group by group.
  const { scope: conditions, receipt } = describeConditions(spec);
  // A group watch follows the members fixed at activation (plan §2.8): "Grupa: Noi față de 2024 · 412 firme fixate la 24.10.2026".
  const [one, many] = members?.role === "county" ? ["județ", "județe"] : members?.role === "authority" ? ["instituție", "instituții"] : ["firmă", "firme"];
  const group = members && Object.hasOwn(TREND_CHANGE_LABELS, members.group)
    ? trendGroupLabel(members.group as keyof typeof TREND_CHANGE_LABELS, spec.filters.yearFrom, spec.filters.yearTo) : members?.group;
  const items = members ? [...conditions, { label: "Grupa", value: `${group}${spec.trend?.firstOnly && spec.filters.yearTo ? ` · prima dată în ${spec.filters.yearTo}` : ""} · ${countWords(members.ids.length, one!, many!)} ${members.ids.length === 1 ? members.role === "county" ? "fixat" : "fixată" : "fixate"} la ${formatBucharestDay(members.frozenAt)}` }] : conditions;
  const selection: { label: string; value: string }[] = [];
  if (options.stream) selection.push({ label: "Ce fel de achiziții", value: options.stream === "da" ? "Doar achizițiile directe" : "Doar contractele din proceduri" });
  if (options.search) selection.push({ label: "Căutare în surse", value: options.search });
  if (options.state) selection.push({ label: "Stare", value: options.state });
  if (subgroup?.entityIds) selection.push({ label: `Doar ${subgroup.role === "supplier" ? "firmele" : "instituțiile"}`, value: subgroup.entityIds.join(", ") });
  if (subgroup?.excludeEntityIds) selection.push({ label: `Exclude ${subgroup.role === "supplier" ? "firmele" : "instituțiile"}`, value: subgroup.excludeEntityIds.join(", ") });
  if (subgroup?.county) selection.push({ label: "Județ din rezultat", value: subgroup.county });
  if (subgroup?.counties) selection.push({ label: "Județe din rezultat", value: subgroup.counties.join(", ") });
  if (subgroup?.cpvPrefixes) selection.push({ label: "Doar ramurile CPV", value: subgroup.cpvPrefixes.join(", ") });
  if (subgroup?.excludeCpvPrefixes) selection.push({ label: "Exclude ramurile CPV", value: subgroup.excludeCpvPrefixes.join(", ") });
  if (subgroup?.years) selection.push({ label: "Ani selectați din rezultat", value: subgroup.years.join(", ") });
  if (subgroup?.riskBucket) selection.push({ label: "Interval CRI", value: `${subgroup.riskBucket.from} — ${subgroup.riskBucket.to}` });
  const list = (rows: { label: string; value: string }[]) => <dl className="mon-scope-conditions">{rows.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
  return <>{list(items)}{receipt && <div className="mon-population"><p>{receipt.intro}</p><strong>{receipt.operator}</strong>{receipt.groups.map((group, i) => <div key={i}><span>{group.title}</span><ul>{group.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div>}{selection.length > 0 && <div className="mon-selection"><p><strong>Din aceste rezultate, urmărim doar selecția de mai jos.</strong> Toate aceste restricții se aplică împreună, peste condițiile întrebării.</p>{list(selection)}</div>}</>;
}
