// node scripts/map/build-map-geo.mjs
//
// The geometry of /harta (counties, then one county's UATs), precomputed as SVG paths so the page draws without a
// TopoJSON library and loads a county's UATs only when it is opened:
// - public/geo/romania.json: the 42 counties (București included), one path each, with their box and label point;
// - public/geo/judete/<key>.json: one county's UATs (București: its six sectors), in the same coordinates, so a
//   county opens by moving the view to its box;
// - lib/reference/uat-geo.json: siruta → [name, county key, kind] for the server (names and county of a UAT).
//
// Source: ancpi-uat.topo.json and ancpi-uat.meta.json beside this script, copied unchanged from the spider project
// (ipr/spider public/geo, built by its scripts/build-geo.ts): ANCPI „Unități Administrativ-Teritoriale 07.03.2024”
// and INS „SIRUTA s1 2026” from data.gov.ro, both CC BY 4.0; Stereo70 → WGS84, 100 m topological simplification,
// counties as the union of their UATs. See README.md.
//
// Projection: equirectangular with the scale of 46°N (x = lon·cos 46°, y = −lat), fitted to a width of 1000. Over
// Romania (43.6–48.3°N) it stretches the north–south distances by at most 4% against the true ones, which a
// choropleth does not show. Counties are written with one decimal (≈ 74 m), UATs with two (≈ 7 m): the
// county view enlarges a county up to about ten times.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..", "..");
const WIDTH = 1000;
const COS = Math.cos((46 * Math.PI) / 180);

const topo = JSON.parse(readFileSync(path.join(HERE, "ancpi-uat.topo.json"), "utf8"));
const meta = JSON.parse(readFileSync(path.join(HERE, "ancpi-uat.meta.json"), "utf8"));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;

/** A county's key: its name without diacritics, lower case, spaces as hyphens ("Satu Mare" → "satu-mare"). */
export const countyKey = (name) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "-");

