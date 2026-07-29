"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fold, score, parseIntents } from "@/lib/ask/intent";
import { aliasQueries } from "@/lib/ask/entity-alias";

/**
 * Entity-name score that also understands institutional aliases: "primaria
 * cluj" must rank "Municipiul Cluj-Napoca" (alias hit, 0.92) above "COMUNA
 * SACUIEU (PRIMARIA SACUIEU CLUJ)" (mere token containment, 0.7).
 */
function entityScore(q: string, name: string): number {
  let best = score(q, name);
  for (const a of aliasQueries(fold(q))) best = Math.max(best, score(a, name));
  return best;
}

/**
 * "Construiește" — single-input continuous-typeahead builder. One field: the
 * user types anything (block, subject, county, locality, entity, number) and
 * picks from a dropdown whose options adapt after every choice. Choices become
 * removable chips; the composed AskSpec runs through the same deterministic
 * /api/ask spec path as the AI answers.
 *
 * Two ideas ported from the search-mock (tg-bridge session):
 *  - candidates are SCORED (lib/ask/intent.ts), not substring-filtered — best
 *    guess is always row 1, Enter is safe to press blind, typos tolerated;
 *  - the block is a CONSEQUENCE of what you name: one entity → network /
 *    sankey / distribution; two entities → compare / fact_check. All 13 blocks
 *    reachable without the user ever learning the word "block".
 */

export interface BuilderSpec {
  block: string;
  dataset?: string;
  dim?: string;
  measure: string;
  topN?: number;
  rankBy?: string;
  filters: Record<string, string | number | boolean>;
}

interface UatPick {
  siruta: number;
  label: string;
  countyFold: string;
}

interface State {
  block: string | null;
  /** null = toate sursele (implicit); "da" / "contracts" = un singur canal. */
  dataset: string | null;
  singleBidder: boolean | null;
  dim: string | null;
  measure: string | null;
  kind: string | null;
  rankBy: string | null;
  yA: number | null;
  yB: number | null;
  topN: number | null;
  cpvTerm: string | null;
  county: string | null;
  uat: UatPick | null;
  authorityName: string | null;
  supplierName: string | null;
  compareWith: string | null;
  y0: number | null;
  y1: number | null;
  /** Month bounds (1–12) from deep links — ride along with y0/y1. */
  m0: number | null;
  m1: number | null;
  /** Exact entity ids from deep links — keep them so re-running can't re-resolve
   * the name to a richer homonym (eight "Comuna Dumbrăvița" exist). */
  authId: number | null;
  supId: number | null;
  /** Supplier size (MF bilanț employees): [min, max, display label]. */
  empl: { min: number | null; max: number | null; label: string } | null;
  /** "Firme conduse de X" — exact ONRC person (key) + display label. */
  admin: { key: string; label: string } | null;
}

interface Chip {
  key: keyof State;
  cat: string;
  label: string;
  auto?: boolean | undefined;
}

interface Cand {
  id: string;
  ic: string;
  label: string;
  sub?: string;
  sc: number;
  hot?: boolean;
  free?: boolean;
  run?: boolean;
  /** Non-selectable guidance row ("scrie numele…") — rendered, not pickable. */
  hint?: boolean;
  apply?: (s: State, chips: Chip[]) => void;
}

interface CandGroup {
  h: string | null;
  items: Cand[];
}

/** kw = folded keyword synonyms the scorer also matches against. */
const BLOCKS = [
  { id: "table", ic: "📊", l: "clasament", d: "top autorități / furnizori / județe", kw: "top clasament cine cel mai mult" },
  { id: "stat", ic: "🔢", l: "un total", d: "o singură cifră", kw: "total cat suma cifra" },
  { id: "timeseries", ic: "📈", l: "evoluție pe ani", d: "2018–2026", kw: "evolutie ani grafic crestere istoric" },
  { id: "map", ic: "🗺️", l: "hartă pe județe", d: "choropletă", kw: "harta judete geografic unde" },
  { id: "breakdown", ic: "🧩", l: "structură pe domenii", d: "pe ce se duc banii (CPV)", kw: "structura domenii pe ce categorii" },
  { id: "trend", ic: "📉", l: "tendință", d: "cine urcă / coboară între doi ani", kw: "tendinta schimbare crestere scadere" },
  { id: "entity_card", ic: "🏛️", l: "fișă entitate", d: "campionul unei categorii", kw: "fisa campion cea mai" },
  // the investigative six — focal = how many named entities they need
  { id: "network", ic: "🕸️", l: "rețeaua de parteneri", d: "cu cine lucrează", kw: "retea parteneri legaturi cerc anturaj", focal: 1 },
  { id: "sankey", ic: "💧", l: "fluxul banilor", d: "de la cine, către ce categorii", kw: "flux bani traseu unde se duc", focal: 1 },
  { id: "distribution", ic: "🎯", l: "cât de neobișnuit e", d: "poziția în distribuția de risc", kw: "distributie neobisnuit outlier percentila comparativ", focal: 1 },
  { id: "compare", ic: "⚖️", l: "compară două entități", d: "față în față", kw: "compara comparatie versus vs fata in fata doua", focal: 2 },
  { id: "fact_check", ic: "✅", l: "au făcut afaceri?", d: "Da/Nu, cu dovezi", kw: "a cumparat de la au facut afaceri verifica adevarat dovada", focal: 2 },
  { id: "scatter", ic: "🔬", l: "risc față de volum", d: "cine iese din tipar", kw: "scatter risc volum outlieri tipar anomalii" },
] as const;

const DIMS = [
  { id: "authority", l: "autorități", d: "cine cumpără", kw: "autoritati primarii institutii cumparatori" },
  { id: "supplier", l: "furnizori", d: "cine încasează", kw: "furnizori firme companii vanzatori castigatori" },
  { id: "county", l: "județe", d: "unde se cheltuie", kw: "judete regiuni geografic" },
];
const MEASURES = [
  { id: "value", l: "în lei", d: "valoare totală", kw: "lei bani valoare suma" },
  { id: "count", l: "în număr de achiziții", d: "câte contracte", kw: "numar cate achizitii bucati" },
  { id: "value_per_capita", l: "în lei pe locuitor", d: "împărțit la populația UAT", kw: "pe locuitor cap populatie" },
];
const KINDS = [
  { id: "comuna", l: "comune", kw: "comune sate rural" },
  { id: "oras_municipiu", l: "orașe și municipii", kw: "orase municipii urban" },
  { id: "consiliu_judetean", l: "consilii județene", kw: "consilii judetene cj" },
  { id: "spital", l: "spitale", kw: "spitale sanatate medical" },
  { id: "scoala", l: "școli", kw: "scoli licee educatie invatamant gradinite" },
];
const RANKS = [
  { id: "risk", l: "cea mai riscantă (CRI)", kw: "risc riscanta suspecta semnale" },
  { id: "value", l: "cea mai mare pe bani", kw: "mare bani valoare cheltuiala" },
];
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov",
  "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța",
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara",
  "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt",
  "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea",
  "Vaslui", "Vâlcea", "Vrancea",
];
const COUNTY_BY_FOLD = new Map(COUNTIES.map((c) => [fold(c), c]));

const NEED_LABEL: Record<string, string> = {
  block: "alege forma răspunsului",
  dim: "clasament cu cine?",
  measure: "măsurat cum?",
  kind: "din ce categorie?",
  rankBy: "după ce criteriu?",
  yA: "tendință: din ce an?",
  yB: "tendință: până în ce an?",
  focal: "despre cine? scrie numele unei autorități sau firme",
  focalAuthority: "care autoritate? scrie numele",
  focalSupplier: "care firmă? scrie numele",
  compareWith: "cu cine să comparăm? scrie numele",
};

