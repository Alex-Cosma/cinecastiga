import Link from "next/link";
import {
  getFlagCounts,
  getFlagInstances,
  getRiskGroup,
  getRiskLeaderboard,
  type FlagInstance,
  type RiskGroupSort,
} from "@/lib/marts";
import { FLAG_META, FLAG_ORDER, criBand } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";

const GROUP_SORTS: RiskGroupSort[] = ["cri", "flags", "das", "total", "name"];

/** Page-number window: first, last, current ±2, gaps as null. */
function pageList(cur: number, n: number): (number | null)[] {
  const keep = new Set<number>([0, n - 1]);
  for (let i = cur - 2; i <= cur + 2; i++) if (i >= 0 && i < n) keep.add(i);
  const arr = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = -2;
  for (const x of arr) {
    if (prev >= 0 && x - prev > 1) out.push(null);
    out.push(x);
    prev = x;
  }
  return out;
}

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
    case "award_no_competition":
      return `${e["procedure"]} · ${formatInt(Number(e["value"]))} lei`;
    case "award_single_bid":
      return `${e["procedure"]} · ofertant unic · ${formatInt(Number(e["value"]))} lei`;
    case "award_concentration":
      return `top câștigător ${Math.round(Number(e["top_winner_pct"]) * 100)}% · HHI ${e["hhi"]} · ${e["winners"]} câștigători`;
    case "award_dependence":
      return `${Math.round(Number(e["top_authority_pct"]) * 100)}% dintr-o singură autoritate · ${e["authorities"]} autorități`;
    default:
      return "";
  }
}

export default async function SemnalePage({
  searchParams,
}: {
  searchParams: Promise<{
    tip?: string;
    rol?: string;
    criMin?: string;
    criMax?: string;
    jud?: string;
    p?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { tip, rol, criMin, criMax, jud, p, sort, dir } = await searchParams;
  const code = tip && FLAG_META[tip] ? tip : "da_split";

  // CRI-band group view (landing page for a clicked distribution bar):
  // a standalone, sortable, paged list — nothing else on the page.
  const groupRole = rol === "authority" || rol === "supplier" ? rol : null;
  const gMin = criMin !== undefined ? Number(criMin) : NaN;
  const gMax = criMax !== undefined ? Number(criMax) : NaN;
  if (groupRole !== null && Number.isFinite(gMin) && Number.isFinite(gMax)) {
    const gSort = GROUP_SORTS.includes(sort as RiskGroupSort)
      ? (sort as RiskGroupSort)
      : "cri";
    const gDir = dir === "asc" ? "asc" : dir === "desc" ? "desc" : gSort === "name" ? "asc" : "desc";
    const PS = 10;
    const page = Math.max(0, Number(p ?? 0) || 0);
    const group = await getRiskGroup(groupRole, gMin, gMax, jud ?? null, page, PS, gSort, gDir);
    const nPages = Math.max(1, Math.ceil(group.total / PS));
    const url = (over: { p?: number; sort?: RiskGroupSort }): string => {
      const q = new URLSearchParams({
        rol: groupRole,
        criMin: String(gMin),
        criMax: String(gMax),
      });
      if (jud) q.set("jud", jud);
      const s = over.sort ?? gSort;
      // clicking the active column flips direction; a new column gets its default
      const d =
        over.sort !== undefined
          ? over.sort === gSort
            ? gDir === "desc"
              ? "asc"
              : "desc"
            : over.sort === "name"
              ? "asc"
              : "desc"
          : gDir;
      if (s !== "cri" || d !== "desc") {
        q.set("sort", s);
        q.set("dir", d);
      }
      const pg = over.p ?? (over.sort !== undefined ? 0 : page);
      if (pg > 0) q.set("p", String(pg));
      return `/semnale?${q.toString()}`;
    };
    const th = (key: RiskGroupSort, label: string, right = false) => (
      <th style={right ? { textAlign: "right" } : undefined}>
        <Link href={url({ sort: key })} className={`grp-sort${gSort === key ? " on" : ""}`}>
          {label}
          {gSort === key ? (gDir === "desc" ? " ▼" : " ▲") : ""}
        </Link>
      </th>
    );
    return (
      <>
        <h1 className="page-title">
          {groupRole === "authority" ? "Autorități" : "Firme"} cu CRI între {gMin.toFixed(1)}{" "}
          și {gMax.toFixed(1)}
          {jud ? ` · ${jud}` : ""}
        </h1>
        <p className="page-sub">
          {formatInt(group.total)} entități cu cel puțin 10 achiziții directe în acest
          interval de risc. CRI e un semnal statistic, nu o dovadă —{" "}
          <Link href="/metodologie">metodologia</Link>.
        </p>
        <section className="section">
          <table className="rank grp-list">
            <thead>
              <tr>
                <th className="num">#</th>
                {th("name", groupRole === "authority" ? "Autoritate" : "Firmă")}
                {th("cri", "CRI")}
                {th("flags", "Semnale")}
                {th("das", "Achiziții directe", true)}
                {th("total", "Total", true)}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((e, i) => {
                const band = criBand(e.cri);
                return (
                  <tr key={e.entityId}>
                    <td className="num county">{page * PS + i + 1}</td>
                    <td>
                      <Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link>
                      {e.county ? <div className="county">{e.county}</div> : null}
                    </td>
                    <td>
                      <span className={`cri-pill ${band.className}`}>{e.cri.toFixed(2)}</span>
                    </td>
                    <td className="county">
                      {e.flags.map((f) => FLAG_META[f]?.title ?? f).join(", ") || "—"}
                    </td>
                    <td className="num">{formatInt(e.nDas)}</td>
                    <td className="num">{formatRon(e.totalRon)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nPages > 1 && (
            <div className="grp-pager">
              {page > 0 && <Link href={url({ p: page - 1 })}>←</Link>}
              {pageList(page, nPages).map((pg, i) =>
                pg === null ? (
                  <span key={`gap-${i}`} className="gap">
                    …
                  </span>
                ) : pg === page ? (
                  <span key={pg} className="on">
                    {pg + 1}
                  </span>
                ) : (
                  <Link key={pg} href={url({ p: pg })}>
                    {pg + 1}
                  </Link>
                ),
              )}
              {page + 1 < nPages && <Link href={url({ p: page + 1 })}>→</Link>}
            </div>
          )}
        </section>
      </>
    );
  }

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
