import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { AUTHORITY_KINDS } from "./spec";
import {
  authorityKindCond, authorityKindExpression, authorityPeerKind, classifyAuthorities, classifyAuthority, isClinicalInstitute, nameKind, townHallKind,
  type AuthorityKindRow, type LocalityRegistry,
} from "./authority-kind";
import { authorityPeerKind as peersKind } from "../peers";
import { filterContext } from "./filters/context";
import { FILTERS } from "./filters/registry";
import type { FilterSpec } from "./filters/types";

// One classification of the kind of an institution (plan §2.5, D1).

const fake = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  { array: (values: unknown[]) => ({ array: values }) },
) as unknown as DbSql;
function render(fragment: unknown): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const walk = (x: unknown): string => {
    const f = x as { strings?: string[]; values?: unknown[]; array?: unknown[] };
    if (f && Array.isArray(f.strings)) return f.strings.reduce((out, s, i) => out + s + (i < f.values!.length ? walk(f.values![i]) : ""), "");
    params.push(f && typeof f === "object" && "array" in f ? f.array : x);
    return `$${params.length}`;
  };
  return { text: walk(fragment).replace(/\s+/g, " ").trim(), params };
}

/** reference.uat rows of the cases below (SIRUTA, tip, county as the table writes it). */
const REGISTRY: LocalityRegistry = new Map([
  [112879, { tip: "3", county: "mehedinti" }], // Pătulele
  [162149, { tip: "3", county: "vaslui" }], // Arsura
  [61069, { tip: "2", county: "constanta" }], // Băneasa, a town since 2004 (the census catalog lists a commune)
  [113849, { tip: "3", county: "mehedinti" }], // Vânători, the code five communes of five counties share
  [94456, { tip: "3", county: "ialomita" }], // Sfântu Gheorghe, Ialomița (the code of the Covasna municipality's name)
  [54975, { tip: "1", county: "cluj" }], // Cluj-Napoca
  [103238, { tip: "3", county: "giurgiu" }], // Ghimpați
  [179132, { tip: "9", county: "bucuresti" }], // București
]);
const row = (name: string, county: string | null, siruta: number | null = null, cui: string | null = "1234567"): AuthorityKindRow =>
  ({ id: String(Math.abs(siruta ?? 1)), name, county, cui, siruta });

/** The clinical institutes the name list of final/entity_card.md §3.1 catches locally (21, all with a profile). */
const CLINICAL_INSTITUTES = [
  "INSTITUTUL DE PNEUMOFTIZIOLOGIE \"MARIUS NASTA\"", "INSTITUTUL NATIONAL DE ENDOCRINOLOGIE C.I.PARHON",
  "INSTITUTUL DE URGENTA PENTRU BOLI CARDIOVASCULARE SI TRANSPLANT TARGU MURES", "Institutul Regional de Oncologie Iasi",
  "INSTITUTUL NATIONAL DE RECUPERARE, MEDICINA FIZICA SI BALNEOCLIMATOLOGIE", "INSTITUTUL ONCOLOGIC PROF DR ALEXANDRU TRESTIOREANU",
  "Institutul National pentru Sanatatea Mamei si Copilului \"Alessandrescu-Rusescu Bucuresti\"",
  "Institutul Regional de Gastroenterologie-Hepatologie \"Prof. Dr. Octavian Fodor\" Cluj", "INSTITUTUL DE PSIHIATRIE \"SOCOLA\" IASI",
  "Institutul de Diabet, Nutritie si Boli Metabolice \"Prof. dr. N. C. Paulescu\"", "Institutul de Boli Cardiovasculare \"Prof.Dr.C.C. Iliescu\"",
  "Institutul National de Gerontologie si Geriatrie  ANA ASLAN", "Institutul Oncologic Prof. Dr. I. Chiricuta Cluj-Napoca",
  "INSTITUTUL INIMII DE URGENTA PENTRU BOLI CARDIOVASCULARE\"Niculae Stancioiu\" Cluj-Napoca", "INSTITUTUL CLINIC FUNDENI",
  "INSTITUTUL NATIONAL DE HEMATOLOGIE  TRANSFUZIONALA Prof.Dr.C.T.Nicolau", "Institutul National de Expertiza Medicala si Recuperare a Capacitatii de Munca",
  "Institutul National de Neurologie si Boli Neurovasculare", "INSTITUTUL DE BOLI CARDIOVASCULARE TIMISOARA",
  "Institutul de Boli Cardiovasculare Prof. Dr. I. M. Georgescu", "Institutul Clinic de Urologie si Transplant Renal Cluj",
];

