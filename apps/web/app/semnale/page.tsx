import Link from "next/link";
import type { FlagInstance, RiskGroupSort } from "@/lib/marts";
import { getSignalOverview, getSignalPage, getSignalRiskGroup, parseSignalState, signalUrl, RISK_SORTS, RISK_PAGE_SIZE, type SignalState } from "@/lib/signals";
import { FLAG_META, FLAG_ORDER, criBand } from "@/lib/flags";
import { formatRon, formatInt, cleanName } from "@/lib/format";
import { COUNTIES } from "@/lib/counties";
import "./signals.css";

const GROUP_SORTS = RISK_SORTS;
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
      return `${e["count"]} achiziții în ${e["year"]}${e["cpv_class"] ? ` · CPV ${e["cpv_class"]}` : ""}, plafon de referință ${formatInt(Number(e["ceiling"]))} lei`;
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
      return e["confirmed_contract_count"] ? `${e["confirmed_contract_count"]} contracte cu o singură ofertă raportată în TED` : "Detaliile contractelor sunt în curs de recalculare";
    case "award_concentration":
      return `top câștigător ${Math.round(Number(e["top_winner_pct"]) * 100)}% · HHI ${e["hhi"]} · ${e["winners"]} câștigători`;
    case "award_dependence":
      return `${Math.round(Number(e["top_authority_pct"]) * 100)}% dintr-o singură autoritate · ${e["authorities"]} autorități`;
    case "fin_tiny_staff":
      return `${e["employees"]} salariați în ${e["year"]} · ${formatRon(Number(e["per_employee"]))} per salariat`;
    case "fin_public_reliance":
      return `${Math.round(Number(e["ratio"]) * 100)}% din cifra de afaceri · ${e["years"]} ani cu bilanț`;
    case "net_shared_admin":
      return `${e["n_firms"]} firme · administrator ${e["person"]} · ${e["authority"]}`;
    default:
      return "";
  }
}

const fmtCri = (n: number) => n.toFixed(2).replace(".", ",");

