import { FLAG_META } from "./flags";
import { COUNTIES } from "./counties";
import type { RiskGroupSort, Role } from "./marts";

export const SIGNAL_PAGE_SIZE = 10;
export const RISK_PAGE_SIZE = 10;
export const RISK_SORTS: RiskGroupSort[] = ["cri", "flags", "das", "total", "name"];
export interface SignalState {
  view: "signals" | "cri";
  criteria: number | null;
  code: string;
  role: Role;
  county: string | null;
  page: number;
  band: { from: number; to: number } | null;
  sort: RiskGroupSort;
  dir: "asc" | "desc";
}
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function parseSignalState(params: Record<string, string | undefined>): SignalState {
  const code = params.tip && Object.hasOwn(FLAG_META, params.tip) ? params.tip : "da_split";
  let role: Role = params.rol === "supplier" ? "supplier" : "authority";
  const county = params.jud?.trim() ? COUNTIES.find((name) => fold(name) === fold(params.jud!.trim())) ?? params.jud.trim().slice(0, 100) : null;
  const from = Number(params.criMin), to = Number(params.criMax);
  const validBand = params.criMin !== undefined && params.criMax !== undefined && Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to <= 1 && from < to;
  const view = params.view === "cri" || validBand ? "cri" : "signals";
  const subject = FLAG_META[code]!.subject;
  if (view === "signals" && (subject === "authority" || subject === "supplier")) role = subject;
  const criteriaValue = Number(params.criteria);
  const criteria = view === "cri" && params.criteria !== undefined && /^\d+$/.test(params.criteria)
    && Number.isSafeInteger(criteriaValue) && criteriaValue <= (role === "authority" ? 5 : 4) ? criteriaValue : null;
  const sort = RISK_SORTS.includes(params.sort as RiskGroupSort) ? params.sort as RiskGroupSort : "cri";
  const p = Number(params.p ?? 0);
  return { view, criteria, code, role, county, page: Number.isSafeInteger(p) && p >= 0 ? p : 0,
    band: validBand && criteria === null ? { from, to } : null, sort,
    dir: params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "name" ? "asc" : "desc" };
}

/** Every navigation keeps the applied role/county; changing a condition resets paging. */
export function signalUrl(state: SignalState, patch: Partial<SignalState> = {}): string {
  const next = { ...state, ...patch };
  if (Object.hasOwn(patch, "code")) {
    next.view = "signals"; next.band = null; next.criteria = null;
    const subject = FLAG_META[next.code]?.subject;
    if (subject === "authority" || subject === "supplier") next.role = subject;
  } else if (Object.hasOwn(patch, "role") && next.view === "signals") {
    const subject = FLAG_META[next.code]?.subject;
    if ((subject === "authority" || subject === "supplier") && subject !== next.role)
      next.code = next.role === "authority" ? "da_concentration" : "da_dependence";
  }
  if (Object.hasOwn(patch, "role")) { next.criteria = null; next.band = null; }
  if (next.view === "signals") { next.band = null; next.criteria = null; }
  const changedFilter = ["view", "code", "role", "county", "band", "criteria", "sort", "dir"].some((key) => Object.hasOwn(patch, key));
  const page = patch.page ?? (changedFilter ? 0 : state.page);
  const q = new URLSearchParams({ tip: next.code, rol: next.role });
  if (next.county) q.set("jud", next.county);
  if (next.view === "cri") q.set("view", "cri");
  if (next.view === "cri" && next.criteria !== null) q.set("criteria", String(next.criteria));
  if (next.band) {
    q.set("criMin", String(next.band.from)); q.set("criMax", String(next.band.to));
  }
  if (next.view === "cri" && (next.sort !== "cri" || next.dir !== "desc")) { q.set("sort", next.sort); q.set("dir", next.dir); }
  if (page > 0) q.set("p", String(page));
  return `/semnale?${q.toString()}`;
}
