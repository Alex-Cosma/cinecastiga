import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEntityFlags,
  getEntityProfile,
  getEntityPartners,
  getEntityMonthly,
  getEntityFlagEvidence,
  getCompanyReps,
  getRegistryCui,
  getEntityTxCounts,
  getEntityContractsAboveCap,
  getEntityFlagRowCounts,
  type FlagEvidenceRow,
  type Role,
  type EntityFlagRow,
} from "@/lib/marts";
import { entityCountryLabel } from "@/lib/ted";
import { formatRon, formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName, birthNote } from "@/lib/format";
import { FLAG_META, FLAG_ORDER, criBand } from "@/lib/flags";
import { getEntitySignalCounts } from "@/lib/signals";
import { parseSignalState, signalTypeCountLabel, signalUrl } from "@/lib/signals-shared";
import { CRI_CRITERIA, riskEvidenceLine, signalPeriodLabel } from "@/lib/risk-presentation";
import { daUrl, registryLinks } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";
import FollowButton from "@/components/FollowButton";
import { encodeSpec } from "@/lib/ask/permalink";
import YearMiniChart from "./YearMiniChart";
import TxTable from "./TxTable";
import PartnersTable from "./PartnersTable";
import SplitPairsTable from "./SplitPairsTable";
import SectionNav from "./SectionNav";

