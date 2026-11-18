/**
 * From the home page's map to a county on /harta (owner, 18 November 2026): a click on a county opens the map of lei
 * per inhabitant on that county, and the way there is drawn. The home map travels into /harta's map (one named
 * element of the page's view transition, components/motion/page-transition.css), /harta opens on the whole country,
 * and its camera then glides into the county (app/harta/motion.ts), as a click on that county there would. Reduced
 * motion, a browser without view transitions, a new tab or a link opened later: the county is simply open.
 *
 * The home page says which county was clicked through the session's storage, so the address stays clean and a reload
 * or a shared link never replays the arrival.
 */
export const MAP_TRAVEL_NAME = "map-travel";
const KEY = "cc-map-arrive";
/** An arrival older than this was a navigation that never came. */
const FRESH_MS = 10_000;
/** The page's cross-fade and the map's travel, then a breath, before the camera moves. */
export const MAP_ARRIVAL_HOLD_MS = 560;

export function mapCountyHref(countyKey: string, year = new Date().getFullYear() - 1): string {
  return `/harta?ani=${year}&judet=${countyKey}`;
}

/** Whether what the home page left says this county was just clicked. */
export function freshArrival(raw: string | null, county: string | null, now: number): boolean {
  if (!raw || !county) return false;
  try {
    const value = JSON.parse(raw) as { county?: unknown; at?: unknown };
    return value.county === county && typeof value.at === "number" && now - value.at >= 0 && now - value.at < FRESH_MS;
  } catch { return false; }
}

export function markMapArrival(county: string): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ county, at: Date.now() })); } catch { /* without storage the county just opens */ }
}
export function peekMapArrival(county: string | null): boolean {
  try { return freshArrival(sessionStorage.getItem(KEY), county, Date.now()); } catch { return false; }
}
export function clearMapArrival(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

// The country's shapes, fetched once for the whole visit: the home map asks for them when the pointer reaches it, so
// /harta has its map in its first picture (the travel needs something to arrive at).
let asked: Promise<unknown> | null = null;
let shapes: unknown = null;
export function warmMapGeo(): Promise<unknown> {
  asked ??= fetch("/geo/romania.json").then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((geo: unknown) => { shapes = geo; return geo; })
    .catch(() => { asked = null; return null; });
  return asked;
}
export const warmedMapGeo = (): unknown => shapes;
