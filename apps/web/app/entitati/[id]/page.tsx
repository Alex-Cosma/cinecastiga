import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { reviewedRegistryCollision } from "@seap/db";
import { notFound } from "next/navigation";
import {
  getEntityFlags,
  getEntityProfile,
  getCompanyReps,
  getRegistryCui,
  getEntityTxCounts,
  getEntityContractsAboveCap,
  getEntityPartnersPaged,
  getEntitySubjects,
  getEntityYears,
  getCompanyTurnover,
  getEntityRegistered,
  type Role,
  type EntityFlagRow,
} from "@/lib/marts";
import EntityYears from "./EntityYears";
import { bucharestYear, entityTitle, ledgerTotals, RISK_SCALE_SLAB, signalNames, yearsModel } from "./entity-top";
import { signalTip } from "@/lib/ask/signal-tips";
import { SIGNAL_GUIDANCE } from "@/lib/signal-guidance";
import InfoMark from "@/components/InfoMark";
import { countyKnown } from "@/lib/counties";
import { entityCountryLabel } from "@/lib/ted";
import { formatRon, formatRonFull, formatInt, formatExactDecimal, formatCalendarDate, cleanName, birthNote, countyLabel, isAbroadCounty } from "@/lib/format";
import { FLAG_META, FLAG_ORDER, flagLabel } from "@/lib/flags";
import { getEntitySignalCounts } from "@/lib/signals";
import { parseSignalState, signalTypeCountLabel, signalUrl, withoutRole } from "@/lib/signals-shared";
import { RISK_BAND_CLASS, RISK_BAND_MIN, RISK_CRITERIA, RISK_HISTORIC_MONTHS, RISK_MIN_DAS, RISK_SCORE_NOTE, riskBand, riskFact, riskHistoric, riskLabel, riskNoScoreReason, riskScoreText, riskPoints, type RiskCriterion } from "@/lib/risk-score";
import { getRiskPeerLine, riskPeerParts } from "@/lib/risk-peers";
import { getHolderTwin, individualHolder } from "@/lib/individual-holder";
import { lastMonthWords } from "@/lib/ask/historic";
import { getRegistryNames } from "@/lib/registry-names";
import { daUrl, registryLinks } from "@/lib/elicitatie";
import { successorOf } from "@/lib/entity-successors";
import { getSuccessorTarget } from "@/lib/entity-successor-target";
import ClipButton from "@/components/ClipButton";
import FollowButton from "@/components/FollowButton";
import { GLOSSARY } from "@/lib/glossary";
import Term from "@/components/Term";
import { encodeSpec } from "@/lib/ask/permalink";
import { entityChannelSpec, personFirmsSpec } from "@/lib/ask/site-links";
import TxTable from "./TxTable";
import { getEntityTransactions } from "@/lib/entity-tx";
import { txColumns } from "@/lib/entity-tx-columns";
import { readFilters, writeFilters } from "@/lib/table-filters/codec";
import PartnersTable from "./PartnersTable";
import ScoreSignals from "./ScoreSignals";
import SectionNav from "./SectionNav";
import AnalysisIcon, { type AnalysisKey } from "./AnalysisIcon";
import DropRolParam from "./DropRolParam";
import RepsMore from "./RepsMore";
import TableLink from "./TableLink";
import HintLink from "./HintLink";
import { isFillerRep, REPS_SHOWN } from "./reps";
import EntityBrief, { SummaryNotes } from "./EntityBrief";
import { composeEntitySummary } from "@/lib/entity-summary";
import { countWords } from "@/lib/ask/answer-text";
import { glossaryEntry } from "@/lib/glossary";
import { roCount } from "@/lib/ro-count";
import "./entity.css";
import { parseRoleParam } from "@/lib/role-param";
import { VALUE_REVIEW_RULE, heldValueReason } from "@/lib/contract-value-words";

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
  const wanted: Role | null = parseRoleParam(sp["rol"]);
  const role = wanted && roles.includes(wanted) ? wanted : roles[0]!;
  return { title: entityTitle(cleanName(name), role, countyKnown(flags.find((f) => f.county)?.county ?? profile?.county)) };
}