function Pager({ state, page, total, pageSize }: { state: SignalState; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages < 2) return null;
  return <nav className="grp-pager" aria-label="Pagini de rezultate">
    {page > 0 && <Link href={signalUrl(state, { page: page - 1 })} aria-label="Pagina anterioară">←</Link>}
    {pageList(page, pages).map((item, i) => item === null ? <span key={`gap-${i}`} className="gap">…</span>
      : item === page ? <span key={item} className="on" aria-current="page">{item + 1}</span>
      : <Link key={item} href={signalUrl(state, { page: item })} aria-label={`Pagina ${item + 1}`}>{item + 1}</Link>)}
    {page + 1 < pages && <Link href={signalUrl(state, { page: page + 1 })} aria-label="Pagina următoare">→</Link>}
  </nav>;
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
  const state = parseSignalState(await searchParams);
  const { code, role: sideRole, county } = state;
  const groupRole = sideRole;
  const bandMode = state.band !== null;
  const gMin = state.band?.from ?? 0, gMax = state.band?.to ?? 1;
  const roleUrl = (role: SignalState["role"]) => signalUrl(state, { role });
  const [overview, signalResult, riskResult] = await Promise.all([
    getSignalOverview(state),
    bandMode ? Promise.resolve(null) : getSignalPage(state),
    bandMode ? getSignalRiskGroup(state) : Promise.resolve(null),
  ]);
  const { distribution: dist, counts } = overview;
  if (signalResult) counts[code] = signalResult.total;
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
                href={signalUrl(state, { band: { from: b.from, to: b.to } })}
                className={on ? "on" : undefined}
                style={{ height: `${Math.max(3, (b.n / distMax) * 100)}%`, ["--i" as string]: i }}
                title={`CRI ${b.from.toFixed(1)}–${b.to.toFixed(1)} · ${formatInt(b.n)} ${sideRole === "authority" ? "autorități" : "firme"}`}
                aria-label={`CRI ${b.from.toFixed(1)}–${b.to.toFixed(1)}: ${formatInt(b.n)} ${sideRole === "authority" ? "autorități" : "firme"}`}
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
        <p className="note sem-scope-note">{sideRole === "authority" ? "Județul autorității." : "Județul sediului firmei."} Filtrul se aplică semnalelor și listelor de entități.</p>
        <form method="get" action="/semnale" className="sem-county">
          <input type="hidden" name="tip" value={code} />
          {bandMode ? (
            <>
              <input type="hidden" name="rol" value={sideRole} />
              <input type="hidden" name="criMin" value={String(gMin)} />
              <input type="hidden" name="criMax" value={String(gMax)} />
              <input type="hidden" name="sort" value={state.sort} />
              <input type="hidden" name="dir" value={state.dir} />
            </>
          ) : (
            <>
              <input type="hidden" name="rol" value={sideRole} />
            </>
          )}
          <select name="jud" defaultValue={county ?? ""} aria-label="județ">
            <option value="">toate județele</option>
            {county && !COUNTIES.includes(county) && <option value={county}>{county}</option>}
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
            <Link key={c} href={signalUrl(state, { code: c, band: null })} className={"chip" + (!bandMode && c === code ? " on" : "")}>
              {FLAG_META[c]!.title} <span className="c">{formatInt(counts[c] ?? 0)}</span>
            </Link>
          ))}
        </div>
        <p className="note">Numerele de lângă tipuri arată toate aparițiile calculate pentru rolul și județul ales, nu doar exemplele afișate. O entitate poate apărea în mai multe perioade.</p>
      </div>
    </aside>
  );

  if (bandMode) {
    const gSort = state.sort;
    const gDir = state.dir;
    const PS = RISK_PAGE_SIZE;
    const group = riskResult!;
    const page = group.page;
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
      const pg = over.p ?? (over.sort !== undefined ? 0 : page);
      return signalUrl(state, { page: pg, sort: s, dir: d });
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
            <div className="sem-table-scroll" role="region" aria-label="Entitățile din intervalul CRI" tabIndex={0}><table className="rank grp-list">
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
            </table></div>
            {group.rows.length === 0 && <p className="sem-empty">Nicio entitate în acest interval și județ. <Link href={signalUrl(state, { band: null })}>Revino la semnale</Link> sau alege alt interval.</p>}
            <Pager state={state} page={page} total={group.total} pageSize={PS} />
          </section>
        </div>
      </>
    );
  }

  const result = signalResult!;
  const instances = result.rows, topAuth = overview.leaderboard;
  const meta = FLAG_META[code]!;

  return (
    <>
      <p className="eyebrow">semnale de risc</p>
      <h1 className="page-title">Unde merită să te uiți</h1>
      <p className="page-sub">
        13 indicatori obiectivi pe achiziții directe, contracte, bilanțuri și ONRC. Fiecare e un semnal, nu o dovadă —{" "}
        <Link href="/metodologie">metodologia</Link>.
      </p>
      <p className="sem-applied">{sideRole === "authority" ? "Autorități" : "Firme"} · {county ?? "Toate județele"}. Sunt afișate semnalele calculate în arhiva disponibilă.</p>

      <div className="sem-layout">
        {side}
        <div className="sem-main-col">
          <section className="method-card sem-flag" id={code}>
            <div className="method-head">
              <h2>{meta.title}</h2>
              <p className="mh-desc">{meta.description}</p>
              <Link href={`/metodologie#${code}`} className="mh-link">
                cum se calculează →
              </Link>
            </div>
            <div className="sem-results-summary" role="status">
              <strong>{formatInt(result.total)} apariții</strong>
              <span>{result.total > 0 ? `${formatInt(result.page * result.pageSize + 1)}–${formatInt(Math.min(result.total, (result.page + 1) * result.pageSize))} afișate · pagina ${formatInt(result.page + 1)} din ${formatInt(Math.max(1, Math.ceil(result.total / result.pageSize)))}` : "Niciun rezultat pentru această selecție"}</span>
            </div>
            <div className="sem-table-scroll" role="region" aria-label={`Rezultate: ${meta.title}`} tabIndex={0}><table className="rank">
              <thead>
                <tr>
                  <th>{meta.subject === "award" ? "Autoritate și firme câștigătoare" : sideRole === "authority" ? "Autoritate și partener" : "Firmă și partener"}</th>
                  <th>Detaliu</th>
                  <th style={{ textAlign: "right" }}>{meta.subject === "award" ? "Valoarea anunțului" : "Valoare"}</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((fi) => (
                  <tr key={fi.id}>
                    <td>
                      {fi.entityId ? <Link href={`/entitati/${fi.entityId}`}>{cleanName(fi.entityName)}</Link> : cleanName(fi.entityName)}
                      {fi.partnerName ? (
                        <>
                          {sideRole === "supplier" ? " ← " : " → "}
                          {fi.partnerId ? <Link href={`/entitati/${fi.partnerId}`}>{cleanName(fi.partnerName)}</Link> : fi.partnerName}
                        </>
                      ) : null}
                      {fi.entityCounty ? <div className="county">{fi.subjectType === "award" ? "Autoritate: " : ""}{fi.entityCounty}</div> : null}
                      {fi.subjectType === "award" && <div className="sem-winners">{fi.winners.length ? fi.winners.map((winner) => <div key={winner.entityId}><Link href={`/entitati/${winner.entityId}`}>{cleanName(winner.name)}</Link>{winner.county && <span className="county"> · {winner.county}</span>}</div>) : <span className="county">Câștigător neidentificat în date.</span>}</div>}
                    </td>
                    <td className="county">{evidenceLine(fi)}{fi.period && fi.period !== "all" && !["da_split", "da_year_end", "fin_tiny_staff"].includes(fi.flagCode) && <div>{fi.period}</div>}{<div><Link href={`/semnale/${fi.id}`}>Vezi înregistrările sursă →</Link></div>}</td>
                    <td className="num">{fi.totalRon > 0 ? formatRon(fi.totalRon) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {result.total === 0 && <p className="sem-empty">Nu există apariții calculate pentru {sideRole === "authority" ? "autorități" : "firme"}{county ? ` din ${county}` : ""} în acest tip de semnal. {meta.subject === "supplier" && sideRole === "authority" ? <Link href={signalUrl(state, { role: "supplier" })}>Vezi semnalul pentru firme →</Link> : meta.subject === "authority" && sideRole === "supplier" ? <Link href={signalUrl(state, { role: "authority" })}>Vezi semnalul pentru autorități →</Link> : county ? <Link href={signalUrl(state, { county: null })}>Caută în toate județele →</Link> : "Alege alt tip din listă."}</p>}
            <Pager state={state} page={result.page} total={result.total} pageSize={result.pageSize} />
            <p className="note">
              {meta.caveat} Poți parcurge întreaga listă de apariții calculate pentru selecție, ordonate după valoare și severitate. Aceeași entitate poate avea mai multe semnale sau perioade.
            </p>
            {meta.subject === "award" && <p className="note">Un semnal se numără o singură dată pe anunț, chiar dacă există mai mulți câștigători. La filtrarea firmelor după județ, cel puțin un câștigător trebuie să fie din județul ales; sunt afișați toți câștigătorii anunțului. Valoarea este a anunțului de atribuire.</p>}
            <p className="note">Semnalele pot acoperi aceleași achiziții. Valorile rândurilor nu se adună pentru a calcula cheltuiala totală.</p>
          </section>

          <section className="card sem-lead">
            <div className="lead-head">
              <h3>{sideRole === "authority" ? "Autorități" : "Firme"} după indicele CRI{county ? ` · ${county}` : ""}</h3>
              <span className="note">Primele {topAuth.length} cu CRI peste zero și cel puțin {sideRole === "authority" ? 30 : 10} achiziții directe. Clasamentul păstrează rolul și județul; CRI combină semnalele aplicabile.</span>
            </div>
            <div className="sem-table-scroll" role="region" aria-label="Clasament CRI" tabIndex={0}><table className="rank">
              <thead>
                <tr>
                  <th>{sideRole === "authority" ? "Autoritate" : "Firmă"}</th>
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
            </table></div>
            {topAuth.length === 0 && <p className="sem-empty">Nicio entitate cu CRI peste zero îndeplinește condițiile acestui clasament.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
