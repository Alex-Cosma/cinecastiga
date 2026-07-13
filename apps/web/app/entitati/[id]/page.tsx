import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEntityFlags,
  getEntityTransactions,
  getEntityPartners,
  getEntityMonthly,
  getSplitPairs,
  type Role,
  type EntityFlagRow,
  type DaTx,
} from "@/lib/marts";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { FLAG_META, criBand } from "@/lib/flags";
import { daUrl, participantsUrl, registryLinks } from "@/lib/elicitatie";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<Role, string> = {
  supplier: "Furnizor",
  authority: "Autoritate contractantă",
};
const PAGE_SIZE = 50;

function gapLabel(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} zile`;
}

function q(base: Record<string, string | undefined>, over: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
  return `?${p.toString()}`;
}

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const flagRows = await getEntityFlags(id);
  if (flagRows.length === 0) notFound();

  const role: Role =
    sp["rol"] === "furnizor" ? "supplier" : sp["rol"] === "autoritate" ? "authority" : flagRows[0]!.role;
  const row: EntityFlagRow = flagRows.find((r) => r.role === role) ?? flagRows[0]!;
  const rolParam = role === "supplier" ? "furnizor" : "autoritate";
  const page = Math.max(1, Number(sp["p"] ?? "1") || 1);
  const base = { rol: rolParam, sort: sp["sort"], an: sp["an"], sem: sp["sem"] };

  const [tx, partners, monthly, splits] = await Promise.all([
    getEntityTransactions(id, role, {
      page,
      pageSize: PAGE_SIZE,
      ...(sp["sort"] ? { sort: sp["sort"] as "value" | "date" | "gap" } : {}),
      ...(sp["an"] ? { year: sp["an"] } : {}),
      ...(sp["sem"] ? { flagCode: sp["sem"] } : {}),
    }),
    getEntityPartners(id, role, 12),
    getEntityMonthly(id, role),
    row.flags.includes("da_split") ? getSplitPairs(id, role) : Promise.resolve([]),
  ]);

  const band = criBand(row.cri);
  const cui = flagRows.find((r) => r.cui)?.cui ?? null;
  const county = flagRows.find((r) => r.county)?.county ?? null;
  const maxMonth = monthly.reduce((m, p) => Math.max(m, p.totalRon), 0) || 1;
  const totalPages = Math.max(1, Math.ceil(tx.total / PAGE_SIZE));
  const isAuth = role === "authority";

  return (
    <>
      <Link href="/semnale" className="back">
        ← Semnale
      </Link>

      {/* Identity */}
      <div className="profile-head">
        <h1>{cleanName(row.name)}</h1>
        <div className="id-meta">
          {flagRows.length > 1
            ? flagRows.map((r) => (
                <Link
                  key={r.role}
                  href={q(base, { rol: r.role === "supplier" ? "furnizor" : "autoritate", p: undefined })}
                  className={`role-tab ${r.role === role ? "on" : ""}`}
                >
                  {ROLE_LABEL[r.role]}
                </Link>
              ))
            : <span className="badge">{ROLE_LABEL[role]}</span>}
          {county ? <span className="note">{county}</span> : null}
          {cui ? <span className="note">CUI {cui}</span> : null}
        </div>
        <div className="ext-links">
          <a href={participantsUrl()} target="_blank" rel="noopener noreferrer">
            e-licitatie.ro ↗
          </a>
          {cui
            ? registryLinks(cui).map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))
            : null}
        </div>
      </div>

      {/* Risk summary */}
      <div className="stat-grid">
        <div className="stat">
          <div className="n">
            <span className={`cri-pill ${band.className}`}>{row.cri.toFixed(2)}</span>
          </div>
          <div className="l">Indice de risc — {band.label.toLowerCase()}</div>
        </div>
        <div className="stat">
          <div className="n">{formatInt(row.nDas)}</div>
          <div className="l">Achiziții directe</div>
        </div>
        <div className="stat">
          <div className="n">{formatRon(row.totalRon)}</div>
          <div className="l">Valoare totală</div>
        </div>
      </div>

      {/* CRI breakdown */}
      {row.flags.length > 0 ? (
        <section className="section">
          <h2>De ce este semnalată</h2>
          <p className="hint">
            {row.nFlags} semnale din cele aplicabile. Fiecare este un indiciu, nu o dovadă —{" "}
            <Link href="/metodologie">metodologie</Link>.
          </p>

          {row.flags.map((code) => {
            const m = FLAG_META[code];
            if (!m) return null;
            return (
              <div className="method-card" key={code}>
                <div className="method-head">
                  <h3>{m.title}</h3>
                  <span className="badge">{m.short}</span>
                </div>

                {code === "da_split" && splits.length > 0 ? (
                  <table className="rank">
                    <thead>
                      <tr>
                        <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
                        <th>An</th>
                        <th>Achiziții</th>
                        <th style={{ textAlign: "right" }}>Total (prag)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.map((s, i) => (
                        <tr key={`${s.partnerId}-${s.year}-${i}`}>
                          <td>
                            {s.partnerId ? (
                              <Link href={`/entitati/${s.partnerId}`}>{cleanName(s.partnerName)}</Link>
                            ) : (
                              (s.partnerName ?? "—")
                            )}
                          </td>
                          <td>{s.year}</td>
                          <td>{s.count}</td>
                          <td className="num">
                            {formatRon(s.totalRon)}{" "}
                            <span className="county">/ {formatInt(s.ceiling)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {code === "da_concentration" || code === "da_dependence" ? (
                  <table className="rank">
                    <thead>
                      <tr>
                        <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
                        <th>Achiziții</th>
                        <th>Pondere</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partners.slice(0, 8).map((p) => (
                        <tr key={p.partnerId}>
                          <td>
                            <Link href={`/entitati/${p.partnerId}`}>{cleanName(p.partnerName)}</Link>
                          </td>
                          <td>{p.n}</td>
                          <td>{Math.round(p.pct * 100)}%</td>
                          <td className="num">{formatRon(p.totalRon)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {code === "da_year_end" ? (
                  <div className="bars">
                    {monthly.slice(-24).map((pt) => {
                      const dec = pt.ym.endsWith("-12");
                      return (
                        <div className="bar-row" key={pt.ym}>
                          <div className="bar-label">{pt.ym}</div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${(pt.totalRon / maxMonth) * 100}%`,
                                background: dec ? "var(--accent)" : "var(--bar)",
                              }}
                            />
                          </div>
                          <div className="bar-val">{formatRon(pt.totalRon)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {code === "da_rapid" || code === "da_round" ? (
                  <p>
                    {m.description}{" "}
                    <Link href={q(base, { sem: code, p: undefined })}>
                      Vezi achizițiile afectate în tabel →
                    </Link>
                  </p>
                ) : (
                  <p className="note">{m.caveat}</p>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Counterparties */}
      {partners.length > 0 ? (
        <section className="section">
          <h2>{isAuth ? "Principalii furnizori" : "Principalele autorități"}</h2>
          <div className="bars">
            {partners.map((p) => (
              <div className="bar-row" key={p.partnerId}>
                <div className="bar-label">
                  <Link href={`/entitati/${p.partnerId}`}>{cleanName(p.partnerName)}</Link>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${p.pct * 100}%` }} />
                </div>
                <div className="bar-val">
                  {formatRon(p.totalRon)} · {Math.round(p.pct * 100)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Transactions */}
      <section className="section">
        <h2>Toate achizițiile directe</h2>
        <div className="tx-controls">
          <div className="filters">
            <Link href={q(base, { sort: undefined, p: undefined })} className={!sp["sort"] ? "on" : ""}>
              După valoare
            </Link>
            <Link href={q(base, { sort: "date", p: undefined })} className={sp["sort"] === "date" ? "on" : ""}>
              După dată
            </Link>
            <Link href={q(base, { sort: "gap", p: undefined })} className={sp["sort"] === "gap" ? "on" : ""}>
              Cele mai rapide
            </Link>
          </div>
          {sp["sem"] ? (
            <Link href={q(base, { sem: undefined, p: undefined })} className="clear-filter">
              ✕ filtru: {FLAG_META[sp["sem"]]?.title ?? sp["sem"]}
            </Link>
          ) : null}
        </div>
        <p className="hint">
          {formatInt(tx.total)} achiziții · fiecare rând trimite la pagina oficială e-licitatie.ro.
        </p>
        <div className="tx-scroll">
          <table className="rank tx-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
                <th>Obiect (CPV)</th>
                <th style={{ textAlign: "right" }}>Închidere</th>
                <th>Interval</th>
                <th>Semnale</th>
                <th>Sursă</th>
              </tr>
            </thead>
            <tbody>
              {tx.rows.map((t: DaTx) => (
                <tr key={t.sicapDaId}>
                  <td className="county">{t.finalizationDate ?? "—"}</td>
                  <td>
                    {t.partnerId ? (
                      <Link href={`/entitati/${t.partnerId}`}>{cleanName(t.partnerName)}</Link>
                    ) : (
                      (t.partnerName ?? "—")
                    )}
                  </td>
                  <td className="county">{t.cpvName ?? t.cpvCode ?? "—"}</td>
                  <td className="num">{formatRonFull(t.closingValue)}</td>
                  <td className="county">{gapLabel(t.gapMinutes)}</td>
                  <td>
                    {t.daFlags.map((f) => (
                      <span className="flag-badge sm" key={f} title={FLAG_META[f]?.short}>
                        {FLAG_META[f]?.title ?? f}
                      </span>
                    ))}
                  </td>
                  <td>
                    <a href={daUrl(t.sicapDaId)} target="_blank" rel="noopener noreferrer">
                      {t.daCode ?? "vezi"} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="pager">
            {page > 1 ? (
              <Link href={q(base, { p: String(page - 1) })}>← Anterior</Link>
            ) : (
              <span className="disabled">← Anterior</span>
            )}
            <span className="note">
              Pagina {page} din {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={q(base, { p: String(page + 1) })}>Următor →</Link>
            ) : (
              <span className="disabled">Următor →</span>
            )}
          </div>
        ) : null}
      </section>

      <p className="note">
        Instantaneu SICAP 2020. Valorile reflectă achiziții directe. Fiecare achiziție are
        link direct către înregistrarea oficială de pe e-licitatie.ro.
      </p>
    </>
  );
}
