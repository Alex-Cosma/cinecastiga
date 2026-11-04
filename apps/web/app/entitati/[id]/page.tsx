import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { reviewedRegistryCollision } from "@seap/db";
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
  getEntityPartnersPaged,
  getEntitySubjects,
  getEntityYears,
  getCompanyTurnover,
  type FlagEvidenceRow,
  type Role,
  type EntityFlagRow,
} from "@/lib/marts";
import EntityYears from "./EntityYears";
import { bucharestYear, entityTitle, evidenceWithPeriod, ledgerTotals, RISK_SCALE_SLAB, yearsModel } from "./entity-top";
import { countyKnown } from "@/lib/counties";
import { entityCountryLabel } from "@/lib/ted";
import { formatRon, formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName, birthNote, countyLabel, isAbroadCounty } from "@/lib/format";
import { FLAG_META, FLAG_ORDER, flagLabel } from "@/lib/flags";
import { getEntitySignalCounts } from "@/lib/signals";
import { parseSignalState, signalTypeCountLabel, signalUrl } from "@/lib/signals-shared";
import { riskEvidenceLine, signalPeriodLabel } from "@/lib/risk-presentation";
import { RISK_BAND_CLASS, RISK_BAND_MIN, RISK_CRITERIA, RISK_SCORE_NOTE, riskBand, riskFact, riskLabel, riskScoreText, riskPoints, type RiskCriterion } from "@/lib/risk-score";
import { getRiskPeerLine, riskPeerWords } from "@/lib/risk-peers";
import { getHolderTwin, individualHolder } from "@/lib/individual-holder";
import { getRegistryNames } from "@/lib/registry-names";
import { daUrl, registryLinks } from "@/lib/elicitatie";
import ClipButton from "@/components/ClipButton";
import FollowButton from "@/components/FollowButton";
import Term from "@/components/Term";
import { roCount } from "@/lib/ro-count";
import { encodeSpec } from "@/lib/ask/permalink";
import { entityChannelSpec, personFirmsSpec } from "@/lib/ask/site-links";
import YearMiniChart from "./YearMiniChart";
import TxTable from "./TxTable";
import { txColumns } from "@/lib/entity-tx-columns";
import { readFilters, writeFilters } from "@/lib/table-filters/codec";
import PartnersTable from "./PartnersTable";
import SplitPairsTable from "./SplitPairsTable";
import SectionNav from "./SectionNav";
import DropRolParam from "./DropRolParam";
import EntityBrief, { SummaryNotes } from "./EntityBrief";
import { composeEntitySummary } from "@/lib/entity-summary";
import "./entity.css";

/** Stat card → search drill with exactly this entity's rows from one channel. */
function entityTxSearchUrl(
  entityId: string,
  name: string,
  role: Role,
  dataset: "da" | "contracts" | "all",
): string {
  return `/?spec=${encodeURIComponent(encodeSpec(entityChannelSpec(entityId, name, role, dataset)))}&drill=1`;
}

