import type { AskSpec } from "./ask/spec";
import { sumDecimalStrings, type EvidenceScope } from "./ask/evidence";

export interface DomainNode {
  code: string;
  name: string;
  officialName: string;
  value: number;
  valueExact: string;
  count: number;
  children?: DomainNode[];
  isLeaf: boolean;
  hasChildren: boolean;
  nodeKind: "division" | "prefix" | "code" | "remainder";
  isOther?: boolean;
  cpvFullCode?: string;
  /** The complement remains exact when the displayed top eight change. */
  excludedPrefixes?: string[];
}

export interface DomainDataset {
  year: number;
  years: number[];
  total: number;
  totalExact: string;
  count: number;
  categoryCount: number;
  categories: DomainNode[];
  generatedAt: string;
  scopeNote: string;
  hierarchyNote: string;
}

export interface DomainAggregate {
  code: string;
  valueExact: string;
  count: number;
}
export interface DomainCatalogueEntry { code: string; name: string }

export const DOMAIN_SCOPE_NOTE = "Achiziții directe cu oferta acceptată și valoare pozitivă de cel mult 2 milioane lei, plus contracte atribuite cu valoare pozitivă. Sunt incluse numai înregistrările cu cod CPV. Valorile nu confirmă plăți. Contractele cu mai mulți câștigători sunt împărțite egal; numărul de rânduri nu este numărul de contracte distincte.";
export const DOMAIN_HIERARCHY_NOTE = "Diviziunile CPV se deschid în grupuri numerice disjuncte: 2 → 4 → 5–8 cifre, cu nivelurile intermediare fără ramificații omise. Grupurile după prefix nu reproduc arborele oficial CPV. Frunzele sunt codurile efectiv prezente în selecție. Codurile generale terminate în zero au frunze proprii; fiecare rând este numărat o singură dată.";

/** Preserve an explicitly selected exact leaf; translate old CPV taxonomy URLs. */
export function normalizeDomainCode(raw: string): string {
  const code = raw.trim();
  if (code === "other" || /^\d{2,8}$/.test(code)) return code;
  const legacy = /^(\d{8})-\d$/.exec(code);
  if (!legacy) return "";
  const bare = legacy[1]!;
  const stem = bare.replace(/0+$/, "");
  return stem.length >= 2 ? stem : bare.slice(0, 2);
}

export function defaultDomainYear(years: readonly number[], currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Bucharest" }).format(new Date()))): number | undefined {
  const sorted = [...new Set(years)].sort((a, b) => b - a);
  return sorted.find((year) => year < currentYear) ?? sorted[0];
}

function compareValues(a: DomainNode, b: DomainNode): number {
  const difference = sumDecimalStrings([a.valueExact, "-" + b.valueExact]);
  return /^-/.test(difference) ? 1 : /[1-9]/.test(difference) ? -1 : a.code.localeCompare(b.code);
}

/** Build a strict partition of actual source codes, not a guessed CPV taxonomy.
 * PostgreSQL's unrounded numeric amounts remain decimal strings throughout.
 */
