import Link from "next/link";
import EntityName from "@/components/EntityName";
import Term from "@/components/Term";
import { countWords } from "@/lib/ask/answer-text";
import type { SplitPair } from "@/lib/entity-splits";
import { FLAG_META, flagLabel } from "@/lib/flags";
import { cleanName, formatInt } from "@/lib/format";
import { RISK_BAND_MIN, RISK_RECURRING_WORDS, riskFact, riskSplitRecurring, type RiskCriterion, type RiskRole, type ScoreParts } from "@/lib/risk-score";
import { SIGNAL_GUIDANCE, signalSentence, signalShare } from "@/lib/signal-guidance";
import SplitPairsTable from "./SplitPairsTable";
import YearMiniChart from "./YearMiniChart";

/** The segments' fills, darkest first: told apart by lightness, in both themes (choropleth scale). */
const SEGMENT_CLASS = ["c0", "c1", "c2", "c3", "c4"] as const;
/** Codes whose records the entity's table filters by (rowFlag): their link opens the table, the rest /semnale. */
const ROW_CODES = new Set(["da_split", "da_round", "da_above_ceiling"]);
/** How many groups the split row draws; the rest is the full table under it. */
const SPLIT_BARS = 5;

const ratioWords = (r: number): string => (Math.round(r * 10) / 10).toFixed(1).replace(".", ",");

export interface SignalsBreakdownProps {
  id: string;
  role: RiskRole;
  entityName: string;
  hasRiskScore: boolean;
  /** Why the signals make no score (rf-2026.22: under 10 DAs, a private buyer, under 10 points). */
  noScoreReason?: string | null;
  score: number;
  parts: ScoreParts;
  points: Partial<Record<RiskCriterion, number>>;
  /** Every signal type of the entity in this role with at least one occurrence, criteria first. */
  signalTypes: string[];
  signalCounts: Record<string, number>;
  flagRowCounts: Record<string, number>;
  recordsHref: (code: string) => string;
  signalsHref: (code: string) => string;
  splitGroups: { rows: SplitPair[]; total: number } | null;
  /** December's flagged years, for the month chart. */
  yearEndYears: string[];
  monthly: { ym: string; totalRon: number }[];
  topPartner: { id: string; name: string } | null;
}

/**
 * „De unde vine scorul” (variant A, owner, 4 November 2026): the score split into its criteria on one bar, then
 * one row per criterion that adds points: what was found in a sentence, a small picture of it, what to check and
 * how it may be explained, and a link to its records. Criteria found but under their threshold, and the signals
 * outside the score, close the section in one line each. The rule and the limits live on /metodologie.
 */
