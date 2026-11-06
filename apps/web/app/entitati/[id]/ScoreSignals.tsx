import Link from "next/link";
import { flagLabel } from "@/lib/flags";
import { countWords } from "@/lib/ask/answer-text";
import { formatInt } from "@/lib/format";
import { RISK_BAND_MIN, type RiskCriterion, type ScoreParts } from "@/lib/risk-score";
import { SIGNAL_GUIDANCE } from "@/lib/signal-guidance";

/** The segments' fills, darkest first: told apart by lightness, in both themes (choropleth scale, as on /semnale). */
const SEGMENT_CLASS = ["c0", "c1", "c2", "c3", "c4"] as const;

/**
 * Where the score comes from, in the page's top (owner, 6 November 2026): the score split into its criteria on one
 * bar, each segment a link to that pattern's page on /semnale (where the cases, their records and what to check now
 * live; the entity page's signals section was removed), its name and points on hover, without a legend under it
 * (owner, same day). Found but under its threshold: named on hover over the bar's empty rest. The signals outside the
 * score are on /semnale only (owner, same day); without a score, why, and the signals found.
 */
export default function ScoreSignals({ hasRiskScore, score, parts, points, signalTypes, signalCounts, noScoreReason, signalsHref }: {
  hasRiskScore: boolean;
  score: number;
  parts: ScoreParts;
  points: Partial<Record<RiskCriterion, number>>;
  /** Every signal type of the entity in this role with at least one occurrence, criteria first. */
  signalTypes: string[];
  signalCounts: Record<string, number>;
  noScoreReason: string | null;
  signalsHref: (code: string) => string;
}) {
  const criteria = (Object.keys(points) as RiskCriterion[])
    .filter((c) => (points[c] ?? 0) > 0 && parts[c])
    .sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0));
  const scored = hasRiskScore && score > 0 && criteria.length > 0;
  const riskCodes = new Set<string>(Object.keys(SIGNAL_GUIDANCE));
  const quiet = signalTypes.filter((c) => riskCodes.has(c) && !(criteria as string[]).includes(c));
  const segment = (code: RiskCriterion) => SEGMENT_CLASS[Math.min(criteria.indexOf(code), SEGMENT_CLASS.length - 1)];
  const total = criteria.reduce((a, c) => a + (points[c] ?? 0), 0);
  // A card opens inwards near the bar's ends.
  const edge = (at: number) => (at < 25 ? " l" : at > 75 ? " r" : "");
  const links = (codes: string[]) => codes.map((c, i) => <span key={c}>{i > 0 && " · "}<Link href={signalsHref(c)}>{flagLabel(c)}</Link></span>);
  if (!scored && signalTypes.length === 0) return null;

  return (
    <div className="ent-sig">
      {scored ? <>
        <div className="ent-sig-bar">
          <span className="ent-track" aria-hidden="true" />
          {criteria.map((code, i) => {
            const left = criteria.slice(0, i).reduce((a, c) => a + (points[c] ?? 0), 0), width = points[code] ?? 0;
            const words = `${flagLabel(code)}: ${countWords(width, "punct", "puncte")} din ${formatInt(Math.round(score))}`;
            return (
              <Link key={code} href={signalsHref(code)} className={`ent-seg ${segment(code)}`} aria-label={words} style={{ left: `${left}%`, width: `${width}%` }}>
                <span className={`ent-sig-tip${edge(left + width / 2)}`} aria-hidden="true"><b>{flagLabel(code)}</b><span>{countWords(width, "punct", "puncte")} din {formatInt(Math.round(score))}</span></span>
              </Link>
            );
          })}
          {/* Found, but under the threshold from which it adds points: named on the empty rest of the bar. */}
          {quiet.length > 0 && (
            <span className="ent-rest" style={{ left: `${total}%`, width: `${Math.max(0, 100 - total)}%` }} tabIndex={0} aria-label={`Găsite, prea puțin ca să conteze: ${quiet.map((c) => flagLabel(c)).join(", ")}`}>
              <span className="ent-sig-tip r" aria-hidden="true"><b>Găsite, prea puțin ca să conteze</b>{quiet.map((c) => <span key={c}>{flagLabel(c)} · 0</span>)}</span>
            </span>
          )}
          <span className="ent-tick" style={{ left: `${RISK_BAND_MIN.moderat}%` }} aria-hidden="true" />
          <span className="ent-tick" style={{ left: `${RISK_BAND_MIN.puternic}%` }} aria-hidden="true" />
          <span className="ent-marker" style={{ left: `${Math.min(100, score)}%` }} aria-hidden="true" />
        </div>
        <div className="ent-sig-scale" aria-hidden="true">
          <span style={{ left: `${RISK_BAND_MIN.moderat / 2}%` }}>slab</span>
          <span style={{ left: `${(RISK_BAND_MIN.moderat + RISK_BAND_MIN.puternic) / 2}%` }}>moderat</span>
          <span style={{ left: `${(RISK_BAND_MIN.puternic + 100) / 2}%` }}>pronunțat</span>
        </div>
      </> : <>
        {quiet.length > 0 && <p className="ent-sig-out">{hasRiskScore ? noScoreReason ?? "Prea puțin ca să facă un scor." : "Scorul de risc se calculează la următoarea actualizare completă."}</p>}
        <p className="ent-sig-out">Semnale: {links(signalTypes)}</p>
      </>}
    </div>
  );
}
