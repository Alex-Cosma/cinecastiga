import Link from "next/link";
import {
  getSpendByType,
  getSpendByCpv,
  getTopEntities,
  getTedStats,
  getNotableFindings,
  type TopEntity,
} from "@/lib/marts";
import { countryName } from "@/lib/ted";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import { FLAG_META } from "@/lib/flags";

/**
 * Legacy home-page sections, parked here while the home page is search-only.
 * Not imported anywhere — the `_legacy` folder is invisible to the Next.js
 * router. Each piece is self-contained (LegacyHomeSections fetches its own
 * data) so bringing one back is a single import + <LegacyHomeSections /> (or a
 * cherry-picked sub-component) in app/page.tsx.
 */

export function TopTable({ title, rows }: { title: string; rows: TopEntity[] }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="hint">După valoarea totală contractată (atribuire integrală).</p>
      <table className="rank">
        <thead>
          <tr>
            <th>#</th>
            <th>Entitate</th>
            <th style={{ textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entityId}>
              <td className="pos">{r.rank}</td>
              <td>
                <Link href={`/entitati/${r.entityId}`}>{r.name ?? "(fără nume)"}</Link>
                {r.county ? <div className="county">{r.county}</div> : null}
              </td>
              <td className="num">{formatRon(r.totalRon)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <div className="bar-label" title={r.label}>
            {r.label}
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="bar-val">{formatRon(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  LUCRARI: "Lucrări",
  SERVICII: "Servicii",
  FURNIZARE: "Furnizare",
};

/** "Descoperiri recente" cards + "Explorează" tiles + charts + top tables + TED callout. */
export async function LegacyHomeSections() {
  const [byType, byCpv, topSuppliers, topAuthorities, ted, notable] = await Promise.all([
    getSpendByType(),
    getSpendByCpv(15),
    getTopEntities("supplier", 15),
    getTopEntities("authority", 15),
    getTedStats(),
    getNotableFindings(2),
  ]);

  return (
    <>
      {notable.length > 0 && (
        <>
          <div className="sect-h">Descoperiri recente</div>
          <div className="notable">
            {notable.map((n) => (
              <Link
                key={`${n.flagCode}-${n.entityId}`}
                className="ncard"
                href={n.entityId ? `/entitati/${n.entityId}` : "/semnale"}
              >
                <div className="k">⚑ {(FLAG_META[n.flagCode]?.title ?? n.flagCode).toUpperCase()}</div>
                <div className="t">
                  {cleanName(n.entityName)} — {formatRon(n.totalRon)}
                  {n.county ? ` (${n.county})` : ""}
                </div>
                <div className="s">
                  {FLAG_META[n.flagCode]?.short ?? ""} Semnal, nu dovadă.
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sect-h">Explorează</div>
      <div className="tiles">
        <Link className="tile" href="/semnale">
          <div className="i">⚑</div>
          <div className="n">Semnale</div>
          <div className="d">tipare de risc</div>
        </Link>
        <Link className="tile" href="/harta">
          <div className="i">🗺️</div>
          <div className="n">Hartă</div>
          <div className="d">cheltuială pe județe</div>
        </Link>
        <Link className="tile" href="/domenii">
          <div className="i">🧩</div>
          <div className="n">Domenii</div>
          <div className="d">ce se cumpără (CPV)</div>
        </Link>
        <Link className="tile" href="/supra-prag">
          <div className="i">🇪🇺</div>
          <div className="n">Supra-prag</div>
          <div className="d">contracte mari · TED</div>
        </Link>
      </div>

      <section className="section">
        <h2>Cheltuieli după tipul achiziției</h2>
        <p className="hint">Repartizarea valorii contractate pe categorii.</p>
        <Bars
          rows={byType.map((t) => ({
            label: TYPE_LABELS[t.acquisitionType ?? ""] ?? t.acquisitionType ?? "Necunoscut",
            value: t.totalRon,
          }))}
        />
      </section>

      <section className="section">
        <h2>Top domenii CPV</h2>
        <p className="hint">Cele mai mari 15 diviziuni CPV după valoare contractată.</p>
        <Bars
          rows={byCpv.map((c) => ({
            label: `${c.division} · ${c.nameRo ?? "—"}`,
            value: c.totalRon,
          }))}
        />
      </section>

      <section className="section">
        <div className="cols">
          <TopTable title="Top furnizori" rows={topSuppliers} />
          <TopTable title="Top autorități" rows={topAuthorities} />
        </div>
      </section>

      <section className="section">
        <div className="callout">
          <div>
            <h2>Contracte peste pragul european</h2>
            <p className="hint">
              {formatInt(ted.tedOnly)} atribuiri de mare valoare regăsite doar în TED, dintre care{" "}
              {formatInt(ted.foreign)} câștigate de firme străine
              {ted.byCountry[0]
                ? ` (${ted.byCountry.slice(0, 3).map((c) => countryName(c.country)).join(", ")}…)`
                : ""}
              . Sursă paralelă, neînsumată peste SEAP.
            </p>
          </div>
          <Link href="/supra-prag" className="callout-cta">
            Vezi achizițiile TED →
          </Link>
        </div>
      </section>
    </>
  );
}