function needs(s: State): string[] {
  if (!s.block) return ["block"];
  const n: string[] = [];
  if ((s.block === "table" || s.block === "trend") && !s.dim) n.push("dim");
  if (["table", "stat", "timeseries", "map"].includes(s.block) && !s.measure) n.push("measure");
  if (s.block === "entity_card") {
    if (!s.kind) n.push("kind");
    if (!s.rankBy) n.push("rankBy");
  }
  if (s.block === "trend") {
    if (s.yA === null) n.push("yA");
    if (s.yB === null) n.push("yB");
  }
  if (["network", "sankey", "distribution"].includes(s.block) && !s.authorityName && !s.supplierName)
    n.push("focal");
  if (s.block === "fact_check") {
    if (!s.authorityName) n.push("focalAuthority");
    if (!s.supplierName) n.push("focalSupplier");
  }
  if (s.block === "compare") {
    if (!s.authorityName && !s.supplierName) n.push("focal");
    else if (!s.compareWith) n.push("compareWith");
  }
  return n;
}

interface RemoteSuggest {
  cpv: { term: string; cpvName: string | null }[];
  uat: { siruta: number; name: string; tip: string; county: string; population: number | null }[];
  authority: { name: string; county: string | null }[];
  supplier: { name: string; county: string | null }[];
  person: { key: string; name: string; birthYear: number | null; birthLocality: string | null; nFirms: number }[];
  /** Top CPV divisions (breakdown-form starters, from ?top=1). */
  division?: { code: string; name: string }[];
}
const EMPTY_REMOTE: RemoteSuggest = { cpv: [], uat: [], authority: [], supplier: [], person: [] };
const TIP_SHORT: Record<string, string> = { comună: "com.", oraș: "or.", municipiu: "mun." };

function addChip(chips: Chip[], key: keyof State, cat: string, label: string, auto?: boolean): Chip[] {
  return [...chips.filter((c) => c.key !== key), { key, cat, label, auto }];
}

/** Remove a chip + everything that depends on it. */
function drop(s: State, chips: Chip[], key: keyof State): [State, Chip[]] {
  const ns = { ...s };
  let nc = chips.filter((c) => c.key !== key);
  const clear = (k: keyof State) => {
    (ns as Record<string, unknown>)[k] = null;
    nc = nc.filter((c) => c.key !== k);
  };
  clear(key);
  if (key === "block")
    for (const k of ["dim", "measure", "kind", "rankBy", "yA", "yB", "topN", "compareWith"] as const) clear(k);
  if (key === "dim" && s.measure === "value_per_capita") clear("measure");
  if (key === "county" && s.uat) clear("uat");
  if ((key === "authorityName" || key === "supplierName") && s.compareWith) clear("compareWith");
  if (key === "dataset" && s.singleBidder) clear("singleBidder");
  // deep-link riders fall with their carrier chips
  if (key === "y0") clear("m0");
  if (key === "y1") clear("m1");
  if (key === "authorityName") clear("authId");
  if (key === "supplierName") clear("supId");
  return [ns, nc];
}

function emplLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max} angajați`;
  if (max !== null) return max === 0 ? "fără angajați" : `cel mult ${max} angajați`;
  return `cel puțin ${min} angajați`;
}

function blank(): State {
  return {
    block: null, dataset: null, singleBidder: null, dim: null, measure: null, kind: null,
    rankBy: null, yA: null, yB: null, topN: null, cpvTerm: null, county: null, uat: null,
    authorityName: null, supplierName: null, compareWith: null, y0: null, y1: null,
    m0: null, m1: null, authId: null, supId: null,
    empl: null, admin: null,
  };
}

function initFrom(initial: BuilderSpec | null | undefined): [State, Chip[]] {
  const s = blank();
  let chips: Chip[] = [];
  if (!initial) return [s, chips];
  const f = initial.filters ?? {};
  const blockDef = BLOCKS.find((b) => b.id === initial.block) ?? BLOCKS[0];
  s.block = blockDef.id;
  chips = addChip(chips, "block", "formă", blockDef.l);
  if (initial.dataset === "contracts" || f["singleBidder"] === true) {
    s.dataset = "contracts";
    chips = addChip(chips, "dataset", "sursa", "doar contracte (peste prag)");
  } else if (initial.dataset === "da") {
    s.dataset = "da";
    chips = addChip(chips, "dataset", "sursa", "doar achiziții directe");
  }
  if (f["singleBidder"] === true) {
    s.singleBidder = true;
    chips = addChip(chips, "singleBidder", "doar", "un singur ofertant");
  }
  const dim = DIMS.find((d) => d.id === initial.dim);
  if (dim && ["table", "trend", "scatter"].includes(s.block)) {
    s.dim = dim.id;
    chips = addChip(chips, "dim", "cu cine", dim.l);
  }
  const meas = MEASURES.find((m) => m.id === initial.measure);
  if (meas && ["table", "stat", "timeseries", "map"].includes(s.block)) {
    s.measure = meas.id;
    chips = addChip(chips, "measure", "măsură", meas.l);
  }
  const kind = KINDS.find((k) => k.id === f["authorityKind"]);
  if (kind) {
    s.kind = kind.id;
    chips = addChip(chips, "kind", s.block === "entity_card" ? "categorie" : "doar", kind.l);
  }
  const rank = RANKS.find((r) => r.id === initial.rankBy);
  if (rank && s.block === "entity_card") {
    s.rankBy = rank.id;
    chips = addChip(chips, "rankBy", "criteriu", rank.l);
  }
  if (initial.topN && (s.block === "table" || s.block === "trend")) {
    s.topN = Math.min(Number(initial.topN), 50);
    chips = addChip(chips, "topN", "primele", String(s.topN));
  }
  const str = (k: string): string | null =>
    typeof f[k] === "string" && f[k] ? (f[k] as string) : null;
  if (str("cpvTerm")) {
    s.cpvTerm = str("cpvTerm");
    chips = addChip(chips, "cpvTerm", "domeniu", s.cpvTerm!);
  }
  if (str("county")) {
    s.county = COUNTY_BY_FOLD.get(fold(str("county")!)) ?? str("county");
    chips = addChip(chips, "county", "județ", s.county!);
  }
  const siruta = Number(f["uatSiruta"]);
  if (Number.isFinite(siruta) && siruta > 0) {
    const label = str("uatName") ?? `UAT ${siruta}`;
    s.uat = { siruta, label, countyFold: fold(s.county ?? "") };
    chips = addChip(chips, "uat", "localitate", label);
  }
  const aId = Number(f["authorityId"]);
  if (Number.isFinite(aId) && aId > 0) s.authId = aId;
  const sId = Number(f["supplierId"]);
  if (Number.isFinite(sId) && sId > 0) s.supId = sId;
  if (str("authorityName") || s.authId) {
    s.authorityName = str("authorityName") ?? `#${s.authId}`;
    chips = addChip(chips, "authorityName", "autoritate", s.authorityName);
  }
  if (str("supplierName") || s.supId) {
    s.supplierName = str("supplierName") ?? `#${s.supId}`;
    chips = addChip(chips, "supplierName", "furnizor", s.supplierName);
  }
  if (str("compareWith") && s.block === "compare") {
    s.compareWith = str("compareWith");
    chips = addChip(chips, "compareWith", "vs", s.compareWith!);
  }
  {
    const mn = Number(f["minEmployees"]);
    const mx = Number(f["maxEmployees"]);
    const hasMn = Number.isFinite(mn) && f["minEmployees"] !== undefined;
    const hasMx = Number.isFinite(mx) && f["maxEmployees"] !== undefined;
    if (hasMn || hasMx) {
      const label = emplLabel(hasMn ? mn : null, hasMx ? mx : null);
      s.empl = { min: hasMn ? mn : null, max: hasMx ? mx : null, label };
      chips = addChip(chips, "empl", "firme", label);
    }
  }
  if (typeof f["adminPersonKey"] === "string" && f["adminPersonKey"]) {
    const label = (typeof f["adminName"] === "string" && f["adminName"]) || "persoana aleasă";
    s.admin = { key: f["adminPersonKey"] as string, label };
    chips = addChip(chips, "admin", "conduse de", label);
  }
  const yf = Number(f["yearFrom"]);
  const yt = Number(f["yearTo"]);
  if (s.block === "trend") {
    if (Number.isFinite(yf) && yf) { s.yA = yf; chips = addChip(chips, "yA", "din", String(yf)); }
    if (Number.isFinite(yt) && yt) { s.yB = yt; chips = addChip(chips, "yB", "până în", String(yt)); }
  } else {
    const mf = Number(f["monthFrom"]);
    const mt = Number(f["monthTo"]);
    if (Number.isFinite(mf) && mf >= 1 && mf <= 12) s.m0 = mf;
    if (Number.isFinite(mt) && mt >= 1 && mt <= 12) s.m1 = mt;
    const ym = (y: number, m: number | null) =>
      m ? `${y}-${String(m).padStart(2, "0")}` : String(y);
    if (Number.isFinite(yf) && yf) { s.y0 = yf; chips = addChip(chips, "y0", "din", ym(yf, s.m0)); }
    if (Number.isFinite(yt) && yt) { s.y1 = yt; chips = addChip(chips, "y1", "până în", ym(yt, s.m1)); }
  }
  return [s, chips];
}