/** Stat card → search drill with exactly this entity's rows from one channel. */
function entityTxSearchUrl(
  entityId: string,
  name: string,
  role: Role,
  dataset: "da" | "contracts" | "all",
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
  await redirectCanonicalEntity(id,"",await searchParams);
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
  // ONRC/MF data only through a corroborated CUI (audit F03): a foreign number
  // that passes the CUI checksum keeps its label but not another firm's records.
  const registryCuiLookup = cui ? getRegistryCui(id) : Promise.resolve(null);
  const [partners, monthly, flagEvidence, reps, txCounts, flagRowCounts, aboveCap, signalCounts, registryCui] =
    await Promise.all([
      getEntityPartners(id, role, 12),
      getEntityMonthly(id, role),
      getEntityFlagEvidence(id),
      registryCuiLookup.then((registry) => (registry ? getCompanyReps(registry) : [])),
      getEntityTxCounts(id, role),
      getEntityFlagRowCounts(id, role),
      getEntityContractsAboveCap(id, role),
      getEntitySignalCounts(id, role),
      registryCuiLookup,
    ]);
  const cuiUncorroborated = cui !== null && registryCui === null;

  const hasRiskScore = flagRowsRaw.some((r) => r.role === role);
  const criteria = CRI_CRITERIA[role];
  const band = criBand(row.cri);
  const county = flagRows.find((r) => r.county)?.county ?? null;
  const isAuth = role === "authority";
  // Every signal type in /semnale for this entity and role, CRI or not (audit F24):
  // the CRI section alone hid procedure, MF and ONRC signals from the profile.
  const signalTypes = [...FLAG_ORDER, ...Object.keys(signalCounts).filter((c) => !FLAG_ORDER.includes(c))]
    .filter((code) => (signalCounts[code] ?? 0) > 0 && FLAG_META[code]);
  const inCri = (code: string) => (criteria as readonly string[]).includes(code);
  const nOutsideCri = signalTypes.filter((code) => !inCri(code)).length;
  const unmetWithOccurrences = hasRiskScore && signalTypes.some((code) => inCri(code) && !row.flags.includes(code));
  const entitySignalsUrl = (code: string) => signalUrl(parseSignalState({ tip: code, rol: role, ent: id }));

  return (
    <>
      {/* Identity */}
      <div className="ehead" id="top">
        <div className="ehead-main">
          <p className="eyebrow">
            {role === "authority" && profile?.isPublicCompany ? "Companie publică · autoritate contractantă" : ROLE_LABEL[role]}
            {profile?.isForeign ? ` · ${entityCountryLabel(true, profile.countryCode)}` : ""}
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
            {cuiUncorroborated ? (
              <span title="Numărul trece cifra de control a unui CUI, dar sursa indică o firmă străină, iar ONRC nu înregistrează acest număr sub un nume asemănător. Nu afișăm reprezentanți, bilanț sau linkuri de registru pentru el.">
                număr necoroborat cu ONRC
              </span>
            ) : null}
          </div>
        </div>
        <div className="ehead-acts">
          <Link href={`/entitati/${id}/legaturi?rol=${rolParam}`} className="btn">Cum sunt legate?</Link>
          <Link href={`/entitati/${id}/comparatii?rol=${rolParam}`} className="btn">Compară în context</Link>
          {isAuth && (
            <Link href={`/entitati/${id}/radiografie`} className="btn pri rx-link">
              🩻 Radiografie
            </Link>
          )}
          <FollowButton spec={{ block: "stat", measure: "value", filters: isAuth ? { authorityId: Number(id), authorityName: cleanName(row.name) } : { supplierId: Number(id), supplierName: cleanName(row.name) } }} title={cleanName(row.name)} />
          <ClipButton kind="entity" refId={id} label={cleanName(row.name)} />
          {/* No e-licitatie entity link: SICAP has no per-entity page, and every
              transaction row already deep-links to its exact record */}
          {registryCui
            ? registryLinks(registryCui, cleanName(row.name)).map((l) => (
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
            <span className={`cri-pill ${hasRiskScore ? band.className : "risk-none"}`}>{hasRiskScore ? row.cri.toFixed(2).replace(".", ",") : "—"}</span>
          </div>
          <div className="l">{hasRiskScore ? `indice de risc · ${band.label.toLowerCase()}` : "Indice de risc necalculat"}</div>
          <p className="note">{hasRiskScore ? `${row.nFlags} din ${criteria.length} criterii · achiziții directe` : "Nu există un scor calculat pentru acest rol."}</p>
          {hasRiskScore && <a href="#criterii-scor" className="hint">Cum se explică scorul?</a>}
          {nOutsideCri > 0 && <p className="note"><a href="#toate-semnalele">{nOutsideCri === 1 ? "Un tip de semnal" : `${formatInt(nOutsideCri)} tipuri de semnale`} în afara indicelui →</a></p>}
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
                {formatInt(txCounts.nContracts)} ↗
              </a>
            </div>
            <div className="l">Contracte distincte prin proceduri</div>
          </div>
        )}
        <div className="stat">
          <div className="n"><a href={entityTxSearchUrl(id, cleanName(row.name), role, "all")}>{formatRon(Number(txCounts.valueExact))} ↗</a></div>
          <div className="l">Valoare înregistrată · ambele canale</div>
        </div>
        {role === "supplier" && registryCui !== null && profile?.employees != null && (
          <div className="stat">
            <div className="n">{formatInt(profile.employees)}</div>
            <div className="l">Angajați (bilanț {profile.employeesYear})</div>
          </div>
        )}
        {role === "supplier" && registryCui !== null && profile?.netTurnover != null && profile.netTurnover > 0 && (
          <div className="stat">
            <div className="n">{formatRon(profile.netTurnover)}</div>
            <div className="l">Cifră de afaceri ({profile.employeesYear})</div>
          </div>
        )}
      </div>

      <details className="data-context entity-data-context">
        <summary>Ce includ aceste cifre?</summary>
        <p>Achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, și contracte prin proceduri
          cu valoare pozitivă de cel mult 1 miliard lei.
          Valorile sunt înregistrate în achiziții; nu confirmă plăți. Totalul și lista partenerilor folosesc aceeași selecție.</p>
        {cuiUncorroborated && <p>Numărul {cui} trece cifra de control a unui CUI românesc, dar sursa indică o firmă străină,
          iar ONRC nu înregistrează acest număr sub un nume asemănător. Poate fi un cod fiscal străin. Nu afișăm pentru el
          reprezentanți ONRC, date din bilanț sau semnale bazate pe bilanț.</p>}
        {aboveCap.count > 0 && <p><strong>{formatInt(aboveCap.count)} {aboveCap.count === 1 ? "contract" : "contracte"} peste 1 miliard lei, în valoare
          integrală de {formatRon(Number(aboveCap.totalExact))}, nu {aboveCap.count === 1 ? "este inclus" : "sunt incluse"} în total și nici în lista partenerilor.</strong>
          {" "}Plafonul este un filtru al aplicației, nu dovada unei erori. <a href="#peste-plafon">Vezi aceste contracte</a>.</p>}
        <p>{formatInt(txCounts.nContracts)} contracte distincte apar în {formatInt(txCounts.nCt)} înregistrări contract–furnizor.
          Pentru consorții, valoarea este împărțită egal între membrii publicați; aceasta este o estimare a alocării.
          Pot exista plafoane de acord-cadru pentru care nu avem contracte subsecvente identificate.</p>
        <p>Înregistrări datate: {txCounts.dateFrom ? formatCalendarDate(txCounts.dateFrom) : "dată necunoscută"} — {txCounts.dateTo ? formatCalendarDate(txCounts.dateTo) : "dată necunoscută"}.
          {txCounts.excludedDa > 0 ? ` ${formatInt(txCounts.excludedDa)} achiziții directe cu valori nule, nepozitive sau peste plafon sunt separate de total.` : ""}
          {" "}<Link href="/metodologie#acoperire">Acoperirea surselor și limitele datelor</Link>.</p>

      </details>

      {hasRiskScore && <details className="data-context entity-data-context" id="calcul-scor">
        <summary>{row.nFlags} din {criteria.length} criterii îndeplinite · cum se calculează scorul?</summary>
        <p id="criterii-scor">Scorul împarte numărul criteriilor îndeplinite la {criteria.length}. Fiecare criteriu contează o singură dată,
          indiferent de numărul achizițiilor semnalate. Folosește achizițiile directe din întreaga perioadă disponibilă
          la ultima recalculare; filtrul de an din tabel nu schimbă scorul.</p>
        <ul>{criteria.map(code => <li key={code}>
          <strong>{row.flags.includes(code) ? "Îndeplinit" : "Neîndeplinit în datele evaluate"}</strong>{" · "}
          <Link href={`/metodologie#${code}`}>{FLAG_META[code]!.title}</Link>
        </li>)}</ul>
        <p>Scorul nu este o probabilitate de corupție.
          Semnalele din contracte prin proceduri, bilanțuri și ONRC nu intră în acest scor; sunt listate la{" "}
          <a href="#toate-semnalele">toate semnalele</a>.
          Lipsa unui semnal nu certifică absența neregulilor. <Link href="/metodologie#indice">Formula și limitele scorului →</Link></p>
      </details>}

      <SectionNav
        items={[
          { id: "top", label: "Rezumat" },
          ...(row.flags.length > 0 || signalTypes.length > 0
            ? [{ id: row.flags.length > 0 ? "semnale" : "toate-semnalele", label: "Semnale",
                count: signalTypeCountLabel(new Set([...row.flags, ...signalTypes]).size) }]
            : []),
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
                    {(r.birthYear || r.birthDateImplausible) && (
                      <span className="county">
                        {" "}
                        {birthNote({ ...r, birthLocality: r.birthLocality ? cleanName(r.birthLocality) : null })}
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
            {row.nFlags} din {criteria.length} criterii pentru achiziții directe sunt îndeplinite în datele evaluate.
            Perioadele anuale apar în explicațiile semnalelor. Fiecare este o pistă de verificat —{" "}
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

                {code === "da_split" ? (
                  <>
                    <SplitPairsTable key={`${id}-${role}`} entityId={id} isAuth={isAuth} />
                    <p className="hint split-pairs-explanation" style={{ marginTop: 6 }}>
                      Semnalul grupează achiziții din aceeași clasă CPV și același tip, către același partener,
                      pe an. Fiecare trebuie să fie strict sub pragul aplicabil datei sale. Suma se compară cu
                      cel mai mare prag aplicabil în grup. Valorile de închidere sunt un reper pentru verificare;
                      legea privește necesarul estimat. Lista de surse include exact achizițiile folosite în calcul.
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
                      .map((e) => {
                        const line = riskEvidenceLine(code, e.evidence);
                        return line ? `${signalPeriodLabel(e.period, e.evidence)} · ${line}` : null;
                      })
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
                        „Valoare aproape de prag” compară o singură achiziție cu plafonul său.
                        „Posibilă fracționare sub prag” compară suma unui grup de achiziții cu plafonul de referință.
                        Aceeași achiziție poate apărea în ambele semnale; niciunul nu stabilește intenția de a evita o procedură.
                      </p>
                    )}
                  </>
                ) : null}
                <p className="note">{m.caveat}</p>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Every signal type for this entity, kept apart from the CRI (audit F24) */}
      {signalTypes.length > 0 && (
        <section className="section" id="toate-semnalele">
          <h2>Toate semnalele</h2>
          <p className="hint">
            {signalTypes.length === 1 ? "Un tip de semnal apare" : `${formatInt(signalTypes.length)} tipuri de semnale apar`} în{" "}
            <Link href="/semnale">Semnale</Link> pentru {isAuth ? "această autoritate" : "această firmă"}, ca{" "}
            {isAuth ? "autoritate contractantă" : "furnizor"}. Doar criteriile pentru achiziții directe intră în indicele
            de risc; semnalele din proceduri, bilanțuri și ONRC se arată separat. Aparițiile pot acoperi aceleași
            achiziții și nu se adună. Semnalele din proceduri se numără o dată pentru fiecare anunț, oricâte versiuni ar avea în SEAP, și
            poartă anul primului contract din anunț. Același contract republicat sub alt număr de anunț, sau un
            acord-cadru și contractul subsecvent, pot apărea separat.
            Fiecare semnal este o pistă de verificat, nu o dovadă.
          </p>
          <div className="ask-tablewrap"><table className="rank">
            <thead>
              <tr>
                <th scope="col">Semnal</th>
                <th scope="col">Indicele de risc</th>
                <th scope="col" className="num">Apariții</th>
              </tr>
            </thead>
            <tbody>
              {signalTypes.map((code) => {
                const m = FLAG_META[code]!;
                const n = signalCounts[code] ?? 0;
                return (
                  <tr key={code}>
                    <td>
                      <Link href={entitySignalsUrl(code)}>{m.title}</Link>
                      <div className="note">{m.short}</div>
                    </td>
                    <td className="county">
                      {!inCri(code) ? "Nu intră în indice" : !hasRiskScore ? "Indice necalculat" : row.flags.includes(code) ? "Criteriu îndeplinit" : "Criteriu neîndeplinit"}
                    </td>
                    <td className="num">
                      <Link href={entitySignalsUrl(code)}>{formatInt(n)}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {unmetWithOccurrences && <p className="note">
            Un criteriu al indicelui poate rămâne neîndeplinit chiar dacă există apariții: finalizarea rapidă și valorile
            aproape de prag cer o pondere minimă din achizițiile directe ale entității.{" "}
            <Link href="/metodologie#indice">Cum se calculează indicele →</Link>
          </p>}
        </section>
      )}

      {/* Counterparties */}
      <section className="section" id="parteneri">
        <h2>{isAuth ? "Principalii furnizori" : "Principalele autorități"}</h2>
        <PartnersTable
          key={`${id}:${rolParam}`}
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
          key={`${id}:${rolParam}:${sp["sem"] ?? ""}`}
          entityId={id}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          flags={row.flags}
          initialFlag={sp["sem"]}
        />
        {aboveCap.count > 0 && <details className="data-context" id="peste-plafon">
          <summary>{formatInt(aboveCap.count)} {aboveCap.count === 1 ? "contract peste 1 miliard lei, separat" : "contracte peste 1 miliard lei, separate"} de total · {formatRon(Number(aboveCap.totalExact))}</summary>
          <p>Contractele îndeplinesc celelalte condiții de includere, dar depășesc plafonul de 1 miliard lei folosit pentru totaluri.
            Nu sunt adăugate la totalul de mai sus, la parteneri, județ sau la nivel național. Valorile sunt integrale, înregistrate în SEAP; nu confirmă plăți.
            {role === "supplier" ? " Pentru consorții, valoarea include și cotele celorlalți câștigători." : ""}</p>
          <div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">Contract</th><th scope="col">Semnat</th><th scope="col" className="num">Valoare (lei)</th></tr></thead><tbody>
            {aboveCap.rows.map((c) => <tr key={c.natId}>
              <td><Link href={`/contracte/${c.natId}`}>{c.title?.trim() || c.contractNo || `Contract ${c.natId}`}</Link>{c.nWinners > 1 ? <span className="note"> · {formatInt(c.nWinners)} câștigători</span> : null}</td>
              <td>{c.contractDate ? formatCalendarDate(c.contractDate) : "—"}</td>
              <td className="num">{formatExactDecimal(c.valueRonExact)}</td>
            </tr>)}
          </tbody></table></div>
          {aboveCap.count > aboveCap.rows.length && <p className="note">Sunt afișate cele mai mari {formatInt(aboveCap.rows.length)} din {formatInt(aboveCap.count)}.</p>}
        </details>}
      </section>

      <p className="note">
        Tabelul cuprinde ambele canale: achiziții directe și contracte atribuite prin
        proceduri. Fiecare rând are link direct către înregistrarea oficială de pe
        e-licitatie.ro.
      </p>
    </>
  );
}
