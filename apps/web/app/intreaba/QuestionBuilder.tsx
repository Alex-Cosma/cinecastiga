"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { COUNTIES } from "@/lib/counties";
import type { EntityHit } from "@/lib/search";
import type { AskSpec } from "@/lib/ask/spec";
import {
  QUESTION_GROUPS, QUESTION_TYPES, KIND_OPTIONS, cloneQuestion, defaultQuestion,
  entityLabel, focalRole, foldQuestion, isProfileQuestion, periodLabel,
  questionErrors, questionKey, transitionQuestion, type QuestionSpec,
} from "@/lib/ask/question-ui";
import "./question-builder.css";

export type QuestionBuilderSpec = QuestionSpec;
type RunOutcome = boolean | QuestionSpec | AskSpec | void;
export interface QuestionBuilderProps {
  initial?: QuestionSpec | null;
  fromAi?: boolean;
  onRun: (spec: QuestionSpec) => RunOutcome | Promise<RunOutcome>;
  running: boolean;
  onDraftChange?: (dirty: boolean) => void;
}

type Field = "catalogue" | "add" | "dim" | "measure" | "rankBy" | "topN" | "dataset" | "county" | "authorityKind" | "period" | "cpvTerm" | "authority" | "supplier" | "focal" | "compareWith" | "uat" | "employees" | "admin" | "singleBidder";
interface SuggestionData {
  authority?: { name: string; county: string | null; entityId?: number }[];
  supplier?: { name: string; county: string | null; entityId?: number }[];
  cpv?: { term: string; cpvName: string | null }[];
  division?: { code: string; name: string }[];
  uat?: { siruta: number; name: string; tip: string; county: string; population: number | null }[];
  person?: { key: string; name: string; birthYear: number | null; birthLocality: string | null; nFirms: number }[];
}
interface Choice { value: string; label: string; detail?: string; }

const SOURCES: Record<string, string> = { all: "Toate achizițiile", da: "Achiziții directe", contracts: "Contracte din proceduri" };
const FIELDS: Record<Field, { title: string; note: string }> = {
  catalogue: { title: "Ce ai vrea să afli?", note: "13 feluri de a privi datele. Alege întrebarea, apoi fă-o a ta." },
  add: { title: "Fă întrebarea mai precisă", note: "Adaugă doar condițiile care te interesează. Le poți schimba oricând." },
  dim: { title: "Pe cine vrei să vezi?", note: "Alege ce reprezintă fiecare rând din rezultat." },
  measure: { title: "Cum comparăm?", note: "Aceeași întrebare poate spune altceva când schimbi măsura." },
  rankBy: { title: "Ce vrei să descoperi?", note: "Un indice ridicat este un punct de plecare pentru verificări." },
  topN: { title: "Cât de lung să fie clasamentul?", note: "Lista de surse păstrează întreaga bază a întrebării, indiferent câte rânduri afișăm." },
  dataset: { title: "Ce achiziții includem?", note: "Contractele din proceduri și achizițiile directe sunt surse distincte." },
  county: { title: "De unde pornim?", note: "Pentru achiziții, județul este al instituției cumpărătoare." },
  authorityKind: { title: "Ce instituții te interesează?", note: "Poți privi toate instituțiile sau un singur tip." },
  period: { title: "În ce perioadă?", note: "Poți alege și lunile, pentru o verificare mai precisă." },
  cpvTerm: { title: "Ce fel de achiziții?", note: "Scrie un domeniu, un produs sau un cod CPV: medicamente, asfaltare, mobilier…" },
  authority: { title: "Care instituție?", note: "Caută numele instituției cumpărătoare." },
  supplier: { title: "Care firmă?", note: "Caută numele firmei furnizoare sau codul fiscal." },
  focal: { title: "Despre cine vrei să afli?", note: "Alege o instituție sau o firmă ca punct de plecare." },
  compareWith: { title: "Cu cine comparăm?", note: "Comparăm două instituții sau două firme, folosind profilurile lor istorice." },
  uat: { title: "Ce localitate te interesează?", note: "Include instituțiile asociate localității: primărie, școli, spital și altele." },
  employees: { title: "Ce mărime au firmele?", note: "Numărul de angajați provine din ultimul bilanț disponibil. Firmele fără bilanț sunt excluse." },
  admin: { title: "Cine conduce firmele?", note: "Reprezentanți legali din Registrul Comerțului. Situația curentă poate diferi de cea de la data achiziției." },
  singleBidder: { title: "Vrei să urmărești competiția?", note: "Datele despre ofertanți sunt disponibile pentru o parte a contractelor din proceduri." },
};