function toSpec(s: State): BuilderSpec {
  const filters: Record<string, string | number | boolean> = {};
  if (s.singleBidder) filters["singleBidder"] = true;
  if (s.cpvTerm) filters["cpvTerm"] = s.cpvTerm;
  if (s.county) filters["county"] = s.county;
  if (s.uat) {
    filters["uatSiruta"] = s.uat.siruta;
    filters["uatName"] = s.uat.label + (s.county ? ` (${s.county})` : "");
  }
  if (s.kind) filters["authorityKind"] = s.kind;
  if (s.authorityName) filters["authorityName"] = s.authorityName;
  if (s.supplierName) filters["supplierName"] = s.supplierName;
  if (s.compareWith) filters["compareWith"] = s.compareWith;
  if (s.empl?.min !== null && s.empl?.min !== undefined) filters["minEmployees"] = s.empl.min;
  if (s.empl?.max !== null && s.empl?.max !== undefined) filters["maxEmployees"] = s.empl.max;
  if (s.block === "trend") {
    if (s.yA !== null) filters["yearFrom"] = s.yA;
    if (s.yB !== null) filters["yearTo"] = s.yB;
  } else {
    if (s.y0 !== null) filters["yearFrom"] = s.y0;
    if (s.y1 !== null) filters["yearTo"] = s.y1;
    if (s.y0 !== null && s.m0 !== null) filters["monthFrom"] = s.m0;
    if (s.y1 !== null && s.m1 !== null) filters["monthTo"] = s.m1;
  }
  if (s.authId !== null) filters["authorityId"] = s.authId;
  if (s.supId !== null) filters["supplierId"] = s.supId;
  if (s.admin) {
    filters["adminPersonKey"] = s.admin.key;
    filters["adminName"] = s.admin.label;
  }
  const spec: BuilderSpec = { block: s.block ?? "table", measure: s.measure ?? "value", filters };
  if (s.dataset === "contracts" || s.dataset === "da") spec.dataset = s.dataset;
  if (s.dim) spec.dim = s.dim;
  if (s.block === "entity_card" && s.rankBy) spec.rankBy = s.rankBy;
  if (s.topN) spec.topN = s.topN;
  return spec;
}

const MIN_SC = 0.5;

/** Chips whose value comes from a closed preset — click-to-edit shows options. */
const PRESET_SLOTS = new Set<keyof State>([
  "block", "dim", "measure", "kind", "rankBy", "dataset", "topN", "yA", "yB", "y0", "y1",
  "empl",
]);

/** Supplier-size presets for the empl chip editor + partial completions. */
const EMPL_PRESETS: [number | null, number | null, string][] = [
  [null, 0, "fără angajați"],
  [null, 4, "sub 5 angajați"],
  [null, 9, "sub 10 angajați"],
  [null, 49, "sub 50 angajați"],
  [50, null, "cel puțin 50 angajați"],
  [101, null, "peste 100 angajați"],
  [250, null, "cel puțin 250 angajați (firme mari)"],
];

/** Replace a chip's label in place (keeps its position); adds if missing. */
function setChip(ch: Chip[], key: keyof State, cat: string, label: string) {
  const i = ch.findIndex((c) => c.key === key);
  if (i >= 0) ch[i] = { key, cat, label };
  else ch.push({ key, cat, label });
}

function clearKeys(st: State, ch: Chip[], keys: (keyof State)[]) {
  for (const k of keys) {
    (st as unknown as Record<string, unknown>)[k] = null;
    const i = ch.findIndex((c) => c.key === k);
    if (i >= 0) ch.splice(i, 1);
  }
}

