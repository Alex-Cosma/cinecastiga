import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEntityFlags,
  getEntityProfile,
  getEntityPartners,
  getEntityMonthly,
  getSplitPairs,
  getEntityFlagEvidence,
  getCompanyReps,
  type FlagEvidenceRow,
  type Role,
  type EntityFlagRow,
} from "@/lib/marts";
import { countryName } from "@/lib/ted";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { FLAG_META, criBand } from "@/lib/flags";
import { daUrl, participantsUrl, registryLinks } from "@/lib/elicitatie";
import { encodeSpec } from "@/lib/ask/permalink";
import YearMiniChart from "./YearMiniChart";
import TxTable from "./TxTable";

/** Per-instance evidence line, formatted per flag code (null = no line). */
function evidenceLine(code: string, ev: Record<string, unknown> | null): string | null {
  if (!ev) return null;
  const n = (k: string) => Number(ev[k]);
  const s = (k: string) => String(ev[k] ?? "?");
  switch (code) {
    case "da_year_end":
      return `${s("year")}: ${(n("december_pct") * 100).toFixed(0)}% din cheltuiala anului pe achiziții directe s-a finalizat în decembrie (${formatRon(n("december"))} din ${formatRon(n("total"))}).`;
    case "da_rapid":
      return `finalizată la ${formatInt(n("minutes"))} min. după publicare — ${formatRon(n("closing"))}.`;
    case "da_round":
      return `${formatRon(n("closing"))} = ${((n("closing") / n("ceiling")) * 100).toFixed(1)}% din pragul de ${formatInt(n("ceiling"))} lei (${s("type")}).`;
    case "da_concentration":
      return `furnizorul principal ia ${(n("top_supplier_pct") * 100).toFixed(0)}% din ${formatRon(n("total"))} (HHI ${n("hhi").toFixed(2)}, ${formatInt(n("suppliers"))} furnizori).`;
    case "award_no_competition":
      return `${s("procedure")}: ${formatRon(n("value"))} (CPV ${s("cpv")}).`;
    case "award_single_bid":
      return `${s("procedure")}, o singură ofertă: ${formatRon(n("value"))} (CPV ${s("cpv")}).`;
    case "fin_tiny_staff":
      return `${s("year")}: ${formatInt(n("employees"))} angajați · ${formatRon(n("total"))} bani publici · ${formatRon(n("per_employee"))}/angajat.`;
    case "net_shared_admin":
      return `${s("person")}${ev["birth_year"] ? ` (n. ${s("birth_year")})` : ""} conduce ${formatInt(n("n_firms"))} firme care au încasat împreună ${formatRon(n("combined"))} de la ${s("authority")}.`;
    case "fin_public_reliance":
      return `${(n("ratio") * 100).toFixed(0)}% din cifra de afaceri vine din bani publici (${formatRon(n("public_total"))} contractat vs ${formatRon(n("revenue_total"))} cifră de afaceri, ${formatInt(n("years"))} ani cu bilanț).`;
    default:
      return null;
  }
}

/**
 * Dig-down deep link: the N acquisitions behind a da_split evidence row.
 * Carries exact entity IDS — names are ambiguous (eight "Comuna Dumbrăvița"
 * exist) and would re-resolve to the richest homonym.
 */
