import { FLAG_META } from "./flags";
import { COUNTIES } from "./counties";
import type { RiskGroupSort, Role } from "./marts";
import { formatInt } from "./format";
import { parseRoleParam } from "./role-param";

/** Badge text for the number of distinct signal types on an entity page ("1 tip", "2 tipuri"). */
export function signalTypeCountLabel(n: number): string {
  return n === 1 ? "1 tip" : `${formatInt(n)} tipuri`;
}

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
  /** Signals of one entity, in the role it is viewed in: its page /entitati/{id}/semnale. Signals view only. */
  entity: string | null;
}
const ENTITY_ID = /^[1-9]\d{0,17}$/;
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function parseSignalState(params: Record<string, string | undefined>): SignalState {
  const code = params.tip && Object.hasOwn(FLAG_META, params.tip) ? params.tip : "da_split";
  let role: Role = parseRoleParam(params.rol) ?? "authority";
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
    dir: params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "name" ? "asc" : "desc",
    entity: view === "signals" && params.ent && ENTITY_ID.test(params.ent) ? params.ent : null };
}

/** Every navigation keeps the applied role/county; changing a condition resets paging. */
/** An entity's signals page. */
export const entitySignalsPath = (entity: string) => `/entitati/${entity}/semnale`;

/** An entity page's link without `?rol=`, for an entity with a single role (the entity pages' convention). */
export function withoutRole(href: string): string {
  const [path, hash] = href.split("#") as [string, string | undefined];
  const [base, query = ""] = path.split("?") as [string, string | undefined];
  const q = new URLSearchParams(query);
  q.delete("rol");
  return `${base}${q.size ? `?${q.toString()}` : ""}${hash !== undefined ? `#${hash}` : ""}`;
}

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
  if (next.view === "signals") { next.band = null; next.criteria = null; } else next.entity = null;
  const changedFilter = ["view", "code", "role", "county", "band", "criteria", "sort", "dir", "entity"].some((key) => Object.hasOwn(patch, key));
  const page = patch.page ?? (changedFilter ? 0 : state.page);
  // One entity's signals are one of its pages, as its other analyses (owner, 6 November 2026): /entitati/{id}/semnale,
  // the role in the entity pages' spelling (the page drops it for an entity with a single role).
  if (next.view === "signals" && next.entity) {
    const q = new URLSearchParams({ tip: next.code, rol: next.role === "supplier" ? "furnizor" : "autoritate" });
    if (page > 0) q.set("p", String(page));
    return `${entitySignalsPath(next.entity)}?${q.toString()}`;
  }
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