/** "Conducere" → clasament of every firm this person represents. */
function personFirmsUrl(personKey: string, personName: string): string {
  return `/?spec=${encodeURIComponent(encodeSpec(personFirmsSpec(personKey, personName)))}`;
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

// Read once per request, by the browser title and by the page.
const loadFlags = cache(getEntityFlags);
const loadProfile = cache(getEntityProfile);

/** Each entity's own browser title (critique 2 November 2026): „BUG FOREST SRL · furnizor, Vaslui — cinecâștigă?”. */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const [flags, profile] = await Promise.all([loadFlags(id), loadProfile(id)]);
  const roles = flags.length > 0 ? flags.map((f) => f.role) : (profile?.roles.map((r) => r.role) ?? []);
  const name = flags[0]?.name ?? profile?.name;
  if (!name || roles.length === 0) return {};
  const wanted: Role | null = sp["rol"] === "furnizor" ? "supplier" : sp["rol"] === "autoritate" ? "authority" : null;
  const role = wanted && roles.includes(wanted) ? wanted : roles[0]!;
  return { title: entityTitle(cleanName(name), role, countyKnown(flags.find((f) => f.county)?.county ?? profile?.county)) };
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
  const [flagRowsRaw, profile] = await Promise.all([loadFlags(id), loadProfile(id)]);
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
            score: 0,
            scoreParts: {},
            scoreNote: null,
          }))
        : [];
  if (flagRows.length === 0) notFound();

  const role: Role =
    sp["rol"] === "furnizor" ? "supplier" : sp["rol"] === "autoritate" ? "authority" : flagRows[0]!.role;
  const row: EntityFlagRow = flagRows.find((r) => r.role === role) ?? flagRows[0]!;
  const rolParam = role === "supplier" ? "furnizor" : "autoritate";
  // `?rol=` only for an entity that both buys and sells (owner, 4 November 2026); a single-role page drops it.
  const bothRoles = flagRows.length > 1;
  const base = { rol: bothRoles ? rolParam : undefined, sort: sp["sort"], an: sp["an"], sem: sp["sem"] };
  // The records table's filters from the address (its funnels; lib/entity-tx-columns.ts).
  const txFilters = readFilters(txColumns(role === "authority"), (key) => sp[key]);

  const cui = flagRows.find((r) => r.cui)?.cui ?? null;
  // ONRC/MF data only through a corroborated CUI (audit F03): a foreign number
  // that passes the CUI checksum keeps its label but not another firm's records.
  const registryCuiLookup = cui ? getRegistryCui(id) : Promise.resolve(null);
  const [partners, monthly, flagEvidence, reps, txCounts, flagRowCounts, aboveCap, signalCounts, registryCui, subjects, topPartners, peerLine, holderTwin, registryNames, activityYears, turnover] =
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
      getEntitySubjects(id, role),
      // Page 1 of the partner list: "Pe scurt" uses its top rows, PartnersTable shows it without refetching.
      getEntityPartnersPaged(id, role, 1, 10),
      // "Scor peste X% dintre …": moderate and strong scores only, Ask's default group.
      flagRowsRaw.some((r) => r.role === role) ? getRiskPeerLine(id, role, row.score).catch(() => null) : null,
      // An individual practice (PFA, II, cabinet): the one ONRC person with its holder's name, as a lead only.
      individualHolder(row.name) ? getHolderTwin(row.name).catch(() => null) : null,
      registryCuiLookup.then((registry) => (registry ? getRegistryNames(registry, row.name) : [])).catch(() => [] as string[]),
      // The top's years chart and ledger (owner, 2 November 2026); a firm's turnover per year through its corroborated CUI.
      getEntityYears(id, role),
      role === "supplier" ? registryCuiLookup.then((registry) => (registry ? getCompanyTurnover(registry) : null)) : null,
    ]);
  const cuiUncorroborated = cui !== null && registryCui === null;
  // Audit F03 (b): a reviewed collision is a Romanian-looking record whose
  // number ONRC registers to another firm, not a foreign number.
  const registryCollision = cuiUncorroborated ? reviewedRegistryCollision(id, cui) : null;

  // A profile built before rf-2026.18 has criteria (n_flags) but no score yet: "risc necalculat" until the
  // first full run after the deploy, never a false 0% (after a new build a score of 0 has no criteria).
  const hasRiskScore = flagRowsRaw.some((r) => r.role === role) && !(row.score === 0 && row.nFlags > 0);
  const criteria = RISK_CRITERIA[role];
  const band = riskBand(row.score);
  const points = riskPoints(row.scoreParts, row.score);
  // The buyer's regime or an in-house firm (rf-2026.20): a hover next to the score.
  const scoreNote = row.scoreNote ? RISK_SCORE_NOTE[row.scoreNote] ?? null : null;
  // The top's ledger per channel and its years chart; the bars and the undated rest add up to txCounts' value.
  const ledger = ledgerTotals(activityYears.years, activityYears.undated);
  const years = yearsModel(activityYears.years, turnover, bucharestYear());
  const county = flagRows.find((r) => r.county)?.county ?? null;
  const isAuth = role === "authority";
  // Every signal type in /semnale for this entity and role, CRI or not (audit F24):
  // the CRI section alone hid procedure, MF and ONRC signals from the profile.
  // The criteria of the risk score first, in the role's order, then every other signal.
  const signalTypes = [...criteria, ...FLAG_ORDER.filter((c) => !(criteria as readonly string[]).includes(c)), ...Object.keys(signalCounts).filter((c) => !FLAG_ORDER.includes(c))]
    .filter((code) => (signalCounts[code] ?? 0) > 0 && FLAG_META[code]);
  const inCri = (code: string) => (criteria as readonly string[]).includes(code);
  const entitySignalsUrl = (code: string) => signalUrl(parseSignalState({ tip: code, rol: role, ent: id }));
  // "Pe scurt": the KPI numbers above, the same selection by CPV division, the partner list's top rows.
  const summary = composeEntitySummary({
    role, totalExact: txCounts.valueExact, nDa: txCounts.nDa, nContracts: txCounts.nContracts,
    dateFrom: txCounts.dateFrom, dateTo: txCounts.dateTo, divisions: subjects.divisions,
    nConsortium: subjects.nConsortium, partners: topPartners.rows.slice(0, 3),
    aboveCap,
  });

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
            {county && !(profile?.isForeign && isAbroadCounty(county)) ? <span>{countyLabel(county)}</span> : null}
            {cui ? <span className="mono">CUI {cui}</span> : null}
            {registryNames.length > 0 ? (
              <span className="ent-tip">
                în registru: {registryNames.slice(0, 2).join(" · ")} <Term tip id="nume-registru" />
              </span>
            ) : null}
            {cuiUncorroborated ? (
              <span title={registryCollision
                ? "La verificarea manuală, ONRC înregistrează acest număr la o altă firmă decât cea din SEAP. Nu afișăm reprezentanți, bilanț sau linkuri de registru pentru el."
                : "Numărul trece cifra de control a unui CUI, dar sursa indică o firmă străină, iar ONRC nu înregistrează acest număr sub un nume asemănător. Nu afișăm reprezentanți, bilanț sau linkuri de registru pentru el."}>
                număr necoroborat cu ONRC
              </span>
            ) : null}
          </div>
        </div>
        <div className="ehead-acts">
          <Link href={`/entitati/${id}/legaturi${bothRoles ? `?rol=${rolParam}` : ""}`} className="btn">Cum sunt legate?</Link>
          <Link href={`/entitati/${id}/comparatii${bothRoles ? `?rol=${rolParam}` : ""}`} className="btn">Compară în context</Link>
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

      {!bothRoles && sp["rol"] !== undefined && <DropRolParam />}
      {/* The page's tabs right under its header, above the summary they start with (owner, 2 November 2026). */}
      <SectionNav
        items={[
          { id: "top", label: "Rezumat" },
          // In the page's order (critique of 2 November 2026): the representatives come right after the summary,
          // an individual practice's holder last, before the explanations.
          ...(reps.length > 0 ? [{ id: "conducere", label: "Conducere" }] : []),
          // Then the partners, the acquisitions and the signals (owner, 4 November 2026).
          { id: "parteneri", label: isAuth ? "Furnizori" : "Autorități" },
          { id: "achizitii", label: "Achiziții", count: formatInt(txCounts.nDa + txCounts.nCt) },
          ...(row.flags.length > 0 || signalTypes.length > 0
            ? [{ id: "semnale", label: "Semnale",
                count: signalTypeCountLabel(new Set([...row.flags, ...signalTypes]).size) }]
            : []),
          ...(reps.length === 0 && holderTwin ? [{ id: "conducere", label: "Titular" }] : []),
          ...(isAuth ? [{ href: `/entitati/${id}/radiografie`, label: "Radiografie" }] : []),
        ]}
      />

      {/* The top (owner, 2 November 2026): the risk on its bands, a ledger of the activity per channel (its swatches
          are the chart's legend) and the value per year. How the score is made stays further down the page. */}
      <div className={`ent-top${years ? "" : " ent-top--no-years"}`}>
        <div className="ent-risk">
          <p className="ent-risk-read">
            <b data-band={hasRiskScore ? band : "none"}>{hasRiskScore ? riskScoreText(row.score) : "—"}</b>
            <span className="ent-tip">{hasRiskScore ? riskLabel(row.score) : "risc necalculat"} <Term tip id="scor-risc" />{scoreNote && <> <Term tip title={scoreNote.title} text={scoreNote.text}>notă</Term></>}</span>
          </p>
          {hasRiskScore && (
            <div className="ent-risk-scale" aria-hidden="true">
              <span className="ent-risk-track" style={{ gridTemplateColumns: `${RISK_SCALE_SLAB}fr ${RISK_BAND_MIN.moderat - RISK_SCALE_SLAB}fr ${RISK_BAND_MIN.puternic - RISK_BAND_MIN.moderat}fr ${100 - RISK_BAND_MIN.puternic}fr` }}><i /><i /><i /><i /></span>
              <span className="ent-risk-marker" style={{ left: `${Math.min(99, Math.max(1, row.score))}%` }} />
              <span className="ent-risk-ticks">
                <span style={{ left: `${RISK_SCALE_SLAB}%` }}>slab</span>
                <span style={{ left: `${RISK_BAND_MIN.moderat}%` }}>moderat</span>
                <span style={{ left: `${RISK_BAND_MIN.puternic}%` }}>puternic</span>
              </span>
            </div>
          )}
          {peerLine && <p className="ent-risk-peer">{riskPeerWords(peerLine)}</p>}
        </div>
        <div className="ent-activity">
        <table className="ent-ledger">
          <thead><tr><th scope="col"><span className="sr-only">Felul achiziției</span></th><th scope="col">Înregistrări</th><th scope="col">Valoare</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row"><span className="ent-ledger-label"><i className="ent-sw ent-sw-da" />{ledger.nDa > 0
                ? <a href={entityTxSearchUrl(id, cleanName(row.name), role, "da")}>Achiziții directe&nbsp;→</a>
                : <span>Achiziții directe</span>}</span></th>
              <td className="ent-ledger-n">{formatInt(ledger.nDa)}</td>
              <td>{formatRon(Number(ledger.valueDa))}</td>
            </tr>
            {ledger.nCt > 0 && (
              <tr>
                <th scope="row"><span className="ent-ledger-label"><i className="ent-sw ent-sw-ct" /><a href={entityTxSearchUrl(id, cleanName(row.name), role, "contracts")}>Contracte prin proceduri&nbsp;→</a></span></th>
                <td className="ent-ledger-n">{formatInt(ledger.nCt)}</td>
                <td>{formatRon(Number(ledger.valueCt))}</td>
              </tr>
            )}
            <tr className="ent-ledger-total">
              <th scope="row"><span className="ent-ledger-label"><i className="ent-sw" /><span className="ent-tip"><a href={entityTxSearchUrl(id, cleanName(row.name), role, "all")}>Total înregistrat</a> <Term tip id="valoare-inregistrata" /></span></span></th>
              <td className="ent-ledger-n">{formatInt(ledger.nDa + ledger.nCt)}</td>
              <td>{formatRon(Number(txCounts.valueExact))}</td>
            </tr>
            {role === "supplier" && registryCui !== null && profile?.employees != null && (
              <tr className="ent-ledger-fin">
                <th scope="row"><span className="ent-ledger-label"><i className="ent-sw" /><span>Angajați (bilanț {profile.employeesYear})</span></span></th>
                <td className="ent-ledger-n" />
                <td>{formatInt(profile.employees)}</td>
              </tr>
            )}
            {role === "supplier" && registryCui !== null && profile?.netTurnover != null && profile.netTurnover > 0 && (
              <tr className="ent-ledger-fin">
                <th scope="row"><span className="ent-ledger-label"><i className={`ent-sw${years?.turnover ? " ent-sw-turnover" : ""}`} /><span>Cifră de afaceri ({profile.employeesYear})</span></span></th>
                <td className="ent-ledger-n" />
                <td>{formatRon(profile.netTurnover)}</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {years && <EntityYears model={years} title={isAuth ? "Cât a atribuit, pe ani" : "Cât a câștigat, pe ani"} />}
      </div>

      {summary && <SummaryNotes notes={summary.notes} />}
      {summary && <EntityBrief summary={summary} />}

      {/* Legal representatives (ONRC snapshot) */}
      {reps.length > 0 && (
        <section className="section" id="conducere">
          <h2 className="ent-tip">Conducere <Term tip id="conducere-onrc" /></h2>
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
                      <a href={personFirmsUrl(r.personKey, cleanName(r.personName))}>
                        {r.nOtherFirms === 1 ? "încă o firmă" : `încă ${formatInt(r.nOtherFirms)} firme`} →
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

      {/* Counterparties */}
      <section className="section" id="parteneri">
        <h2>{isAuth ? "Principalii furnizori" : "Principalele autorități"}</h2>
        <PartnersTable
          key={`${id}-${role}`}
          entityId={id}
          entityName={cleanName(row.name)}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          initial={topPartners}
        />
      </section>

      {/* Transactions — client table: 10/pagină, sortabil, filtre fără reload */}
      <section className="section" id="achizitii">
        <h2>Toate achizițiile și contractele</h2>
        <TxTable
          key={`${id}:${rolParam}:${writeFilters(txColumns(isAuth), "", txFilters)}`}
          entityId={id}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          initial={txFilters}
        />
        {aboveCap.count > 0 && <details className="data-context" id="peste-plafon">
          <summary>{formatInt(aboveCap.count)} {aboveCap.count === 1 ? "contract peste 1 miliard lei, separat" : "contracte peste 1 miliard lei, separate"} de total · {formatRon(Number(aboveCap.totalExact))}</summary>
          <p>Peste plafonul de 1 mld. lei folosit pentru totaluri: nu intră în niciun total. Valori integrale din SEAP, nu plăți.
            {role === "supplier" ? " Includ și cotele celorlalți membri ai consorțiului." : ""}</p>
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

      {/* The signals in one section, after the acquisitions (owner, 4 November 2026; the section itself is from 2 November, after the Impeccable critique): every signal type first, as an
          index (what it adds to the risk, how often it appears), then a card for each criterion behind the score — what it
          found first, the rule folded under „Regula”. The former „Toate semnalele” was the same table further down. */}
      {(row.flags.length > 0 || signalTypes.length > 0) && (
        <section className="section ent-tip-col" id="semnale">
          <h2 className="ent-tip">{row.flags.length > 0 ? "De ce este semnalată" : "Semnale"} <Term tip id="semnale-numarare" /></h2>
          <p className="hint">
            Piste de verificat, nu dovezi · <Link href="/metodologie">metodologie</Link>
          </p>

          {signalTypes.length > 0 && (
            <div className="ask-tablewrap ent-signal-index"><table className="rank">
              <thead>
                <tr>
                  <th scope="col">Semnal</th>
                  <th scope="col" className="num">În risc <Term tip id="scor-risc" /></th>
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
                        <Link href={entitySignalsUrl(code)}>{flagLabel(code)}</Link>
                        <div className="note">{m.short}</div>
                      </td>
                      <td className="num" data-label="În risc">
                        {!inCri(code) ? <span className="note">nu intră</span> : !hasRiskScore ? <span className="note">necalculat</span> : row.scoreParts[code as RiskCriterion]
                          ? <span className="risk-points">+{formatInt(points[code as RiskCriterion] ?? 0)}</span>
                          : <span className="note">sub prag</span>}
                      </td>
                      <td className="num" data-label="Apariții">
                        <Link href={entitySignalsUrl(code)}>{formatInt(n)}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}

          {row.flags.map((code) => {
            const m = FLAG_META[code];
            if (!m) return null;
            return (
              <div className="method-card ent-card" key={code}>
                <div className="method-head ent-tip-col">
                  <h3>
                    {flagLabel(code)}
                    {code === "da_round" && row.flags.includes("da_split") && <> <Term tip id="prag-vs-fractionare" /></>}
                    {row.scoreParts[code as RiskCriterion] && <span className="risk-points"> +{formatInt(points[code as RiskCriterion] ?? 0)}</span>}
                  </h3>
                  {row.scoreParts[code as RiskCriterion] && <p className="mh-fact">{riskFact(code as RiskCriterion, row.scoreParts[code as RiskCriterion]!, role)}</p>}
                  <Link href={`/metodologie#${code}`} className="mh-link">
                    cum se calculează →
                  </Link>
                  <Term tip title="Limite" text={m.caveat} className="mh-limits">limite</Term>
                  <details className="mh-rule">
                    <summary>Regula</summary>
                    <p className="mh-desc">{m.description}</p>
                  </details>
                </div>

                {code === "da_split" ? (
                  <SplitPairsTable key={`${id}-${role}`} entityId={id} isAuth={isAuth} />
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
                        return line ? evidenceWithPeriod(signalPeriodLabel(e.period, e.evidence), e.period, line) : null;
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
                {code === "da_year_end" && (
                  <div className="yem-row">
                    {flagEvidence
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
                  </div>
                )}

                {code === "da_round" || code === "da_above_ceiling" ? (
                  <p>
                    <b>{roCount(flagRowCounts[code] ?? 0, "o achiziție", "achiziții")}</b> cu acest semnal ·{" "}
                    <a href={`${q(base, { sem: code, p: undefined })}#achizitii`}>Vezi în tabel →</a>
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      {/* An individual practice has no ONRC representative: the one register person with its holder's name, a lead
          (owner decision of 1 November 2026, variant B); never a signal, a risk or a count of the person's firms. Last before
          the explanations at the foot of the page (owner, same day). */}
      {reps.length === 0 && holderTwin && (
        <section className="section" id="conducere">
          <h2 className="ent-tip">Titular <Term tip id="acelasi-nume" /></h2>
          <p className="holder-twin">
            Același nume în Registrul Comerțului:{" "}
            <a href={personFirmsUrl(holderTwin.personKey, cleanName(holderTwin.name))}>{cleanName(holderTwin.name)}</a>
            {holderTwin.birthYear && (
              <span className="county"> {birthNote({ birthYear: holderTwin.birthYear, birthLocality: holderTwin.locality ? cleanName(holderTwin.locality) : null })}</span>
            )}
            {" · "}{holderTwin.firms === 1 ? "administrator la o firmă" : `administrator la ${formatInt(holderTwin.firms)} firme`}
            {" · "}<span className="county">potrivire doar după nume</span>
          </p>
        </section>
      )}

      {/* What the numbers include and how the risk is formed: the last blocks before the footer (owner, 1 November 2026). */}
      <details className="data-context entity-data-context">
        <summary>Ce includ aceste cifre?</summary>
        <p>Achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, și contracte prin proceduri
          cu valoare pozitivă de cel mult 1 miliard lei.
          Valorile sunt înregistrate în achiziții; nu confirmă plăți. Totalul și lista partenerilor folosesc aceeași selecție.</p>
        {cuiUncorroborated && (registryCollision
          ? <p>Numărul {cui} apare în SEAP la această firmă, dar ONRC îl înregistrează la o altă firmă. Am verificat manual
            diferența: firmă străină, sediu în afara României sau o formă juridică ce nu poate avea acest număr. Nu afișăm
            pentru el reprezentanți ONRC, date din bilanț sau semnale bazate pe bilanț.</p>
          : <p>Numărul {cui} trece cifra de control a unui CUI românesc, dar sursa indică o firmă străină,
            iar ONRC nu înregistrează acest număr sub un nume asemănător. Poate fi un cod fiscal străin. Nu afișăm pentru el
            reprezentanți ONRC, date din bilanț sau semnale bazate pe bilanț.</p>)}
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
        <summary>Cum se formează riscul?</summary>
        <p id="criterii-scor">Din tiparele găsite în achizițiile directe, pe toată perioada disponibilă: fiecare tipar adaugă puncte după cât de
          pronunțat e. Tiparele se grupează în patru familii (evitarea plafonului, relația cu un partener, decembrie, capacitatea
          firmei): o familie singură ajunge cel mult la 80, decembrie singur la 25, capacitatea singură la 30.
          Filtrul de an din tabel nu schimbă scorul.</p>
        <ul>{criteria.map(code => <li key={code}>
          <strong>{row.scoreParts[code] ? `+${formatInt(points[code] ?? 0)}` : "fără tipar"}</strong>{" · "}
          <Link href={`/metodologie#${code}`}>{flagLabel(code)}</Link>
          {row.scoreParts[code] && <> · {riskFact(code, row.scoreParts[code]!, role)}</>}
        </li>)}</ul>
        <p>Nu este o probabilitate de corupție. Semnalele din proceduri, bilanțuri și ONRC nu intră în risc; sunt la{" "}
          <a href="#semnale">lista semnalelor</a>. Lipsa unui tipar nu certifică absența neregulilor.{" "}
          <Link href="/metodologie#indice">Formula și limitele →</Link></p>
      </details>}
    </>
  );
}
