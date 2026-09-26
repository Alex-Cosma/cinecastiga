/** Closed, portable population conditions. No SQL or unresolved names. */
export type PopulationCondition =
  | { field: "date" | "value"; op: "gte" | "lte"; value: string }
  | { field: "authority" | "supplier" | "cpv" | "county"; op: "in" | "not_in"; values: string[]; labels?: string[] };
export interface PopulationGroup { operator: "and" | "or"; conditions: PopulationCondition[] }
export interface QueryPopulation { operator: "and" | "or"; groups: PopulationGroup[] }
export interface MinimumRecords { role:"authority" | "supplier"; count:number }

export function describePopulation(population: QueryPopulation): string {
  const names = { date:"data", value:"lei pe înregistrare", authority:"instituții", supplier:"firme", cpv:"CPV", county:"județe" };
  return population.groups.map(group => `(${group.conditions.map(c => "value" in c
    ? `${names[c.field]} ${c.op === "gte" ? "≥" : "≤"} ${c.value}`
    : `${names[c.field]} ${c.op === "not_in" ? "exclud" : "includ"} ${(c.labels ?? c.values).join(", ")}`).join(group.operator === "and" ? " ȘI " : " SAU ")})`).join(population.operator === "and" ? " ȘI " : " SAU ");
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exactKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every(k => keys.includes(k));
const operator = (v: unknown): v is "and" | "or" => v === "and" || v === "or";
export function validatePopulation(raw: unknown): QueryPopulation | { error: string } {
  const error = (message: string) => ({ error: `Selecție precisă: ${message}` });
  if (!record(raw) || !exactKeys(raw, ["operator", "groups"]) || !operator(raw.operator)
    || !Array.isArray(raw.groups) || raw.groups.length < 1 || raw.groups.length > 8)
    return error("alege ȘI/SAU și între 1 și 8 grupuri de condiții.");
  const groups: PopulationGroup[] = []; let count = 0;
  for (const group of raw.groups) {
    if (!record(group) || !exactKeys(group, ["operator", "conditions"]) || !operator(group.operator)
      || !Array.isArray(group.conditions) || !group.conditions.length || group.conditions.length > 8)
      return error("fiecare grup trebuie să aibă între 1 și 8 condiții și un operator ȘI/SAU.");
    const conditions: PopulationCondition[] = [];
    for (const c of group.conditions) {
      if (++count > 32) return error("sunt permise cel mult 32 de condiții.");
      if (!record(c)) return error("condiție invalidă.");
      if (c.field === "date" || c.field === "value") {
        if (!exactKeys(c, ["field", "op", "value"]) || (c.op !== "gte" && c.op !== "lte") || typeof c.value !== "string")
          return error("data și valoarea necesită o limită minimă sau maximă explicită.");
        if (c.field === "date") {
          if (!/^20\d{2}-\d{2}-\d{2}$/.test(c.value) || Number.isNaN(Date.parse(c.value)) || new Date(c.value).toISOString().slice(0, 10) !== c.value)
            return error("folosește o dată calendaristică validă, AAAA-LL-ZZ.");
        } else if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/.test(c.value)) return error("valoarea trebuie să fie pozitivă sau zero, cu cel mult 6 zecimale (punct separator).");
        conditions.push({ field:c.field, op:c.op, value:c.value });
      } else if (["authority", "supplier", "cpv", "county"].includes(String(c.field))) {
        if (!exactKeys(c, ["field", "op", "values", "labels"]) || (c.op !== "in" && c.op !== "not_in") || !Array.isArray(c.values)
          || c.values.length < 1 || c.values.length > 100 || c.values.some(v => typeof v !== "string" || !v.trim() || v.length > 100))
          return error("lista trebuie să conțină între 1 și 100 de valori explicite.");
        const values = [...new Set((c.values as string[]).map(v => v.trim()))];
        if (c.labels !== undefined && (!Array.isArray(c.labels) || c.labels.length !== c.values.length || c.labels.some(v => typeof v !== "string" || v.length > 300)))
          return error("numele afișate trebuie să corespundă identificatorilor selectați.");
        if ((c.field === "authority" || c.field === "supplier") && values.some(v => !/^[1-9]\d{0,17}$/.test(v)))
          return error("instituțiile și firmele se aleg prin identificatorul intern exact, nu prin CUI sau nume.");
        if (c.field === "cpv" && values.some(v => !/^\d{2,8}$/.test(v))) return error("codurile CPV trebuie să aibă între 2 și 8 cifre, fără cifra de control.");
        conditions.push({ field:c.field as "authority" | "supplier" | "cpv" | "county", op:c.op, values,
          ...(Array.isArray(c.labels) ? { labels:values.map(v => String((c.labels as string[])[(c.values as string[]).findIndex(original => original.trim() === v)] ?? v)) } : {}) });
      } else return error("câmp necunoscut; condiția nu a fost ignorată.");
    }
    groups.push({ operator:group.operator, conditions });
  }
  return { operator:raw.operator, groups };
}

/** Historical CRI renderers cannot apply transaction-level populations. */
export function isHistoricalProfile(spec: { block:string; comparisonMode?:string; rankBy?:string }): boolean {
  return ["distribution", "scatter"].includes(spec.block) || spec.block === "entity_card" && spec.rankBy !== "value" || spec.block === "compare" && spec.comparisonMode !== "transactions";
}
export function unsupportedPopulationView(spec: { block: string; dataset?: string; dim?: string; comparisonMode?:string; rankBy?:string; population?: QueryPopulation; minimumRecords?:MinimumRecords; filters: object }): string | null {
  if (spec.block === "trend" && spec.minimumRecords) return "Filtrul «cel puțin N înregistrări» se aplică întregii selecții și nu este disponibil în diferența dintre doi ani. Alege evoluția în timp sau elimină explicit acest filtru.";
  if (!isHistoricalProfile(spec)) return null;
  const f = spec.filters as Record<string, unknown>;
  const transaction = ["cpvTerm", "yearFrom", "yearTo", "monthFrom", "monthTo", "singleBidder", "minEmployees", "maxEmployees", "adminName", "adminPersonKey"];
  if (spec.population || spec.minimumRecords || transaction.some(k => f[k] !== undefined) || spec.dataset === "contracts")
    return "Acest răspuns folosește profiluri istorice de achiziții directe și nu poate respecta selecția de tranzacții. Condițiile sunt păstrate. Alege un clasament, o evoluție sau un total; pentru profiluri, elimină explicit condițiile de perioadă, domeniu și selecție precisă.";
  if (spec.block === "compare" && ["county", "authorityKind", "uatSiruta"].some(k => f[k] !== undefined))
    return "Comparația de profiluri nu poate restrânge județul, tipul instituției sau localitatea. Condițiile sunt păstrate; elimină-le explicit sau alege un clasament.";
  if (["scatter", "entity_card"].includes(spec.block) && ["authorityId", "authorityName", "supplierId", "supplierName"].some(k => f[k] !== undefined))
    return "Acest răspuns compară o populație de profiluri; nu poate fixa o singură entitate. Elimină explicit entitatea sau alege distribuția unui profil.";
  const supplier = f.supplierId || f.supplierName || spec.dim === "supplier";
  if (supplier && (f.authorityKind || f.uatSiruta)) return "Profilurile firmelor nu pot fi restrânse după tipul sau localitatea cumpărătorului. Condițiile sunt păstrate.";
  if ((f.authorityId || f.authorityName) && (f.supplierId || f.supplierName)) return "Profilul istoric nu poate restrânge și cumpărătorul, și furnizorul. Folosește verificarea relației pentru această pereche.";
  return null;
}
