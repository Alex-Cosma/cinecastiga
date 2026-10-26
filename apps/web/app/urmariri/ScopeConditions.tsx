import type { MonitoringScope } from "@/lib/monitoring-shared";
import { describeConditions } from "@/lib/ask/filters/describe";
import { specTrendPartLabel } from "@/lib/ask/trend-shared";
import { TREND_GROUP_ROW } from "@/lib/ask/filters/defs/trend";
import { countWords } from "@/lib/ask/answer-text";
import { formatBucharestDay } from "@/lib/format";
export default function ScopeConditions({ scope }: { scope: MonitoringScope }) {
  const { spec, options } = scope, subgroup = options.scope, members = options.members;
  // The question's conditions in the words of describeConditions; the receipt keeps a precise selection group by group.
  const { scope: conditions, receipt } = describeConditions(spec);
  // A group watch follows the members fixed at activation (plan §2.8): "Grupa: Noi față de 2024 · 412 firme fixate la 24.10.2026".
  const [one, many] = members?.role === "county" ? ["județ", "județe"] : members?.role === "authority" ? ["instituție", "instituții"] : ["firmă", "firme"];
  // The group by its part's name, as the answer's drawer, the setup page and the server's notes say it (trendPartLabel);
  // its row replaces the question's own „Grupa” (describeConditions), so the page names it once.
  const group = members && spec.block === "trend" ? specTrendPartLabel(spec) : members?.group;
  const items = members ? [...conditions.filter((row) => row.label !== TREND_GROUP_ROW), { label: TREND_GROUP_ROW, value: `${group} · ${countWords(members.ids.length, one!, many!)} ${members.ids.length === 1 ? members.role === "county" ? "fixat" : "fixată" : "fixate"} la ${formatBucharestDay(members.frozenAt)}` }] : conditions;
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
