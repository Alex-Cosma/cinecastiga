import type { AskSpec } from '../ask/spec';
import { fold, periodBounds } from './shared';

/*
 * What „Pe scurt” on /cauta computes from an Ask answer beyond drawing it (app/cauta/Understood.tsx SubjectAnswer; owner,
 * 23 November 2026): the counties compared. Pure, so it is tested.
 */

export type County = { county: string; value: number; count: number };
/** The map block's data, as /api/ask returns it: the counties, the records no county is known for, and for the local
 * administrations' map the counties' populations and the counties whose council the strict list lacks. */
export type MapData = { block: 'map'; counties: County[]; unknown?: { value: number; count: number }; local?: { population?: Record<string, number>; missing?: string[] } };

/**
 * The first three counties by the measure asked: the value, the records, or the value per inhabitant of the county.
 * Per inhabitant, a county whose council the strict list lacks has an incomplete figure (the map greys it): not ranked.
 */
export function countyRows(m: MapData, measure: string | undefined): (County & { metric: number })[] {
  const pop = m.local?.population;
  const metric = (c: County) => measure === 'count' ? c.count
    : measure === 'value_per_capita' ? (pop?.[c.county] && !m.local?.missing?.includes(c.county) ? c.value / pop[c.county]! : null) : c.value;
  return m.counties.flatMap((c) => { const x = metric(c); return x != null && c.count > 0 ? [{ ...c, metric: x }] : []; }).sort((a, b) => b.metric - a.metric).slice(0, 3);
}

/** The total the map adds up to, with the records no county is known for. */
export const mapTotal = (m: MapData) => [...m.counties, ...(m.unknown ? [m.unknown] : [])].reduce((t, c) => ({ value: t.value + c.value, count: t.count + c.count }), { value: 0, count: 0 });

/** A county's own search: the same subject and period with the county as the place; none without a subject to search. */
export function countyHref(spec: AskSpec, name: string): string | null {
  const f = spec.filters, q = typeof f.cpvTerm === 'string' && !/\d{8}/.test(f.cpvTerm) ? f.cpvTerm : null;
  if (!q) return null;
  const p = new URLSearchParams({ q, place: `county:${fold(name)}` });
  if (f.yearFrom !== undefined && f.yearTo !== undefined) {
    const b = periodBounds({ yearFrom: f.yearFrom, yearTo: f.yearTo, ...(f.monthFrom !== undefined && f.monthTo !== undefined ? { monthFrom: f.monthFrom, monthTo: f.monthTo } : {}) });
    p.set('from', b.from); p.set('to', b.to);
  }
  return `/cauta?${p}`;
}