function Glyph({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    table: <><path d="M5 6h14M5 12h10M5 18h6" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    stat: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 8h8M8 12h2m4 0h2m-8 4h2m4 0h2" /></>,
    timeseries: <><path d="M4 4v16h16M7 14l4-5 4 3 5-7" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" /></>,
    breakdown: <><path d="M11 3a9 9 0 1 0 10 10H11zM15 3v6h6a9 9 0 0 0-6-6Z" /></>,
    compare: <><rect x="3" y="5" width="7" height="14" rx="2" /><rect x="14" y="5" width="7" height="14" rx="2" /><path d="M5 10h3m-3 4h3m8-4h3m-3 4h3" /></>,
    trend: <><path d="M4 18h16M5 14l5-5 4 3 6-8M15 4h5v5" /></>,
    network: <><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="20" cy="7" r="2" /><circle cx="6" cy="20" r="2" /><circle cx="20" cy="19" r="2" /><path d="m7 7 3 3m4 0 4-2m-8 6-3 4m7-4 4 4" /></>,
    sankey: <><path d="M3 5h4c5 0 5 5 10 5h4M3 12h4c5 0 5-7 10-7h4M3 19h4c5 0 5-4 10-4h4" /><path d="M3 3v18m18-18v18" /></>,
    fact_check: <><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6" /></>,
    distribution: <><path d="M3 20h18M5 20v-5h4v5M9 20V6h4v14m0 0V3h4v17m0 0v-8h4v8" /></>,
    scatter: <><path d="M4 4v16h16" /><circle cx="8" cy="14" r="1" /><circle cx="12" cy="11" r="1" /><circle cx="17" cy="13" r="1" /><circle cx="18" cy="5" r="2" /></>,
    entity_card: <><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.7l6.2-.9z" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M7 3v4M17 3v4M7 14h3m4 0h3m-10 3h3" /></>,
  };
  return <svg viewBox="0 0 24 24" className={`qb-icon ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.table}</svg>;
}

export default function QuestionBuilder({ initial, fromAi = false, onRun, running, onDraftChange }: QuestionBuilderProps) {
  const [seed] = useState(() => transitionQuestion(initial ?? defaultQuestion()));
  const [draft, setDraft] = useState<QuestionSpec>(seed.spec);
  const [applied, setApplied] = useState<QuestionSpec | null>(initial ? cloneQuestion(initial) : null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [changes, setChanges] = useState<string[]>(seed.changes);
  const initialKey = initial ? questionKey(initial) : "";
  const previousInitial = useRef(initialKey);
  const [field, setField] = useState<Field | null>(null);
  const [search, setSearch] = useState("");
  const [remote, setRemote] = useState<SuggestionData>({});
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pickRole, setPickRole] = useState<"authority" | "supplier">("authority");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogTitleId = useId();
  const searchId = useId();
  const dirty = questionKey(draft) !== questionKey(applied ?? seed.spec);
  const errors = questionErrors(draft);
  const profile = isProfileQuestion(draft);
  const type = QUESTION_TYPES.find((item) => item.id === draft.block) ?? QUESTION_TYPES[0]!;
  const kind = KIND_OPTIONS.find(([id]) => id === (draft.filters.authorityKind ?? "")) ?? KIND_OPTIONS[0];

  useEffect(() => {
    if (previousInitial.current === initialKey) return;
    previousInitial.current = initialKey;
    const next = transitionQuestion(initial ?? defaultQuestion());
    setDraft(next.spec);
    setApplied(initial ? cloneQuestion(initial) : null);
    setChanges(next.changes);
  }, [initial, initialKey]);

  useEffect(() => { onDraftChange?.(dirty); }, [dirty, applied, onDraftChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!field || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => {
      const input = dialog.querySelector<HTMLInputElement>("input[type=search], input[type=number]");
      (input ?? dialog.querySelector<HTMLButtonElement>("button"))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [field]);

  // Suggestions use the existing API; an exact search hit carries its ID all
  // the way through the deterministic spec. Abort prevents stale picker data.
  useEffect(() => {
    const needsRemote = field && ["authority", "supplier", "focal", "compareWith", "cpvTerm", "uat", "admin"].includes(field);
    setRemote({});
    setHits([]);
    setLoadError(false);
    if (!needsRemote) { setLoading(false); return; }
    const term = search.trim();
    const isEntity = ["authority", "supplier", "focal", "compareWith"].includes(field!);
    if (term.length < 2 && ["uat", "admin"].includes(field!)) { setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams(term.length >= 2 ? { q: term } : { top: "1" });
      if (draft.filters.county) params.set("county", foldQuestion(String(draft.filters.county)));
      const results = await Promise.allSettled([
        fetch(`/api/suggest?${params}`, { signal: ctrl.signal }).then(async (r) => { if (!r.ok) throw new Error("suggest"); return r.json() as Promise<SuggestionData>; }),
        isEntity && term.length >= 2 ? fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }).then(async (r) => { if (!r.ok) throw new Error("search"); return r.json() as Promise<{ hits: EntityHit[] }>; }) : Promise.resolve({ hits: [] as EntityHit[] }),
      ]);
      if (ctrl.signal.aborted) return;
      if (results[0].status === "fulfilled") setRemote(results[0].value);
      if (results[1].status === "fulfilled") setHits(results[1].value.hits ?? []);
      setLoadError(results[0].status === "rejected" && (results[1].status === "rejected" || !isEntity));
      setLoading(false);
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [search, field, draft.filters.county]);

  function closePicker() {
    dialogRef.current?.close();
    setField(null);
    triggerRef.current?.focus({ preventScroll: true });
  }
  function openPicker(next: Field, trigger?: HTMLElement) {
    if (!field) triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSearch("");
    setFormError("");
    setRemote({});
    setHits([]);
    setPickRole(next === "supplier" ? "supplier" : next === "authority" ? "authority" : focalRole(draft));
    setFormValues({ ...Object.fromEntries(Object.entries(draft.filters).map(([key, value]) => [key, String(value)])), topN: String(draft.topN ?? 10) });
    setField(next);
  }
  function replaceDraft(next: QuestionSpec, notes: string[] = []) {
    const normalized = transitionQuestion(next);
    setDraft(normalized.spec);
    setChanges((previous) => [...new Set([...previous, ...notes, ...normalized.changes])]);
  }
  function chooseType(block: string) {
    const next = transitionQuestion(draft, block);
    setDraft(next.spec);
    setChanges(next.changes);
    closePicker();
  }
  function updateFilter(key: string, value: string | number | boolean | undefined) {
    const next = cloneQuestion(draft);
    const notes: string[] = [];
    if (key === "county" && value !== next.filters.county && next.filters.uatSiruta) {
      delete next.filters.uatSiruta;
      delete next.filters.uatName;
      notes.push("Localitatea a fost eliminată odată cu schimbarea județului.");
    }
    if (value === undefined || value === "") delete next.filters[key];
    else next.filters[key] = value;
    replaceDraft(next, notes);
    closePicker();
  }
  function removeFilter(target: Field) {
    const next = cloneQuestion(draft);
    const keys: Partial<Record<Field, string[]>> = {
      authority: ["authorityName", "authorityId"], supplier: ["supplierName", "supplierId"],
      compareWith: ["compareWith", "compareWithId"], uat: ["uatSiruta", "uatName"],
      employees: ["minEmployees", "maxEmployees"], admin: ["adminPersonKey", "adminName"],
      period: ["yearFrom", "yearTo", "monthFrom", "monthTo"],
    };
    for (const key of keys[target] ?? [target]) delete next.filters[key];
    replaceDraft(next);
  }
  function pickEntity(name: string, id?: number) {
    const next = cloneQuestion(draft);
    const key = field === "compareWith" ? "compareWith" : `${pickRole}Name`;
    const idKey = field === "compareWith" ? "compareWithId" : `${pickRole}Id`;
    next.filters[key] = name;
    delete next.filters[idKey];
    if (id) next.filters[idKey] = id;
    if (field === "focal") {
      const other = pickRole === "authority" ? "supplier" : "authority";
      delete next.filters[`${other}Name`];
      delete next.filters[`${other}Id`];
      next.dim = pickRole;
      if (pickRole !== focalRole(draft)) {
        delete next.filters.compareWith;
        delete next.filters.compareWithId;
      }
    }
    replaceDraft(next);
    closePicker();
  }
  function chooseValue(value: string) {
    if (!field) return;
    if (["dim", "measure", "rankBy", "topN", "dataset"].includes(field)) {
      const next = cloneQuestion(draft);
      const notes: string[] = [];
      if (field === "topN") {
        if (value === "all") delete next.topN;
        else next.topN = Number(value);
      }
      else if (field === "dim") next.dim = value;
      else if (field === "measure") next.measure = value;
      else if (field === "rankBy") next.rankBy = value;
      else {
        next.dataset = value;
        if (value !== "contracts" && next.filters.singleBidder) {
          delete next.filters.singleBidder;
          notes.push("Filtrul «un singur ofertant» a fost eliminat; se aplică doar contractelor din proceduri.");
        }
      }
      replaceDraft(next, notes);
      closePicker();
    } else if (field === "singleBidder") updateFilter("singleBidder", value === "yes" ? true : undefined);
    else updateFilter(field, value || undefined);
  }
  async function apply() {
    if (errors.length || running) return;
    const next = cloneQuestion(draft);
    const submittedKey = questionKey(next);
    try {
      const outcome = await onRun(next);
      if (outcome === false) return;
      const accepted = typeof outcome === "object" && outcome !== null ? cloneQuestion(outcome as QuestionSpec) : next;
      setApplied(accepted);
      // Edits made while the server works remain a separate, unapplied draft.
      setDraft((current) => questionKey(current) === submittedKey ? cloneQuestion(accepted) : current);
      if (questionKey(draftRef.current) === submittedKey) setChanges([]);
    } catch {
      // The parent owns the request error; keep the draft and previous answer.
    }
  }
  function discard() {
    const next = transitionQuestion(applied ?? seed.spec);
    setDraft(next.spec);
    setChanges(next.changes);
  }

  function phrase(key: Field, label: ReactNode) {
    return <button type="button" className="qb-phrase" aria-haspopup="dialog" onClick={(event) => openPicker(key, event.currentTarget)}><span>{label}</span><Glyph name="chevron" /></button>;
  }
  function chip(key: Field, label: string, removable = false, icon = "table") {
    return <span className="qb-chip" key={key}><button type="button" aria-haspopup="dialog" onClick={(event) => openPicker(key, event.currentTarget)}><Glyph name={icon} /><span>{label}</span><Glyph name="chevron" /></button>{removable && <button type="button" className="qb-chip-remove" onClick={() => removeFilter(key)} aria-label={`Elimină condiția ${label}`}><Glyph name="close" /></button>}</span>;
  }
  const namedAuthority = Boolean(draft.filters.authorityName || draft.filters.authorityId);
  const who = namedAuthority ? phrase("authority", entityLabel(draft, "authority")) : phrase("authorityKind", kind[2]);
  const where = phrase(draft.filters.uatSiruta ? "uat" : "county", String(draft.filters.uatName || draft.filters.county || "toată România"));
  const when = phrase("period", periodLabel(draft));
  const focal = phrase("focal", entityLabel(draft, focalRole(draft)));
  const what = phrase("dim", draft.dim === "authority" ? "instituții" : draft.dim === "county" ? "județe" : "firme");
  function sentence() {
    switch (draft.block) {
      case "table": return draft.dim === "supplier" ? <>Cine furnizează {who}<br className="qb-desktop-break" /> din {where}, în {when}?</> : <>Cum se compară {phrase("dim", draft.dim === "authority" ? "instituțiile" : "județele")} după achiziții<br className="qb-desktop-break" /> din {where}, în {when}?</>;
      case "stat": return <>{draft.measure === "count" ? namedAuthority ? "Câte achiziții are " : "Câte achiziții au " : "Cât valorează achizițiile "}{draft.measure === "count" && !namedAuthority ? phrase("authorityKind", kind[1]) : who}<br className="qb-desktop-break" /> din {where}, în {when}?</>;
      case "timeseries": return <>Cum evoluează achizițiile {who}<br className="qb-desktop-break" /> din {where}, în {when}?</>;
      case "map": return <>Cum se împart achizițiile {who}<br className="qb-desktop-break" /> pe județe, în {when}?</>;
      case "breakdown": return <>Ce cumpără {namedAuthority ? phrase("authority", entityLabel(draft, "authority")) : phrase("authorityKind", kind[1])}<br className="qb-desktop-break" /> din {where}, în {when}?</>;
      case "compare": return <>Compară profilul {focal}<br className="qb-desktop-break" /> cu {phrase("compareWith", String(draft.filters.compareWith || "alege a doua entitate"))}.</>;
      case "trend": return <>Ce {what} au cea mai mare schimbare<br className="qb-desktop-break" /> între {phrase("period", String(draft.filters.yearFrom || "primul an"))} și {phrase("period", String(draft.filters.yearTo || "al doilea an"))}?</>;
      case "network": return <>Cu cine lucrează<br className="qb-desktop-break" /> {focal}?</>;
      case "sankey": return <>Cum se împart achizițiile {focal}<br className="qb-desktop-break" /> între parteneri și domenii?</>;
      case "fact_check": return <>A cumpărat {phrase("authority", entityLabel(draft, "authority"))}<br className="qb-desktop-break" /> de la {phrase("supplier", entityLabel(draft, "supplier"))}?</>;
      case "distribution": return <>Unde se situează {focal}<br className="qb-desktop-break" /> după indicele de risc?</>;
      case "scatter": return <>Ce {what} ies din tipar<br className="qb-desktop-break" /> după risc și valoarea achizițiilor?</>;
      case "entity_card": return <>Care {phrase("dim", draft.dim === "supplier" ? "firmă" : "instituție")} are<br className="qb-desktop-break" /> {phrase("rankBy", draft.rankBy === "risk" ? "cel mai ridicat indice de risc" : "cea mai mare valoare în profil")}?</>;
      default: return null;
    }
  }
  function activeConditions() {
    const f = draft.filters;
    const focalBlock = ["network", "sankey", "distribution", "compare"].includes(draft.block);
    const scopeInSentence = ["table", "stat", "timeseries", "breakdown"].includes(draft.block);
    const conditions: ReactNode[] = [];
    if (profile) conditions.push(<span className="qb-profile-scope" key="profile"><Glyph name="stat" />Profiluri istorice · achiziții directe</span>);
    else conditions.push(chip("dataset", SOURCES[draft.dataset ?? "all"] ?? SOURCES.all!, false, "stat"));
    if (f.authorityKind && (!scopeInSentence || namedAuthority || draft.block === "table" && draft.dim !== "supplier")) conditions.push(chip("authorityKind", kind[1], true));
    if (f.county && (!scopeInSentence || f.uatSiruta)) conditions.push(chip("county", String(f.county), true, "map"));
    if (f.uatSiruta && !scopeInSentence) conditions.push(chip("uat", String(f.uatName || `Localitatea #${f.uatSiruta}`), true, "map"));
    if (!profile && !scopeInSentence && !["trend", "map"].includes(draft.block)) conditions.push(chip("period", periodLabel(draft), Boolean(f.yearFrom || f.yearTo), "calendar"));
    if (f.cpvTerm) conditions.push(chip("cpvTerm", String(f.cpvTerm), true, "breakdown"));
    if (namedAuthority && !scopeInSentence && !["map", "fact_check"].includes(draft.block) && !(focalBlock && focalRole(draft) === "authority")) conditions.push(chip("authority", entityLabel(draft, "authority"), true));
    if ((f.supplierName || f.supplierId) && draft.block !== "fact_check" && !(focalBlock && focalRole(draft) === "supplier")) conditions.push(chip("supplier", entityLabel(draft, "supplier"), true));
    if (f.minEmployees !== undefined || f.maxEmployees !== undefined) conditions.push(chip("employees", f.minEmployees !== undefined && f.maxEmployees !== undefined ? `${f.minEmployees}–${f.maxEmployees} angajați` : f.maxEmployees !== undefined ? `Cel mult ${f.maxEmployees} angajați` : `Cel puțin ${f.minEmployees} angajați`, true));
    if (f.adminName || f.adminPersonKey) conditions.push(chip("admin", `Conduse de ${f.adminName || "persoana selectată"}`, true));
    if (f.singleBidder) conditions.push(chip("singleBidder", "Un singur ofertant", true));
    return conditions;
  }

  const options = useMemo((): Choice[] => {
    switch (field) {
      case "dim": return [{ value: "supplier", label: "Firme", detail: "Cine furnizează bunurile și serviciile." }, { value: "authority", label: "Instituții", detail: "Cine face achizițiile." }, ...(!["scatter", "entity_card"].includes(draft.block) ? [{ value: "county", label: "Județe", detail: "Unde se află instituțiile cumpărătoare." }] : [])];
      case "measure": return [{ value: "value", label: "Valoarea în lei", detail: "Suma valorilor înregistrate." }, { value: "count", label: "Numărul de achiziții", detail: "Câte înregistrări există în date." }, ...(draft.block === "table" && draft.dim === "authority" ? [{ value: "value_per_capita", label: "Valoarea pe locuitor", detail: "Pentru autorități-UAT cu populație cunoscută." }] : [])];
      case "rankBy": return [{ value: "value", label: "Cea mai mare valoare în profil", detail: "Achiziții directe, pe întreaga perioadă." }, { value: "risk", label: "Cel mai ridicat indice de risc", detail: "Un semnal statistic, de verificat în surse." }];
      case "topN": return [...[5, 10, 25, 50].map((n) => ({ value: String(n), label: `Primele ${n}` })), ...(draft.block === "table" ? [{ value: "all", label: "Toate rezultatele", detail: "Clasamentul complet, împărțit în pagini." }] : [])];
      case "dataset": return [{ value: "all", label: SOURCES.all!, detail: "Achiziții directe și contracte din proceduri, împreună." }, { value: "contracts", label: SOURCES.contracts!, detail: "Contracte atribuite prin licitații și alte proceduri." }, { value: "da", label: SOURCES.da!, detail: "Achizițiile directe, înregistrate separat." }];
      case "authorityKind": return KIND_OPTIONS.map(([value, label]) => ({ value, label: label.charAt(0).toUpperCase() + label.slice(1) }));
      case "county": return [{ value: "", label: "Toată România" }, ...COUNTIES.map((county) => ({ value: county, label: county }))];
      case "singleBidder": return [{ value: "yes", label: "Doar contracte cu un singur ofertant", detail: "Contracte cu informație cunoscută despre competiție." }, { value: "no", label: "Fără acest filtru", detail: "Păstrează toate contractele din sursa aleasă." }];
      default: return [];
    }
  }, [field, draft.block, draft.dim]);

  const catalogResults = QUESTION_TYPES.filter((item) => foldQuestion(`${item.label} ${item.description} ${item.keywords}`).includes(foldQuestion(search.trim())));
  const isEntityPicker = field && ["authority", "supplier", "focal", "compareWith"].includes(field);
  const selectedRole = field === "compareWith" ? focalRole(draft) : pickRole;
  const entityChoices = useMemo(() => {
    const exact = hits.filter((hit) => hit.roles.includes(selectedRole)).map((hit) => ({ name: hit.name, county: hit.county, id: hit.id, detail: [hit.county, hit.cui ? `CUI ${hit.cui}` : null].filter(Boolean).join(" · ") }));
    const names = new Set(exact.map((hit) => `${foldQuestion(hit.name)}|${foldQuestion(hit.county ?? "")}`));
    return [...exact, ...(remote[selectedRole] ?? []).filter((item) => !names.has(`${foldQuestion(item.name)}|${foldQuestion(item.county ?? "")}`)).map((item) => ({ name: item.name, county: item.county, id: item.entityId, detail: item.county ?? "Numele va fi verificat în date" }))];
  }, [hits, remote, selectedRole]);

  function optionList(choices: Choice[]) {
    const visible = choices.filter((choice) => foldQuestion(`${choice.label} ${choice.detail ?? ""}`).includes(foldQuestion(search)));
    const current = field === "singleBidder" ? draft.filters.singleBidder ? "yes" : "no" : field && ["dim", "measure", "rankBy", "topN", "dataset"].includes(field) ? String((draft as unknown as Record<string, unknown>)[field] ?? (field === "dataset" || field === "topN" && draft.block === "table" ? "all" : "")) : String(draft.filters[field ?? ""] ?? "");
    return <div className="qb-options">{visible.map((choice) => <button type="button" className={`qb-option${choice.value === current ? " is-selected" : ""}`} key={choice.value} onClick={() => chooseValue(choice.value)}><span><strong>{choice.label}</strong>{choice.detail && <small>{choice.detail}</small>}</span><Glyph name={choice.value === current ? "check" : "arrow"} /></button>)}{!visible.length && <p className="qb-empty">Nicio opțiune pentru „{search}”. Încearcă un termen mai scurt.</p>}</div>;
  }
  function numberInput(key: string, label: string, min: number, max: number, placeholder = "Oricare") {
    return <label className="qb-form-field"><span>{label}</span><input type="number" inputMode="numeric" min={min} max={max} step="1" value={formValues[key] ?? ""} onChange={(event) => setFormValues((previous) => ({ ...previous, [key]: event.target.value }))} placeholder={placeholder} /></label>;
  }
  function submitBounds() {
    const next = cloneQuestion(draft);
    const keys = field === "employees" ? ["minEmployees", "maxEmployees"] : ["yearFrom", "yearTo", "monthFrom", "monthTo"];
    for (const key of keys) {
      if (!formValues[key]) delete next.filters[key];
      else next.filters[key] = Number(formValues[key]);
    }
    if (field === "period") {
      if (next.filters.monthFrom && !next.filters.yearFrom || next.filters.monthTo && !next.filters.yearTo) { setFormError("Alege și anul pentru fiecare lună selectată."); return; }
      if (next.filters.yearFrom && next.filters.yearTo && Number(next.filters.yearFrom) > Number(next.filters.yearTo)) { setFormError("Perioada trebuie să înceapă înainte să se încheie."); return; }
      if (next.filters.yearFrom === next.filters.yearTo && next.filters.monthFrom && next.filters.monthTo && Number(next.filters.monthFrom) > Number(next.filters.monthTo)) { setFormError("Luna de început trebuie să fie înaintea lunii de sfârșit."); return; }
      if (draft.block === "trend" && (!next.filters.yearFrom || !next.filters.yearTo || next.filters.yearFrom === next.filters.yearTo)) { setFormError("Alege doi ani diferiți pentru comparație."); return; }
    } else if (next.filters.minEmployees !== undefined && next.filters.maxEmployees !== undefined && Number(next.filters.minEmployees) > Number(next.filters.maxEmployees)) { setFormError("Minimul trebuie să fie mai mic sau egal cu maximul."); return; }
    replaceDraft(next);
    closePicker();
  }
  function pickerBody() {
    if (field === "catalogue") return <div className="qb-catalogue-grid">{QUESTION_GROUPS.map((group) => {
      const items = catalogResults.filter((item) => item.group === group.id);
      return items.length ? <section className="qb-catalogue-group" key={group.id}><h3>{group.label}</h3>{items.map((item) => <button key={item.id} type="button" className={`qb-catalogue-item${draft.block === item.id ? " is-selected" : ""}`} onClick={() => chooseType(item.id)}><span className="qb-catalogue-glyph"><Glyph name={item.id} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Glyph name={draft.block === item.id ? "check" : "arrow"} /></button>)}</section> : null;
    })}{!catalogResults.length && <p className="qb-empty">Nicio întrebare pentru „{search}”. Încearcă „bani”, „relații” sau „risc”.</p>}</div>;
    if (field === "add") {
      const fields: { field: Field; label: string; detail: string }[] = profile ? draft.block === "compare" ? [] : [{ field: "county", label: "Județul grupului de comparație", detail: "Restrânge profilurile comparate." }, ...(draft.dim !== "supplier" ? [{ field: "authorityKind" as const, label: "Tipul instituției", detail: "Comune, spitale, școli și altele." }, { field: "uat" as const, label: "Localitatea", detail: "Instituțiile asociate unei localități." }] : [])] : [
        { field: "cpvTerm", label: "Domeniul achiziției", detail: "Medicamente, asfaltare, mobilier…" },
        ...(!["network", "sankey"].includes(draft.block) ? [{ field: "authority" as const, label: "O anumită instituție", detail: "Cine cumpără." }, { field: "supplier" as const, label: "O anumită firmă", detail: "Cine furnizează." }] : []),
        ...((draft.block !== "map" && draft.dim !== "county") ? [{ field: "county" as const, label: "Județul", detail: "Unde se află instituția cumpărătoare." }, ...(!["network", "sankey"].includes(draft.block) ? [{ field: "uat" as const, label: "Localitatea", detail: "Toate instituțiile asociate unei localități." }] : [])] : []),
        { field: "authorityKind", label: "Tipul instituției", detail: "Comune, spitale, școli și altele." },
        { field: "employees", label: "Mărimea firmelor", detail: "Numărul de angajați din bilanț." },
        { field: "admin", label: "Administratorul firmelor", detail: "Reprezentanți legali din Registrul Comerțului." },
        { field: "singleBidder", label: "Un singur ofertant", detail: "Contracte cu informații despre competiție." },
      ];
      return <div className="qb-options">{fields.map((item) => <button type="button" className="qb-option" key={item.field} onClick={() => openPicker(item.field)}><span><strong>{item.label}</strong><small>{item.detail}</small></span><Glyph name="plus" /></button>)}{!fields.length && <p className="qb-empty">Comparația folosește profilurile istorice complete ale celor două entități.</p>}</div>;
    }
    if (field === "period" || field === "employees") return <form onSubmit={(event) => { event.preventDefault(); submitBounds(); }} className="qb-picker-form">
      {field === "period" ? <><div className="qb-presets">{[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((year) => <button type="button" key={year} onClick={() => setFormValues((previous) => ({ ...previous, yearFrom: String(draft.block === "trend" ? year - 1 : year), yearTo: String(year), monthFrom: "", monthTo: "" }))}>{draft.block === "trend" ? `${year - 1}–${year}` : year}</button>)}{draft.block !== "trend" && <button type="button" onClick={() => setFormValues((previous) => ({ ...previous, yearFrom: "", yearTo: "", monthFrom: "", monthTo: "" }))}>Toată perioada</button>}</div><div className="qb-form-grid">{numberInput("yearFrom", draft.block === "trend" ? "Primul an" : "Din anul", 2000, 2100)}{numberInput("yearTo", draft.block === "trend" ? "Al doilea an" : "Până în anul", 2000, 2100)}{draft.block !== "trend" && <>{numberInput("monthFrom", "Din luna (opțional)", 1, 12)}{numberInput("monthTo", "Până în luna (opțional)", 1, 12)}</>}</div></> : <><div className="qb-presets">{[["", "0", "Fără angajați"], ["", "4", "Sub 5"], ["", "49", "Sub 50"], ["250", "", "250 sau mai mulți"]].map(([min, max, label]) => <button type="button" key={label} onClick={() => setFormValues((previous) => ({ ...previous, minEmployees: min!, maxEmployees: max! }))}>{label}</button>)}</div><div className="qb-form-grid">{numberInput("minEmployees", "Cel puțin", 0, 1000000)}{numberInput("maxEmployees", "Cel mult", 0, 1000000)}</div></>}
      {formError && <p role="alert" className="qb-form-error">{formError}</p>}<button className="qb-primary qb-picker-confirm" type="submit">Folosește această {field === "period" ? "perioadă" : "condiție"}<Glyph name="check" /></button>
    </form>;
    if (isEntityPicker) return <><div className="qb-options">{entityChoices.map((item, index) => <button type="button" className="qb-option" key={`${item.id ?? item.name}-${index}`} onClick={() => pickEntity(item.name, item.id)}><span><strong>{item.name}</strong><small>{item.detail}{item.id ? ` · ID ${item.id}` : ""}</small></span><Glyph name="arrow" /></button>)}{!loading && !entityChoices.length && <p className="qb-empty">{search.trim().length < 2 ? "Scrie cel puțin două litere pentru a căuta." : "Nicio potrivire. Încearcă un nume mai scurt sau codul fiscal."}</p>}{search.trim().length >= 2 && <button type="button" className="qb-text-choice" onClick={() => pickEntity(search.trim())}>Caută numele exact „{search.trim()}”<small>Vei vedea identitatea găsită și eventualele ambiguități lângă răspuns.</small></button>}</div></>;
    if (field === "uat") return <div className="qb-options">{(remote.uat ?? []).map((item) => <button key={item.siruta} type="button" className="qb-option" onClick={() => { const next = cloneQuestion(draft); next.filters.uatSiruta = item.siruta; next.filters.uatName = `${item.name} (${item.county})`; if (item.county) next.filters.county = item.county; replaceDraft(next); closePicker(); }}><span><strong>{item.name}</strong><small>{item.tip} · {item.county}{item.population ? ` · ${item.population.toLocaleString("ro-RO")} locuitori` : ""}</small></span><Glyph name="arrow" /></button>)}{!loading && !(remote.uat ?? []).length && <p className="qb-empty">{search.length < 2 ? "Scrie numele localității." : "Nicio localitate găsită. Încearcă și județul."}</p>}</div>;
    if (field === "admin") return <div className="qb-options">{(remote.person ?? []).map((person) => <button type="button" className="qb-option" key={person.key} onClick={() => { const next = cloneQuestion(draft); next.filters.adminPersonKey = person.key; next.filters.adminName = `${person.name}${person.birthYear ? ` (n. ${person.birthYear}${person.birthLocality ? `, ${person.birthLocality}` : ""})` : ""}`; replaceDraft(next); closePicker(); }}><span><strong>{person.name}</strong><small>{[person.birthYear ? `n. ${person.birthYear}` : null, person.birthLocality, `${person.nFirms} firme`].filter(Boolean).join(" · ")}</small></span><Glyph name="arrow" /></button>)}{!loading && !(remote.person ?? []).length && <p className="qb-empty">{search.length < 2 ? "Scrie numele reprezentantului legal." : "Nicio persoană găsită. Încearcă numele complet."}</p>}</div>;
    if (field === "cpvTerm") return <div className="qb-options">{(remote.cpv ?? []).map((item) => <button type="button" className="qb-option" key={item.term} onClick={() => updateFilter("cpvTerm", item.term)}><span><strong>{item.term}</strong>{item.cpvName && <small>{item.cpvName}</small>}</span><Glyph name="arrow" /></button>)}{(remote.division ?? []).map((item) => <button type="button" className="qb-option" key={item.code} onClick={() => updateFilter("cpvTerm", item.code)}><span><strong>{item.name}</strong><small>CPV {item.code}</small></span><Glyph name="arrow" /></button>)}{search.trim() && <button className="qb-text-choice" type="button" onClick={() => updateFilter("cpvTerm", search.trim())}>Folosește domeniul „{search.trim()}”<small>Corespondența cu clasificarea CPV va fi afișată lângă răspuns.</small></button>}</div>;
    return <>{optionList(options)}{field === "topN" && <form className="qb-custom-top" onSubmit={(event) => { event.preventDefault(); chooseValue(formValues.topN ?? "10"); }}><label className="qb-form-field"><span>Sau alege un număr între 1 și 50</span><input type="number" inputMode="numeric" required min={1} max={50} step={1} value={formValues.topN ?? "10"} onChange={(event) => setFormValues((previous) => ({ ...previous, topN: event.target.value }))} /></label><button type="submit" className="qb-primary">Folosește<Glyph name="check" /></button></form>}</>;
  }

  const showsSearch = field && !["add", "period", "employees", "dim", "measure", "rankBy", "topN", "dataset", "authorityKind", "singleBidder"].includes(field);
  return <div className="question-builder">
    <div className="qb-navigation"><div className="qb-shortcuts" aria-label="Întrebări de pornire">{[{ id: "table", label: "Cine câștigă?" }, { id: "timeseries", label: "Cum se schimbă?" }, { id: "network", label: "Cu cine lucrează?" }].map((item) => <button type="button" aria-pressed={draft.block === item.id} key={item.id} onClick={() => chooseType(item.id)}><Glyph name={item.id} />{item.label}</button>)}</div><button type="button" className="qb-catalogue-trigger" aria-haspopup="dialog" onClick={(event) => openPicker("catalogue", event.currentTarget)}><Glyph name="plus" />Toate întrebările<span>13</span></button></div>
    <section className={`qb-editor${dirty ? " qb-editor-pending" : ""}`} aria-label="Construiește întrebarea">
      <div className="qb-editor-top"><p className="qb-eyebrow"><span />Întrebarea ta <span className="qb-type-count">{String(QUESTION_TYPES.findIndex((item) => item.id === draft.block) + 1).padStart(2, "0")} / 13</span></p><span className="qb-editor-tip">Cuvintele evidențiate se pot schimba</span></div>
      {fromAi && <p className="qb-ai-note">Am transformat întrebarea în condiții pe care le poți verifica și modifica.</p>}
      <h2 className={`qb-sentence qb-sentence-${draft.block}`}>{sentence()}</h2>
      <div className="qb-conditions">{activeConditions()}{draft.block !== "compare" && <button type="button" className="qb-add" aria-haspopup="dialog" onClick={(event) => openPicker("add", event.currentTarget)}><Glyph name="plus" />Adaugă o condiție</button>}</div>
      {changes.length > 0 && <div className="qb-scope-change" role="status"><Glyph name="info" /><div><strong>Ce se schimbă odată cu întrebarea</strong>{changes.map((note) => <p key={note}>{note}</p>)}</div></div>}
      {profile && <p className="qb-profile-note">Profilurile folosesc achizițiile directe din întreaga perioadă. Indicele de risc este un semnal statistic; definiția, calculele și sursele sunt explicate lângă rezultat.{draft.dim === "supplier" && draft.filters.county ? " Județul grupului este cel înregistrat în profilul firmei." : ""}</p>}
      <div className="qb-editor-bottom"><div className="qb-presentation">{draft.block === "table" ? <>Arată {phrase("topN", draft.topN === undefined ? "toate" : `primele ${draft.topN}`)} {phrase("dim", draft.topN === undefined ? draft.dim === "supplier" ? "firmele" : draft.dim === "county" ? "județele" : "instituțiile" : draft.dim === "supplier" ? "firme" : draft.dim === "county" ? "județe" : "instituții")}, după {phrase("measure", draft.measure === "count" ? "numărul de achiziții" : draft.measure === "value_per_capita" ? "valoarea pe locuitor" : "valoarea înregistrată")}.</> : draft.block === "trend" ? <>Arată {phrase("topN", `primele ${draft.topN ?? 10}`)}, după diferența în lei dintre cei doi ani.</> : ["stat", "timeseries", "map"].includes(draft.block) ? <>Măsoară {phrase("measure", draft.measure === "count" ? "numărul de achiziții" : "valoarea înregistrată")}.</> : <><Glyph name={type.id} />{type.description}</>}</div><div className="qb-apply-area">{dirty ? <button type="button" className="qb-discard" onClick={discard}>Renunță la modificări</button> : applied && <span className="qb-ready"><Glyph name="check" />Întrebare aplicată</span>}<button type="button" className="qb-primary qb-apply" disabled={running || errors.length > 0} onClick={apply}>{running ? "Caut în date…" : dirty && applied ? "Actualizează răspunsul" : "Vezi răspunsul"}<Glyph name="arrow" /></button></div></div>
      {errors.length > 0 && <div className="qb-validation" aria-live="polite">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {dirty && <p className="qb-pending-line" role="status"><span />Modificări neaplicate{applied && <span>Răspunsul și sursele de mai jos păstrează întrebarea anterioară.</span>}</p>}
    </section>
    <dialog ref={dialogRef} className={`qb-dialog${showsSearch ? " qb-dialog-search" : ""}${field === "catalogue" ? " qb-dialog-catalogue" : ""}`} aria-labelledby={dialogTitleId} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePicker(); } }} onCancel={(event) => { event.preventDefault(); closePicker(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePicker(); } }}>
      {field && <><div className="qb-picker-head"><h2 id={dialogTitleId}>{FIELDS[field].title}</h2><button className="qb-dialog-close" type="button" onClick={closePicker} aria-label="Închide"><Glyph name="close" /></button></div><p className="qb-picker-note">{FIELDS[field].note}</p>{showsSearch && <label className="qb-picker-search" htmlFor={searchId}><Glyph name="search" /><input id={searchId} type="search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={field === "catalogue" ? "Caută o întrebare, de exemplu: relații, risc, evoluție…" : field === "county" ? "Caută județul" : "Scrie pentru a căuta…"} aria-label={field === "catalogue" ? "Caută în cele 13 întrebări" : FIELDS[field].title} /></label>}{field === "focal" && <div className="qb-role-switch" aria-label="Tipul entității"><button type="button" aria-pressed={pickRole === "authority"} onClick={() => setPickRole("authority")}>Instituție</button><button type="button" aria-pressed={pickRole === "supplier"} onClick={() => setPickRole("supplier")}>Firmă</button></div>}<span className="qb-search-status" role="status">{showsSearch && loading ? "Caut în date…" : ""}</span><div className="qb-picker-content" aria-busy={!!showsSearch && loading}>{showsSearch && loading ? <><p className="qb-loading" aria-hidden="true">Caut în date…</p><div className="qb-search-skeleton" aria-hidden="true">{[0, 1, 2, 3].map((row) => <div key={row}><span /><span /></div>)}</div></> : <>{loadError && <p className="qb-load-error" role="status">Sugestiile nu sunt disponibile acum. Poți încerca din nou sau folosi un nume complet.</p>}{pickerBody()}</>}</div><div className="qb-picker-footer"><Glyph name="fact_check" />{field === "catalogue" ? "Fiecare întrebare păstrează legătura cu înregistrările-sursă." : "Alegerea modifică întrebarea. Răspunsul se schimbă când o aplici."}</div></>}
    </dialog>
  </div>;
}