export default function SignalsBreakdown(p: SignalsBreakdownProps) {
  const criteria = (Object.keys(p.points) as RiskCriterion[])
    .filter((c) => (p.points[c] ?? 0) > 0 && p.parts[c])
    .sort((a, b) => (p.points[b] ?? 0) - (p.points[a] ?? 0));
  const scored = p.hasRiskScore && p.score > 0 && criteria.length > 0;
  const inScore = new Set<string>(criteria);
  const riskCodes = new Set<string>(Object.keys(SIGNAL_GUIDANCE));
  // Found, but below the share or count from which it adds points (or the score is not built yet).
  const quiet = p.signalTypes.filter((c) => riskCodes.has(c) && !inScore.has(c));
  const others = p.signalTypes.filter((c) => !riskCodes.has(c));
  const segments = criteria.map((code, i) => ({ code, width: p.points[code] ?? 0, left: criteria.slice(0, i).reduce((a, c) => a + (p.points[c] ?? 0), 0) }));
  const segment = (code: RiskCriterion) => SEGMENT_CLASS[Math.min(criteria.indexOf(code), SEGMENT_CLASS.length - 1)];

  return (
    <section className="section ent-tip-col sig" id="semnale">
      <div className="sig-head">
        <div>
          <h2 className="ent-tip">
            {scored ? `De unde vine scorul de ${formatInt(Math.round(p.score))} din 100` : "Semnale"} <Term tip id="semnale-numarare" />
          </h2>
          <p className="sig-lede">
            {scored ? `${countWords(criteria.length, "tipar găsit", "tipare găsite")} în achizițiile directe. ` : ""}Piste de verificat, nu dovezi.
          </p>
        </div>
        <Link href="/metodologie#indice" className="sig-method">Cum se calculează →</Link>
      </div>

      {scored && (
        <div className="sig-score">
          <div className="sig-bar" role="img" aria-label={`Scorul ${formatInt(Math.round(p.score))} din 100: ${criteria.map((c) => `${flagLabel(c)} ${p.points[c]}`).join(", ")}`}>
            <span className="sig-track" />
            {segments.map((sgm) => <span key={sgm.code} className={`sig-seg ${segment(sgm.code)}`} style={{ left: `${sgm.left}%`, width: `${sgm.width}%` }} />)}
            <span className="sig-tick" style={{ left: `${RISK_BAND_MIN.moderat}%` }} />
            <span className="sig-tick" style={{ left: `${RISK_BAND_MIN.puternic}%` }} />
            <span className="sig-marker" style={{ left: `${Math.min(100, p.score)}%` }} />
          </div>
          <div className="sig-scale" aria-hidden="true">
            <span style={{ left: 0 }}>0</span>
            <span style={{ left: `${RISK_BAND_MIN.moderat / 2}%` }} className="mid">slab</span>
            <span style={{ left: `${(RISK_BAND_MIN.moderat + RISK_BAND_MIN.puternic) / 2}%` }} className="mid">moderat</span>
            <span style={{ left: `${(RISK_BAND_MIN.puternic + 100) / 2}%` }} className="mid">pronunțat</span>
            <span style={{ right: 0 }}>100</span>
          </div>
          <ul className="sig-legend">
            {criteria.map((code) => (
              <li key={code}><i className={`sig-swatch ${segment(code)}`} /><b>{formatInt(p.points[code] ?? 0)}</b> {flagLabel(code)}</li>
            ))}
            {quiet.map((code) => (
              <li key={code} className="quiet"><i className="sig-swatch none" /><b>0</b> {flagLabel(code)}: {quietWords(code, p.signalCounts[code] ?? 0)}</li>
            ))}
          </ul>
        </div>
      )}

      {scored && (
        <div className="sig-rows">
          {criteria.map((code) => {
            const part = p.parts[code]!;
            const sentence = signalSentence(code, part, p.role) ?? riskFact(code, part, p.role);
            const guide = SIGNAL_GUIDANCE[code];
            const share = signalShare(code, part);
            const rows = p.flagRowCounts[code] ?? 0;
            return (
              <article className="sig-row" key={code} aria-labelledby={`sig-${code}`}>
                <div className={`sig-pts ${segment(code)}`}>+{formatInt(p.points[code] ?? 0)}</div>
                <div className="sig-body">
                  <h3 id={`sig-${code}`}>{flagLabel(code)}</h3>
                  <p className="sig-sentence">{sentence}</p>
                  <div className="sig-guide">
                    <p><b>Ce verifici</b>{guide.check}</p>
                    <p><b>Se poate explica</b>{guide.explain}</p>
                  </div>
                  {ROW_CODES.has(code) && rows > 0
                    ? <Link href={p.recordsHref(code)} className="sig-link">Vezi {rows === 1 ? "achiziția" : `cele ${countWords(rows, "achiziție", "achiziții")}`} →</Link>
                    : <Link href={p.signalsHref(code)} className="sig-link">Vezi aparițiile →</Link>}
                </div>
                <div className="sig-pic">
                  {code === "da_split" && p.splitGroups && p.splitGroups.rows.length > 0 && <SplitBars groups={p.splitGroups} role={p.role} counted={Number(part.groups) || null} />}
                  {code === "da_round" && part.expected != null && <FoundVsExpected found={Number(part.n) || 0} expected={Math.round(Number(part.expected) || 0)} />}
                  {share != null && (
                    <div className="sig-share" role="img" aria-label={`${Math.round(share * 100)}%`}>
                      <span className={`sig-share-fill ${segment(code)}`} style={{ width: `${Math.max(1, share * 100)}%` }} />
                    </div>
                  )}
                  {share != null && code === "da_above_ceiling" && <p className="sig-cap">{Math.round(share * 100)}% din valoarea achizițiilor directe</p>}
                  {share != null && (code === "da_concentration" || code === "da_dependence") && p.topPartner && (
                    <p className="sig-cap">{code === "da_concentration" ? "Furnizorul principal: " : "Clientul principal: "}
                      <EntityName id={p.topPartner.id} role={p.role === "authority" ? "supplier" : "authority"}>{cleanName(p.topPartner.name)}</EntityName></p>
                  )}
                  {code === "da_year_end" && p.yearEndYears[0] && (
                    <YearMiniChart monthly={p.monthly} year={p.yearEndYears[0]} entityId={p.id} entityName={p.entityName} role={p.role} />
                  )}
                </div>
                {code === "da_split" && p.splitGroups && p.splitGroups.total > SPLIT_BARS && (
                  <details className="sig-all">
                    <summary>Toate cele {countWords(p.splitGroups.total, "grup", "grupuri")}</summary>
                    <SplitPairsTable entityId={p.id} isAuth={p.role === "authority"} />
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      {(scored ? others : p.signalTypes).length > 0 && (
        <div className="sig-others">
          {!scored && !p.hasRiskScore && p.signalTypes.some((c) => riskCodes.has(c)) && (
            <p className="sig-note">Scorul de risc se calculează la următoarea actualizare completă.</p>
          )}
          {!scored && p.hasRiskScore && p.noScoreReason && p.signalTypes.some((c) => riskCodes.has(c)) && (
            <p className="sig-note">{p.noScoreReason}</p>
          )}
          {scored && <h3>În afara scorului</h3>}
          <ul>
            {(scored ? others : p.signalTypes).map((code) => (
              <li key={code}>
                <Link href={p.signalsHref(code)}>{flagLabel(code)}</Link>
                <span>{FLAG_META[code]?.short}</span>
                <span className="n">{countWords(p.signalCounts[code] ?? 0, "apariție", "apariții")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Why a signal found adds no points (rf-2026.22, owner decision M24): one direct acquisition above the ceiling is
 * shown but never makes the pattern, which needs two cases; the rest are under their threshold.
 */
function quietWords(code: string, count: number): string {
  if (code === "da_above_ceiling" && count === 1) return "o singură achiziție directă peste plafon; se vede aici, dar nu intră în scor, tiparul cere cel puțin două cazuri";
  return "găsit, prea puțin ca să conteze";
}

/** The groups' totals against their ceiling: one bar each, the ceiling as one line across them. */
function SplitBars({ groups, role, counted }: { groups: { rows: SplitPair[]; total: number }; role: RiskRole; counted: number | null }) {
  const rows = groups.rows.slice(0, SPLIT_BARS).filter((g) => g.ceiling > 0);
  if (!rows.length) return null;
  const max = Math.max(1.05, ...rows.map((g) => g.totalRon / g.ceiling));
  const line = (1 / max) * 100;
  return (
    <figure className="sig-split">
      <figcaption>
        {groups.total > rows.length ? `Primele ${rows.length} din ${countWords(groups.total, "grup", "grupuri")}` : countWords(groups.total, "grup", "grupuri")}
        {counted != null && counted !== groups.total ? ` · ${formatInt(counted)} intră în scor` : ""} · față de plafon
      </figcaption>
      <ol style={{ ["--plafon" as string]: `${line}%` }}>
        {rows.map((g) => {
          const r = g.totalRon / g.ceiling;
          return (
            <li key={g.flagId}>
              <span className="track"><span className="bar" style={{ width: `${(r / max) * 100}%` }} /></span>
              <span className="lab">
                <EntityName id={g.partnerId} role={role === "authority" ? "supplier" : "authority"}>{cleanName(g.partnerName ?? "—")}</EntityName>
                {g.year ? ` · ${g.year}` : ""} · {countWords(g.count, "achiziție", "achiziții")} · <b>{ratioWords(r)}×</b>
                {/* rf-2026.22 (S5): recurring supply weighs nothing; it shows as what it is. */}
                {riskSplitRecurring({ total: g.totalRon, n: g.count, ceiling: g.ceiling, cpvClass: g.cpvClass }) && <> · {RISK_RECURRING_WORDS}</>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sig-plafon" aria-hidden="true">plafonul</p>
    </figure>
  );
}

/** Found against expected, two bars on one scale. */
function FoundVsExpected({ found, expected }: { found: number; expected: number }) {
  const max = Math.max(found, expected, 1);
  return (
    <div className="sig-vs" role="img" aria-label={`găsite ${found}, așteptate în jur de ${expected}`}>
      <span>așteptat</span><span className="bar exp" style={{ width: `${(expected / max) * 100}%` }} /><b>~{formatInt(expected)}</b>
      <span>găsit</span><span className="bar" style={{ width: `${(found / max) * 100}%` }} /><b>{formatInt(found)}</b>
    </div>
  );
}