// Arcs: quantized deltas → longitude, latitude.
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const arc of arcs) for (const [lon, lat] of arc) {
  const x = lon * COS, y = -lat;
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const K = WIDTH / (maxX - minX);
const HEIGHT = Math.round((maxY - minY) * K);
const project = ([lon, lat]) => [(lon * COS - minX) * K, (-lat - minY) * K];

/**
 * Douglas–Peucker on one projected arc, endpoints kept: arcs are shared between neighbours, so simplifying them (not the
 * rings) leaves no gap or overlap between two units.
 */
function simplify(pts, tol) {
  if (pts.length < 3 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, dist = tol;
    for (let k = a + 1; k < b; k++) {
      const [px, py] = pts[k];
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > dist) { dist = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}
// A closed arc (a ring alone, an island) keeps at least four points, so it stays a polygon.
const projected = arcs.map((arc) => arc.map(project));
const arcsAt = (tol) => projected.map((pts) => { const s = simplify(pts, tol); return s.length < 4 && pts.length >= 4 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? simplify(pts, tol / 8) : s; });
// The national view shows a county at about 1 unit per pixel; a county's view enlarges it up to about ten times.
const NATIONAL_TOL = 0.35, COUNTY_TOL = 0.05;
const national = arcsAt(NATIONAL_TOL), detailed = arcsAt(COUNTY_TOL);

/** One ring of arc indexes as projected points (a negative index ~i is arc i reversed; shared ends kept once). */
function ring(indexes, set) {
  const out = [];
  for (const i of indexes) {
    const arc = i >= 0 ? set[i] : [...set[~i]].reverse();
    for (let k = out.length ? 1 : 0; k < arc.length; k++) out.push(arc[k]);
  }
  return out;
}
const rings = (g, set) => (g.type === "Polygon" ? g.arcs : g.type === "MultiPolygon" ? g.arcs.flat() : []).map((r) => ring(r, set));

/** An SVG path: absolute start, then relative steps between the rounded points (no drift, no zero steps). */
function pathOf(rs, digits) {
  const f = 10 ** digits;
  const r = (v) => Math.round(v * f);
  const n = (v) => String(v / f);
  return rs.map((pts) => {
    let [px, py] = [r(pts[0][0]), r(pts[0][1])];
    let d = `M${n(px)} ${n(py)}`, steps = "";
    for (let k = 1; k < pts.length; k++) {
      const [x, y] = [r(pts[k][0]), r(pts[k][1])];
      if (x === px && y === py) continue;
      const dx = n(x - px), dy = n(y - py);
      steps += `${steps ? (dx.startsWith("-") ? "" : " ") : ""}${dx}${dy.startsWith("-") ? "" : " "}${dy}`;
      [px, py] = [x, y];
    }
    return `${d}l${steps}z`;
  }).join("");
}

const boxOf = (rs) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const pts of rs) for (const [x, y] of pts) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d].map((v) => Math.round(v * 10) / 10);
};
/** The centroid of the largest ring (shoelace), a label point good enough for convex-ish units; its box centre when degenerate. */
function labelOf(rs) {
  let best = null, bestArea = 0;
  for (const pts of rs) {
    let a = 0, cx = 0, cy = 0;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
      const cross = pts[j][0] * pts[k][1] - pts[k][0] * pts[j][1];
      a += cross; cx += (pts[j][0] + pts[k][0]) * cross; cy += (pts[j][1] + pts[k][1]) * cross;
    }
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  if (!best) { const b = boxOf(rs); best = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return best.map((v) => Math.round(v * 10) / 10);
}

const labels = new Map(topo.objects.etichete.geometries.map((g) => [g.properties.county, project([g.coordinates[0] * sx + tx, g.coordinates[1] * sy + ty]).map((v) => Math.round(v * 10) / 10)]));
const attribution = "Limitele UAT: ANCPI, 07.03.2024; denumiri: INS SIRUTA s1 2026 (data.gov.ro, CC BY 4.0), simplificate";

const counties = topo.objects.judete.geometries.map((g) => {
  const rs = rings(g, national);
  const name = g.properties.county;
  return { key: countyKey(name), name, d: pathOf(rs, 1), box: boxOf(rs), label: labels.get(name) ?? labelOf(rs) };
}).sort((a, b) => a.key.localeCompare(b.key));

const out = path.join(WEB, "public", "geo");
rmSync(path.join(out, "judete"), { recursive: true, force: true });
mkdirSync(path.join(out, "judete"), { recursive: true });
writeFileSync(path.join(out, "romania.json"), JSON.stringify({ width: WIDTH, height: HEIGHT, attribution, counties }));

const index = [];
const sizes = [];
for (const county of counties) {
  const uats = topo.objects.uat.geometries.filter((g) => countyKey(g.properties.county) === county.key).map((g) => {
    const rs = rings(g, detailed);
    const p = g.properties;
    index.push([p.siruta, p.name, county.key, p.kind]);
    return { siruta: p.siruta, name: p.name, kind: p.kind, seat: Boolean(p.seat), d: pathOf(rs, 2), label: labelOf(rs) };
  }).sort((a, b) => a.siruta - b.siruta);
  const body = JSON.stringify({ key: county.key, name: county.name, box: county.box, attribution, uats });
  writeFileSync(path.join(out, "judete", `${county.key}.json`), body);
  sizes.push([county.key, uats.length, body.length]);
}
index.sort((a, b) => a[0] - b[0]);
writeFileSync(path.join(WEB, "lib", "reference", "uat-geo.json"), JSON.stringify({ source: meta.sources.map((s) => ({ label: s.label, url: s.url, license: s.license })), uats: index }));

const nationalBytes = JSON.stringify({ width: WIDTH, height: HEIGHT, attribution, counties }).length;
sizes.sort((a, b) => b[2] - a[2]);
console.log(`romania.json ${nationalBytes} B, ${counties.length} counties, ${WIDTH}x${HEIGHT}`);
console.log(`counties' UAT files: ${sizes.length}, ${index.length} UATs, total ${sizes.reduce((a, s) => a + s[2], 0)} B, largest ${sizes.slice(0, 3).map((s) => `${s[0]} ${s[1]} UATs ${s[2]} B`).join("; ")}, smallest ${sizes.at(-1).join(" ")}`);