/** The dropdown while EDITING a preset chip: only that slot's alternatives. */
function buildEditCands(s: State, key: keyof State, q: string): CandGroup[] {
  const qq = q.trim();
  const items: Cand[] = [];
  const ok = (l: string, kw?: string) => !qq || score(qq, l) >= MIN_SC || (kw ? score(qq, kw) >= MIN_SC : false);
  const cur = (v: unknown, id: unknown) => (v === id ? " · ales acum" : "");

  if (key === "block") {
    for (const b of BLOCKS) {
      if (b.id === "map" && (s.county || s.uat)) continue;
      if (!ok(b.l, b.kw)) continue;
      items.push({
        id: `eb:${b.id}`, ic: b.ic, label: b.l, sub: b.d + cur(s.block, b.id), sc: 1,
        apply: (st, ch) => {
          st.block = b.id;
          setChip(ch, "block", "formă", b.l);
          // keep what stays valid for the new block, clear the rest
          const hasDim = b.id === "table" || b.id === "trend" || b.id === "scatter";
          if (!hasDim || (b.id === "scatter" && st.dim === "county")) clearKeys(st, ch, ["dim"]);
          const hasMeasure = ["table", "stat", "timeseries", "map"].includes(b.id);
          if (!hasMeasure || (st.measure === "value_per_capita" && !(b.id === "table" && st.dim === "authority")))
            clearKeys(st, ch, ["measure"]);
          if (b.id !== "entity_card") clearKeys(st, ch, ["rankBy"]);
          if (b.id !== "table" && b.id !== "trend") clearKeys(st, ch, ["topN"]);
          if (b.id === "trend") clearKeys(st, ch, ["y0", "y1"]);
          else clearKeys(st, ch, ["yA", "yB"]);
        },
      });
    }
  }
  if (key === "dim") {
    for (const d of DIMS) {
      if (s.block === "scatter" && d.id === "county") continue;
      if (d.id === "county" && (s.county || s.uat)) continue;
      if (d.id === "authority" && s.authorityName) continue;
      if (d.id === "supplier" && s.supplierName) continue;
      if (!ok(d.l, d.kw)) continue;
      items.push({
        id: `ed:${d.id}`, ic: "·", label: d.l, sub: d.d + cur(s.dim, d.id), sc: 1,
        apply: (st, ch) => {
          st.dim = d.id;
          setChip(ch, "dim", "cu cine", d.l);
          if (st.measure === "value_per_capita" && d.id !== "authority") clearKeys(st, ch, ["measure"]);
        },
      });
    }
  }
  if (key === "measure") {
    for (const m of MEASURES) {
      if (m.id === "value_per_capita" && !(s.block === "table" && (s.dim === "authority" || !s.dim))) continue;
      if (!ok(m.l, m.kw)) continue;
      items.push({
        id: `em:${m.id}`, ic: "·", label: m.l, sub: m.d + cur(s.measure, m.id), sc: 1,
        apply: (st, ch) => {
          st.measure = m.id;
          setChip(ch, "measure", "măsură", m.l);
          if (m.id === "value_per_capita" && !st.dim) {
            st.dim = "authority";
            setChip(ch, "dim", "cu cine", "autorități");
          }
        },
      });
    }
  }
  if (key === "kind") {
    for (const k of KINDS) {
      if (!ok(k.l, k.kw)) continue;
      items.push({
        id: `ek:${k.id}`, ic: "·", label: k.l, sub: (s.block === "entity_card" ? "categorie" : "filtru") + cur(s.kind, k.id), sc: 1,
        apply: (st, ch) => {
          st.kind = k.id;
          setChip(ch, "kind", s.block === "entity_card" ? "categorie" : "doar", k.l);
        },
      });
    }
  }
  if (key === "empl") {
    for (const [min, max, l] of EMPL_PRESETS) {
      if (!ok(l, "angajati marime firma")) continue;
      const lbl = emplLabel(min, max);
      items.push({
        id: `ee:${l}`, ic: "👥", label: l,
        sub: "mărimea firmei — bilanț MF" + cur(s.empl?.label ?? null, lbl),
        sc: 1,
        apply: (st, ch) => {
          st.empl = { min, max, label: lbl };
          setChip(ch, "empl", "firme", lbl);
        },
      });
    }
  }
  if (key === "rankBy") {
    for (const r of RANKS) {
      if (!ok(r.l, r.kw)) continue;
      items.push({
        id: `er:${r.id}`, ic: "·", label: r.l, sub: "criteriu" + cur(s.rankBy, r.id), sc: 1,
        apply: (st, ch) => {
          st.rankBy = r.id;
          setChip(ch, "rankBy", "criteriu", r.l);
        },
      });
    }
  }
  if (key === "dataset") {
    const opts = [
      { id: null, ic: "🔀", l: "toate sursele", d: "directe + contracte (implicit)" },
      { id: "da", ic: "🧾", l: "doar achiziții directe", d: "sub prag" },
      { id: "contracts", ic: "📑", l: "doar contracte", d: "licitații, peste prag" },
    ];
    for (const o of opts) {
      if (!ok(o.l)) continue;
      items.push({
        id: `eds:${o.id ?? "all"}`, ic: o.ic, label: o.l, sub: o.d + cur(s.dataset, o.id), sc: 1,
        apply: (st, ch) => {
          if (o.id !== "contracts" && st.singleBidder) clearKeys(st, ch, ["singleBidder"]);
          if (o.id === null) clearKeys(st, ch, ["dataset"]);
          else {
            st.dataset = o.id;
            setChip(ch, "dataset", "sursa", o.id === "da" ? "doar achiziții directe" : "doar contracte (peste prag)");
          }
        },
      });
    }
  }
  if (key === "topN") {
    const typed = /^\d{1,3}$/.test(qq) ? Math.min(parseInt(qq, 10), 50) : null;
    for (const n of typed ? [typed] : [3, 5, 10, 25, 50]) {
      items.push({
        id: `en:${n}`, ic: "#", label: `primele ${n}`, sub: (typed ? "număr exact" : "") + cur(s.topN, n), sc: 1,
        apply: (st, ch) => {
          st.topN = n;
          setChip(ch, "topN", "primele", String(n));
        },
      });
    }
  }
  if (key === "yA" || key === "yB" || key === "y0" || key === "y1") {
    const cats: Record<string, string> = { yA: "din", yB: "până în", y0: "din", y1: "până în" };
    for (const y of YEARS) {
      if (qq && !String(y).includes(qq)) continue;
      if (key === "yA" && s.yB !== null && y >= s.yB) continue;
      if (key === "yB" && s.yA !== null && y <= s.yA) continue;
      if (key === "y0" && s.y1 !== null && y > s.y1) continue;
      if (key === "y1" && s.y0 !== null && y < s.y0) continue;
      items.push({
        id: `ey:${key}:${y}`, ic: "📅", label: `${cats[key]} ${y}`, sub: "" + cur(s[key], y), sc: 1,
        apply: (st, ch) => {
          (st as unknown as Record<string, unknown>)[key] = y;
          // editing to a plain year drops the deep-link month rider
          if (key === "y0") st.m0 = null;
          if (key === "y1") st.m1 = null;
          setChip(ch, key, cats[key]!, String(y));
        },
      });
    }
  }
  const CHIP_TITLES: Partial<Record<keyof State, string>> = {
    block: "forma răspunsului", dim: "cu cine", measure: "măsura", kind: "categoria",
    rankBy: "criteriul", dataset: "sursa datelor", topN: "mărimea clasamentului",
    yA: "anul de start", yB: "anul de final", y0: "începutul perioadei", y1: "finalul perioadei",
  };
  return [{ h: `Schimbă ${CHIP_TITLES[key] ?? "opțiunea"}`, items }];
}

