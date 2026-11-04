import type { Readers } from "../table-filters/memory";
import type { TableColumns } from "../table-filters/types";

/*
 * The admin's records tables with column funnels (owner, 4 November 2026: the admin uniformized with the rest): the
 * request journal and the proxy inventory, both filtered in the browser over the status they already hold
 * (lib/table-filters/memory.ts), and the accounts, filtered on the server over the auth API's list.
 */

export const STREAM_LABELS: Readonly<Record<string, string>> = {
  da: "Achiziții directe", tenders: "Anunțuri de participare", awards: "Anunțuri de atribuire",
  documents: "Documente", catalogue: "Catalogul instituțiilor", ted: "Atribuiri TED (UE)",
};
export const OUTCOME_LABELS: Readonly<Record<string, string>> = { success: "reușit", failed: "eșuat", interrupted: "întrerupt", running: "în curs" };
/** The journal keeps the last 100 failures apart from the last 100 attempts: a result funnel of failures only reads them. */
export const FAILURE_OUTCOMES: readonly string[] = ["failed", "interrupted"];
export const DIRECT = "direct";

export const JOURNAL_COLUMNS: TableColumns = [
  { key: "flux", kind: "options", label: "Cererea", chip: "", param: "flux", labels: STREAM_LABELS },
  { key: "proxy", kind: "pick", label: "Proxy", chip: "proxy", param: "proxy", labels: { [DIRECT]: "Direct / istoric" } },
  { key: "rezultat", kind: "options", label: "Rezultat", chip: "", param: "rezultat", labels: OUTCOME_LABELS },
];

type JournalRow = { stream?: string; proxy_id?: string | null; outcome?: string };
export const JOURNAL_READERS: Readers<JournalRow> = {
  flux: (r) => r.stream ?? null,
  proxy: (r) => r.proxy_id ?? DIRECT,
  rezultat: (r) => r.outcome ?? null,
};

export const PROXY_STATES: Readonly<Record<string, string>> = {
  activ: "activat", neutilizat: "neutilizat", oprit: "oprit după erori", retras: "retras din listă",
};
export const PROXY_ERRORS: Readonly<Record<string, string>> = { cu: "cu ultima eroare", fara: "fără eroare" };

export const PROXY_COLUMNS: TableColumns = [
  { key: "proxy", kind: "pick", label: "Proxy / IP", chip: "proxy", param: "proxy" },
  { key: "stare", kind: "options", label: "Stare", chip: "", param: "stare", labels: PROXY_STATES },
  { key: "erori", kind: "options", label: "Erori", chip: "", param: "erori", labels: PROXY_ERRORS },
];

type ProxyRow = { id: string; configured?: boolean; enabled?: boolean; consecutive_failures?: number | string | null; last_error?: string | null };
/** A proxy's lasting state, as its row says it (the moment's „Cerere în curs” or „Rezervat” is not filtered on). */
export const proxyState = (p: ProxyRow): string =>
  !p.configured ? "retras" : !p.enabled ? (Number(p.consecutive_failures) >= 3 ? "oprit" : "neutilizat") : "activ";
export const PROXY_READERS: Readers<ProxyRow> = {
  proxy: (p) => p.id,
  stare: proxyState,
  erori: (p) => (p.last_error ? "cu" : "fara"),
};

export const ACCOUNT_COLUMNS: TableColumns = [
  { key: "cont", kind: "pick", label: "Email", chip: "cont", param: "cont" , valuePattern: /^[\w-]{1,64}$/ },
  { key: "rol", kind: "options", label: "Rol", chip: "", param: "rol", valuePattern: /^(admin|watchdog)$/, labels: { admin: "admin", watchdog: "watchdog" } },
  { key: "stare", kind: "options", label: "Stare", chip: "", param: "stare", valuePattern: /^(activ|dezactivat)$/, labels: { activ: "activ", dezactivat: "dezactivat" } },
  { key: "creat", kind: "dates", label: "Creat", chip: "", param: "creat" },
];

export type AccountRow = { id: string; email: string; name?: string | null; role?: string | null; banned?: boolean | null; createdAt: string | Date };
export const ACCOUNT_READERS: Readers<AccountRow> = {
  cont: (u) => u.id,
  rol: (u) => u.role ?? "watchdog",
  stare: (u) => (u.banned ? "dezactivat" : "activ"),
  creat: (u) => new Date(u.createdAt).toISOString(),
};
