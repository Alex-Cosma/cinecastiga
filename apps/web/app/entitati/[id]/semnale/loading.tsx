"use client";

import { useSearchParams } from "next/navigation";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import "@/app/semnale/case/case.css";

/*
 * The signals page while the server reads the case (a slow route: 0.22–0.30 s in production; owner, 6 November 2026).
 * Built from the case page's own classes (app/semnale/case/CasePage.tsx), so its rows keep their height: the crumb and
 * score pill, the score bar with its tabs, the headline, the lede. The address names the pattern, and with it the
 * shape: "Adunate sub plafon" (da_split, also the usual first pattern) has a three-line headline, the two-sided mirror
 * and its groups; every other pattern a one-line headline and its list. Lists reserve ten rows (they vary by entity).
 */

const COLS = [62, 48, 88, 74, 36, 92, 55, 70, 30, 84, 66, 45, 78, 58];
const GROUPS = [84, 78, 52, 86, 80, 64];

export default function EntitySignalsLoading() {
  const tip = useSearchParams().get("tip");
  const split = !tip || tip === "da_split";
  return (
    <Ghost className="sgc" name="entity-signals" label="Se încarcă semnalele…" wait="suspense">
      <div className="sgc-crumb" aria-hidden="true">
        <span><G.Line w="40ch" /><G.Line w="24ch" only="phone" /></span>
        <span className="cri-pill risk-none g-quiet"><G.Line inline w="104px" /></span>
      </div>
      <div className="sgc-score" aria-hidden="true">
        <div className="sgc-bar" />
        <ul className="sgc-tabs">
          {([["150px", "104px"], ["176px", "92px"]] as const).map(([b, s]) => (
            <li key={b}><span className="sgc-tab quiet"><i className="sw" /><span><b><G.Line w={b} /></b><small><G.Line w={s} /></small></span></span></li>
          ))}
          <li className="sgc-more"><span className="sgc-morebtn"><span className="t"><b><G.Line w="128px" /></b><small><G.Line w="96px" /></small></span></span></li>
        </ul>
      </div>
      <h1 className="sgc-title" aria-hidden="true">
        {split
          ? <><G.Line w="97%" /><G.Line w="94%" /><G.Line w="36%" /><G.Line w="88%" only="phone" /><G.Line w="92%" only="phone" /><G.Line w="40%" only="phone" /></>
          : <><G.Line w="62%" /><G.Line w="48%" only="phone" /></>}
      </h1>
      <p className="sgc-lede" aria-hidden="true">
        <G.Line w="58%" />
        <G.Line w="90%" only="phone" />
        {split && <G.Line w="44%" only="phone" />}
      </p>
      {split && (
        <div className="sgc-mirror" aria-hidden="true">
          <section className="sgc-side">
            <h2>Luate pe rând</h2>
            <p className="sgc-big"><span><G.Line inline w="1.4em" /></span><small><G.Line inline w="160px" /></small></p>
            <div className="sgc-ychart">
              <div className="sgc-yaxis" />
              <div className="sgc-cols">{COLS.map((h, i) => <span key={i} className="g-block" style={{ flex: 1, height: `${h}%`, borderRadius: "2px 2px 0 0" }} />)}</div>
            </div>
            <p className="sgc-cap"><G.Line w="96%" /><G.Line w="54%" /><G.Line w="88%" only="phone" /><G.Line w="46%" only="phone" /></p>
          </section>
          <section className="sgc-side">
            <h2><G.Line w="190px" /></h2>
            <p className="sgc-big"><span><G.Line inline w="1.9em" /></span><small><G.Line inline w="190px" /></small></p>
            <div className="sgc-groups">{GROUPS.map((h, i) => <div key={i}><span className="g-block" style={{ width: "100%", height: `${h}%`, borderRadius: "3px 3px 0 0" }} /></div>)}</div>
            <div className="sgc-glab">{GROUPS.map((_, i) => <span key={i}><G.Line w="86%" /><small><G.Line w="44%" /></small></span>)}</div>
            <p className="sgc-cap"><G.Line w="78%" /><G.Line w="40%" only="phone" /></p>
          </section>
        </div>
      )}
      <div className="sgc-cases-h" aria-hidden="true"><h2><G.Line w="150px" /></h2></div>
      <div className="sgc-cases" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => split ? (
          <details key={i} className="sgc-case" inert>
            <summary>
              <span className="sgc-who"><G.Line w={rankWidth(i, 64, 4, 36)} /><G.Line w="40%" only="phone" /><small><G.Line w="42%" /></small></span>
              <span className="sgc-mini"><span /><span className="t" /></span>
              <span className="sgc-sum"><G.Line inline w="104px" /></span>
              <span className="sgc-x"><G.Line inline w="40px" /></span>
            </summary>
          </details>
        ) : (
          <article key={i} className="sgc-row outside">
            <span className="sgc-who"><G.Line w={rankWidth(i, 64, 4, 36)} /><small><G.Line w="42%" /></small></span>
            <span className="sgc-sum"><G.Line inline w="96px" /></span>
            <span className="sgc-src"><G.Line inline w="64px" /></span>
          </article>
        ))}
      </div>
      <div className="sgc-guide" aria-hidden="true">
        <div><h2>Ce verifici</h2><p><G.Line w="92%" /><G.Line w="70%" only="phone" /></p></div>
        <div><h2><G.Line w="150px" /></h2><p><G.Line w="88%" /><G.Line w="64%" only="phone" /></p></div>
      </div>
      <p className="sgc-foot" aria-hidden="true">Un tipar e o pistă de verificat, nu o dovadă. Valori înregistrate, nu plăți. <G.Line inline w="120px" /></p>
    </Ghost>
  );
}