function buildCands(s: State, q: string, remote: RemoteSuggest, run: () => void): CandGroup[] {
  const out: CandGroup[] = [];
  const qq = q.trim();
  const it = parseIntents(qq);
  const need = needs(s);
  const first = need[0] ?? null;
  const focalNeeded = ["focal", "focalAuthority", "focalSupplier", "compareWith"].includes(first ?? "");
  /** Score a static vocab option against the query (label + desc + keywords). */
  const vsc = (l: string, d?: string, kw?: string, qOverride?: string): number => {
    const qx = qOverride ?? qq;
    if (!qx) return 0;
    return Math.max(score(qx, l), d ? score(qx, d) : 0, kw ? score(qx, kw) : 0);
  };

  // (the Rulează row is appended LAST — see end of this function)

  // ---------- required next step ----------
  const req: Cand[] = [];
  if (!s.block && (first === "block" || qq)) {
    for (const b of BLOCKS) {
      // map IS a by-county breakdown — contradictory with a county/locality filter
      if (b.id === "map" && (s.county || s.uat)) continue;
      const sc = qq ? vsc(b.l, b.d, b.kw) : 1;
      if (qq && sc < MIN_SC) continue;
      req.push({
        id: `b:${b.id}`, ic: b.ic, label: b.l, sub: b.d, sc,
        apply: (st, ch) => { st.block = b.id; ch.push({ key: "block", cat: "formă", label: b.l }); },
      });
    }
  }
  if (s.block && (s.block === "table" || s.block === "trend" || s.block === "scatter") && !s.dim && (first === "dim" || qq)) {
    for (const d of DIMS) {
      if (s.block === "scatter" && d.id === "county") continue;
      // a filter already pinning the dimension to one value → 1-row clasament
      if (d.id === "county" && (s.county || s.uat)) continue;
      if (d.id === "authority" && s.authorityName) continue;
      if (d.id === "supplier" && s.supplierName) continue;
      const sc = qq ? vsc(d.l, d.d, d.kw, it.stripped.dim) : 1;
      if (qq && sc < MIN_SC) continue;
      req.push({
        id: `d:${d.id}`, ic: "·", label: d.l, sub: d.d, sc,
        apply: (st, ch) => { st.dim = d.id; ch.push({ key: "dim", cat: "cu cine", label: d.l }); },
      });
    }
  }
  if (s.block && ["table", "stat", "timeseries", "map"].includes(s.block) && !s.measure && (first === "measure" || qq)) {
    for (const m of MEASURES) {
      if (m.id === "value_per_capita" && !(s.block === "table" && (s.dim === "authority" || !s.dim))) continue;
      const sc = qq ? (it.perCapita && m.id === "value_per_capita" ? 1 : vsc(m.l, m.d, m.kw)) : 1;
      if (qq && sc < MIN_SC) continue;
      req.push({
        id: `m:${m.id}`, ic: "·", label: m.l, sub: m.d, sc,
        apply: (st, ch) => {
          st.measure = m.id;
          ch.push({ key: "measure", cat: "măsură", label: m.l });
          if (m.id === "value_per_capita" && !st.dim) {
            st.dim = "authority";
            ch.push({ key: "dim", cat: "cu cine", label: "autorități", auto: true });
          }
        },
      });
    }
  }
  if (s.block === "entity_card" && !s.kind && (first === "kind" || qq)) {
    for (const k of KINDS) {
      const sc = qq ? vsc(k.l, undefined, k.kw, it.stripped.kind) : 1;
      if (qq && sc < MIN_SC) continue;
      req.push({
        id: `k:${k.id}`, ic: "·", label: k.l, sub: "categorie", sc,
        apply: (st, ch) => { st.kind = k.id; ch.push({ key: "kind", cat: "categorie", label: k.l }); },
      });
    }
  }
  if (s.block === "entity_card" && !s.rankBy && (first === "rankBy" || qq)) {
    for (const r of RANKS) {
      const sc = qq ? (it.risk && r.id === "risk" ? 1 : vsc(r.l, undefined, r.kw)) : 1;
      if (qq && sc < MIN_SC) continue;
      req.push({
        id: `r:${r.id}`, ic: "·", label: r.l, sub: "criteriu", sc,
        apply: (st, ch) => { st.rankBy = r.id; ch.push({ key: "rankBy", cat: "criteriu", label: r.l }); },
      });
    }
  }
  if (s.block === "trend" && (s.yA === null || s.yB === null)) {
    const digs = it.yearFrom?.digits ?? it.yearTo?.digits ?? (it.yearBare ? String(it.yearBare.year) : /^\d{2,4}$/.test(qq) ? qq : null);
    for (const y of YEARS) {
      const ys = String(y);
      if (qq && digs === null) continue;
      if (qq && digs && !ys.includes(digs)) continue;
      if (s.yA === null) {
        if (it.yearTo) continue;
        if (!qq && first !== "yA") continue;
        req.push({
          id: `yA:${y}`, ic: "·", label: `din ${y}`, sub: "anul de start", sc: 1,
          apply: (st, ch) => { st.yA = y; ch.push({ key: "yA", cat: "din", label: ys }); },
        });
      } else if (s.yB === null && y > s.yA) {
        if (it.yearFrom) continue;
        if (!qq && first !== "yB") continue;
        req.push({
          id: `yB:${y}`, ic: "·", label: `până în ${y}`, sub: "anul de final", sc: 1,
          apply: (st, ch) => { st.yB = y; ch.push({ key: "yB", cat: "până în", label: ys }); },
        });
      }
    }
  }
  // focal steps: the required candidates ARE the remote entity results
  if (focalNeeded) {
    const wantAuth = first !== "focalSupplier";
    const wantSupp = first !== "focalAuthority";
    const asCompare = first === "compareWith";
    if (wantAuth)
      for (const a of remote.authority) {
        if (asCompare && a.name === s.authorityName) continue;
        req.push({
          id: `fa:${a.name}`, ic: "🏛️", label: a.name, sub: `autoritate${a.county ? ` · jud. ${a.county}` : ""}`,
          sc: entityScore(qq, a.name) || 0.6,
          apply: (st, ch) => {
            if (asCompare) { st.compareWith = a.name; ch.push({ key: "compareWith", cat: "vs", label: a.name }); }
            else { st.authorityName = a.name; ch.push({ key: "authorityName", cat: "autoritate", label: a.name }); }
          },
        });
      }
    if (wantSupp)
      for (const f of remote.supplier) {
        if (asCompare && f.name === s.supplierName) continue;
        req.push({
          id: `fs:${f.name}`, ic: "🏢", label: f.name, sub: `furnizor${f.county ? ` · ${f.county}` : ""}`,
          sc: entityScore(qq, f.name) || 0.6,
          apply: (st, ch) => {
            if (asCompare && !s.authorityName) { st.compareWith = f.name; ch.push({ key: "compareWith", cat: "vs", label: f.name }); }
            else { st.supplierName = f.name; ch.push({ key: "supplierName", cat: "furnizor", label: f.name }); }
          },
        });
      }
  }
  req.sort((a, b) => b.sc - a.sc);
  if (req.length)
    out.push({ h: first ? `Pasul următor · ${NEED_LABEL[first]}` : "Completează", items: req.slice(0, qq ? 7 : 9) });

  // ---------- narrow (optional, dynamic) ----------
  const nar: Cand[] = [];
  const namedEntity = s.authorityName ?? s.supplierName;

  // block-from-dim shortcut ("furnizori" before any block)
  if (qq && !s.block && !s.dim) {
    for (const d of DIMS) {
      const sc = vsc(d.l, d.d, d.kw, it.stripped.dim);
      if (sc < MIN_SC) continue;
      nar.push({
        id: `bd:${d.id}`, ic: "📊", label: `clasament cu ${d.l}`, sub: "formă + dimensiune", sc: sc - 0.05,
        apply: (st, ch) => {
          st.block = "table";
          ch.push({ key: "block", cat: "formă", label: "clasament", auto: true });
          st.dim = d.id;
          ch.push({ key: "dim", cat: "cu cine", label: d.l });
        },
      });
    }
  }
  // name-driven investigative blocks: an entity is named, no block chosen yet
  if (!s.block && namedEntity && !qq) {
    for (const b of BLOCKS.filter((x) => "focal" in x && x.focal === 1))
      nar.push({
        id: `nb:${b.id}`, ic: b.ic, label: b.l, sub: `despre ${namedEntity.slice(0, 32)}`, sc: 1, hot: true,
        apply: (st, ch) => { st.block = b.id; ch.push({ key: "block", cat: "formă", label: b.l }); },
      });
    if (s.authorityName && s.supplierName)
      nar.push({
        id: "nb:fact_check", ic: "✅", label: "au făcut afaceri?", sub: `${s.authorityName.slice(0, 22)} × ${s.supplierName.slice(0, 22)}`, sc: 1.1, hot: true,
        apply: (st, ch) => { st.block = "fact_check"; ch.push({ key: "block", cat: "formă", label: "au făcut afaceri?" }); },
      });
    else
      nar.push({
        id: "nb:compare", ic: "⚖️", label: `compară ${namedEntity.slice(0, 28)} cu…`, sub: "alegi a doua entitate", sc: 0.9, hot: true,
        apply: (st, ch) => { st.block = "compare"; ch.push({ key: "block", cat: "formă", label: "compară două entități" }); },
      });
  }
  // topN
  const ranking = s.block === "table" || s.block === "trend";
  if (ranking && !s.topN && it.topN) {
    if (it.topN.n !== null) {
      const n = it.topN.n;
      nar.push({
        id: `top:${n}`, ic: "#", label: `primele ${n} rezultate`, sub: it.topN.over ? "maxim 50" : "mărimea clasamentului", sc: 1.2,
        apply: (st, ch) => { st.topN = n; ch.push({ key: "topN", cat: "primele", label: String(n) }); },
      });
    } else {
      for (const n of [3, 10, 25])
        nar.push({
          id: `top:${n}`, ic: "#", label: `primele ${n}`, sub: "scrie și un număr exact", sc: 1,
          apply: (st, ch) => { st.topN = n; ch.push({ key: "topN", cat: "primele", label: String(n) }); },
        });
    }
  }
  if (!qq && ranking && !s.topN) {
    for (const n of [3, 10, 25])
      nar.push({
        id: `top:${n}`, ic: "#", label: `primele ${n}`, sub: "mărimea clasamentului", sc: 0.4,
        apply: (st, ch) => { st.topN = n; ch.push({ key: "topN", cat: "primele", label: String(n) }); },
      });
  }
  // breakdown starters: top CPV divisions (high-level — leaf terms make a
  // one-slice "composition"); shown before typing, replaced by typed matches
  if (s.block === "breakdown" && !s.cpvTerm && !qq) {
    for (const d of remote.division ?? [])
      nar.push({
        id: `div:${d.code}`, ic: "🧩", label: d.name, sub: "domeniu mare — vezi compoziția lui", sc: 0.95, hot: true,
        apply: (st, ch) => { st.cpvTerm = d.code; ch.push({ key: "cpvTerm", cat: "domeniu", label: d.name }); },
      });
  }
  // cpv (remote) + free text
  if (!s.cpvTerm) {
    for (const c of remote.cpv.slice(0, 5))
      nar.push({
        id: `cpv:${c.term}`, ic: "🧱", label: c.term, sub: c.cpvName ?? "domeniu CPV", sc: score(qq, c.term) || 0.55,
        apply: (st, ch) => { st.cpvTerm = c.term; ch.push({ key: "cpvTerm", cat: "domeniu", label: c.term }); },
      });
    if (qq.length >= 3 && !it.consumed && !focalNeeded && !remote.cpv.some((c) => fold(c.term) === fold(qq)))
      nar.push({
        id: "cpv:free", ic: "🧱", label: `caută „${qq}” ca domeniu`, sub: "text liber → CPV", free: true, sc: 0.31,
        apply: (st, ch) => { st.cpvTerm = qq; ch.push({ key: "cpvTerm", cat: "domeniu", label: qq }); },
      });
  }
  // localities (remote) — not for map / county-dim rankings: already by-county
  if (!s.uat && s.block !== "map" && s.dim !== "county") {
    for (const u of remote.uat.slice(0, 5)) {
      const short = `${TIP_SHORT[u.tip] ?? ""} ${u.name}`.trim();
      const countyDisplay = COUNTY_BY_FOLD.get(u.county) ?? u.county;
      nar.push({
        id: `uat:${u.siruta}`, ic: "🏘️", label: `${u.tip} ${u.name}`, sub: `jud. ${countyDisplay}`,
        sc: score(it.stripped.place, u.name) || score(qq, u.name) || 0.5, hot: !!s.county,
        apply: (st, ch) => {
          st.uat = { siruta: u.siruta, label: short, countyFold: u.county };
          ch.push({ key: "uat", cat: "localitate", label: short });
          if (fold(st.county ?? "") !== u.county) {
            st.county = countyDisplay;
            ch.push({ key: "county", cat: "județ", label: countyDisplay, auto: true });
          }
        },
      });
    }
  }
  // counties (static) — not for map / county-dim rankings (see above)
  if (!s.county && s.block !== "map" && s.dim !== "county" && qq) {
    for (const c of COUNTIES) {
      const sc = Math.max(score(it.stripped.county, c), score(it.stripped.place, c));
      if (sc < MIN_SC) continue;
      nar.push({
        id: `co:${c}`, ic: "📍", label: `jud. ${c}`, sub: "județul autorității", sc,
        apply: (st, ch) => { st.county = c; ch.push({ key: "county", cat: "județ", label: c }); },
      });
    }
  }
  // authority kind as filter
  if (!s.kind && s.block !== "entity_card" && qq) {
    for (const k of KINDS) {
      const sc = vsc(k.l, undefined, k.kw, it.stripped.kind);
      if (sc < MIN_SC) continue;
      nar.push({
        id: `kf:${k.id}`, ic: "🏛️", label: `doar ${k.l}`, sub: "tip de autoritate", sc: sc - 0.05,
        apply: (st, ch) => { st.kind = k.id; ch.push({ key: "kind", cat: "doar", label: k.l }); },
      });
    }
  }
  // entities as filters (remote) — and the two-entity block implications
  if (!focalNeeded) {
    // ranking rows ARE this role → a same-role name filter = 1-row clasament
    const ranking = s.block === "table" || s.block === "trend" || s.block === "scatter";
    if (!s.authorityName && !(ranking && (s.dim === "authority" || (s.block === "scatter" && !s.dim))))
      for (const a of remote.authority)
        nar.push({
          id: `au:${a.name}`, ic: "🏛️", label: a.name, sub: `autoritate${a.county ? ` · jud. ${a.county}` : ""}`,
          sc: entityScore(qq, a.name) || 0.5,
          apply: (st, ch) => { st.authorityName = a.name; ch.push({ key: "authorityName", cat: "autoritate", label: a.name }); },
        });
    else if (s.block === null || s.block === "compare")
      for (const a of remote.authority.filter((x) => x.name !== s.authorityName))
        nar.push({
          id: `cw:${a.name}`, ic: "⚖️", label: `compară cu ${a.name}`, sub: "a doua autoritate", sc: entityScore(qq, a.name) || 0.5,
          apply: (st, ch) => {
            if (!st.block) { st.block = "compare"; ch.push({ key: "block", cat: "formă", label: "compară două entități", auto: true }); }
            st.compareWith = a.name;
            ch.push({ key: "compareWith", cat: "vs", label: a.name });
          },
        });
    if (!s.supplierName && !(ranking && s.dim === "supplier"))
      for (const f of remote.supplier)
        nar.push({
          id: `su:${f.name}`, ic: "🏢", label: f.name, sub: `furnizor${f.county ? ` · ${f.county}` : ""}`,
          sc: entityScore(qq, f.name) || 0.5,
          apply: (st, ch) => { st.supplierName = f.name; ch.push({ key: "supplierName", cat: "furnizor", label: f.name }); },
        });
    // ONRC administrators → all their firms at once ("firme conduse de …")
    if (!s.admin)
      for (const per of remote.person)
        nar.push({
          id: `adm:${per.key}`, ic: "👤", label: `firme conduse de ${per.name}`,
          sub: `${per.birthYear ? `n. ${per.birthYear}${per.birthLocality ? `, ${per.birthLocality}` : ""} · ` : ""}${per.nFirms} firme · ONRC`,
          sc: (score(qq, per.name) || 0.52) - 0.02,
          apply: (st, ch) => {
            const label = `${per.name}${per.birthYear ? ` (n. ${per.birthYear})` : ""}`;
            st.admin = { key: per.key, label };
            ch.push({ key: "admin", cat: "conduse de", label });
          },
        });
  }
  // period
  if (s.block !== "trend") {
    if (it.yearExact) {
      const y = it.yearExact.year;
      nar.push({
        id: `ye:${y}`, ic: "📅", label: `doar ${y}`, sub: it.yearExact.label ?? "un singur an", sc: 1.1,
        apply: (st, ch) => {
          st.y0 = y; st.y1 = y;
          ch.push({ key: "y0", cat: "din", label: String(y) });
          ch.push({ key: "y1", cat: "până în", label: String(y) });
        },
      });
    }
    if (it.yearRange) {
      const { from, to, label } = it.yearRange;
      nar.push({
        id: `yr:${from}`, ic: "📅", label, sub: `${from}–${to}`, sc: 1.1,
        apply: (st, ch) => {
          st.y0 = Math.max(from, 2018); st.y1 = to;
          ch.push({ key: "y0", cat: "din", label: String(Math.max(from, 2018)) });
          ch.push({ key: "y1", cat: "până în", label: String(to) });
        },
      });
    }
    if (it.yearFrom || it.yearTo || it.yearBare || /^\d{2,4}$/.test(qq)) {
      const digs = it.yearFrom?.digits || it.yearTo?.digits || (it.yearBare ? String(it.yearBare.year) : /^\d{2,4}$/.test(qq) ? qq : "");
      for (const y of YEARS.filter((y) => !digs || String(y).includes(digs))) {
        if (s.y0 === null && !it.yearTo)
          nar.push({
            id: `y0:${y}`, ic: "📅", label: `din ${y}`, sub: "perioadă", sc: 0.9,
            apply: (st, ch) => { st.y0 = y; ch.push({ key: "y0", cat: "din", label: String(y) }); },
          });
        if (s.y1 === null && !it.yearFrom)
          nar.push({
            id: `y1:${y}`, ic: "📅", label: `până în ${y}`, sub: "perioadă", sc: 0.88,
            apply: (st, ch) => { st.y1 = y; ch.push({ key: "y1", cat: "până în", label: String(y) }); },
          });
      }
    }
  }
  // data stream + competition (default = BOTH channels; chips narrow to one)
  if (s.dataset !== "contracts" && (it.datasetContracts || it.singleBidder)) {
    nar.push({
      id: "ds:contracts", ic: "📑", label: "sursa: doar contracte (licitații, peste prag)",
      sub: "implicit cauți în ambele canale", sc: 1.2,
      apply: (st, ch) => {
        st.dataset = "contracts";
        ch.push({ key: "dataset", cat: "sursa", label: "doar contracte (peste prag)" });
      },
    });
  }
  if (s.dataset !== "da" && it.datasetDa) {
    nar.push({
      id: "ds:da", ic: "🧾", label: "sursa: doar achiziții directe (sub prag)",
      sub: "implicit cauți în ambele canale", sc: 1.2,
      apply: (st, ch) => {
        if (st.singleBidder) {
          st.singleBidder = null;
          const j = ch.findIndex((c) => c.key === "singleBidder");
          if (j >= 0) ch.splice(j, 1);
        }
        st.dataset = "da";
        const i = ch.findIndex((c) => c.key === "dataset");
        if (i >= 0) ch.splice(i, 1);
        ch.push({ key: "dataset", cat: "sursa", label: "doar achiziții directe" });
      },
    });
  }
  if (!s.singleBidder && (it.singleBidder || (s.dataset === "contracts" && !qq))) {
    nar.push({
      id: "sb", ic: "1️⃣", label: "doar cu un singur ofertant", sub: "competiția, din datele TED",
      sc: it.singleBidder ? 1.25 : 0.39, hot: !!it.singleBidder,
      apply: (st, ch) => {
        if (st.dataset !== "contracts") {
          st.dataset = "contracts";
          ch.push({ key: "dataset", cat: "sursa", label: "doar contracte (peste prag)", auto: true });
        }
        st.singleBidder = true;
        ch.push({ key: "singleBidder", cat: "doar", label: "un singur ofertant" });
      },
    });
  }
  // note: singleBidder auto-chip sets dataset="contracts" — the chip's label
  // must match the three-state wording

  // supplier size ("sub 5 angajați", "fără angajați", "peste 100 angajați")
  if (!s.empl && it.employees) {
    if (it.employees.partial) {
      // number/word still being typed — offer concrete completions
      for (const [min, max, l] of [
        [null, 0, "fără angajați"],
        [null, 4, "sub 5 angajați"],
        [null, 9, "sub 10 angajați"],
        [101, null, "peste 100 angajați"],
      ] as [number | null, number | null, string][]) {
        nar.push({
          id: `emp:${l}`, ic: "👥", label: l, sub: "mărimea firmei — bilanț MF", sc: 1.2, hot: true,
          apply: (st, ch) => {
            st.empl = { min, max, label: emplLabel(min, max) };
            ch.push({ key: "empl", cat: "firme", label: emplLabel(min, max) });
          },
        });
      }
    } else {
      const { min = null, max = null } = it.employees;
      const lbl = emplLabel(min ?? null, max ?? null);
      nar.push({
        id: "emp:x", ic: "👥", label: lbl, sub: "mărimea firmei — bilanț MF", sc: 1.25, hot: true,
        apply: (st, ch) => {
          st.empl = { min: min ?? null, max: max ?? null, label: lbl };
          ch.push({ key: "empl", cat: "firme", label: lbl });
        },
      });
    }
  }

  // "riscant" typed → entity_card shortcut
  if (it.risk && !s.block) {
    nar.push({
      id: "risk:card", ic: "🏛️", label: "cea mai riscantă entitate", sub: "fișă entitate după CRI", sc: 1.15,
      apply: (st, ch) => {
        st.block = "entity_card";
        ch.push({ key: "block", cat: "formă", label: "fișă entitate" });
        st.rankBy = "risk";
        ch.push({ key: "rankBy", cat: "criteriu", label: "cea mai riscantă (CRI)", auto: true });
      },
    });
  }
  // ---------- empty-input example seeds: never a dead-end dropdown ----------
  // After every completed step the user should SEE what can come next — a few
  // concrete picks per open slot, plus "scrie…" hints for the type-in ones.
  if (!qq && !focalNeeded && s.block) {
    if (!s.cpvTerm) {
      for (const t of ["lemne de foc", "asfaltare"])
        nar.push({
          id: `ex-cpv:${t}`, ic: "🧱", label: t, sub: "exemplu — scrie orice domeniu", sc: 0.38,
          apply: (st, ch) => { st.cpvTerm = t; ch.push({ key: "cpvTerm", cat: "domeniu", label: t }); },
        });
    }
    if (!s.county && !s.uat && s.block !== "map" && s.dim !== "county")
      nar.push({
        id: "ex-co:Cluj", ic: "📍", label: "jud. Cluj", sub: "exemplu — scrie orice județ", sc: 0.37,
        apply: (st, ch) => { st.county = "Cluj"; ch.push({ key: "county", cat: "județ", label: "Cluj" }); },
      });
    if (!s.empl && (s.dim === "supplier" || s.block === "table"))
      nar.push({
        id: "ex-empl", ic: "👥", label: "sub 5 angajați", sub: "exemplu — mărimea firmei (bilanț MF)", sc: 0.355,
        apply: (st, ch) => {
          st.empl = { min: null, max: 4, label: emplLabel(null, 4) };
          ch.push({ key: "empl", cat: "firme", label: emplLabel(null, 4) });
        },
      });
    if (!s.kind && s.block !== "entity_card" && (s.dim === "authority" || !s.dim))
      nar.push({
        id: "ex-kind", ic: "🏛️", label: "doar comune", sub: "exemplu — sau orașe, spitale, școli…", sc: 0.36,
        apply: (st, ch) => { st.kind = "comuna"; ch.push({ key: "kind", cat: "doar", label: "comune" }); },
      });
    if (s.y0 === null && s.y1 === null && s.block !== "trend")
      nar.push({
        id: "ex-years", ic: "📅", label: "ultimii 3 ani", sub: "exemplu — sau „din 2020”, „în 2023”…", sc: 0.35,
        apply: (st, ch) => {
          st.y0 = 2023; st.y1 = 2026;
          ch.push({ key: "y0", cat: "din", label: "2023" });
          ch.push({ key: "y1", cat: "până în", label: "2026" });
        },
      });
    if (!s.dataset) {
      nar.push({
        id: "ex-ds-c", ic: "📑", label: "sursa: doar contracte (licitații)",
        sub: "implicit: ambele canale", sc: 0.34,
        apply: (st, ch) => {
          st.dataset = "contracts";
          ch.push({ key: "dataset", cat: "sursa", label: "doar contracte (peste prag)" });
        },
      });
      nar.push({
        id: "ex-ds-d", ic: "🧾", label: "sursa: doar achiziții directe",
        sub: "implicit: ambele canale", sc: 0.33,
        apply: (st, ch) => {
          st.dataset = "da";
          ch.push({ key: "dataset", cat: "sursa", label: "doar achiziții directe" });
        },
      });
    }
    if (!s.authorityName && !s.uat)
      nar.push({ id: "h-auth", ic: "🏛️", label: "o autoritate sau o localitate anume", sub: "scrie numele în câmp", sc: 0.2, hint: true });
    if (!s.supplierName)
      nar.push({ id: "h-supp", ic: "🏢", label: "un furnizor anume", sub: "scrie numele firmei", sc: 0.19, hint: true });
  }

  nar.sort((a, b) => b.sc - a.sc);
  if (nar.length) out.push({ h: qq ? "Sau îngustează" : "Îngustează", items: nar.slice(0, 12) });

  // Rulează — always the LAST row, so the eye passes the possibilities first.
  if (!qq && need.length === 0) {
    out.push({
      h: null,
      items: [{ id: "run", ic: "▶", label: "Rulează interogarea", sub: "Enter", sc: 2, run: true, apply: run }],
    });
  }
  return out;
}