export function buildDomainDataset(
  rows: readonly DomainAggregate[],
  catalogue: readonly DomainCatalogueEntry[],
  options: { year: number; years: readonly number[]; generatedAt: string },
): DomainDataset {
  const names = new Map(catalogue.map((entry) => [entry.code.slice(0, 8), entry]));
  const unique = new Map<string, DomainAggregate>();
  for (const row of rows) {
    if (!/^\d{8}(?:-\d)?$/.test(row.code) || !/^\d+(?:\.\d+)?$/.test(row.valueExact) || !Number.isSafeInteger(row.count) || row.count <= 0)
      throw new Error("Agregare CPV invalidă: selecția nu poate fi prezentată exact.");
    const code = row.code.slice(0, 8);
    const previous = unique.get(code);
    // The two source channels may arrive separately. A repeated code denotes
    // additive aggregates, never a second node in the navigation hierarchy.
    unique.set(code, previous ? { code, valueExact: sumDecimalStrings([previous.valueExact, row.valueExact]), count: previous.count + row.count } : { ...row, code });
  }
  const allRows = [...unique.values()];
  const partition = (group: readonly DomainAggregate[], length: number) => {
    const groups = new Map<string, DomainAggregate[]>();
    for (const row of group) {
      const prefix = row.code.slice(0, length);
      const bucket = groups.get(prefix);
      if (bucket) bucket.push(row); else groups.set(prefix, [row]);
    }
    return groups;
  };
  const make = (code: string, group: readonly DomainAggregate[], keep = false): DomainNode => {
    if (code.length < 8 && !keep) {
      const next = partition(group, code.length + 1);
      if (next.size === 1) return make(next.keys().next().value!, group);
    }
    const reference = names.get(code.padEnd(8, "0"));
    const isLeaf = code.length === 8;
    const isDivision = code.length === 2;
    const valueExact = sumDecimalStrings(group.map((row) => row.valueExact));
    const name = reference?.name ?? `Grup CPV ${code}`;
    const node: DomainNode = {
      code,
      name: !isLeaf && !isDivision && code.endsWith("0") ? `Grup CPV ${code}` : name,
      officialName: isLeaf || isDivision ? name : `Grup numeric CPV ${code}${reference ? ` · ${reference.name}` : " · prefix fără denumire oficială distinctă"}`,
      value: Number(valueExact), valueExact,
      count: group.reduce((count, row) => count + row.count, 0),
      isLeaf, hasChildren: !isLeaf,
      nodeKind: isLeaf ? "code" : isDivision ? "division" : "prefix",
    };
    if (isLeaf) {
      node.cpvFullCode = reference?.code ?? code;
    } else {
      const length = isDivision ? 4 : code.length + 1;
      node.children = [...partition(group, length)].map(([prefix, members]) => make(prefix, members, length === 4)).sort(compareValues);
    }
    return node;
  };
  const divisions = [...partition(allRows, 2)].map(([prefix, members]) => make(prefix, members, true)).sort(compareValues);
  const categories = divisions.slice(0, 8);
  if (divisions.length > 8) {
    const remainder = divisions.slice(8);
    const valueExact = sumDecimalStrings(remainder.map((node) => node.valueExact));
    categories.push({ code: "other", name: "Altele", officialName: `Celelalte ${remainder.length} diviziuni CPV`, value: Number(valueExact), valueExact,
      count: remainder.reduce((count, node) => count + node.count, 0), children: remainder,
      isLeaf: false, hasChildren: true, isOther: true, nodeKind: "remainder", excludedPrefixes: divisions.slice(0, 8).map((node) => node.code) });
  }
  const totalExact = sumDecimalStrings(allRows.map((row) => row.valueExact));
  return { year: options.year, years: [...options.years], total: Number(totalExact), totalExact,
    count: allRows.reduce((count, row) => count + row.count, 0), categoryCount: divisions.length, categories,
    generatedAt: options.generatedAt, scopeNote: DOMAIN_SCOPE_NOTE, hierarchyNote: DOMAIN_HIERARCHY_NOTE };
}

/** Breakdown deliberately excludes null CPV. EvidenceScope preserves literal
 * prefixes, including eight-digit general codes that Ask otherwise broadens.
 */
export function domainSourceQuery(year: number, node?: DomainNode): { spec: AskSpec; scope: EvidenceScope } {
  const spec: AskSpec = { block: "breakdown", dataset: "all", measure: "value", filters: { yearFrom: year, yearTo: year } };
  if (!node) return { spec, scope: {} };
  if (node.isOther || node.nodeKind === "remainder") {
    if (!node.excludedPrefixes) throw new Error("Selecția celorlalte diviziuni nu are un perimetru explicit.");
    return { spec, scope: { excludeCpvPrefixes: node.excludedPrefixes } };
  }
  spec.filters.cpvTerm = node.code;
  return { spec, scope: { cpvPrefixes: [node.code] } };
}

export function domainSourceUrl(year: number, node?: DomainNode): string {
  const { spec, scope } = domainSourceQuery(year, node);
  return `/intreaba?spec=${encodeURIComponent(btoa(JSON.stringify(spec)))}&drill=1&evidence=${encodeURIComponent(JSON.stringify(scope))}`;
}
