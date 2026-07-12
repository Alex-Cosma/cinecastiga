import Link from "next/link";
import { getCpvChildren, getCpvAncestry, type CpvNode } from "@/lib/marts";
import { squarify } from "@/lib/treemap";
import { formatRon } from "@/lib/format";

export const dynamic = "force-dynamic";

const W = 1000;
const H = 560;

// Light gold → deep accent, by relative value within the current view.
function fill(value: number, max: number): string {
  const t = max > 0 ? Math.sqrt(value / max) : 0; // sqrt so small tiles stay visible
  const l = 78 - t * 42; // 78% → 36%
  const s = 42 + t * 22;
  return `hsl(30 ${s}% ${l}%)`;
}

export default async function DomeniiPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const parent = code ?? null;
  const [children, ancestry] = await Promise.all([
    getCpvChildren(parent),
    parent ? getCpvAncestry(parent) : Promise.resolve([] as CpvNode[]),
  ]);

  const max = children.reduce((m, c) => Math.max(m, c.totalRon), 0);
  const tiles = squarify(
    children.map((c) => ({ value: c.totalRon, node: c })),
    0,
    0,
    W,
    H,
  );

  return (
    <>
      <h1 className="page-title">Cheltuieli pe domenii (CPV)</h1>
      <p className="page-sub">
        Harta valorii contractate pe clasificarea CPV. Apasă o zonă pentru a detalia.
      </p>

      <nav className="crumbs">
        <Link href="/domenii">Toate domeniile</Link>
        {ancestry.map((a) => (
          <span key={a.code}>
            {" / "}
            <Link href={`/domenii?code=${a.code}`}>
              {a.code.slice(0, 8)} · {a.nameRo ?? "—"}
            </Link>
          </span>
        ))}
      </nav>

      <div className="treemap-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="treemap" role="img" aria-label="Treemap CPV">
          {tiles.map((t) => {
            const drill = t.node.nChildren > 0;
            const big = t.w > 74 && t.h > 30;
            const label = `${t.node.code.slice(0, 8)} · ${t.node.nameRo ?? ""}`;
            const rect = (
              <g>
                <rect
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  fill={fill(t.node.totalRon, max)}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <title>
                  {label} — {formatRon(t.node.totalRon)}
                </title>
                {big ? (
                  <foreignObject x={t.x + 6} y={t.y + 5} width={t.w - 12} height={t.h - 10}>
                    <div className="tile-label">
                      <span className="tile-name">{label}</span>
                      <span className="tile-val">{formatRon(t.node.totalRon)}</span>
                    </div>
                  </foreignObject>
                ) : null}
              </g>
            );
            return drill ? (
              <Link key={t.node.code} href={`/domenii?code=${t.node.code}`}>
                {rect}
              </Link>
            ) : (
              <g key={t.node.code}>{rect}</g>
            );
          })}
        </svg>
      </div>
      <p className="note">
        Instantaneu 2020. Suprafața fiecărei zone este proporțională cu valoarea contractată.
      </p>
    </>
  );
}