function splitDrillUrl(
  authority: { id: string | number | null; name: string },
  supplier: { id: string | number | null; name: string },
  year: number | string | null,
): string {
  const y = Number(year);
  const spec = {
    block: "stat",
    measure: "value",
    dataset: "da",
    filters: {
      // id = exact identity for the engine; name = readable chips in the builder
      authorityName: authority.name,
      supplierName: supplier.name,
      ...(authority.id ? { authorityId: Number(authority.id) } : {}),
      ...(supplier.id ? { supplierId: Number(supplier.id) } : {}),
      ...(Number.isFinite(y) ? { yearFrom: y, yearTo: y } : {}),
    },
  };
  return `/?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1`;
}

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<Role, string> = {
  supplier: "Furnizor",
  authority: "Autoritate contractantă",
};
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
  const [flagRowsRaw, profile] = await Promise.all([getEntityFlags(id), getEntityProfile(id)]);
  // The DA-centric flag summary exists only for entities with DA activity. An
  // entity known only via contracts / TED (e.g. a foreign supplier) has an
  // entity_profile but no entity_flags — synthesize a flag-free identity row from
  // the profile so it's still reachable + badged (its DA sections just render empty).
  const flagRows: EntityFlagRow[] =
    flagRowsRaw.length > 0
      ? flagRowsRaw
      : profile
        ? profile.roles.map((pr) => ({
            role: pr.role,
            name: profile.name,
            cui: null,
            county: profile.county,
            cri: 0,
            nFlags: 0,
            nDas: pr.nDas,
            totalRon: pr.totalRonFull,
            flags: [],
          }))
        : [];
  if (flagRows.length === 0) notFound();

  const role: Role =
    sp["rol"] === "furnizor" ? "supplier" : sp["rol"] === "autoritate" ? "authority" : flagRows[0]!.role;
  const row: EntityFlagRow = flagRows.find((r) => r.role === role) ?? flagRows[0]!;
  const rolParam = role === "supplier" ? "furnizor" : "autoritate";
  const base = { rol: rolParam, sort: sp["sort"], an: sp["an"], sem: sp["sem"] };

  const cui = flagRows.find((r) => r.cui)?.cui ?? null;
  const [partners, monthly, splits, flagEvidence, reps] = await Promise.all([
    getEntityPartners(id, role, 12),
    getEntityMonthly(id, role),
    row.flags.includes("da_split") ? getSplitPairs(id, role) : Promise.resolve([]),
    getEntityFlagEvidence(id),
    cui ? getCompanyReps(cui) : Promise.resolve([]),
  ]);

  const band = criBand(row.cri);
  const county = flagRows.find((r) => r.county)?.county ?? null;
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
          {profile?.isForeign ? (
            <span className="flag-tag">
              Firmă străină{profile.countryCode ? ` · ${countryName(profile.countryCode)}` : ""}
            </span>
          ) : null}
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
        {role === "supplier" && profile?.employees != null && (
          <div className="stat">
            <div className="n">{formatInt(profile.employees)}</div>
            <div className="l">Angajați (bilanț {profile.employeesYear})</div>
          </div>
        )}
        {role === "supplier" && profile?.netTurnover != null && profile.netTurnover > 0 && (
          <div className="stat">
            <div className="n">{formatRon(profile.netTurnover)}</div>
            <div className="l">Cifră de afaceri ({profile.employeesYear})</div>
          </div>
        )}
      </div>

      {/* Legal representatives (ONRC snapshot) */}
      {reps.length > 0 && (
        <section className="section">
          <h2>Conducere</h2>
          <p className="hint">
            Reprezentanți legali din Registrul Comerțului (instantaneu lunar). Administratorii nu
            sunt neapărat asociații/proprietarii firmei.
          </p>
          <table className="rank">
            <thead>
              <tr>
                <th>Persoană</th>
                <th>Calitate</th>
                <th>Alte firme reprezentate</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r, i) => (
                <tr key={`${r.personName}-${i}`}>
                  <td>
                    {cleanName(r.personName)}
                    {r.birthYear && (
                      <span className="county">
                        {" "}
                        n. {r.birthYear}
                        {r.birthLocality ? `, ${cleanName(r.birthLocality)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="county">{r.calitate ?? "—"}</td>
                  <td>{r.nOtherFirms > 0 ? `încă ${formatInt(r.nOtherFirms)} firme` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
                  <>
                    <table className="rank">
                      <thead>
                        <tr>
                          <th>{isAuth ? "Furnizor" : "Autoritate"}</th>
                          <th>An</th>
                          <th>Achiziții</th>
                          <th style={{ textAlign: "right" }}>Total vs prag</th>
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
                            <td>
                              <a
                                href={splitDrillUrl(
                                  isAuth
                                    ? { id, name: cleanName(row.name) }
                                    : { id: s.partnerId, name: cleanName(s.partnerName) },
                                  isAuth
                                    ? { id: s.partnerId, name: cleanName(s.partnerName) }
                                    : { id, name: cleanName(row.name) },
                                  s.year,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="deschide lista achizițiilor (tab nou)"
                              >
                                {s.count} ↗
                              </a>
                            </td>
                            <td
                              className="num"
                              title={`pragul unei achiziții directe: ${formatInt(s.ceiling)} lei`}
                            >
                              {formatRon(s.totalRon)}{" "}
                              <span className="county">
                                · {(s.totalRon / s.ceiling).toFixed(1)}× pragul
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hint" style={{ marginTop: 6 }}>
                      Pragul legal e per achiziție, nu anual — dar legea interzice divizarea unei
                      achiziții (art. 11, L98/2016) și cere agregarea necesarului anual pe produse
                      similare. Semnalul: suma anuală către același partener, din achiziții fiecare
                      sub prag, depășește pragul de mai multe ori.
                    </p>
                  </>
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

                {/* the flag's own evidence — scoped to ITS year(s), never the recent months */}
                {code !== "da_split" &&
                  (() => {
                    const evs = flagEvidence.filter((e: FlagEvidenceRow) => e.flagCode === code);
                    const lines = evs
                      .map((e) => evidenceLine(code, e.evidence))
                      .filter((l): l is string => l !== null);
                    if (lines.length === 0) return null;
                    return (
                      <ul className="ev-lines">
                        {lines.slice(0, 4).map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                        {lines.length > 4 && <li>… încă {lines.length - 4} instanțe.</li>}
                      </ul>
                    );
                  })()}
                {code === "da_year_end" &&
                  flagEvidence
                    .filter((e: FlagEvidenceRow) => e.flagCode === code && e.evidence?.["year"])
                    .slice(0, 3)
                    .map((e) => (
                      <YearMiniChart
                        key={String(e.evidence!["year"])}
                        monthly={monthly}
                        year={String(e.evidence!["year"])}
                        entityId={id}
                        entityName={cleanName(row.name)}
                        role={role}
                      />
                    ))}

                {code === "da_rapid" || code === "da_round" ? (
                  <p>
                    {m.description}{" "}
                    <a href={`${q(base, { sem: code, p: undefined })}#achizitii`}>
                      Vezi achizițiile afectate în tabel →
                    </a>
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

      {/* Transactions — client table: 10/pagină, sortabil, filtre fără reload */}
      <section className="section" id="achizitii">
        <h2>Toate achizițiile directe</h2>
        <TxTable
          entityId={id}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          flags={row.flags}
          initialFlag={sp["sem"]}
        />
      </section>

      <p className="note">
        Instantaneu SICAP 2020. Valorile reflectă achiziții directe. Fiecare achiziție are
        link direct către înregistrarea oficială de pe e-licitatie.ro.
      </p>
    </>
  );
}
