import Link from "next/link";
import {
  getHeadline,
  getSpendByType,
  getSpendByCpv,
  getTopEntities,
  type TopEntity,
} from "@/lib/marts";
import { formatRon, formatInt } from "@/lib/format";

// Data comes from the batch-built marts and changes only on rebuild; render at
// request time (cache via CDN headers) rather than prerendering at build.
export const dynamic = "force-dynamic";

function TopTable({ title, rows }: { title: string; rows: TopEntity[] }) {
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

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
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

export default async function HomePage() {
  const [headline, byType, byCpv, topSuppliers, topAuthorities] = await Promise.all([
    getHeadline(),
    getSpendByType(),
    getSpendByCpv(15),
    getTopEntities("supplier", 15),
    getTopEntities("authority", 15),
  ]);

  const typeLabels: Record<string, string> = {
    LUCRARI: "Lucrări",
    SERVICII: "Servicii",
    FURNIZARE: "Furnizare",
  };

  return (
    <>
      <h1 className="page-title">Achizițiile publice ale României, în cifre</h1>
      <p className="page-sub">
        Statistici agregate din SICAP. Explorează cheltuielile, furnizorii și autoritățile
        contractante.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{formatRon(headline.totalSpend)}</div>
          <div className="l">Valoare totală contractată</div>
        </div>
        <div className="stat">
          <div className="n">{formatInt(headline.suppliers)}</div>
          <div className="l">Furnizori</div>
        </div>
        <div className="stat">
          <div className="n">{formatInt(headline.authorities)}</div>
          <div className="l">Autorități contractante</div>
        </div>
      </div>

      <section className="section">
        <h2>Cheltuieli după tipul achiziției</h2>
        <p className="hint">Repartizarea valorii contractate pe categorii.</p>
        <Bars
          rows={byType.map((t) => ({
            label: typeLabels[t.acquisitionType ?? ""] ?? t.acquisitionType ?? "Necunoscut",
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
    </>
  );
}
