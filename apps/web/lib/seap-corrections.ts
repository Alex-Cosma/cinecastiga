import {
  ACCEPTED_AUTHORITY_CUI, AUTHORITY_UAT_CORRECTIONS, BUYER_REGIME_OVERRIDES, REVIEWED_AUTHORITY_NAMES,
  REVIEWED_FOREIGN_TWIN_MERGES, REVIEWED_REGISTRY_COLLISIONS, REVIEWED_SUPPLIER_MERGES, REVIEWED_TOWN_HALL_NAMES,
  REVIEWED_WINNER_RECORDS,
} from "@seap/db";

/*
 * „Unde corectăm datele SEAP” (owner, 21 November 2026): every hand-reviewed correction the processing applies to the
 * source data, as rows the methodology page lists, from the same lists the processing reads (packages/db
 * reviewed-corrections.ts, registry-collisions.ts, profile-flags.ts). What SEAP says, what the site shows, why, and on
 * what basis; the entity page of a corrected institution or firm links to its row (Complet only). The rows name only
 * institutions and firms; a natural person registered in ONRC is described, never named. Pure: the page resolves the
 * CUIs to entity pages and adds the database's parts (lib/seap-corrections-data.ts).
 */

export type CorrectionKind = "castigator" | "dubluri" | "straine" | "nume" | "localitate" | "onrc" | "cumparator";

export interface CorrectionRow {
  /** The row's anchor on /metodologie (`#corectura-…`). */
  key: string;
  kind: CorrectionKind;
  /** The entity page the row names, when the list holds its id. */
  entityId: string | null;
  /** The CUI the page resolves to an entity when the list has no id. */
  cui: string | null;
  name: string;
  seap: string;
  shown: string;
  why: string;
  basis: string;
  /** A merge's other profile (core.entity_redirects.old_id once the processing applied it). */
  mergedId?: string;
}

export interface CorrectionGroup {
  kind: CorrectionKind;
  title: string;
  /** One line under the title. */
  lead: string;
  rows: CorrectionRow[];
}

const COUNTRY: Record<string, string> = { CA: "Canada", MD: "Republica Moldova", TR: "Turcia", IT: "Italia", PA: "Panama" };

/** "id RO15034059 (digits swapped), Bucharest; ONRC 15034095 = Telecomunicatii C.F.R. SA, only CUI with this name" */
const MERGE_EVIDENCE = /^(?:(no id)|id (\S+) \(([^)]+)\))[^;]*; ONRC (\d+) = (.+?)(?:, (only CUI with this name|the renamed (.+)))?$/;
const TYPO: [RegExp, string][] = [
  [/^digits swapped$/, "cifre inversate"], [/^one digit missing$/, "o cifră lipsă"], [/^extra zero$/, "un zero în plus"],
  [/^last digit$/, "ultima cifră greșită"], [/^one digit$/, "o cifră greșită"], [/^extra digit$/, "o cifră în plus"],
  [/^garbled /, "CUI deformat"],
];

/** What the source wrote for a merged profile, in Romanian; null when the evidence note has another shape. */
export function mergeSource(evidence: string): { seap: string; onrcName: string; basis: string } | null {
  const m = MERGE_EVIDENCE.exec(evidence);
  if (!m) return null;
  const [, none, id, typo, , onrc, only, renamed] = m;
  const fault = typo ? TYPO.find(([re]) => re.test(typo))?.[1] : undefined;
  if (!none && !fault) return null;
  return {
    seap: none ? "fără CUI" : `CUI „${id}” (${fault})`,
    onrcName: onrc!.replace(/ \/ .*$/, ""),
    basis: renamed ? "ONRC: aceeași firmă, cu numele nou" : only ? "ONRC: singurul CUI cu acest nume" : "ONRC",
  };
}

/** "LA FANTANA 2025621; Registrul Auto Roman 2027820 is the authority of 25 of its contracts" */
const WINNER_EVIDENCE = /^(.+?) (\d{6,8}); (.+?) (\d{6,8}) is the authority of (\d+) of its contracts$/;
export function winnerSource(evidence: string): { firm: string; firmId: string; authority: string; contracts: number } | null {
  const m = WINNER_EVIDENCE.exec(evidence);
  return m ? { firm: m[1]!, firmId: m[2]!, authority: m[3]!, contracts: Number(m[5]) } : null;
}

/** "PFA of a natural person, Cluj" → "o persoană fizică autorizată (PFA), Cluj"; a firm's name stays out of the row. */
export function onrcHolder(onrcName: string): string {
  const m = /^(PFA|PF|IF|AF) of a natural person, (.+)$/.exec(onrcName);
  if (!m) return "altei firme";
  const form = { PFA: "unei persoane fizice autorizate (PFA)", PF: "unei persoane fizice", IF: "unei întreprinderi familiale", AF: "unei asociații familiale" }[m[1] as "PFA"];
  return `${form}, ${m[2]}`;
}

function rows(kind: CorrectionKind, list: Omit<CorrectionRow, "key" | "kind">[]): CorrectionRow[] {
  return list.map((r, i) => ({ ...r, kind, key: `corectura-${kind}-${i + 1}` }));
}