/** The direct acquisitions' share of the money, one decimal under 10% ("0,4%"), whole above ("35%"). */
function coverageWords(da: number, ct: number): string {
  const share = da + ct > 0 ? (100 * da) / (da + ct) : 0;
  return `${share < 10 ? share.toFixed(1).replace(".", ",").replace(/,0$/, "") : formatInt(Math.round(share))}%`;
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

  // A role the entity does not have, asked in the address, opens its own (UX audit bug, 16 November 2026): the page was
  // empty in the wrong role while DropRolParam cleaned the address.
  const wantedRole = parseRoleParam(sp["rol"]);
  const role: Role = wantedRole && flagRows.some((r) => r.role === wantedRole) ? wantedRole : flagRows[0]!.role;
  const row: EntityFlagRow = flagRows.find((r) => r.role === role) ?? flagRows[0]!;
  const rolParam = role === "supplier" ? "furnizor" : "autoritate";
  // `?rol=` only for an entity that both buys and sells (owner, 4 November 2026); a single-role page drops it.
  const bothRoles = flagRows.length > 1;
  const base = { rol: bothRoles ? rolParam : undefined, sort: sp["sort"], an: sp["an"], sem: sp["sem"] };
  // The records table's filters from the address (its funnels; lib/entity-tx-columns.ts).
  const txFilters = readFilters(txColumns(role === "authority"), (key) => sp[key]);
  // The records table's page from the address (UX audit Z5-29).
  const txPage = /^[1-9]\d{0,5}$/.test(sp["p"] ?? "") ? Number(sp["p"]) : 1;

  const cui = flagRows.find((r) => r.cui)?.cui ?? null;
  // ONRC/MF data only through a corroborated CUI (audit F03): a foreign number
  // that passes the CUI checksum keeps its label but not another firm's records.
  const registryCuiLookup = cui ? getRegistryCui(id) : Promise.resolve(null);
  // A reviewed older or secondary identity of an institution (owner, 4 November 2026): where its activity is now.
  const successor = successorOf(id);
  const successorTarget = successor ? getSuccessorTarget(successor.to).catch(() => null) : Promise.resolve(null);
  const otherRole: Role = role === "authority" ? "supplier" : "authority";
  const [reps, txCounts, aboveCap, signalCounts, registryCui, subjects, topPartners, peerLine, holderTwin, registryNames, activityYears, turnover, txFirst, otherCounts, registered] =
    await Promise.all([
      registryCuiLookup.then((registry) => (registry ? getCompanyReps(registry) : [])),
      getEntityTxCounts(id, role),
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
      // Page 1 of the records table, as TxTable first asks for it (by value, the address's filters): the table is in
      // the first paint instead of growing the page after it (owner, 6 November 2026). On a failure the table asks itself.
      getEntityTransactions(id, role, { filters: txFilters, sort: "value", dir: "desc", page: txPage, pageSize: 10, wholeConsortia: true })
        .catch((e: unknown) => { console.error("entity-tx first page", { id, role }, e); return null; }),
      // The other role's records, on its tab above the name (UX audit Z5-13), only for an entity that both buys and sells.
      bothRoles ? getEntityTxCounts(id, otherRole).catch(() => null) : null,
      // A firm's first registration in the trade register (UX audit Z5-17).
      role === "supplier" ? getEntityRegistered(id).catch(() => null) : null,
    ]);
  const continuedAt = await successorTarget;
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
  // The score's parts for its explanation: the patterns found, strongest first, and how many of the role's are not.
  const scoreFound = criteria.filter((code) => row.scoreParts[code]).sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
  const scoreMissing = criteria.length - scoreFound.length;
  // The buyer's regime or an in-house firm (rf-2026.20): a hover next to the score.
  const scoreNote = row.scoreNote ? RISK_SCORE_NOTE[row.scoreNote] ?? null : null;
  // rf-2026.22 (S8): no record in this role for 24 months reads "Inactiv"; the score and its evidence stay.
  const lastActivity = profile?.roles.find((r) => r.role === role)?.lastActivity ?? null;
  const historic = riskHistoric(lastActivity);
  // The header's tags (owner, 6 November 2026): the score's note, then inactivity. Esențial has no score (owner,
  // 18 November 2026): the score's note is Complet's, and „Inactiv” explains itself there without the score's sentence.
  const inactiveLabel = lastActivity && lastMonthWords(lastActivity) ? `Inactiv · ultima ${lastMonthWords(lastActivity)}` : "Inactiv";
  const inactiveText = `Nicio achiziție sau contract în ultimele ${RISK_HISTORIC_MONTHS} de luni.`;
  const headFlags: { title: string; text: string; label?: string; only?: "complet" | "esential" }[] = [
    ...(scoreNote ? [{ ...scoreNote, only: "complet" as const }] : []),
    // In Ask's words, with the month of the last record (UX audit Z5-15, 16 November 2026); its explanation unchanged.
    ...(historic ? [
      { title: "Inactiv", label: inactiveLabel, text: `${inactiveText} Scorul și dovezile rămân; clasamentele nu-l arată implicit.`, only: "complet" as const },
      { title: "Inactiv", label: inactiveLabel, text: inactiveText, only: "esential" as const },
    ] : []),
  ];
  // rf-2026.22 (S4b, S9b, S10): why a profile with signals has no score.
  const noScoreReason = hasRiskScore ? riskNoScoreReason({ nDas: row.nDas, scoreNote: row.scoreNote, score: row.score }) : null;
  // The top's ledger per channel and its years chart; the bars and the undated rest add up to txCounts' value.
  const ledger = ledgerTotals(activityYears.years, activityYears.undated);
  // The chart from two years with records up; one year is the ledger alone (UX audit Z5-14, 16 November 2026).
  const years = activityYears.years.filter((y) => y.nDa + y.nCt > 0).length >= 2 ? yearsModel(activityYears.years, turnover, bucharestYear()) : null;
  const county = flagRows.find((r) => r.county)?.county ?? null;
  const isAuth = role === "authority";
  // Every signal type in /semnale for this entity and role, CRI or not (audit F24):
  // the CRI section alone hid procedure, MF and ONRC signals from the profile.
  // The criteria of the risk score first, in the role's order, then every other signal.
  const signalTypes = [...criteria, ...FLAG_ORDER.filter((c) => !(criteria as readonly string[]).includes(c)), ...Object.keys(signalCounts).filter((c) => !FLAG_ORDER.includes(c))]
    .filter((code) => (signalCounts[code] ?? 0) > 0 && FLAG_META[code]);
  const inCri = (code: string) => (criteria as readonly string[]).includes(code);
  // Its signals page, `?rol=` only for an entity that both buys and sells (owner, 6 November 2026).
  const entitySignalsUrl = (code: string) => {
    const href = signalUrl(parseSignalState({ tip: code, rol: role, ent: id }));
    return bothRoles ? href : withoutRole(href);
  };
  // The score split into its criteria on the top's bar (ScoreSignals); a score without any stays on the bands.
  const scoreSplit = hasRiskScore && row.score > 0 && Object.values(points).some((n) => (n ?? 0) > 0);
  // The entity's signals page opens on the pattern with the most points (else its first signal); its tabs lead to the rest.
  const firstSignal = (Object.entries(points) as [string, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? signalTypes[0];
  // Esențial's form of the top's risk cell (owner, 18 November 2026): the same signals by name, from the counts and
  // points read above (the bar's criteria are those with points and parts), each with its meaning on hover.
  const namedSignals = signalNames(signalTypes,
    Object.fromEntries((Object.entries(points) as [RiskCriterion, number][]).filter(([c, n]) => n > 0 && row.scoreParts[c])),
    new Set(Object.keys(SIGNAL_GUIDANCE)), FLAG_ORDER, hasRiskScore);
  const signalHint = (code: string, quiet: boolean) => {
    const meaning = (Object.hasOwn(SIGNAL_GUIDANCE, code) ? signalTip({ code }, role)?.text : null) ?? FLAG_META[code]?.short ?? flagLabel(code);
    return quiet ? `Găsit, prea puțin ca să conteze. ${meaning}` : meaning;
  };
  // The entity's analysis pages, short names; their own titles keep the questions (owner, 4 November 2026). "Semnale"
  // first, the signals page being hard to find from here (owner, 6 November 2026).
  const rolQuery = bothRoles ? `?rol=${rolParam}` : "";
  // What each analysis shows, on hover, focus or a long press; with few records Radiografie and Legături are quieter and
  // say so, never hidden (UX audit Z5-21, 16 November 2026).
  const fewRecords = txCounts.nDa + txCounts.nCt < 10;
  const few = fewRecords ? ` Puține date: ${countWords(txCounts.nDa + txCounts.nCt, "înregistrare", "înregistrări")}.` : "";
  const views: { href: string; label: string; icon: AnalysisKey; note?: string; noteWords?: string; band?: string; hint: string; thin?: boolean }[] = [
    ...(firstSignal ? [{ href: entitySignalsUrl(firstSignal), label: "Semnale", icon: "semnale" as const,
      note: formatInt(signalTypes.length), noteWords: signalTypes.length === 1 ? "un tip de semnal" : `${signalTypeCountLabel(signalTypes.length)} de semnale`,
      hint: "Semnale: tiparele găsite în înregistrări, fiecare cu cazurile și sursele lui. Piste, nu dovezi.",
      ...(hasRiskScore ? { band } : {}) }] : []),
    ...(isAuth ? [{ href: `/entitati/${id}/radiografie`, label: "Radiografie", icon: "radiografie" as const, thin: fewRecords,
      hint: `Radiografie: cine depinde de instituție, loturi care se repetă, achiziții apropiate în timp.${few}` }] : []),
    { href: `/entitati/${id}/legaturi${rolQuery}`, label: "Legături", icon: "legaturi", thin: fewRecords,
      hint: `Legături: drumul banilor spre parteneri și spre partenerii lor.${few}` },
    { href: `/entitati/${id}/comparatii${rolQuery}`, label: "Comparații", icon: "comparatii",
      hint: isAuth ? "Comparații: față de instituții asemănătoare." : "Comparații: față de firme asemănătoare." },
  ];
  // A small profile does not repeat itself (UX audit Z5-14): with at most 5 records, each from another partner, the
  // partner list would be the records table again, so it is left out.
  const nRecords = txCounts.nDa + txCounts.nCt;
  const partnersRepeatTable = nRecords > 0 && nRecords <= 5 && topPartners.total === nRecords;
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
          <div className="ehead-role">
          {/* An entity that both buys and sells: its two roles are tabs in the role line's place, each with its records
              (UX audit Z5-13, 16 November 2026); a public company or a foreign firm keeps those words in the line under the name. */}
          {bothRoles ? (
            <nav className="ehead-roles" aria-label="Rolul">
              {(["authority", "supplier"] as const).map((r) => {
                const counts = r === role ? txCounts : otherCounts;
                return (
                  <Link key={r} href={q(base, { rol: r === "supplier" ? "furnizor" : "autoritate", p: undefined })}
                    aria-current={r === role ? "page" : undefined}
                    title={counts ? `${ROLE_LABEL[r]}: ${formatInt(counts.nDa + counts.nCt)} înregistrări` : ROLE_LABEL[r]}>
                    <span>{r === "authority" ? "Cumpără · autoritate" : "Vinde · furnizor"}</span>
                    {counts && <span className="n">{formatInt(counts.nDa + counts.nCt)}</span>}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <p className="eyebrow">
              {role === "authority" && profile?.isPublicCompany ? "Companie publică · autoritate contractantă" : ROLE_LABEL[role]}
              {profile?.isForeign ? ` · ${entityCountryLabel(true, profile.countryCode)}` : ""}
            </p>
          )}
          {/* Tags beside the role, each with its reason on hover or tap (owner, 6 November 2026; beside the role since UX audit
              Z5-15): the buyer's regime or an in-house firm (rf-2026.20), no record in this role for 24 months (rf-2026.22 S8). */}
          {/* A tag of one mode only sits in a box that takes no room of its own (display: contents), so Complet is unchanged. */}
          {headFlags.length > 0 && <div className="ehead-flags" data-only={headFlags.every((f) => f.only === "complet") ? "complet" : undefined}>
            {headFlags.map((f) => {
              const tag = <Term key={`${f.title}-${f.only ?? ""}`} tip hold="box" className="ehead-flag" title={f.title} text={f.text}>{f.label ?? f.title}</Term>;
              return f.only ? <span key={`${f.title}-${f.only}`} data-only={f.only} style={{ display: "contents" }}>{tag}</span> : tag;
            })}
          </div>}
          </div>
          <h1 className="page-title">{cleanName(row.name)}</h1>
          <div className="id-meta">
            {bothRoles && (profile?.isPublicCompany || profile?.isForeign) ? (
              <span>{[profile.isPublicCompany ? "companie publică" : null, profile.isForeign ? entityCountryLabel(true, profile.countryCode) : null].filter(Boolean).join(" · ")}</span>
            ) : null}
            {county && !(profile?.isForeign && isAbroadCounty(county)) ? <span>{countyLabel(county)}</span> : null}
            {/* Esențial (owner, 18 November 2026): the name and county say who it is; the CUI, the registries, the registry
                dates and names are for whoever checks (Complet). */}
            {cui ? <span className="mono" data-only="complet">CUI {cui}</span> : null}
            {/* The registries check this CUI, so they sit beside it as quiet links (owner, 4 November 2026). No
                e-licitatie entity link: SICAP has no per-entity page, and every record deep-links to its source. */}
            {registryCui ? (
              <span className="ehead-reg" data-only="complet">
                {registryLinks(registryCui, cleanName(row.name)).map((l) => (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </span>
            ) : null}
            {/* Since when the firm exists and which years its records cover, without opening a block (UX audit Z5-17). */}
            {registered && registryCui !== null && (registered.on || registered.year) ? (
              <span className="ent-tip" data-only="complet">înființată {registered.on ? `${registered.on.slice(5, 7)}.${registered.on.slice(0, 4)}` : registered.year}{" "}
                <Term tip title="Înființată" text={`Data primei înmatriculări a acestui CUI la Registrul Comerțului${registered.on ? `: ${formatCalendarDate(registered.on)}` : ""}.`} /></span>
            ) : null}
            {txCounts.dateFrom && txCounts.dateTo ? (
              <span>înregistrări {txCounts.dateFrom.slice(0, 4) === txCounts.dateTo.slice(0, 4) ? txCounts.dateFrom.slice(0, 4) : `${txCounts.dateFrom.slice(0, 4)}–${txCounts.dateTo.slice(0, 4)}`}</span>
            ) : null}
            {registryNames.length > 0 ? (
              <span className="ent-tip" data-only="complet">
                în registru: {registryNames.slice(0, 2).join(" · ")} <Term tip id="nume-registru" />
              </span>
            ) : null}
            {cuiUncorroborated ? (
              // The CUI's own warning goes with the CUI (both or neither).
              <span data-only="complet" title={registryCollision
                ? "La verificarea manuală, ONRC înregistrează acest număr la o altă firmă decât cea din SEAP. Nu afișăm reprezentanți, bilanț sau linkuri de registru pentru el."
                : "Numărul trece cifra de control a unui CUI, dar sursa indică o firmă străină, iar ONRC nu înregistrează acest număr sub un nume asemănător. Nu afișăm reprezentanți, bilanț sau linkuri de registru pentru el."}>
                număr necoroborat cu ONRC
              </span>
            ) : null}
          </div>
        </div>
        {/* Only the two things a reader does with the entity; the analyses are pages, linked once beside the tabs
            (owner, 4 November 2026). */}
        <div className="ehead-acts">
          <FollowButton
            spec={{ block: "stat", measure: "value", filters: isAuth ? { authorityId: Number(id), authorityName: cleanName(row.name) } : { supplierId: Number(id), supplierName: cleanName(row.name) } }}
            title={`${cleanName(row.name)} — valoarea achizițiilor`} back={{ href: `/entitati/${id}`, label: cleanName(row.name) }} label="Urmărește" hint="Urmărește modificările" arrow={false}
          />
          <ClipButton kind="entity" refId={id} label={cleanName(row.name)} primary />
        </div>
      </div>
      {/* The same analyses on a phone, where the tab row scrolls sideways and would hide them. */}
      {/* Esențial (owner, 18 November 2026): Radiografie, Legături and Comparații belong to Complet, and the signals are
          named in the top, each a link to its page; the row goes whole (here and beside the tabs, SectionNav). */}
      <nav className="ehead-views" aria-label="Analize" data-only="complet">
        {views.map((v) => <HintLink key={v.href} href={v.href} hint={v.hint} dataBand={v.band} className={v.thin ? "is-thin" : undefined}
          ariaLabel={v.noteWords ? `${v.label}, ${v.noteWords}` : undefined}><AnalysisIcon name={v.icon} />{v.label}{v.note && <span className="n">{v.note}</span>}</HintLink>)}
      </nav>

      {successor && continuedAt ? (
        <p className="ent-successor" role="note">
          {successor.kind === "succesor"
            ? <>Activitatea continuă{successor.since ? ` din ${successor.since}` : ""} sub alt CUI: </>
            : <>Cont secundar al instituției </>}
          <Link prefetch={false} href={`/entitati/${continuedAt.id}`}>{continuedAt.name}</Link>
          {continuedAt.cui ? <span className="mono"> (CUI {continuedAt.cui})</span> : null}
          <span aria-hidden="true"> →</span>
        </p>
      ) : null}
      {!bothRoles && sp["rol"] !== undefined && <DropRolParam />}
      {/* The page's tabs right under its header, above the summary they start with (owner, 2 November 2026). */}
      <SectionNav
        name={cleanName(row.name)}
        items={[
          { id: "top", label: "Rezumat" },
          // In the page's order (critique of 2 November 2026): the representatives come right after the summary,
          // an individual practice's holder last, before the explanations.
          ...(reps.length > 0 ? [{ id: "conducere", label: "Conducere" }] : []),
          // Then the partners and the acquisitions (owner, 4 November 2026); the signals are their own page, "Semnale →"
          // among the analyses, and the score's parts are in the top (owner, 6 November 2026).
          ...(partnersRepeatTable ? [] : [{ id: "parteneri", label: isAuth ? "Furnizori" : "Autorități" }]),
          { id: "achizitii", label: "Achiziții", count: formatInt(txCounts.nDa + txCounts.nCt), countWords: countWords(txCounts.nDa + txCounts.nCt, "înregistrare", "înregistrări") },
          ...(reps.length === 0 && holderTwin ? [{ id: "conducere", label: "Titular" }] : []),
          ...views,
        ]}
      />

      {/* The top (owner, 2 November 2026): the risk on its bands, a ledger of the activity per channel (its swatches
          are the chart's legend) and the value per year. The score's criteria are on its bar, each a link to its page on
          /semnale (owner, 6 November 2026). */}
      <div className={`ent-top${years ? "" : " ent-top--no-years"}`}>
        {/* The score, its bar and bands, the peers and the method: Complet's (owner, 18 November 2026). */}
        <div className="ent-risk" data-only="complet">
          <p className="ent-risk-read">
            {/* From what the score is formed (owner, 19 November 2026): on the number itself, in a box over the page; the
                fold „Cum se formează riscul?” at the page's end is gone and its rules are the guide's (#indice). Only
                where a score can be (UX audit Z5-14). */}
            {hasRiskScore && row.nDas >= RISK_MIN_DAS
              ? <Term tip hold="line" className="ent-score-how" title="Din ce e format scorul" text={scoreFound.length > 0 ? <>
                {scoreFound.map((code) => <span key={code} className="ent-how-n">
                  <b>+{formatInt(points[code] ?? 0)}</b> · <Link href={`/metodologie#${code}`}>{flagLabel(code)}</Link> · {riskFact(code, row.scoreParts[code]!, role)}
                </span>)}
                {scoreMissing > 0 && <span className="ent-how-n">{scoreMissing === 1 ? "Un alt tipar din scor nu apare" : `Alte ${formatInt(scoreMissing)} tipare din scor nu apar`} la {role === "authority" ? "această instituție" : "această firmă"}.</span>}
              </> : <span className="ent-how-n">Niciun tipar din scor nu apare la {role === "authority" ? "această instituție" : "această firmă"}.</span>}>
                <b data-band={band}>{riskScoreText(row.score)}</b>
              </Term>
              : <b data-band={hasRiskScore ? band : "none"}>{hasRiskScore ? riskScoreText(row.score) : "—"}</b>}
            {/* rf-2026.22 (S7): the score reads only the direct acquisitions; how much of the money that is waits in the
                label's own explanation (owner, 17 November 2026: less small print under the bar). */}
            <span className="ent-tip">{hasRiskScore && ledger.nCt > 0
              ? <Term tip hold="line" title={GLOSSARY["scor-risc"].title} text={`${GLOSSARY["scor-risc"].text}\n– Citește doar achizițiile directe: ${coverageWords(Number(ledger.valueDa), Number(ledger.valueCt))} din valoarea înregistrată. Contractele prin proceduri nu intră în el.`}>{riskLabel(row.score)}</Term>
              : <Term tip hold="line" id="scor-risc">{hasRiskScore ? riskLabel(row.score) : "risc necalculat"}</Term>}
</span>
          </p>
          {/* Where the score comes from (owner, 6 November 2026): its criteria on the bar, each a link to its pattern's page. */}
          <ScoreSignals hasRiskScore={hasRiskScore} score={row.score} parts={row.scoreParts} points={points} signalTypes={signalTypes}
            signalCounts={signalCounts} noScoreReason={noScoreReason} signalsHref={entitySignalsUrl} />
          {hasRiskScore && !scoreSplit && (
            // The bands stay; the score's marker appears where it is, never sliding in from 0 (owner, 6 November 2026).
            <div className="ent-risk-scale" aria-hidden="true" data-chart>
              <span className="ent-risk-track" style={{ gridTemplateColumns: `${RISK_SCALE_SLAB}fr ${RISK_BAND_MIN.moderat - RISK_SCALE_SLAB}fr ${RISK_BAND_MIN.puternic - RISK_BAND_MIN.moderat}fr ${100 - RISK_BAND_MIN.puternic}fr` }}><i /><i /><i /><i /></span>
              <span className="ent-risk-marker cm-fade" style={{ left: `${Math.min(99, Math.max(1, row.score))}%` }} />
              <span className="ent-risk-ticks">
                <span style={{ left: `${RISK_SCALE_SLAB}%` }}>slab</span>
                <span style={{ left: `${RISK_BAND_MIN.moderat}%` }}>moderat</span>
                <span style={{ left: `${RISK_BAND_MIN.puternic}%` }}>pronunțat</span>
              </span>
            </div>
          )}
          {/* A firm's long domain name in its explanation, not in the narrow column (UX audit Z5-16, 16 November 2026). */}
          {peerLine && (() => {
            const peer = riskPeerParts(peerLine);
            return <p className="ent-risk-peer ent-tip">{peer.words}{peer.domain && <> <Term tip title="Același domeniu" text={`„${peer.domain}”: domeniul principal al firmei. Locul e printre firmele lui cu cel puțin 10 achiziții directe.`} /></>}</p>;
          })()}
          {(hasRiskScore || signalTypes.length > 0) && <Link href="/metodologie#indice" className="ent-risk-method">Cum se calculează →</Link>}
        </div>
        {/* Esențial's risk, in words (owner, 18 November 2026): every pattern found by name, each a link to its page with
            its meaning on hover, those found but too few to count last and dashed, then the one „Pistă, nu dovadă”. With
            no signal there is no box and the ledger takes the strip (esential-entitate.css). */}
        {namedSignals.length > 0 && (
          <div className="ent-sigwords" data-only="esential">
            <p className="ent-sigwords-h">Semnale</p>
            <ul>
              {namedSignals.map(({ code, quiet }) => (
                <li key={code}>
                  <HintLink href={entitySignalsUrl(code)} hint={signalHint(code, quiet)} className={`flag-badge${quiet ? " is-quiet" : ""}`}>{flagLabel(code)}</HintLink>
                </li>
              ))}
            </ul>
            <p className="ent-sigwords-foot">Pistă, nu <span className="ent-sigwords-keep">dovadă <InfoMark title="De știut" text="Un tipar e o pistă de verificat, nu o dovadă." /></span></p>
          </div>
        )}
        <div className="ent-activity">
        <table className="ent-ledger">
          <thead><tr><th scope="col"><span className="sr-only">Felul achiziției</span></th><th scope="col">Înregistrări</th><th scope="col">Valoare</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row"><span className="ent-ledger-label"><i className="ent-sw ent-sw-da" data-only="complet" />{ledger.nDa > 0
                ? <TableLink href="?tip=directe#achizitii" filter={{ tip: { kind: "options", values: ["directe"] } }}>Achiziții directe&nbsp;→</TableLink>
                : <span>Achiziții directe</span>}</span></th>
              <td className="ent-ledger-n">{formatInt(ledger.nDa)}</td>
              <td>{formatRon(Number(ledger.valueDa))}</td>
            </tr>
            {ledger.nCt > 0 && (
              <tr>
                <th scope="row"><span className="ent-ledger-label"><i className="ent-sw ent-sw-ct" data-only="complet" /><TableLink href="?tip=contracte#achizitii" filter={{ tip: { kind: "options", values: ["contracte"] } }}>Contracte prin proceduri&nbsp;→</TableLink></span></th>
                <td className="ent-ledger-n">{formatInt(ledger.nCt)}</td>
                <td>{formatRon(Number(ledger.valueCt))}</td>
              </tr>
            )}
            <tr className="ent-ledger-total">
              <th scope="row"><span className="ent-ledger-label"><i className="ent-sw" data-only="complet" /><span className="ent-tip"><TableLink href="#achizitii" filter={{}}>Total înregistrat</TableLink> {subjects.nConsortium > 0
                // The contracts in a consortium join this explanation (owner, 17 November 2026; before: a line of their own under the top).
                ? <Term tip title={glossaryEntry("valoare-inregistrata").title} text={`${glossaryEntry("valoare-inregistrata").text} ${roCount(subjects.nConsortium, "Un contract", "contracte")} în consorțiu.`} />
                : <Term tip id="valoare-inregistrata" />}</span></span></th>
              <td className="ent-ledger-n">{formatInt(ledger.nDa + ledger.nCt)}</td>
              <td>{formatRon(Number(txCounts.valueExact))}</td>
            </tr>
            {/* A firm's employees and turnover from its balance sheet: Complet's (owner, 18 November 2026). */}
            {role === "supplier" && registryCui !== null && profile?.employees != null && (
              <tr className="ent-ledger-fin" data-only="complet">
                <th scope="row"><span className="ent-ledger-label"><i className="ent-sw" /><span>Angajați (bilanț {profile.employeesYear})</span></span></th>
                <td className="ent-ledger-n" />
                <td>{formatInt(profile.employees)}</td>
              </tr>
            )}
            {role === "supplier" && registryCui !== null && profile?.netTurnover != null && profile.netTurnover > 0 && (
              <tr className="ent-ledger-fin" data-only="complet">
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

      {/* Only the contracts above the cap: the count of contracts in a consortium is in the total's (?) (owner, 17 November 2026). */}
      {summary && <SummaryNotes notes={summary.notes.filter((note) => !note.some((s) => typeof s !== "string" && s.tip === "consortiu"))} />}
      {summary && <EntityBrief summary={summary} />}

      {/* Legal representatives (ONRC snapshot). A register filler is never a person (UX audit Z5-26); the „other firms”
          column only when someone has any; on a phone each person is one line and the first five are shown. */}
      {reps.length > 0 && (() => {
        const people = reps.filter((r, i) => !isFillerRep(r.personName) || reps.findIndex((x) => isFillerRep(x.personName)) === i);
        const others = people.some((r) => !isFillerRep(r.personName) && ((r.nOtherFirms > 0 && r.personKey) || r.nOtherOnrcOnly > 0));
        // Esențial keeps Conducere strict (owner, 18 November 2026): the name, the role and „încă N firme →”; the birth
        // note and „N firme fără achiziții publice” are Complet's. A cell left without a link says „—” (and a phone drops
        // it, as it drops Complet's empty ones); a column without any link goes whole.
        const linked = (r: (typeof people)[number]) => !isFillerRep(r.personName) && r.nOtherFirms > 0 && !!r.personKey;
        const othersOnly = others && !people.some(linked) ? "complet" : undefined;
        return (
        <section className="section" id="conducere">
          <h2 className="ent-tip">Conducere <Term tip id="conducere-onrc" /></h2>
          <RepsMore hidden={Math.max(0, people.length - REPS_SHOWN)}>
          <table className="rank reps-table">
            <thead>
              <tr>
                <th>Persoană</th>
                <th>Calitate</th>
                {others && <th data-only={othersOnly}>Alte firme reprezentate</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((r, i) => isFillerRep(r.personName) ? (
                <tr key={`filler-${i}`} className={i >= REPS_SHOWN ? "rep-more" : undefined}>
                  <td className="rep-name"><span className="rep-n rep-none">fără reprezentant declarat</span></td>
                  <td className="county rep-cal">{r.calitate ?? "—"}</td>
                  {others && <td className="rep-other" data-empty="1" data-only={othersOnly} />}
                </tr>
              ) : (
                <tr key={`${r.personName}-${i}`} className={i >= REPS_SHOWN ? "rep-more" : undefined}>
                  <td className="rep-name">
                    <span className="rep-n">{cleanName(r.personName)}</span>
                    {(r.birthYear || r.birthDateImplausible) && (
                      <span className="county rep-b" data-only="complet">
                        {" "}
                        {birthNote({ ...r, birthLocality: r.birthLocality ? cleanName(r.birthLocality) : null })}
                      </span>
                    )}
                  </td>
                  <td className="county rep-cal">{r.calitate ?? "—"}</td>
                  {others && <td className="rep-other" data-empty={r.nOtherFirms === 0 && r.nOtherOnrcOnly === 0 ? "1" : undefined}
                    data-only={othersOnly} data-esential-empty={linked(r) ? undefined : "1"}>
                    {r.nOtherFirms > 0 && r.personKey ? (
                      <a href={personFirmsUrl(r.personKey, cleanName(r.personName))}>
                        {r.nOtherFirms === 1 ? "încă o firmă" : `încă ${formatInt(r.nOtherFirms)} firme`} →
                      </a>
                    ) : null}
                    {r.nOtherOnrcOnly > 0 && (
                      <span className="county" data-only="complet">
                        {r.nOtherFirms > 0 ? " + " : ""}
                        {r.nOtherOnrcOnly === 1
                          ? "o firmă fără achiziții publice"
                          : `${formatInt(r.nOtherOnrcOnly)} firme fără achiziții publice`}
                      </span>
                    )}
                    {r.nOtherFirms === 0 && r.nOtherOnrcOnly === 0 && "—"}
                    {!linked(r) && r.nOtherOnrcOnly > 0 && <span data-only="esential">—</span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
          </RepsMore>
        </section>
        );
      })()}

      {/* Counterparties */}
      {!partnersRepeatTable && <section className="section" id="parteneri">
        <h2>{isAuth ? "Principalii furnizori" : "Principalele autorități"}</h2>
        <PartnersTable
          key={`${id}-${role}`}
          entityId={id}
          entityName={cleanName(row.name)}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          initial={topPartners}
        />
      </section>}

      {/* Transactions — client table: 10/pagină, sortabil, filtre fără reload; page 1 from the server */}
      <section className="section" id="achizitii">
        <h2>Toate înregistrările</h2>
        <TxTable
          key={`${id}:${rolParam}:${writeFilters(txColumns(isAuth), "", txFilters)}`}
          entityId={id}
          role={rolParam as "furnizor" | "autoritate"}
          isAuth={isAuth}
          initial={txFilters}
          first={txFirst}
          initialPage={txPage}
          askHref={entityTxSearchUrl(id, cleanName(row.name), role, "all")}
          count={txCounts.nDa + txCounts.nCt}
        />
        {aboveCap.count > 0 && <details className="data-context" id="peste-plafon">
          <summary>{formatInt(aboveCap.count)} {aboveCap.count === 1 ? "contract peste 1 miliard lei, ținut" : "contracte peste 1 miliard lei, ținute"} în afara totalului · {formatRon(Number(aboveCap.totalExact))}</summary>
          {/* Owner, 19 November 2026: above 1 mld. lei a contract is counted unless its notice contradicts the value or it
              was reported as wrong; this list is what stayed out, each with its reason. */}
          <p>{VALUE_REVIEW_RULE} {aboveCap.count === 1 ? "Acesta a rămas afară." : "Acestea au rămas afară."} Valori integrale din SEAP, nu plăți.
            {role === "supplier" ? " Includ și cotele celorlalți membri ai consorțiului." : ""}</p>
          <div className="ask-tablewrap"><table className="rank"><thead><tr><th scope="col">Contract</th><th scope="col">Semnat</th><th scope="col" className="num">Valoare (lei)</th><th scope="col">De ce e ținut afară</th></tr></thead><tbody>
            {aboveCap.rows.map((c) => <tr key={c.natId}>
              <td><Link prefetch={false} href={`/contracte/${c.natId}`}>{c.title?.trim() || c.contractNo || `Contract ${c.natId}`}</Link>{c.nWinners > 1 ? <span className="note"> · {formatInt(c.nWinners)} câștigători</span> : null}</td>
              <td>{c.contractDate ? formatCalendarDate(c.contractDate) : "—"}</td>
              <td className="num">{formatExactDecimal(c.valueRonExact)}</td>
              <td>{heldValueReason(c)}</td>
            </tr>)}
          </tbody></table></div>
          {aboveCap.count > aboveCap.rows.length && <p className="note">Sunt afișate cele mai mari {formatInt(aboveCap.rows.length)} din {formatInt(aboveCap.count)}.</p>}
        </details>}
      </section>

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

      {/* What this page's numbers include (owner, 19 November 2026): quiet words whose box floats over the page, in
          place of the fold „Ce includ aceste cifre?” that opened in it. Only what is this entity's: the rules of every
          total are the guide's (#totaluri). Complet's (owner, 18 November 2026); „valoare înregistrată” stays at the
          total's (?) and in the footer. The score's parts are on the score, at the top. */}
      <p className="ent-how" data-only="complet">
        <Term tip hold="line" title="Ce includ cifrele" text={<>
          {txCounts.nCt > 0 && <span className="ent-how-n">{formatInt(txCounts.nContracts)} contracte distincte apar în {formatInt(txCounts.nCt)} înregistrări contract–furnizor.</span>}
          <span className="ent-how-n">Înregistrări datate: {txCounts.dateFrom ? formatCalendarDate(txCounts.dateFrom) : "dată necunoscută"} — {txCounts.dateTo ? formatCalendarDate(txCounts.dateTo) : "dată necunoscută"}.</span>
          {txCounts.excludedDa > 0 && <span className="ent-how-n">{formatInt(txCounts.excludedDa)} achiziții directe cu valori nule, nepozitive sau peste plafon sunt separate de total.</span>}
          {aboveCap.count > 0 && <span className="ent-how-n">Contractele de peste 1 mld. lei ținute afară nu intră în totaluri și nici în lista partenerilor; sunt listate sub tabel, fiecare cu motivul.</span>}
          {cuiUncorroborated && <span className="ent-how-n">{registryCollision
            ? <>Numărul {cui} apare în SEAP la această firmă, dar ONRC îl înregistrează la o altă firmă. Am verificat manual diferența. Nu afișăm pentru el reprezentanți ONRC, date din bilanț sau semnale bazate pe bilanț.</>
            : <>Numărul {cui} trece cifra de control a unui CUI românesc, dar sursa indică o firmă străină, iar ONRC nu înregistrează acest număr sub un nume asemănător. Poate fi un cod fiscal străin. Nu afișăm pentru el reprezentanți ONRC, date din bilanț sau semnale bazate pe bilanț.</>}</span>}
          <span className="ent-how-n">Ce intră în orice total e în <Link href="/metodologie#totaluri">Ghid</Link>.</span>
        </>}>Ce includ cifrele</Term>
      </p>
    </>
  );
}