describe("the kind of an institution by its name", () => {
  it("follows strict name rules, with «Primăria comunei …» among the communes", () => {
    const cases: [string, string | null][] = [
      ["COMUNA MĂGURA", "comuna"], ["Primăria Comunei Patulele", "comuna"], ["PRIMARIA COMUNA CAZASU", "comuna"],
      ["UNITATEA ADMINISTRATIV TERITORIALA A COMUNEI VADENI", "comuna"], ["U.A.T. Comuna Dofteana", "comuna"], ["UAT ORAS BREZOI", "oras_municipiu"],
      // A UAT's legal form alone does not say the unit's kind (the registry may).
      ["UNITATEA ADMINISTRATIV TERITORIALA TRAIAN", null],
      ["Primăria Buzău", "oras_municipiu"], ["ORAȘUL SLĂNIC MOLDOVA", "oras_municipiu"], ["Oraş Buhuşi", "oras_municipiu"],
      ["MUNICIPIUL CLUJ-NAPOCA", "oras_municipiu"], ["PRIMARIA MUNICIPIULUI PITESTI", "oras_municipiu"],
      ["JUDEȚUL ALBA", "consiliu_judetean"], ["CONSILIUL JUDEȚEAN SUCEAVA", "consiliu_judetean"],
      ["SPITALUL JUDETEAN DE URGENTA SATU MARE", "spital"], ["Spitalul Clinic Județean", "spital"],
      ["Școala Gimnazială nr. 1", "scoala"], ["Liceul Teoretic", "scoala"], ["COLEGIUL NATIONAL", "scoala"], ["Grădinița cu Program Prelungit", "scoala"],
      // Outer spaces do not hide a name; the unknown and the empty name have no kind.
      [" Comuna cu spațiu", "comuna"], ["Ministerul Educației", null], ["SELGROS CASH&CARRY SRL", null], ["", null],
    ];
    expect(cases.map(([name]) => [name, nameKind(name)])).toEqual(cases);
  });

  it("gives no kind to a name matching two kinds", () => {
    expect(nameKind("Comuna Școala Nouă")).toBeNull();
    expect(nameKind("Spitalul Școala de Sanitari")).toBeNull();
  });

  it("counts the clinical institutes with the hospitals, not forensic medicine, research or other institutes", () => {
    expect(CLINICAL_INSTITUTES).toHaveLength(21);
    for (const name of CLINICAL_INSTITUTES) expect([name, nameKind(name)]).toEqual([name, "spital"]);
    for (const name of [
      "INSTITUTUL NATIONAL DE MEDICINA LEGALA MINA MINOVICI", "Institutul de Medicina Legala Iasi",
      "INSTITUTUL NATIONAL DE CERCETARE DEZVOLTARE MEDICO MILITARA CANTACUZINO",
      "Institutul National de Cercetare-Dezvoltare in domeniul Patologiei si Stiintelor Biomedicale Victor Babes",
      "INSTITUTUL NATIONAL DE STATISTICA", "Institutul de Diagnostic si Sanatate Animala", "Institutul National de Sanatate Publica",
      "INSTITUTIA PREFECTULUI JUDETUL PRAHOVA", "Inspectoratul pentru Situatii de Urgenta", "Policlinica de Boli Cardiovasculare",
      // Two clinical hospitals the list does not name (D1-classify.md): left as today.
      "Institutul de Fonoaudiologie si Chirurgie Functionala - O.R.L. Prof. Dr. D. Hociota", "I.N.B.I. \"Prof. Dr. Matei Bals\"",
    ]) expect([name, isClinicalInstitute(name), nameKind(name)]).toEqual([name, false, null]);
  });
});