/** Every group, in the page's order; the rows as the lists hold them. */
export function correctionGroups(): CorrectionGroup[] {
  const winners = rows("castigator", [
    ...ACCEPTED_AUTHORITY_CUI.map((a) => {
      const w = winnerSource(a.evidence)!;
      return {
        entityId: w.firmId, cui: a.supplierCui, name: w.firm,
        seap: `CUI ${a.sourceCui}, al instituției (${w.authority})`, shown: `firma, CUI ${a.supplierCui}`,
        why: `Instituția și-a trecut propriul CUI la câștigător; e cumpărătorul în ${w.contracts} dintre contractele firmei.`,
        basis: "codul de participant SICAP al firmei; ONRC nu leagă firma de instituție",
      };
    }),
    ...REVIEWED_WINNER_RECORDS.map((r) => ({
      entityId: null, cui: r.cui, name: r.sourceName,
      seap: `CUI ${r.sourceCui}, ${r.note}`, shown: r.cui ? `CUI ${r.cui}` : "fără codul celeilalte firme",
      why: "Înregistrarea câștigătorului poartă identitatea altei firme.", basis: "numele și codul de participant SICAP",
    })),
  ]);
  const doubles = rows("dubluri", REVIEWED_SUPPLIER_MERGES.map((m) => {
    const s = mergeSource(m.evidence)!;
    return {
      entityId: m.targetId, cui: m.targetCui, name: s.onrcName, mergedId: m.sourceId,
      seap: `încă un profil, ${s.seap}`, shown: `un singur profil, CUI ${m.targetCui}`,
      why: "Aceeași firmă apărea de două ori, iar contractele ei se împărțeau între profiluri.", basis: s.basis,
    };
  }));
  const foreign = rows("straine", REVIEWED_FOREIGN_TWIN_MERGES.map((m) => ({
    entityId: m.targetId, cui: null, name: m.evidence.split(", foreign id")[0]!, mergedId: m.sourceId,
    seap: `țara România, cod ${m.foreignId}`, shown: `țara ${COUNTRY[m.targetCountry] ?? m.targetCountry}, același cod`,
    why: "Aceeași firmă străină apărea o dată ca românească, o dată cu țara ei.", basis: "codul fiscal străin și numele, identice în SEAP și TED",
  })));
  const names = rows("nume", [
    ...REVIEWED_AUTHORITY_NAMES.map((r) => ({
      entityId: null, cui: r.cui, name: r.name, seap: `„${r.wrongName}”`, shown: "numele instituției",
      why: "Numele venea de la o înregistrare de furnizor cu același CUI; ONRC dă acel nume altei firme.", basis: "ONRC și anunțurile instituției",
    })),
    ...REVIEWED_TOWN_HALL_NAMES.map((r) => ({
      entityId: null, cui: r.cui, name: r.name, seap: `„${r.wrongName}”`, shown: "numele primăriei",
      why: "Înregistrarea SICAP a primăriei poartă alt nume sau unul deformat.", basis: `CUI-ul primăriei, județul ${r.county}`,
    })),
  ]);
  const places = rows("localitate", AUTHORITY_UAT_CORRECTIONS.map((c) => ({
    entityId: c.entityId, cui: c.cui, name: c.name, seap: "localitatea cu același nume din alt județ", shown: `localitatea din județul ${c.county}`,
    why: "Legătura veche cu localitatea s-a făcut doar după nume; contează la populație și pe hartă.", basis: "codul SIRUTA, singura localitate cu acest nume din județ",
  })));
  const onrc = rows("onrc", REVIEWED_REGISTRY_COLLISIONS.map((c) => ({
    entityId: c.entityId, cui: c.cui, name: c.seapName, seap: `CUI ${c.cui}`, shown: "fără datele ONRC și bilanțurile acestui CUI",
    why: `În ONRC, CUI-ul e al ${onrcHolder(c.onrcName)}; firma din SEAP e alta.`, basis: "ONRC; forma juridică și țara firmei din SEAP",
  })));
  const buyers = rows("cumparator", BUYER_REGIME_OVERRIDES.map((o) => ({
    entityId: null, cui: o.cui, name: o.name,
    seap: "tipul nu reiese sigur din nume și forma juridică",
    shown: o.regime === "classic" ? "instituție, cu scor" : "cumpărător privat, fără scor",
    why: `${o.why.charAt(0).toUpperCase()}${o.why.slice(1)}.`, basis: "o sursă publică, verificată de mână",
  })));
  return [
    { kind: "castigator", title: "Câștigătorul are CUI-ul altcuiva", lead: "Contractul rămâne al firmei pe care o numește SICAP.", rows: winners },
    { kind: "dubluri", title: "Aceeași firmă, de două ori", lead: "Profilul fără CUI sau cu CUI greșit e unit cu firma.", rows: doubles },
    { kind: "straine", title: "Firmă străină trecută ca românească", lead: "Unită cu aceeași firmă, sub țara ei.", rows: foreign },
    { kind: "nume", title: "Nume greșit", lead: "Afișăm numele din anunțurile instituției.", rows: names },
    { kind: "localitate", title: "Localitatea instituției", lead: "Primăria e legată de localitatea din județul ei.", rows: places },
    { kind: "onrc", title: "CUI-ul altei firme în ONRC", lead: "Nu atașăm administratorii și bilanțurile acelui CUI.", rows: onrc },
    { kind: "cumparator", title: "Tipul cumpărătorului", lead: "Regimul ales de mână, cu sursa lui.", rows: buyers },
  ];
}

let anchors: { byId: Map<string, string>; byCui: Map<string, string> } | null = null;

/** The row an entity page links to: by the entity's id, else by its CUI; the first row when several name it. */
export function correctionAnchor(id: string | number, cui: string | null | undefined): string | null {
  if (!anchors) {
    anchors = { byId: new Map(), byCui: new Map() };
    for (const g of correctionGroups()) for (const r of g.rows) {
      if (r.entityId && !anchors.byId.has(r.entityId)) anchors.byId.set(r.entityId, r.key);
      // A CUI names the entity only for rows without an id (the page resolves them the same way).
      if (!r.entityId && r.cui && !anchors.byCui.has(r.cui)) anchors.byCui.set(r.cui, r.key);
    }
  }
  return anchors.byId.get(String(id)) ?? (cui ? anchors.byCui.get(cui) ?? null : null);
}