export default function Builder({
  initial,
  fromAi,
  onRun,
  running,
}: {
  initial?: BuilderSpec | null;
  fromAi?: boolean;
  onRun: (spec: BuilderSpec) => void;
  running: boolean;
}) {
  const [init] = useState(() => initFrom(initial));
  const [state, setState] = useState<State>(init[0]);
  const [chips, setChips] = useState<Chip[]>(init[1]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  /** -1 = "auto": highlight Rulează when runnable, else the first item. */
  const [act, setAct] = useState(-1);
  /** Chip being click-edited (preset slots only) — dropdown shows alternatives. */
  const [editing, setEditing] = useState<keyof State | null>(null);
  const [remote, setRemote] = useState<RemoteSuggest>(EMPTY_REMOTE);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focal steps (network/sankey/… need an entity) must never show an empty
  // dropdown: with nothing typed we fetch the biggest entities as starters.
  // Breakdown gets the same treatment with top CPV DIVISIONS (high-level —
  // a leaf term would make a one-slice "composition").
  const focalWaiting =
    ["focal", "focalAuthority", "focalSupplier", "compareWith"].includes(
      needs(state)[0] ?? "",
    ) ||
    (state.block === "breakdown" && !state.cpvTerm);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 && !focalWaiting) {
      setRemote(EMPTY_REMOTE);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams(term.length >= 2 ? { q: term } : { top: "1" });
      if (state.county && !state.uat) params.set("county", fold(state.county));
      fetch(`/api/suggest?${params}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : EMPTY_REMOTE))
        .then((r: RemoteSuggest) => setRemote(r))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, state.county, state.uat, focalWaiting]);

  const missing = needs(state);
  const runnable = missing.length === 0;

  const run = () => {
    if (needs(state).length === 0) onRun(toSpec(state));
  };

  const groups = useMemo(
    () => (editing ? buildEditCands(state, editing, q) : buildCands(state, q, remote, run)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, q, remote, editing],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items).filter((c) => !c.hint), [groups]);
  const runIdx = useMemo(() => flat.findIndex((c) => c.run), [flat]);
  const active =
    act === -1
      ? runIdx >= 0 && !q.trim()
        ? runIdx
        : 0
      : Math.min(act, Math.max(0, flat.length - 1));

  const pick = (c: Cand) => {
    if (c.run) {
      run();
      setOpen(false);
      return;
    }
    if (!c.apply) return;
    const ns = { ...state };
    const nc = [...chips];
    c.apply(ns, nc);
    setState(ns);
    setChips(nc);
    setQ("");
    setAct(-1);
    setEditing(null);
    inputRef.current?.focus();
  };

  const removeChip = (key: keyof State) => {
    const [ns, nc] = drop(state, chips, key);
    setState(ns);
    setChips(nc);
    setEditing(null);
    inputRef.current?.focus();
  };

  /** Click a chip → edit it: presets show their options, text chips reopen search. */
  const startEdit = (key: keyof State) => {
    if (PRESET_SLOTS.has(key)) {
      setEditing(editing === key ? null : key);
      setQ("");
      setAct(-1);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }
    // text/remote slot: put the old label back in the field and search again
    const label = chips.find((c) => c.key === key)?.label ?? "";
    const [ns, nc] = drop(state, chips, key);
    setState(ns);
    setChips(nc);
    setEditing(null);
    setQ(label);
    setAct(-1);
    setOpen(true);
    inputRef.current?.focus();
  };

  const reset = () => {
    setState(blank());
    setChips([]);
    setQ("");
    inputRef.current?.focus();
  };

  const onKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "ArrowDown") {
      setAct(Math.min(active + 1, flat.length - 1));
      ev.preventDefault();
    } else if (ev.key === "ArrowUp") {
      setAct(Math.max(active - 1, 0));
      ev.preventDefault();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (!q.trim() && runnable && (!flat[active] || flat[active].run)) {
        run();
        setOpen(false);
        return;
      }
      if (flat[active]) pick(flat[active]);
    } else if (ev.key === "Escape") {
      if (editing) setEditing(null);
      else setOpen(false);
    } else if (ev.key === "Backspace" && !q && chips.length > 0) {
      if (editing) {
        setEditing(null);
      } else {
        removeChip(chips[chips.length - 1]!.key);
      }
      ev.preventDefault();
    }
  };

  return (
    <div className="cb-card">
      {fromAi && (
        <div className="qb-fromai">
          ✨ Pornit din întrebarea ta — ajustează liber, apoi rulează. Fără AI de aici încolo.
        </div>
      )}
      <div className="cb-wrap">
        <div className="cb-combo" onClick={() => inputRef.current?.focus()}>
          {chips.map((c) => (
            <span
              key={c.key}
              className={
                "cb-chip" + (c.auto ? " auto" : "") + (editing === c.key ? " editing" : "")
              }
              title={PRESET_SLOTS.has(c.key) ? "schimbă opțiunea" : "caută altă valoare"}
              onClick={(ev) => {
                ev.stopPropagation();
                startEdit(c.key);
              }}
            >
              <span className="cat">{c.cat}</span> <b>{c.label}</b>
              <span
                className="x"
                title="scoate"
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeChip(c.key);
                }}
              >
                ✕
              </span>
            </span>
          ))}
          <input
            ref={inputRef}
            value={q}
            placeholder={
              chips.length === 0
                ? "scrie: clasament, lemne de foc, Brăești, «rețeaua» unei firme…"
                : runnable
                  ? "îngustează sau Enter ca să rulezi…"
                  : "continuă să scrii…"
            }
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setAct(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() =>
              setTimeout(() => {
                setOpen(false);
                setEditing(null);
              }, 130)
            }
            onKeyDown={onKey}
            aria-label="Construiește interogarea"
          />
        </div>
        {open && (
          <div className="cb-dd">
            {flat.length === 0 && (
              <div className="cb-empty">
                nimic găsit — încearcă alt cuvânt (ex.: „asfaltare”, „Cluj”, „spitale”, numele unei firme)
              </div>
            )}
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.h && <div className="cb-h">{g.h}</div>}
                {g.items.map((c) => {
                  if (c.hint) {
                    return (
                      <div key={c.id} className="cb-item hintrow">
                        <span className="ic">{c.ic}</span>
                        <span className="lb">{c.label}</span>
                        <span className="sb">{c.sub ?? ""}</span>
                      </div>
                    );
                  }
                  const idx = flat.indexOf(c);
                  return (
                    <div
                      key={c.id}
                      className={
                        "cb-item" +
                        (c.run ? " run" : "") +
                        (c.hot ? " hot" : "") +
                        (c.free ? " free" : "") +
                        (idx === active ? " act" : "")
                      }
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pick(c);
                      }}
                    >
                      <span className="ic">{c.ic}</span>
                      <span className="lb">{c.label}</span>
                      <span className="sb">{c.sub ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="cb-under">
        <button type="button" className="cb-run" disabled={!runnable || running} onClick={run}>
          {running ? "…" : "Rulează →"}
        </button>
        <span className="cb-need">
          {missing.length > 0
            ? `mai lipsește: ${missing.map((m) => NEED_LABEL[m]).join(" · ")}`
            : "gata de rulat — Enter sau butonul"}
        </span>
        {chips.length > 0 && (
          <button type="button" className="cb-reset" onClick={reset}>
            de la capăt
          </button>
        )}
      </div>
    </div>
  );
}
