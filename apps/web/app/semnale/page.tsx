import Link from "next/link";
import {
  getCriDistribution,
  getFlagCounts,
  getFlagInstances,
  getRiskGroup,
  getRiskLeaderboard,
  type FlagInstance,
  type Role,
  type RiskGroupSort,
} from "@/lib/marts";
import { FLAG_META, FLAG_ORDER, criBand } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import { COUNTIES } from "@/lib/counties";

const GROUP_SORTS: RiskGroupSort[] = ["cri", "flags", "das", "total", "name"];
const SORT_LABEL: Record<RiskGroupSort, string> = { cri: "CRI", flags: "semnale", das: "achiziții directe", total: "total", name: "nume" };

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
export const metadata = { title: "Semnale de risc" };

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

const fmtCri = (n: number) => n.toFixed(2).replace(".", ",");

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

  // Side-panel state. The CRI band view (role + criMin/criMax) and the
  // flag-type view (tip) are the two things the panel can select; both keep
  // their URL contract (bars from the ask engine's distribution land here).
  const groupRole: Role | null = rol === "authority" || rol === "supplier" ? rol : null;
  const sideRole: Role = groupRole ?? "authority";
  const county = jud && COUNTIES.some((c) => c.toLowerCase() === jud.toLowerCase()) ? jud : jud || null;
  const gMin = criMin !== undefined ? Number(criMin) : NaN;
  const gMax = criMax !== undefined ? Number(criMax) : NaN;
  const bandMode = groupRole !== null && Number.isFinite(gMin) && Number.isFinite(gMax);

  const bandUrl = (role: Role, from: number, to: number, c: string | null, extra?: Record<string, string>) => {
    const q = new URLSearchParams({ rol: role, criMin: String(from), criMax: String(to) });
    if (c) q.set("jud", c);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    return `/semnale?${q}`;
  };
  const roleUrl = (role: Role) => (bandMode ? bandUrl(role, gMin, gMax, county) : `/semnale?tip=${code}&rol=${role}${county ? `&jud=${encodeURIComponent(county)}` : ""}`);

  const [dist, counts] = await Promise.all([getCriDistribution(sideRole, county), getFlagCounts()]);
  const distMax = Math.max(1, ...dist.map((b) => b.n));
  const distTotal = dist.reduce((s, b) => s + b.n, 0);

  const side = (
    <aside className="sem-side">
      <div className="card pad">
        <p className="eyebrow">cine</p>
        <span className="seg sem-seg">
          <Link href={roleUrl("authority")} className={sideRole === "authority" ? "on" : undefined}>
            autorități
          </Link>
          <Link href={roleUrl("supplier")} className={sideRole === "supplier" ? "on" : undefined}>
            firme
          </Link>
        </span>

        <p className="eyebrow">indice de risc</p>
        <div className="distr" role="list">
          {dist.map((b, i) => {
            const on = bandMode && gMin <= b.from + 1e-9 && gMax >= b.to - 1e-9;
            return (
              <Link
                key={i}
                href={bandUrl(sideRole, b.from, b.to, county)}
                className={on ? "on" : undefined}
                style={{ height: `${Math.max(3, (b.n / distMax) * 100)}%`, ["--i" as string]: i }}
                title={`CRI ${b.from.toFixed(1)}–${b.to.toFixed(1)} · ${formatInt(b.n)} ${sideRole === "authority" ? "autorități" : "firme"}`}
                role="listitem"
              />
            );
          })}
        </div>
        <div className="distr-l">
          {dist.map((b, i) => (
            <span key={i}>{i === 0 ? "0" : `,${i}`}</span>
          ))}
        </div>
        <p className="note">
          {bandMode
            ? `Selectat: CRI ${gMin.toFixed(1).replace(".", ",")}–${gMax.toFixed(1).replace(".", ",")}. Click pe o bară schimbă banda.`
            : `${formatInt(distTotal)} ${sideRole === "authority" ? "autorități" : "firme"} cu cel puțin 10 achiziții directe${county ? ` în ${county}` : ""}. Click pe o bară deschide lista.`}
        </p>

        <p className="eyebrow">județ</p>
        <form method="get" action="/semnale" className="sem-county">
          {bandMode ? (
            <>
              <input type="hidden" name="rol" value={sideRole} />
              <input type="hidden" name="criMin" value={String(gMin)} />
              <input type="hidden" name="criMax" value={String(gMax)} />
            </>
          ) : (
            <>
              <input type="hidden" name="tip" value={code} />
              <input type="hidden" name="rol" value={sideRole} />
            </>
          )}
          <select name="jud" defaultValue={county ?? ""} aria-label="județ">
            <option value="">toate județele</option>
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="submit" className="btn sm">
            aplică
          </button>
        </form>

        <p className="eyebrow">tip de semnal</p>
        <div className="chips sem-types">
          {FLAG_ORDER.map((c) => (
            <Link key={c} href={`/semnale?tip=${c}`} className={"chip" + (!bandMode && c === code ? " on" : "")}>
              {FLAG_META[c]!.title} <span className="c">{formatInt(counts[c] ?? 0)}</span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );

  if (bandMode) {
    const gSort = GROUP_SORTS.includes(sort as RiskGroupSort) ? (sort as RiskGroupSort) : "cri";
    const gDir = dir === "asc" ? "asc" : dir === "desc" ? "desc" : gSort === "name" ? "asc" : "desc";
    const PS = 10;
    const page = Math.max(0, Number(p ?? 0) || 0);
    const group = await getRiskGroup(groupRole!, gMin, gMax, county, page, PS, gSort, gDir);
    const nPages = Math.max(1, Math.ceil(group.total / PS));
    const url = (over: { p?: number; sort?: RiskGroupSort }): string => {
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
      const extra: Record<string, string> = {};
      if (s !== "cri" || d !== "desc") {
        extra.sort = s;
        extra.dir = d;
      }
      const pg = over.p ?? (over.sort !== undefined ? 0 : page);
      if (pg > 0) extra.p = String(pg);
      return bandUrl(groupRole!, gMin, gMax, county, extra);
    };
    const th = (key: RiskGroupSort, label: string, right = false) => (
      <th style={right ? { textAlign: "right" } : undefined} className={gSort === key ? "on" : undefined}>
        <Link href={url({ sort: key })} className={`grp-sort${gSort === key ? " on" : ""}`}>
          {label}
          {gSort === key ? (gDir === "desc" ? " ▾" : " ▴") : ""}
        </Link>
      </th>
    );
    return (
      <>
        <p className="eyebrow">semnale de risc</p>
        <h1 className="page-title">
          {groupRole === "authority" ? "Autorități" : "Firme"} cu CRI între {gMin.toFixed(1).replace(".", ",")} și{" "}
          {gMax.toFixed(1).replace(".", ",")}
          {county ? ` · ${county}` : ""}
        </h1>
        <p className="page-sub">
          {formatInt(group.total)} entități cu cel puțin 10 achiziții directe în acest interval de risc. CRI e un semnal
          statistic, nu o dovadă — <Link href="/metodologie">metodologia</Link>.
        </p>
        <div className="sem-layout">
          {side}
          <section className="card sem-main">
            <div className="sortrow">
              <span>sortare:</span>
              {GROUP_SORTS.map((k) => (
                <Link key={k} href={url({ sort: k })} className={gSort === k ? "on" : undefined}>
                  {SORT_LABEL[k]}
                  {gSort === k ? (gDir === "desc" ? " ▾" : " ▴") : ""}
                </Link>
              ))}
              <span className="num right">
                pagina {page + 1} din {nPages}
              </span>
            </div>
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
                        <span className={`cri-pill ${band.className}`}>{fmtCri(e.cri)}</span>
                      </td>
                      <td className="county">{e.flags.map((f) => FLAG_META[f]?.title ?? f).join(", ") || "—"}</td>
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
        </div>
      </>
    );
  }

  const [instances, topAuth] = await Promise.all([getFlagInstances(code, 50), getRiskLeaderboard("authority", 12)]);
  const meta = FLAG_META[code]!;

  return (
    <>
      <p className="eyebrow">semnale de risc</p>
      <h1 className="page-title">Unde merită să te uiți</h1>
      <p className="page-sub">
        13 indicatori obiectivi pe achiziții directe, contracte, bilanțuri și ONRC. Fiecare e un semnal, nu o dovadă —{" "}
        <Link href="/metodologie">metodologia</Link>.
      </p>

      <div className="sem-layout">
        {side}
        <div className="sem-main-col">
          <section className="method-card sem-flag" id={code}>
            <div className="method-head">
              <h3>{meta.title}</h3>
              <p className="mh-desc">{meta.description}</p>
              <Link href={`/metodologie#${code}`} className="mh-link">
                cum se calculează →
              </Link>
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
                      {fi.entityId ? <Link href={`/entitati/${fi.entityId}`}>{cleanName(fi.entityName)}</Link> : cleanName(fi.entityName)}
                      {fi.partnerName ? (
                        <>
                          {" → "}
                          {fi.partnerId ? <Link href={`/entitati/${fi.partnerId}`}>{cleanName(fi.partnerName)}</Link> : fi.partnerName}
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
            <p className="note">
              {meta.caveat} Primele {formatInt(instances.length)} din {formatInt(counts[code] ?? 0)}, după valoare.
            </p>
          </section>

          <section className="card sem-lead">
            <div className="lead-head">
              <h3>Autorități cu risc ridicat</h3>
              <span className="note">după indicele compus de risc (CRI)</span>
            </div>
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
                        <span className={`cri-pill ${band.className}`}>{fmtCri(e.cri)}</span>
                      </td>
                      <td className="county">{e.flags.map((f) => FLAG_META[f]?.title ?? f).join(", ")}</td>
                      <td className="num">{formatInt(e.nDas)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
