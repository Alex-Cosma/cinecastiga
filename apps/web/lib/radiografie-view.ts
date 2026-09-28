import type { MatrixRow, SliceRow } from "./radiografie";
export type Zoom = {
    k: number;
    x: number;
    y: number;
};
export const INITIAL_ZOOM: Zoom = { k: 1, x: 0, y: 0 };
export function boundZoom(z: Zoom): Zoom { const k = Math.max(1, Math.min(12, z.k)); return { k, x: Math.max(0, Math.min(1 - 1 / k, z.x)), y: Math.max(0, Math.min(1 - 1 / k, z.y)) }; }
export function zoomAt(z: Zoom, factor: number, x: number, y: number): Zoom { const k = Math.max(1, Math.min(12, z.k * factor)); return boundZoom({ k, x: z.x + x / z.k - x / k, y: z.y + y / z.k - y / k }); }
export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const rxDate = (s: string) => s.slice(0, 10).split("-").reverse().join(".");
export const percent = (n: number) => `${(n * 100).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
export function sliceIncludes(s: SliceRow, p: SliceRow["points"][number]) { return p.d >= s.d0 && p.d <= s.d1 && p.cls === s.cpvClass && p.purchaseType != null && p.purchaseType === s.purchaseType && p.ceiling != null && p.v > 0 && p.v < p.ceiling; }
export interface LotCell {
    key: string;
    names: string[];
    ids: string[];
    contracts: MatrixRow[];
}
export interface LotColumn {
    notice: string;
    date: string;
    contracts: MatrixRow[];
    cells: Map<string, LotCell>;
}
/** Group all members first; period filtering must not turn a consortium into solo winners. */
export function lotColumns(rows: MatrixRow[], from?: number, to?: number): LotColumn[] {
    const contracts = new Map<string, MatrixRow[]>();
    for (const r of rows) {
        const group = contracts.get(r.contractId) ?? [];
        group.push(r);
        contracts.set(r.contractId, group);
    }
    const notices = new Map<string, LotColumn>();
    for (const members of contracts.values()) {
        const ms = [...new Map(members.map(m => [m.supplierId, m])).values()].sort((a, b) => a.supplierId.localeCompare(b.supplierId)), first = ms[0]!;
        const year = Number(first.d.slice(0, 4));
        if ((from && year < from) || (to && year > to))
            continue;
        const col = notices.get(first.notice) ?? { notice: first.notice, date: first.d, contracts: [], cells: new Map<string, LotCell>() };
        const key = ms.map(m => m.supplierId).join("+"), cell = col.cells.get(key) ?? { key, names: ms.map(m => m.supplierName), ids: ms.map(m => m.supplierId), contracts: [] };
        cell.contracts.push(first);
        col.cells.set(key, cell);
        col.contracts.push(first);
        col.date = col.date < first.d ? col.date : first.d;
        notices.set(first.notice, col);
    }
    return [...notices.values()].filter(c => c.contracts.length >= 3).sort((a, b) => a.date.localeCompare(b.date) || a.notice.localeCompare(b.notice));
}