describe("the kind of a town hall from the locality registry", () => {
  it("takes the type of the UAT of a corroborated legacy code", () => {
    expect(townHallKind(row("Primaria comunei Patulele", "Mehedinti", 112879), REGISTRY)).toBe("comuna");
    // Named like a town by today's patterns, a commune in the registry.
    expect(townHallKind(row("PRIMARIA   ARSURA", "Vaslui", 162149), REGISTRY)).toBe("comuna");
    expect(nameKind("PRIMARIA   ARSURA")).toBe("oras_municipiu");
    // «Comuna …» that is a town.
    expect(townHallKind(row("COMUNA BANEASA", "Constanta", 61069), REGISTRY)).toBe("oras_municipiu");
    expect(townHallKind(row("Municipiul Cluj-Napoca", "Cluj", 54975), REGISTRY)).toBe("oras_municipiu");
    expect(townHallKind(row("UAT Comuna Vânători", "Mehedinți", 113849), REGISTRY)).toBe("comuna");
  });

  it("never uses a code from another county or for a name without a local-administration form", () => {
    // The name decides: a commune by its name, a municipality by its name.
    const vanatori = row("Comuna Vânători (Primaria Vinatori)", "Vrancea", 113849);
    expect(townHallKind(vanatori, REGISTRY)).toBeNull();
    expect(classifyAuthority(vanatori, REGISTRY)).toBe("comuna");
    const sfantuGheorghe = row("Municipiul Sfantu Gheorghe", "Covasna", 94456);
    expect(townHallKind(sfantuGheorghe, REGISTRY)).toBeNull();
    expect(classifyAuthority(sfantuGheorghe, REGISTRY)).toBe("oras_municipiu");
    // A school or a hospital mapped to its locality's code is still a school or a hospital.
    expect(classifyAuthority(row("Scoala Gimnaziala Patulele", "Mehedinti", 112879), REGISTRY)).toBe("scoala");
    expect(classifyAuthority(row("Spitalul Orasenesc Baneasa", "Constanta", 61069), REGISTRY)).toBe("spital");
    // Without a county, no code corroborates.
    expect(townHallKind(row("MUNICIPIUL CLUJ-NAPOCA", null, 54975), REGISTRY)).toBeNull();
  });

  it("matches a town hall without a code by its exact name and county, and the six sector town halls", () => {
    // Today's «primaria %» pattern made it a town.
    expect(classifyAuthority(row("Primăria Ghimpați", "Giurgiu"), REGISTRY)).toBe("comuna");
    expect(classifyAuthority(row("Primaria Municipiului Bucuresti", "Bucuresti"), REGISTRY)).toBe("oras_municipiu");
    // The strict join needs a valid CUI; without one the name rules decide.
    expect(townHallKind(row("Primăria Ghimpați", "Giurgiu", null, null), REGISTRY)).toBeNull();
    expect(classifyAuthority(row("Sectorul 2 al Municipiului Bucuresti", "Bucuresti", -2), REGISTRY)).toBe("oras_municipiu");
    expect(classifyAuthority(row("SECTOR 4 (PRIMARIA SECTORULUI 4 BUCURESTI)", "Bucuresti"), REGISTRY)).toBe("oras_municipiu");
    // A sector's institutions are not its town hall.
    expect(classifyAuthority(row("CLUBUL COPIILOR SECTOR 3", "Bucuresti", -3), REGISTRY)).toBeNull();
    expect(classifyAuthority(row("DIRECTIA GENERALA DE IMPOZITE SI TAXE LOCALE SECTOR 6", "Bucuresti", -6), REGISTRY)).toBeNull();
    // A county council keeps its name rule (its registry code -100 is not a town hall's).
    expect(classifyAuthority(row("JUDETUL CLUJ (CONSILIUL JUDETEAN)", "Cluj", -100), REGISTRY)).toBe("consiliu_judetean");
  });
});

describe("the institutions of each kind", () => {
  it("are lists of ids, ascending, each id in at most one", () => {
    const kinds = classifyAuthorities([
      { ...row("Spitalul Clinic Iasi", "Iasi"), id: "40" }, { ...row("Primaria comunei Patulele", "Mehedinti", 112879), id: "7" },
      { ...row("INSTITUTUL CLINIC FUNDENI", "Bucuresti"), id: "12" }, { ...row("Ministerul Educației", "Bucuresti"), id: "3" },
      { ...row("Comuna Școala Nouă", "Brasov"), id: "5" }, { ...row("Spitalul Clinic Iasi", "Iasi"), id: "40" },
    ], REGISTRY);
    expect(kinds.ids).toEqual({ comuna: ["7"], oras_municipiu: [], consiliu_judetean: [], spital: ["12", "40"], scoala: [] });
    expect([...kinds.byId]).toEqual([["7", "comuna"], ["12", "spital"], ["40", "spital"]]);
  });

  it("are one SQL condition per kind, on an institution id, and one expression for the peer groups", () => {
    const cond = render(authorityKindCond(fake, ["12", "40"], fake`d.authority_id`));
    expect(cond).toEqual({ text: "d.authority_id = any($1::bigint[])", params: [["12", "40"]] });
    const kinds = { byId: new Map(), ids: { comuna: ["7"], oras_municipiu: [], consiliu_judetean: [], spital: ["12", "40"], scoala: [] } } as const;
    const expression = render(authorityKindExpression(fake, kinds, fake`s.entity_id`));
    expect(expression.text).toBe(`(case ${AUTHORITY_KINDS.map((_, i) => `when s.entity_id = any($${2 * i + 1}::bigint[]) then $${2 * i + 2}`).join(" ")} else null end)`);
    expect(expression.params).toEqual(AUTHORITY_KINDS.flatMap((kind) => [kinds.ids[kind], kind]));
  });

  it("are read by the peer pages through the same function", () => {
    expect(peersKind).toBe(authorityPeerKind);
  });

  it("are offered on every question with the kind, the profiles included (D1: «Primării de oraș și municipiu» on scatter and entity_card)", () => {
    for (const spec of [
      { block: "scatter", dim: "authority", measure: "value", filters: {} },
      { block: "entity_card", dim: "authority", measure: "value", rankBy: "risk", filters: {} },
      { block: "entity_card", dim: "authority", measure: "value", rankBy: "value", filters: {} },
      { block: "table", dim: "authority", measure: "value", topN: 10, filters: {} },
    ] as FilterSpec[]) {
      const ctx = filterContext(spec);
      expect([spec.block, FILTERS.authorityKind.engine[ctx.form]]).toEqual([spec.block, ctx.profile ? "profile" : "row"]);
      expect([spec.block, FILTERS.authorityKind.choices(spec, ctx)]).toEqual([spec.block, [undefined, ...AUTHORITY_KINDS]]);
    }
  });
});
