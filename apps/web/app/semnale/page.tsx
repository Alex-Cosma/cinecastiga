import Link from "next/link";
import {
  getFlagCounts,
  getFlagInstances,
  getRiskLeaderboard,
  type FlagInstance,
} from "@/lib/marts";
import { FLAG_META, FLAG_ORDER, criBand } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";

export const dynamic = "force-dynamic";

function evidenceLine(fi: FlagInstance): string {
  const e = fi.evidence ?? {};
  switch (fi.flagCode) {
    case "da_split":
      return `${e["count"]} achiziții în ${e["year"]}, prag ${formatInt(Number(e["ceiling"]))} lei`;
    case "da_concentration":
      return `top furnizor ${Math.round(Number(e["top_supplier_pct"]) * 100)}% · HHI ${e["hhi"]} · ${e["suppliers"]} furnizori`;
    case "da_dependence":
      return `${Math.round(Number(e["top_authority_pct"]) * 100)}% dintr-o singură autoritate · ${e["authorities"]} autorități`;
    case "da_year_end":
      return `${Math.round(Number(e["december_pct"]) * 100)}% în decembrie ${e["year"]}`;
    case "da_rapid":
      return `finalizat în ${e["minutes"]} minute`;
    case "da_round":
      return `${formatInt(Number(e["closing"]))} din prag ${formatInt(Number(e["ceiling"]))} lei`;
    default:
      return "";
  }
}

export default async function SemnalePage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string }>;
}) {
  const { tip } = await searchParams;
  const code = tip && FLAG_META[tip] ? tip : "da_split";
  const [counts, instances, topAuth] = await Promise.all([
    getFlagCounts(),
    getFlagInstances(code, 50),
    getRiskLeaderboard("authority", 12),
  ]);
  const meta = FLAG_META[code]!;

  return (
    <>
      <h1 className="page-title">Semnale de risc</h1>
      <p className="page-sub">
        Indicatori obiectivi de risc pe achizițiile directe. Fiecare este un semnal, nu o
        dovadă — vezi{" "}
        <Link href="/metodologie">metodologia</Link>.
      </p>

      <section className="section">
        <h2>Autorități cu risc ridicat</h2>
        <p className="hint">
          După indicele compus de risc (CRI) — ponderea semnalelor declanșate.
        </p>
        <table className="rank">
          <thead>
            <tr>
              <th>Autoritate</th>
              <th>CRI</th>
              <th>Semnale</th>
              <th style={{ textAlign: "right" }}>Achiziții directe</th>
            </tr>
          </thead>
          <tbody>
            {topAuth.map((e) => {
              const band = criBand(e.cri);
              return (
                <tr key={e.entityId}>
                  <td>
                    <Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link>
                    {e.county ? <div className="county">{e.county}</div> : null}
                  </td>
                  <td>
                    <span className={`cri-pill ${band.className}`}>{e.cri.toFixed(2)}</span>
                  </td>
                  <td className="county">
                    {e.flags.map((f) => FLAG_META[f]?.title ?? f).join(", ")}
                  </td>
                  <td className="num">{formatInt(e.nDas)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2>Explorează după tip de semnal</h2>
        <div className="filters" style={{ flexWrap: "wrap" }}>
          {FLAG_ORDER.map((c) => (
            <Link key={c} href={`/semnale?tip=${c}`} className={c === code ? "on" : ""}>
              {FLAG_META[c]!.title} ({formatInt(counts[c] ?? 0)})
            </Link>
          ))}
        </div>

        <div className="flag-head">
          <h3>{meta.title}</h3>
          <p className="hint">{meta.description}</p>
        </div>

        <table className="rank">
          <thead>
            <tr>
              <th>{meta.subject === "pair" ? "Autoritate → Furnizor" : "Entitate"}</th>
              <th>Detaliu</th>
              <th style={{ textAlign: "right" }}>Valoare</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((fi, i) => (
              <tr key={`${fi.entityId}-${fi.partnerId}-${i}`}>
                <td>
                  {fi.entityId ? (
                    <Link href={`/entitati/${fi.entityId}`}>{cleanName(fi.entityName)}</Link>
                  ) : (
                    cleanName(fi.entityName)
                  )}
                  {fi.partnerName ? (
                    <>
                      {" → "}
                      {fi.partnerId ? (
                        <Link href={`/entitati/${fi.partnerId}`}>{cleanName(fi.partnerName)}</Link>
                      ) : (
                        fi.partnerName
                      )}
                    </>
                  ) : null}
                  {fi.entityCounty ? <div className="county">{fi.entityCounty}</div> : null}
                </td>
                <td className="county">{evidenceLine(fi)}</td>
                <td className="num">{fi.totalRon > 0 ? formatRon(fi.totalRon) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">{meta.caveat}</p>
      </section>
    </>
  );
}
