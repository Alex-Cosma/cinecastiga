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
  getEntityTxCounts,
  getEntityFlagRowCounts,
  type FlagEvidenceRow,
  type Role,
  type EntityFlagRow,
} from "@/lib/marts";
import { countryName } from "@/lib/ted";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { FLAG_META, criBand } from "@/lib/flags";
import { daUrl, registryLinks } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";
import { encodeSpec } from "@/lib/ask/permalink";
import YearMiniChart from "./YearMiniChart";
import TxTable from "./TxTable";
import PartnersTable from "./PartnersTable";
import SectionNav from "./SectionNav";

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

/** Stat card → search drill with exactly this entity's rows from one channel. */
function entityTxSearchUrl(
  entityId: string,
  name: string,
  role: Role,
  dataset: "da" | "contracts",
): string {
  const spec = {
    block: "stat",
    measure: "value",
    dataset,
    filters:
      role === "authority"
        ? { authorityName: name, authorityId: Number(entityId) }
        : { supplierName: name, supplierId: Number(entityId) },
  };
  return `/?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1`;
}

/** "Conducere" → clasament of every firm this person represents. */
function personFirmsUrl(personKey: string, personName: string): string {
  const spec = {
    block: "table",
    dim: "supplier",
    measure: "value",
    filters: { adminPersonKey: personKey, adminName: personName },
  };
  return `/?spec=${encodeURIComponent(encodeSpec(spec))}`;
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
  const [partners, monthly, splits, flagEvidence, reps, txCounts, flagRowCounts] =
    await Promise.all([
      getEntityPartners(id, role, 12),
      getEntityMonthly(id, role),
      row.flags.includes("da_split") ? getSplitPairs(id, role) : Promise.resolve([]),
      getEntityFlagEvidence(id),
      cui ? getCompanyReps(cui) : Promise.resolve([]),
      getEntityTxCounts(id, role),
      getEntityFlagRowCounts(id, role),
    ]);

  const band = criBand(row.cri);
  const county = flagRows.find((r) => r.county)?.county ?? null;
  const isAuth = role === "authority";

  return (
    <>
      {/* Identity */}
      <div className="ehead" id="top">
        <div className="ehead-main">
          <p className="eyebrow">
            {ROLE_LABEL[role]}
            {profile?.isForeign ? ` · firmă străină${profile.countryCode ? ` · ${countryName(profile.countryCode)}` : ""}` : ""}
          </p>
          <h1 className="page-title">{cleanName(row.name)}</h1>
          <div className="id-meta">
            {flagRows.length > 1 ? (
              <span className="roles">
                {flagRows.map((r) => (
                  <Link
                    key={r.role}
                    href={q(base, { rol: r.role === "supplier" ? "furnizor" : "autoritate", p: undefined })}
                    className={r.role === role ? "on" : undefined}
                  >
                    {ROLE_LABEL[r.role]}
                  </Link>
                ))}
              </span>
            ) : null}
            {county ? <span>{county}</span> : null}
            {cui ? <span className="mono">CUI {cui}</span> : null}
          </div>
        </div>
        <div className="ehead-acts">
          {isAuth && (
            <Link href={`/entitati/${id}/radiografie`} className="btn pri rx-link">
              🩻 Radiografie
            </Link>
          )}
          <ClipButton kind="entity" refId={id} label={cleanName(row.name)} />
          {/* No e-licitatie entity link: SICAP has no per-entity page, and every
              transaction row already deep-links to its exact record */}
          {cui
            ? registryLinks(cui, cleanName(row.name)).map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="btn">
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
          <div className="l">indice de risc · {band.label.toLowerCase()}</div>
        </div>
        <div className="stat">
          <div className="n">
            {txCounts.nDa > 0 ? (
              <a
                href={entityTxSearchUrl(id, cleanName(row.name), role, "da")}
                target="_blank"
                rel="noopener"
              >
                {formatInt(txCounts.nDa)} ↗
              </a>
            ) : (
              formatInt(txCounts.nDa)
            )}
          </div>
          <div className="l">Achiziții directe</div>
        </div>
        {txCounts.nCt > 0 && (
          <div className="stat">
            <div className="n">
              <a
                href={entityTxSearchUrl(id, cleanName(row.name), role, "contracts")}
                target="_blank"
                rel="noopener"
              >
                {formatInt(txCounts.nCt)} ↗
              </a>
            </div>
            <div className="l">Contracte (peste prag)</div>
          </div>
        )}
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

      <SectionNav
        items={[
          { id: "top", label: "Rezumat" },
          ...(row.flags.length > 0 ? [{ id: "semnale", label: "Semnale", count: String(row.nFlags) }] : []),
          { id: "parteneri", label: isAuth ? "Furnizori" : "Autorități" },
          { id: "achizitii", label: "Achiziții", count: formatInt(txCounts.nDa + txCounts.nCt) },
          ...(reps.length > 0 ? [{ id: "conducere", label: "Conducere" }] : []),
          ...(isAuth ? [{ href: `/entitati/${id}/radiografie`, label: "Radiografie" }] : []),
        ]}
      />

      {/* Legal representatives (ONRC snapshot) */}
      {reps.length > 0 && (
        <section className="section" id="conducere">
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
                  <td>
                    {r.nOtherFirms > 0 && r.personKey ? (
                      <a
                        href={personFirmsUrl(r.personKey, cleanName(r.personName))}
                        target="_blank"
                        rel="noopener"
                      >
                        {r.nOtherFirms === 1 ? "încă o firmă" : `încă ${formatInt(r.nOtherFirms)} firme`} ↗
                      </a>
                    ) : null}
                    {r.nOtherOnrcOnly > 0 && (
                      <span className="county">
                        {r.nOtherFirms > 0 ? " + " : ""}
                        {r.nOtherOnrcOnly === 1
                          ? "o firmă fără achiziții publice"
                          : `${formatInt(r.nOtherOnrcOnly)} firme fără achiziții publice`}
                      </span>
                    )}
                    {r.nOtherFirms === 0 && r.nOtherOnrcOnly === 0 && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* CRI breakdown */}
      {row.flags.length > 0 ? (
        <section className="section" id="semnale">
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
                  <p className="mh-desc">{m.description}</p>
                  <Link href={`/metodologie#${code}`} className="mh-link">
                    cum se calculează →
                  </Link>
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
                            <td className="num">
                              {formatRon(s.totalRon)}{" "}
                              <span className="county">
                                · {(s.totalRon / s.ceiling).toFixed(1).replace(".", ",")}× pragul
                                de {formatInt(s.ceiling)} lei
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
                      sub prag, depășește pragul de mai multe ori. Fiecare an e judecat după pragul
                      în vigoare atunci (135.060 lei până în 2022, 270.120 lei din 2023, pentru
                      produse/servicii) — de aceea rândurile pot avea praguri diferite.
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
                  <>
                    <p>
                      <b>{formatInt(flagRowCounts[code] ?? 0)} achiziții</b> poartă acest semnal
                      aici. {m.description}{" "}
                      <a href={`${q(base, { sem: code, p: undefined })}#achizitii`}>
                        Vezi {flagRowCounts[code] === 1 ? "achiziția" : "toate cele"}{" "}
                        {flagRowCounts[code] === 1 ? "" : formatInt(flagRowCounts[code] ?? 0)} în
                        tabel →
                      </a>
                    </p>
                    {code === "da_round" && row.flags.includes("da_split") && (
                      <p className="note">
                        Diferența față de „Fracționare sub prag”: aici e semnalată valoarea
                        FIECĂREI achiziții în parte (una singură, oprită chiar sub limită), pe
                        când fracționarea privește SUMA multor achiziții mici. O achiziție „aproape
                        de prag” poate fi, în același timp, una dintre piesele fracționării.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="note">{m.caveat}</p>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Counterparties */}
      <section className="section" id="parteneri">
        <h2>{isAuth ? "Principalii furnizori" : "Principalele autorități"}</h2>
        <PartnersTable
          entityId={id}
          entityName={cleanName(row.name)}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
        />
      </section>

      {/* Transactions — client table: 10/pagină, sortabil, filtre fără reload */}
      <section className="section" id="achizitii">
        <h2>Toate achizițiile și contractele</h2>
        <TxTable
          entityId={id}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          flags={row.flags}
          initialFlag={sp["sem"]}
        />
      </section>

      <p className="note">
        Tabelul cuprinde ambele canale: achiziții directe (sub prag) și contracte atribuite prin
        proceduri (peste prag). Fiecare rând are link direct către înregistrarea oficială de pe
        e-licitatie.ro.
      </p>
    </>
  );
}
