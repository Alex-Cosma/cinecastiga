import { BUYER_REGIME_OVERRIDES, FLAGS_METHODOLOGY_VERSION } from "@seap/db";
import { DA_CEILING_ERAS } from "@seap/domain";
import DataCoverage from "@/components/DataCoverage";
import { coverageDate } from "@/lib/coverage";
import { AWARD_COUNTING_CAVEAT, FLAG_META, FLAG_ORDER, flagLabel } from "@/lib/flags";
import { formatInt } from "@/lib/format";
import { RISK_CRITERIA } from "@/lib/risk-score";
import { ROADS_RANKING_SPEC } from "@/lib/ask/site-links";
import { askHref, countyBreakdownHref } from "@/lib/discovery-links";
import { BRIEF_TERMS, GLOSSARY } from "@/lib/glossary";
import { EXAMPLE_TOWN, type BandCounts, type KindKey, type MethodologyFigures } from "@/lib/methodology-figures";

// The /metodologie page body: the v24 prototype (seap-filters-work/scratchpad/metodologie-20261105), ported once by
// port24.py and edited here since (classes mt-*, styles in metodologie-v24.css). The Regulile lane keeps v24's folds and
// carries every rule of the previous page (owner, 5 November 2026). MethodologyBehavior attaches the lanes, the stage,
// the ledger and the mixer to this markup.

const SUBJECT_LABEL: Record<string, string> = {
  da: "Per achiziție",
  authority: "Per autoritate",
  supplier: "Per furnizor",
  pair: "Per relație",
  award: "Per anunț de atribuire",
};

/** Who a pattern of the risk score applies to (RISK_CRITERIA, both roles or one). */
function scoreRoles(code: string): string | null {
  const inst = (RISK_CRITERIA.authority as readonly string[]).includes(code);
  const firm = (RISK_CRITERIA.supplier as readonly string[]).includes(code);
  return inst && firm ? "instituții și firme" : inst ? "instituții" : firm ? "firme" : null;
}

/** The version in force and its day; both change together with FLAGS_METHODOLOGY_VERSION (packages/db). */
const VERSION = FLAGS_METHODOLOGY_VERSION;
const VERSION_SINCE = "5 noiembrie 2026";
const CODE_URL = (path: string) => `https://github.com/Alex-Cosma/seap-new/blob/${VERSION}/${path}`;

const longDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : null;
const shortDate = (iso: string | null | undefined) => (iso ? coverageDate(iso) : null);

/** A share as the page writes it: whole percents, one decimal under 1%. */
function pct(part: number, total: number): string {
  if (!total) return "0%";
  const p = (100 * part) / total;
  return p >= 1 || p === 0 ? `${Math.round(p)}%` : `${p.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
}

const KIND_ROW_LABEL: Record<KindKey, string> = {
  comuna: "Comune",
  oras_municipiu: "Orașe și municipii",
  consiliu_judetean: "Consilii județene",
  sector: "Primăriile de sector",
  scoala: "Școli",
  spital: "Spitale (fără comparație)",
  ouai: "Organizațiile utilizatorilor de apă",
  alte: "Alte instituții",
};

/** "Locul 30 din 720": Comuna Exemplu's place among the town halls of half to double its population. */
function exampleRank(f: MethodologyFigures | null): string {
  return f?.peers ? `Locul ${formatInt(f.peers.higher + 1)} din ${formatInt(f.peers.n + 1)}` : "Locul N din M";
}

function BandBar({ label, b, who }: { label: string; b: BandCounts; who: string }) {
  const words = `${pct(b.none, b.total)} au scorul 0, ${pct(b.slab, b.total)} slab, ${pct(b.moderat, b.total)} moderat, ${pct(b.puternic, b.total)} pronunțat`;
  return (
    <div className="mt-row">
      <b>{formatInt(b.total)} {label}</b>
      <div className="mt-pbar" role="img" aria-label={`${who} cu cel puțin 10 achiziții directe: ${words}`}>
        <i className="mt-z" style={{ flex: String(b.none) }} />
        <i className="mt-l" style={{ flex: String(b.slab) }} />
        <i className="mt-m" style={{ flex: String(b.moderat) }} />
        <i className="mt-p" style={{ flex: String(b.puternic) }} />
      </div>
      <p className="mt-leg" aria-hidden="true"><span><i className="mt-z" />{pct(b.none, b.total)} au 0</span><span><i className="mt-l" />{pct(b.slab, b.total)} slab</span><span><i className="mt-m" />{pct(b.moderat, b.total)} moderat</span><span><i className="mt-p" />{pct(b.puternic, b.total)} pronunțat</span></p>
    </div>
  );
}

/** The non-zero scores of the institutions (10–100), by tens; one series, its numbers written above the bars. */
function ScoreHistogram({ kinds }: { kinds: MethodologyFigures["kinds"] }) {
  const bins = Array.from({ length: 9 }, (_, i) => kinds.reduce((sum, k) => sum + (k.histogram[i] ?? 0), 0));
  const top = Math.max(1, ...bins);
  const total = bins.reduce((a, b) => a + b, 0);
  const label = (i: number) => (i === 8 ? "90–100" : `${(i + 1) * 10}–${(i + 1) * 10 + 9}`);
  return (
    <figure className="mt-shist">
      <figcaption>Instituțiile cu scor (10 sau mai mult), după scor: {formatInt(total)}</figcaption>
      <div className="mt-shist-bars" role="img" aria-label={`Instituțiile cu scor, după scor: ${bins.map((n, i) => `${label(i)}: ${formatInt(n)}`).join("; ")}`}>
        {bins.map((n, i) => (
          <div key={i} title={`${label(i)}: ${formatInt(n)}`}>
            <span>{formatInt(n)}</span>
            <i style={{ height: `${Math.max(n ? 2 : 0, (100 * n) / top)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-shist-lab" aria-hidden="true">{bins.map((_, i) => <span key={i}>{(i + 1) * 10}</span>)}</div>
      <p className="mt-shist-note">Slab 10–39, moderat 40–67, pronunțat 68–100.</p>
    </figure>
  );
}

function PatternList({ codes }: { codes: readonly string[] }) {
  return <>{codes.map((c, i) => <span key={c}>{i ? ", " : ""}<a href={`#${c}`}>{flagLabel(c)}</a></span>)}</>;
}

export default function MethodologyStory({ figures }: { figures: MethodologyFigures | null }) {
  const f = figures;
  const peers = f?.peers ?? null;
  const riskDay = shortDate(f?.riskAt);
  const today = shortDate(new Date().toISOString());
  return (
    <div className="mt" id="metodologie">
      <div className="mt-prog" aria-hidden="true">
        <i id="prog-i" />
      </div>
      <div>
        <header className="mt-col">
          <h1>Cum citim banii publici</h1>
          <p className="mt-lede">Ce face o primărie cu banii publici și cum îți dai seama ce merită întrebat? Urmărim o comună inventată, Comuna Exemplu, mai ales în 2024.</p>
          <div className="mt-tools">
            <button type="button" className="mt-aa" aria-pressed="false"><b aria-hidden="true">Aa</b> Litere mai mari</button>
            <button type="button" className="mt-aa mt-allx" aria-pressed="false">Arată explicațiile</button>
            <a className="mt-tools-go" href="/cauta">Caută instituția sau firma ta</a>
          </div>
          <section className="mt-stage" aria-labelledby="stage-t" data-fr="1">
            <h2 id="stage-t" className="mt-sr">Scorul, în patru pași</h2>
            <div className="mt-frames">
              <figure className="mt-fr mt-fr1" data-n="1">
                <div className="mt-art">
                  <svg viewBox="0 0 680 190" role="img" aria-label="Desen: primăria comunei, parcul cu bănci și fișa achiziției de 38.000 lei">
                    <path d="M0 170h680" stroke="var(--line2)" strokeWidth="2" />
                    <path d="M0 170c90-26 170-30 260-14s180 18 270-6 120-14 150-8v28H0z" fill="var(--sunk)" />
                    <g transform="translate(250 60)">
                      <rect x="0" y="40" width="150" height="72" rx="3" fill="var(--surface)" stroke="var(--c4)" strokeWidth="2.5" />
                      <path d="M-10 42L75 6l85 36z" fill="var(--c4)" />
                      <rect x="62" y="74" width="26" height="38" rx="2" fill="var(--c2)" />
                      <rect x="16" y="56" width="22" height="20" rx="2" fill="var(--c0)" />
                      <rect x="112" y="56" width="22" height="20" rx="2" fill="var(--c0)" />
                      <path d="M75 6V-22" stroke="var(--ink2)" strokeWidth="2" />
                      <path d="M75-22h22v10H75z" fill="var(--orange)" />
                      <text x="75" y="34" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="var(--surface)" fontWeight="600">PRIMĂRIA</text>
                    </g>
                    <g transform="translate(470 116)">
                      <circle cx="40" cy="0" r="30" fill="var(--c2)" />
                      <circle cx="62" cy="14" r="20" fill="var(--c3)" />
                      <rect x="38" y="10" width="6" height="44" fill="var(--ink2)" />
                    </g>
                    <g fill="var(--c4)">
                      <rect x="560" y="148" width="54" height="6" rx="2" />
                      <rect x="564" y="154" width="4" height="14" />
                      <rect x="606" y="154" width="4" height="14" />
                      <rect x="560" y="136" width="54" height="5" rx="2" />
                    </g>
                  </svg>
                  <div className="mt-hcard mt-rise" aria-hidden="true">SEAP<b>38.000 lei</b></div>
                </div>
                <figcaption><b>1. O achiziție</b> <span>Comuna cumpără 40 de bănci pentru parc: 38.000 lei. Achiziția se înregistrează în SEAP, lista publică a achizițiilor; de acolo o citim. Ce nu trece pe acolo nu vedem.</span></figcaption>
              </figure>
              <figure className="mt-fr mt-fr2" data-n="2">
                <div className="mt-art">
                  <div className="mt-ru" role="img" aria-label="O riglă de la 0 la 500.000 lei: băncile, 38.000 lei, sunt o bară scurtă; plafonul pentru produse, 270.120 lei, e o linie portocalie mult mai la dreapta">
                    <span className="mt-ru-axis" />
                    <span className="mt-ru-t mt-s">0</span>
                    <span className="mt-ru-t mt-e">500.000 lei</span>
                    <span className="mt-ru-bar mt-grow" />
                    <span className="mt-ru-lab mt-late" style={{ left: "calc(7.6% + 10px)" }}>38.000: băncile din parc</span>
                    <span className="mt-ru-lim mt-draw" style={{ left: "54%" }}><b>plafon: 270.120 lei</b></span>
                    <span className="mt-ru-note mt-late" style={{ left: "calc(54% + 12px)" }}>mai sus: licitație sau altă procedură</span>
                  </div>
                </div>
                <figcaption><b>2. O limită</b> <span>Direct, fără licitație sau altă procedură, se poate cumpăra până la plafon: 270.120 lei la produse și servicii, 900.400 lei la lucrări. Peste el, legea cere o procedură.</span></figcaption>
              </figure>
              <figure className="mt-fr mt-fr3" data-n="3">
                <div className="mt-art">
                  <div className="mt-blocks mt-b3 mt-st3" role="img" aria-label="Trei comenzi de câte 185.000 lei puse una după alta; a doua și a treia trec de linia plafonului de 270.120 lei; adunate fac 555.000 lei, dublul plafonului">
                    <span className="mt-lim" style={{ left: "48.6%" }} aria-hidden="true"><b>plafon</b></span>
                    <span className="mt-bar mt-s1" style={{ left: "0", width: "calc(33.3% - 4px)" }} aria-hidden="true">185.000</span>
                    <span className="mt-bar mt-o mt-s2" style={{ left: "33.3%", width: "calc(33.3% - 4px)" }} aria-hidden="true">185.000</span>
                    <span className="mt-bar mt-o mt-s3" style={{ left: "66.6%", width: "calc(33.4% - 4px)" }} aria-hidden="true">185.000</span>
                    <span className="mt-sum mt-late2" aria-hidden="true">adunate: 555.000, peste plafon</span>
                  </div>
                </div>
                <figcaption><b>3. Un tipar</b> <span>Trei comenzi la aceeași firmă, fiecare sub plafon. Adunate, trec cu mult de plafon. Un obicei care se repetă e un tipar: ceva de verificat, nu o vină.</span></figcaption>
              </figure>
              <figure className="mt-fr mt-fr4" data-n="4">
                <div className="mt-art">
                  <div className="mt-grid100 mt-hero mt-anim" id="hg" aria-hidden="true">
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-g" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-o" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                    <i className="mt-e" />
                  </div>
                  <div className="mt-hnum" aria-hidden="true">
                    <b id="hnum">55</b>
                    <span>din 100</span>
                    <span className="mt-pill">moderat</span>
                  </div>
                </div>
                <figcaption><b>4. Un scor</b> <span>Fiecare tipar găsit umple pătrățele din 100. 55 e „moderat” (40–67): de verificat, nu vinovat. Sub 10 e „fără semnal în scor”: nu am găsit tipare destul de mari.</span></figcaption>
              </figure>
            </div>
            <div className="mt-stage-nav">
              <span className="mt-st-hint" aria-hidden="true">Pasul <b id="st-k">1</b> din 4</span>
              <ol className="mt-steps-n">
                <li><button type="button" aria-label="Pasul 1: o achiziție" aria-current="step">1</button></li>
                <li><button type="button" aria-label="Pasul 2: o limită">2</button></li>
                <li><button type="button" aria-label="Pasul 3: un tipar">3</button></li>
                <li><button type="button" aria-label="Pasul 4: un scor">4</button></li>
              </ol>
              <div className="mt-st-ctl">
                <button type="button" className="mt-st-play mt-ico" aria-pressed="false" aria-label="Pornește" title="Pornește"><svg className="mt-i-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg><svg className="mt-i-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg></button>
                <button type="button" className="mt-st-share mt-ico" aria-label="Trimite linkul" title="Trimite linkul"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg></button>
                <span className="mt-st-toast" aria-hidden="true" hidden>Link copiat</span>
              </div>
            </div>
            <p className="mt-sr mt-st-live" aria-live="polite" />
          </section>
          <p className="mt-meta">Comuna Exemplu, Mobilier Exemplu SRL, Firma A și Firma B nu există: numele și cifrele sunt inventate. Regulile sunt cele reale.</p>
          <nav className="mt-lanes" role="tablist" aria-label="Cum vrei să citești">
            <button type="button" role="tab" id="tab-scurt" aria-selected="true" aria-controls="lane-scurt" data-lane="scurt">Pe scurt<small>2 minute</small></button>
            <button type="button" role="tab" id="tab-poveste" aria-selected="false" aria-controls="lane-poveste" data-lane="poveste" tabIndex={-1}>Povestea<small>cam 20 de minute</small></button>
            <button type="button" role="tab" id="tab-reguli" aria-selected="false" aria-controls="lane-reguli" data-lane="reguli" tabIndex={-1}>Regulile<small>toate, cu formula</small></button>
          </nav>
        </header>
        <div className="mt-lane mt-col" id="lane-scurt" role="tabpanel" aria-labelledby="tab-scurt">
          <div className="mt-go-row mt-top">
            <a className="mt-go" href="/cauta">Caută instituția sau firma ta</a>
            <a className="mt-go2" href="/semnale">Vezi semnalele</a>
          </div>
          <p className="mt-also">Sau pornește de la <a href={countyBreakdownHref("Buzău")}>pe ce se duc banii într-un județ</a> ori de la o întrebare: <a href={askHref(ROADS_RANKING_SPEC)}>cine repară drumurile?</a></p>
          <nav className="mt-paths" aria-label="Scurtături">Pentru: <a href="#steps-t">oricine</a><a href="#citeaza">presă</a><a href="#alesi">aleși locali</a><a href="#firma">firme</a><a href="#raspuns">instituții</a><a href="#achizitor">achizitori</a><a href="#spitale">spitale</a><a href="#formula">formulă și praguri</a><a href="#cuvinte">cuvinte</a></nav>
          <section className="mt-brief" aria-labelledby="pe-scurt">
            <h2 id="pe-scurt">Pe scurt</h2>
            <p className="mt-sub">Opt lucruri de știut.</p>
            <ul className="mt-points">
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span><b>Ce e site-ul:</b> arată achizițiile instituțiilor publice, așa cum sunt înregistrate în SEAP (lista publică în care instituțiile își trec achizițiile), și <b>tiparele</b> care merită verificate: obiceiuri care se repetă.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span>Sumele sunt <b>contractate</b>, nu plătite: cât s-a semnat sau comandat, fără TVA, nu cât s-a dat sau ce s-a livrat. Plățile le afli de la instituție.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span><b>Plafonul</b> e limita sub care se cumpără direct, fără licitație sau altă <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: procedură">procedură</button><span className="mt-def" hidden>licitație, procedură simplificată sau alt mod de achiziție cu oferte în concurență, cerut de lege peste plafon</span>: 270.120 lei la produse și servicii, 900.400 lei la lucrări, fără TVA. Peste el, legea cere o procedură. Legea judecă nevoia estimată pe un an, nu fiecare comandă.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span>Un <b>semnal</b> e un tipar marcat pe site ca lucru de verificat, nu o acuzație. Lângă el stă explicația obișnuită: nevoi apărute pe rând, bani veniți târziu, piață mică.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span><b>Scorul</b>, de la 0 la 100, spune cât de mari și de repetate sunt tiparele găsite: 10–39 slab, 40–67 moderat, 68–100 pronunțat; sub 10, „fără semnal în scor”. Îl calculăm doar de la 10 achiziții directe. 60 nu înseamnă 60% șanse de corupție. <b>Sub 10 nu înseamnă că totul e bine</b>: doar că tiparele pe care le căutăm lipsesc sau sunt mici.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span>Trei tipare despre același lucru (plafonul) <b>nu se numără de trei ori</b>: cel mai mare contează întreg, celelalte doar cu 40%. Un tipar de alt fel (decembrie) ia doar o parte din ce a rămas până la 100; de aceea scorul nu trece de 100.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span>La o <b>firmă</b>, suma se compară cu tot ce a câștigat ea direct: 1,5 milioane sunt un sfert pentru o firmă căreia i s-au atribuit direct 6 milioane și 0,6% pentru una cu 240 de milioane. Un contract luat de trei firme împreună se împarte egal între ele. Plafonul e obligația cumpărătorului, nu a firmei.</span></li>
              <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg><span>Comparația e un loc: „{exampleRank(f)} · primăriile cu 4.500–18.000 de locuitori” pune o primărie doar lângă <b>primăriile de mărime apropiată</b> (de la jumătate până la dublul populației ei); o firmă, lângă firmele din domeniul ei principal, dacă sunt cel puțin 100. <b>Spitalele nu au comparație.</b> Apare doar la scor moderat sau pronunțat.</span></li>
            </ul>
            <p className="mt-sub mt-terms-h">Și trei cuvinte din tabele.</p>
            <dl className="mt-terms">
              {BRIEF_TERMS.map((id) => (
                <div key={id} id={id}>
                  <dt>{GLOSSARY[id].title}</dt>
                  <dd>{GLOSSARY[id].text}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="mt-mini" aria-labelledby="mini-t">
            <h2 id="mini-t">Comuna Exemplu, în patru rânduri</h2>
            <p className="mt-mini-cap">Punctele fiecărui tipar, ca pe pagina comunei</p>
            <ol className="mt-mini-l">
              <li><span>Trei comenzi de mobilier la aceeași firmă, adunate, trec de plafon</span><b>28</b></li>
              <li><span>7 achiziții imediat sub plafon, față de 3 de așteptat</span><b>7</b></li>
              <li><span>Două achiziții directe declarate peste plafon, în două luni</span><b>7</b></li>
              <li className="mt-dec"><span>35% din banii contractați direct în 2024, în decembrie</span><b>13</b></li>
            </ol>
            <p className="mt-mini-tot"><b>55</b><span>din 100 · moderat (40–67)</span><a href="#anul">Cum se ajunge aici</a></p>
            <p className="mt-leg" aria-hidden="true"><span><i />tipare despre plafon</span><span><i className="mt-o" />decembrie, alt fel de tipar</span></p>
            <p className="mt-how">Al doilea și al treilea sunt tot despre plafon, ca primul, deci cântăresc mai puțin. Când citezi, citează scorul și tiparele, nu punctele.</p>
          </section>
          <section className="mt-steps3" aria-labelledby="steps-t">
            <h2 id="steps-t">Ai găsit un semnal? Trei pași</h2>
            <ol>
              <li><span><b>Deschide înregistrările.</b> Pe pagina instituției, lângă semnal: ce s-a cumpărat, când, de la cine, cu link spre SEAP.</span></li>
              <li><span><b>Cere documentele.</b> <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: Legea 544/2001">Legea 544/2001</button><span className="mt-def" hidden>legea accesului la informațiile publice: orice om poate cere documente de la orice instituție, iar instituția trebuie să răspundă</span> te lasă să ceri <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: referatele de necesitate">referatele de necesitate</button><span className="mt-def" hidden>documentele în care instituția scrie de ce are nevoie de ce cumpără</span>, <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: notele justificative">notele justificative</button><span className="mt-def" hidden>documentele în care instituția arată cum a ales firma și cum a stabilit valoarea</span> și <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: programul anual al achizițiilor">programul anual al achizițiilor</button><span className="mt-def" hidden>lista achizițiilor planificate pe anul în curs, cu valorile estimate</span>. Răspuns în 10 zile (30 dacă cererea e complicată). <a href="#req">Model de cerere</a>. Ca ales local, le ceri în comisie sau în ședință: <a href="#alesi">vezi „aleși locali”</a>.</span></li>
              <li><span><b>Citează tiparul, nu scorul.</b> „Trei comenzi adunate peste plafon, de verificat”, nu „printre cele mai riscante”. <a href="#citeaza">Așa da, așa nu</a>.</span></li>
            </ol>
          </section>
          <section className="mt-roles" aria-labelledby="roles-t">
            <h2 id="roles-t">Pe rolul tău</h2>
            <details suppressHydrationWarning className="mt-sock mt-role" id="citeaza">
              <summary>Ești jurnalist?</summary>
              <div className="mt-rb">
                <p>Ca fapt, citezi înregistrarea din SEAP și tiparul. Scorul e un indicator: spune de unde e și din ce zi. Înainte să publici, cere punctul de vedere al instituției și al firmei.</p>
                <div className="mt-write">
                  <div className="mt-yes"><b>Așa da</b>„Potrivit datelor din SEAP, Comuna Exemplu a făcut trei comenzi de mobilier la aceeași firmă care, adunate, trec de plafon. Plafonul legal privește valoarea estimată; e un tipar de verificat, nu o constatare: am cerut primăriei documentele.”</div>
                  <div className="mt-yes"><b>Așa da, despre o firmă</b>„Un sfert din valoarea contractelor directe atribuite Firmei A din 2018 încoace a venit din achiziții declarate peste plafon, la două primării. Plafonul e obligația cumpărătorului; am cerut punctul de vedere al primăriilor și al firmei.”</div>
                  <div className="mt-no"><b>Așa nu</b>„Comuna Exemplu, printre cele mai riscante primării din țară.” Scorul nu e o vină, nu e o probă. În titlu, scrie tiparul, nu scorul sau locul în clasament.</div>
                </div>
                <p className="mt-cite" id="cite-s">Comuna Exemplu: trei comenzi de mobilier la aceeași firmă, adunate peste plafon (tipar de verificat); scor 55 din 100 (moderat), un indicator, nu o constatare; versiunea metodologiei {VERSION}; scor calculat la {riskDay ?? "…"}, din datele SEAP de până atunci; cinecâștigă?, https://cinecastiga.ro/entitati/… (adresa paginii), consultat la {today}.</p>
                <button type="button" className="mt-btn" data-copy="cite-s">Copiază modelul de citare</button>
                <p className="mt-how">Pagina arată mereu datele cele mai noi: păstrează fișierul cu înregistrările descărcat în ziua citării.</p>
              </div>
            </details>
            <details suppressHydrationWarning className="mt-sock mt-role" id="alesi">
              <summary>Ești ales local?</summary>
              <div className="mt-rb">
                <p>Ceri în comisie, în ședința de consiliu sau printr-o întrebare scrisă: programul anual al achizițiilor, referatele de necesitate, notele justificative și hotărârea de rectificare, cu datele lor.</p>
                <div className="mt-write">
                  <div className="mt-yes"><b>Așa da, în ședință</b>„Trei comenzi de mobilier la aceeași firmă, adunate, trec de plafon. Cer referatele de necesitate și notele justificative.”</div>
                  <div className="mt-no"><b>Așa nu</b>„Primăria are scor 55, e printre cele mai riscante.” Scorul nu e o vină, nu e o probă.</div>
                </div>
                <p>Primăria ta e „fără semnal în scor”? N-am găsit tiparele noastre destul de mari; nu înseamnă că totul e în regulă. Documentele se pot cere oricum.</p>
                <p><b>Model de întrebare scrisă în consiliu</b></p>
                <p className="mt-cite" id="intreb-s">Către Primăria Comunei Exemplu. În calitate de consilier local, vă rog să-mi comunicați, în scris: programul anual al achizițiilor publice pe 2024, cu anexa privind achizițiile directe; referatele de necesitate și, acolo unde normele le cer, notele justificative pentru achizițiile directe nr. … din data de …; hotărârea de rectificare bugetară din … și data publicării ei. Vă rog să precizați, pentru fiecare, data la care a fost întocmit documentul.</p>
                <button type="button" className="mt-btn" data-copy="intreb-s">Copiază întrebarea</button>
              </div>
            </details>
            <details suppressHydrationWarning className="mt-sock mt-role" id="spitale">
              <summary>Ești la un spital?</summary>
              <div className="mt-rb">
                <p>Spitalele <b>nu au comparație</b>: nu vezi „Locul X din N”, pentru că un spital județean și unul orășenesc nu se aseamănă.</p>
                <ul>
                  <li>Produsele medicale (CPV 33) nu intră la „Declarate directe, peste plafon” și nici la „Adunate, trec de plafon”.</li>
                  <li>Nici grupurile de cel puțin 12 comenzi mărunte la același furnizor (în medie sub 10% din plafon).</li>
                  <li>Amândouă apar ca <b>„comenzi repetate, fără acord-cadru”</b>, fără puncte: legea cere ca nevoia unui an să fie cumulată, dar asta ține de planificare; nu e o pistă.</li>
                </ul>
                <p>Ai o explicație? <a href="#raspuns">Scrie-ne</a>, cu documentele: răspundem în 10 zile lucrătoare.</p>
              </div>
            </details>
            <details suppressHydrationWarning className="mt-sock mt-role" id="furnizori-spital">
              <summary>Furnizezi unui spital?</summary>
              <div className="mt-rb">
                <ul>
                  <li>Produsele medicale (CPV 33) declarate directe peste plafon sau comandate des nu-ți aduc puncte; le vezi în înregistrări.</li>
                  <li>Dacă un spital îți aduce cel puțin 70% din vânzările directe, poți avea „Un singur client public mare”.</li>
                  <li>Când primele două instituții au sub 60% din aceste achiziții, tiparele despre plafon cântăresc cel mult 30 de puncte: plafonul e obligația spitalului.</li>
                  <li>Te comparăm cu firmele din domeniul tău principal, dacă sunt cel puțin 100.</li>
                </ul>
                <p>Pragurile: <a href="#praguri-firme">în „Regulile”, pentru firme</a>.</p>
              </div>
            </details>
          </section>
          <div className="mt-go-row">
            <button type="button" className="mt-go" data-go="poveste">Citește povestea <span className="mt-go-t">7 capitole și o ramură, cam 20 de minute</span></button>
            <button type="button" className="mt-go2" data-go="reguli">Regulile și formula</button>
          </div>
          <p className="mt-how" style={{ marginTop: "14px" }}>Cine face site-ul: <a href="#despre">despre cinecâștigă?</a></p>
        </div>
        <div className="mt-lane" id="lane-poveste" role="tabpanel" aria-labelledby="tab-poveste" hidden>
          <div className="mt-col">
            <p className="mt-jumpnote" id="jumpnote" hidden />
            <details suppressHydrationWarning className="mt-toc-wrap">
              <summary>Sari la un capitol</summary>
              <nav aria-label="Capitole">
                <ul className="mt-toc">
                  <li><a href="#urma">1. O achiziție</a></li>
                  <li><a href="#plafon">2. Plafonul</a></li>
                  <li><a href="#adunam">3. Cum adunăm</a></li>
                  <li><a href="#anul">4. Tiparele Comunei Exemplu</a></li>
                  <li><a href="#scorul">5. Cum se face scorul</a></li>
                  <li><a href="#fata">6. Cu cine comparăm</a></li>
                  <li><a href="#marime">Ramură: firme mari, firme mici</a></li>
                  <li><a href="#pista">7. Ce faci cu un semnal</a></li>
                  <li><a href="#epilog">Epilog</a></li>
                  <li><a href="#cuvinte">Cuvintele din pagină</a></li>
                  <li><a href="#detalii">Toate regulile</a></li>
                </ul>
              </nav>
            </details>
          </div>
          <section className="mt-ch mt-col mt-stack" id="urma" aria-labelledby="h-urma">
            <h2 id="h-urma"><span className="mt-ch-n">Capitolul 1</span>Fiecare achiziție are o fișă</h2>
            <svg className="mt-scene mt-sm" viewBox="0 0 680 120" role="img" aria-label="Desen: Ioana, reportera, la birou, cu laptopul deschis pe SEAP și un carnet">
              <path d="M0 108h680" stroke="var(--line2)" strokeWidth="2" />
              <rect x="150" y="70" width="380" height="8" rx="3" fill="var(--c4)" />
              <rect x="170" y="78" width="7" height="30" fill="var(--c4)" />
              <rect x="503" y="78" width="7" height="30" fill="var(--c4)" />
              <g transform="translate(236 14)">
                <circle cx="30" cy="14" r="13" fill="var(--c2)" />
                <path d="M6 58c0-22 10-32 24-32s24 10 24 32z" fill="var(--c3)" />
              </g>
              <g transform="translate(330 22)">
                <rect x="4" y="0" width="92" height="46" rx="4" fill="var(--surface)" stroke="var(--line2)" strokeWidth="2" />
                <rect x="0" y="46" width="100" height="4" rx="2" fill="var(--line2)" />
                <path d="M14 14h60M14 24h40M14 34h50" stroke="var(--c2)" strokeWidth="3" strokeLinecap="round" />
              </g>
              <g transform="translate(456 36)">
                <rect width="52" height="34" rx="3" fill="var(--surface)" stroke="var(--line2)" strokeWidth="2" />
                <path d="M8 11h36M8 20h24" stroke="var(--orange)" strokeWidth="3" strokeLinecap="round" />
              </g>
            </svg>
            <p>Comuna Exemplu are 9.000 de locuitori. Ioana, reporteră la ziarul local, vrea să afle pe ce merg banii comunei.</p>
            <p>Prima achiziție pe care o găsește: în martie, primăria a cumpărat bănci pentru parcul din centru. Ca orice instituție publică, a trecut-o în SEAP, registrul public al achizițiilor. De acolo o luăm noi.</p>
            <figure className="mt-fig">
              <span className="mt-stamp">Achiziție directă</span>
              <dl className="mt-receipt">
                <dt>Cine cumpără</dt>
                <dd>Comuna Exemplu</dd>
                <dt>De la cine</dt>
                <dd>Mobilier Exemplu SRL</dd>
                <dt>Ce</dt>
                <dd>40 de bănci pentru parc</dd>
                <dt>Când</dt>
                <dd>12 martie 2024</dd>
                <dt className="mt-vis">Valoare declarată în SEAP</dt>
                <dd className="mt-big">38.000 lei <small>fără TVA</small></dd>
              </dl>
              <figcaption>Așa arată o înregistrare, simplificat. Pe site, fiecare are și linkul spre sursa din SEAP.</figcaption>
            </figure>
            <p>Instituțiile cumpără în mai multe feluri; în poveste le împărțim în două. <b>Achiziția directă</b> e pentru sume sub plafon: instituția cere una sau mai multe oferte, de multe ori din catalogul SEAP, și alege firma, fără procedură. Are nevoie de două acte: un <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: referat de necesitate">referat de necesitate</button><span className="mt-def" hidden>documentul în care instituția scrie de ce are nevoie de ce cumpără</span> și, acolo unde normele o cer, o <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: notă justificativă">notă justificativă</button><span className="mt-def" hidden>documentul în care instituția arată cum a ales firma și cum a stabilit valoarea</span>.</p>
            <p><b>Procedura</b> e pentru sume mai mari: licitație, procedură simplificată sau altele, de obicei cu oferte în concurență.</p>
            <div className="mt-key">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <p><b>Cei 38.000 de lei sunt o sumă contractată, nu una plătită.</b> Poate fi plătit mai târziu, în parte sau deloc. Plata unui contract o afli de la instituție; bugetul unei primării, pe <a href="https://transparenta-bugetara.gov.ro">transparenta-bugetara.gov.ro</a>. Sumele de aici sunt cele declarate fără TVA; în buget apar cu TVA.</p>
            </div>
            <ul className="mt-plain mt-small">
              <li><b>Ce date avem:</b> din 2018 până azi, achizițiile directe și contractele din <a href="https://e-licitatie.ro">SEAP</a>, anunțurile europene din <a href="https://ted.europa.eu">TED</a> (jurnalul Uniunii Europene pentru licitațiile mari), bilanțurile firmelor (<a href="https://mfinante.gov.ro">Ministerul Finanțelor</a>), administratorii firmelor (<a href="https://www.onrc.ro">Registrul Comerțului</a>) și populația din <a href="https://www.recensamantromania.ro">recensământul din 2021</a>.</li>
              <li><b>Cât de des:</b> datele se actualizează în fiecare noapte, scorurile o dată pe săptămână; la o schimbare a metodologiei, scorurile se refac imediat, cu versiune nouă. {f?.dataAt ? <> Ultima actualizare: datele, {longDate(f.dataAt)}; scorurile, {longDate(f.riskAt)} (<span className="mt-nw">{VERSION}</span>).</> : null}</li>
              <li><b>Ce nu vedem:</b> ce nu trece prin SEAP, plățile, ce s-a livrat de fapt. O singură achiziție directă peste plafon nu intră în scor, pentru că tiparul cere cel puțin două cazuri; o vezi în înregistrări, ca și achizițiile de peste 2 milioane de lei. O achiziție împărțită între firme diferite nu o prindem. În capitolul 7 îți arătăm ce documente să ceri ca să afli.</li>
            </ul>
          </section>
          <section className="mt-ch mt-col mt-stack" id="plafon" aria-labelledby="h-plafon">
            <h2 id="h-plafon"><span className="mt-ch-n">Capitolul 2</span>Limita până la care poți cumpăra direct</h2>
            <p>Ioana se uită la suma băncilor: 38.000 de lei. Se întreabă până la ce sumă poate primăria să cumpere fără licitație.</p>
            <p>Achiziția directă are o limită: <b>plafonul</b>. Peste plafon, instituția trebuie să organizeze o procedură. Limita depinde de ce cumperi:</p>
            <figure className="mt-fig">
              <div className="mt-ruler" role="img" aria-label="O riglă de la 0 la 1 milion de lei: băncile, 38.000 lei, sunt mult sub plafonul pentru produse și servicii, de 270.120 lei; plafonul pentru lucrări e 900.400 lei">
                <div className="mt-axis" aria-hidden="true" />
                <div className="mt-tick mt-start" style={{ left: "0" }} aria-hidden="true">
                  <span>0</span>
                </div>
                <div className="mt-tick" style={{ left: "50%" }} aria-hidden="true">
                  <span>500.000</span>
                </div>
                <div className="mt-tick mt-end" style={{ left: "calc(100% - 2px)" }} aria-hidden="true">
                  <span>1 mil. lei</span>
                </div>
                <div className="mt-lim" style={{ left: "27%" }} aria-hidden="true">
                  <b>1</b>
                </div>
                <div className="mt-lim" style={{ left: "90%" }} aria-hidden="true">
                  <b>2</b>
                </div>
                <div className="mt-pin" style={{ left: "3.8%" }} aria-hidden="true">
                  <span>băncile din parc</span>
                </div>
              </div>
              <ul className="mt-legend-l">
                <li><b aria-hidden="true">1</b> Produse și servicii: <b className="mt-nw">270.120 lei</b></li>
                <li><b aria-hidden="true">2</b> Lucrări: <b className="mt-nw">900.400 lei</b></li>
              </ul>
              <figcaption>Plafoanele de azi, fără TVA (Legea 98/2016, art. 7 alin. 5, cu valorile din Legea 208/2022, de la 10 septembrie 2022). Între iunie 2018 și septembrie 2022 erau 135.060 lei și 450.200 lei.</figcaption>
            </figure>
            <p className="mt-how">Plafonul se socotește pe achiziții de același fel. Legea vorbește de „același obiect”; noi îl aproximăm prin <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: clasa CPV">clasa CPV</button><span className="mt-def" hidden>CPV e codul european al lucrului cumpărat; clasa = primele 4 cifre, de exemplu 3916, mobilier pentru școli</span>. Băncile din parc au altă clasă decât mobilierul pentru școli, deci nu le adunăm.</p>
            <div className="mt-ask">
              <p className="mt-q"><span className="mt-lead">Ce crezi?</span> Comuna vrea un acoperiș nou la școală, de 400.000 lei. Îl poate cumpăra direct?</p>
              <div className="mt-opts" role="group" aria-label="Variante">
                <button type="button" className="mt-opt" aria-pressed="false" data-a="no">Nu, trece de plafon</button>
                <button type="button" className="mt-opt" aria-pressed="false" data-a="yes">Da</button>
              </div>
              <div className="mt-reveal" hidden data-for="no">
                <p className="mt-tone mt-no">Răspunsul e da: un acoperiș e sub plafonul pentru lucrări.</p>
                <p>Un acoperiș e o <b>lucrare</b>, nu un produs. Pentru lucrări plafonul e 900.400 lei, deci 400.000 lei încap. Ce cumperi schimbă limita.</p>
              </div>
              <div className="mt-reveal" hidden data-for="yes">
                <p className="mt-tone mt-ok">Da, se poate.</p>
                <p>Un acoperiș e o <b>lucrare</b>, iar pentru lucrări plafonul e 900.400 lei. Dacă ar fi fost calculatoare de 400.000 lei, ar fi trecut de plafonul pentru produse.</p>
              </div>
            </div>
          </section>
          <section className="mt-ch mt-col mt-stack" id="adunam" aria-labelledby="h-adunam">
            <h2 id="h-adunam"><span className="mt-ch-n">Capitolul 3</span>Cum adunăm sumele</h2>
            <p>Ioana vrea să adune tot ce a contractat comuna. Înainte, află ce se adună și ce nu.</p>
            <p>Un total e util doar dacă știi ce adună. Trei reguli contează cel mai mult:</p>
            <ul className="mt-plain">
              <li><b>Nu adunăm sumele greu de crezut.</b> O achiziție directă de peste 2 milioane de lei e de obicei o greșeală la introducere. Nu o putem verifica, așa că o arătăm, dar nu o adunăm.</li>
              <li><b>Nu adunăm acordurile-cadru.</b> Un acord-cadru e o înțelegere pe câțiva ani care spune doar cât s-ar putea cumpăra, cel mult. Adunăm contractele încheiate pe baza lui.</li>
              <li><b>Un contract câștigat de mai multe firme se împarte.</b></li>
            </ul>
            <div className="mt-ask">
              <p className="mt-q"><span className="mt-lead">Ce crezi?</span> Trei firme câștigă împreună un contract de 9 milioane de lei. Cât socotim la fiecare?</p>
              <div className="mt-opts" role="group" aria-label="Variante">
                <button type="button" className="mt-opt" aria-pressed="false" data-a="9">9 milioane fiecare</button>
                <button type="button" className="mt-opt" aria-pressed="false" data-a="3">3 milioane fiecare</button>
                <button type="button" className="mt-opt" aria-pressed="false" data-a="?">Nu se poate ști</button>
              </div>
              <div className="mt-reveal" hidden data-for="9">
                <p className="mt-tone mt-no">Nu: așa ar ieși 27 de milioane dintr-un contract de 9.</p>
                <p>Împărțim în mod egal: <b>3 milioane fiecare</b>. Adunate, refac exact contractul.</p>
              </div>
              <div className="mt-reveal" hidden data-for="3">
                <p className="mt-tone mt-ok">Da, 3 milioane fiecare.</p>
                <p>SEAP nu publică cât ia fiecare firmă, așa că împărțim în mod egal. Adunate, cele trei părți refac contractul. Nu spun ce a încasat fiecare.</p>
              </div>
              <div className="mt-reveal" hidden data-for="?">
                <p className="mt-tone mt-ok">Ai dreptate că partea reală nu se știe.</p>
                <p>SEAP nu o publică. Ca să nu numărăm contractul de trei ori, îl împărțim în mod egal: <b>3 milioane fiecare</b>.</p>
              </div>
            </div>
          </section>
          <section className="mt-ch" id="anul" aria-labelledby="h-anul">
            <div className="mt-col mt-stack" style={{ marginBottom: "32px" }}>
              <h2 id="h-anul"><span className="mt-ch-n">Capitolul 4</span>Tiparele Comunei Exemplu</h2>
              <p>Ioana trece de la o achiziție la toate. Pe pagina comunei găsește patru tipare și le ia pe rând.</p>
              <p>Din 2018 încoace, Comuna Exemplu a făcut 210 achiziții directe, de 10,8 milioane de lei în total. Scorul privește toți anii din 2018 încoace, nu doar unul, și doar achizițiile directe. Le urmărim mai ales în 2024, anul în care apar cele mai multe <b>tipare</b> ale ei: lucruri care o dată nu spun nimic, dar repetate merită verificate.</p>
              <p>Un tipar singur poate da cel mult 60 de puncte. Comuna are tipare de două feluri: despre plafon și despre decembrie. <span aria-hidden="true">Caseta <b>Scorul Comunei Exemplu</b> arată cum crește scorul pe măsură ce afli tiparele: lângă text pe calculator, într-o bandă sus pe telefon. Punctele fiecărui tipar, așa cum le arată pagina comunei, apar la capăt.</span><span className="mt-sr">După fiecare tipar vei auzi scorul nou; punctele fiecărui tipar sunt la capătul capitolului.</span></p>
              <p><button type="button" className="mt-btn mt-allcalc" aria-pressed="false">Arată toate calculele</button></p>
            </div>
            <div className="mt-year">
              <aside className="mt-ledger" aria-hidden="true">
                <h3>Scorul Comunei Exemplu</h3>
                <p className="mt-lg-how">așa crește scorul</p>
                <p className="mt-lg-cap">Scorul comunei, așa crește</p>
                <div className="mt-tot">
                  <b id="lg-tot">55</b>
                  <span>din 100</span>
                </div>
                <div className="mt-gauge">
                  <i id="lg-g" style={{ width: "55%" }} />
                </div>
                <p className="mt-band" id="lg-band">scor moderat</p>
                <p className="mt-last" id="lg-last">toate cele patru tipare</p>
                <ol>
                  <li className="mt-on" data-l="1"><span>Adunate, trec de plafon</span><b>28</b></li>
                  <li className="mt-on" data-l="2"><span>Multe sume imediat sub plafon</span><b>7</b><small>același fel ca primul: intră cu 40%</small></li>
                  <li className="mt-on" data-l="3"><span>Declarate directe, peste plafon</span><b>7</b><small>același fel ca primul: intră cu 40%</small></li>
                  <li className="mt-on" data-l="4"><span>Mulți bani contractați în decembrie</span><b>13</b><small>alt fel: ia din ce a rămas</small></li>
                </ol>
                <p className="mt-lg-split">Punctele, ca pe pagina comunei: 28 + 7 + 7 + 13 = 55</p>
              </aside>
              <div className="mt-events">
                <article className="mt-ev" data-step="1" aria-labelledby="e1">
                  <span className="mt-when" aria-hidden="true">Martie – mai</span>
                  <h3 id="e1"><span className="mt-sr">Martie – mai: </span>Trei comenzi de mobilier, la aceeași firmă</h3>
                  <p>Comuna cumpără mobilier pentru trei școli, de fiecare dată direct de la Mobilier Exemplu SRL: de trei ori câte 185.000 de lei. Fiecare comandă, luată singură, e sub plafonul pentru produse. Adunate, fac 555.000 de lei.</p>
                  <figure className="mt-fig">
                    <div className="mt-blocks mt-b3" role="img" aria-label="Trei comenzi de câte 185.000 lei, puse una după alta: 555.000 lei, peste dublul plafonului de 270.120 lei">
                      <span className="mt-lim" style={{ left: "48.6%" }} aria-hidden="true"><b>plafon</b></span>
                      <span className="mt-bar" style={{ left: "0", width: "calc(33.3% - 4px)" }} aria-hidden="true">185.000</span>
                      <span className="mt-bar" style={{ left: "33.3%", width: "calc(33.3% - 4px)" }} aria-hidden="true">185.000</span>
                      <span className="mt-bar" style={{ left: "66.6%", width: "calc(33.4% - 4px)" }} aria-hidden="true">185.000</span>
                    </div>
                    <figcaption>Comenzile puse una după alta, față de plafonul de 270.120 lei. Adunate, fac puțin peste dublul plafonului.</figcaption>
                  </figure>
                  <div className="mt-found">
                    <p className="mt-name">Adunate, trec de plafon</p>
                    <p className="mt-gl">comenzi mici care, adunate, trec de limită</p>
                    <p className="mt-plainline">Adunate, cele trei comenzi fac de două ori plafonul. E singurul grup de felul ăsta al comunei, dar e mare față de cât cumpără ea direct: scorul comunei ajunge la <b>30</b>, jumătate din cât poate da un tipar singur. Răspunsul e în documente.</p>
                    <p className="mt-plainline">Trei <b>lucrări</b> de câte 185.000 de lei n-ar apărea: plafonul de lucrări e 900.400 lei.</p>
                    <details suppressHydrationWarning className="mt-sock">
                      <summary><span className="mt-sumw">Vezi calculul<span className="mt-sumn">: Adunate, trec de plafon</span></span></summary>
                      <ul className="mt-calc">
                        <li>Adunăm achizițiile de același fel (aceeași clasă după <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: codul CPV">codul CPV</button><span className="mt-def" hidden>codul european al lucrului cumpărat; clasa = primele 4 cifre, de exemplu 3916, mobilier pentru școli</span>) de la aceeași firmă, din același an; cel puțin 3.</li>
                        <li>Un grup contează de la 1,2 ori plafonul (324.144 lei), crescând în linie dreaptă până la dublu (540.240 lei), de unde contează întreg: ponderea = (suma ÷ plafon − 1,2) ÷ 0,8, tăiată între 0 și 1; suma grupului înmulțită cu ponderea e ceea ce raportăm la valoarea directă a comunei. Aici: 555.000 ÷ 270.120 = 2,05, deci ponderea e 1 și grupul contează întreg.</li>
                        <li>Legea judecă necesarul estimat pe tot anul, oricare ar fi firma; noi adunăm doar comenzile de același fel la aceeași firmă, pe valorile contractate.</li>
                        <li>Nu intră produsele medicale (CPV 33) și nici grupurile de cel puțin 12 comenzi mărunte (în medie sub 10% din plafon): apar ca „comenzi repetate, fără acord-cadru”, fără puncte.</li>
                        <li>Toate grupurile comunei, din toți anii, se adună și se raportează la tot ce a contractat direct comuna din 2018 încoace; aici e un singur grup: 555.000 din 10,8 milioane = <b>5,1%</b>. De ce toți anii: scara comunei e mai stabilă așa; un an cu puține achiziții n-ar umfla tiparul, iar unul cu multe nu l-ar ascunde.</li>
                        <li>Scara: sub 1% grupul nu contează; de la 1% la 2% nivelul urcă de la 0 la 1; 8% dau nivelul 2, 20% nivelul 3; între ele, proporțional. 1 + (5,1 − 2) ÷ (8 − 2) = <b>1,52</b>.</li>
                        <li>Cu puține dovezi nivelul e ținut jos: cu 10 achiziții directe, cel mult 1; de la 30, cel mult 3. La tiparele despre sume contează și valoarea: de la 2 milioane de lei contractați direct, tot 3. Comuna are 210 achiziții și 10,8 milioane.</li>
                        <li>Fiecare nivel valorează 20 de puncte: singur, 1,52 × 20 ≈ <b>30</b>, deci scorul comunei ajunge la 30.</li>
                      </ul>
                    </details>
                    <p className="mt-doc"><b>Ce documente lămuresc:</b> <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: referatele de necesitate">referatele de necesitate</button><span className="mt-def" hidden>documentele în care fiecare școală a scris de ce are nevoie de mobilier</span> și programul anual al achizițiilor.</p>
                    <div className="mt-pair">
                      <div><b>Se poate explica</b>Erau trei școli, cu nevoi apărute pe rând, sau bugetul a venit în mai multe părți.</div>
                      <div><b>De ce poate conta</b>Legea interzice împărțirea unei achiziții ca să se evite procedura (Legea 98/2016, art. 11). Ea judecă necesarul estimat pe un an, oricare ar fi firma; noi adunăm doar comenzile de același fel la aceeași firmă.</div>
                    </div>
                  </div>
                  <p className="mt-sr">Scorul Comunei Exemplu ajunge la 30 din 100.</p>
                  <div className="mt-ask">
                    <p className="mt-q"><span className="mt-lead">Ce crezi?</span> Se poate spune, din aceste date, că primăria a încălcat legea?</p>
                    <div className="mt-opts" role="group" aria-label="Variante">
                      <button type="button" className="mt-opt" aria-pressed="false" data-a="yes">Da</button>
                      <button type="button" className="mt-opt" aria-pressed="false" data-a="maybe">Nu, nu din aceste date</button>
                    </div>
                    <div className="mt-reveal" hidden data-for="yes">
                      <p className="mt-tone mt-no">Nu se poate spune.</p>
                      <p>Un semnal nu constată o încălcare și nu dovedește intenția. O încălcare o pot constata Curtea de Conturi, <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: ANAP">ANAP</button><span className="mt-def" hidden>Agenția Națională pentru Achiziții Publice, care verifică felul în care se cumpără</span> sau o instanță; o faptă penală o cercetează parchetul, iar vinovăția o stabilește doar instanța penală. Dacă școlile au avut nevoi separate, decise pe rând, totul poate fi în regulă.</p>
                    </div>
                    <div className="mt-reveal" hidden data-for="maybe">
                      <p className="mt-tone mt-ok">Așa e.</p>
                      <p>Răspunsul e în documentele celor trei comenzi: o singură nevoie de la început, sau trei separate? O încălcare o constată Curtea de Conturi, ANAP sau o instanță, nu un scor.</p>
                    </div>
                  </div>
                </article>
                <article className="mt-ev" data-step="2" aria-labelledby="e2">
                  <span className="mt-when" aria-hidden="true">Mai mulți ani, mai ales vara</span>
                  <h3 id="e2"><span className="mt-sr">Mai mulți ani: </span>Șapte achiziții imediat sub plafon</h3>
                  <p>Comuna are 7 achiziții cu sume foarte aproape de plafon, între 96% și 100% din el, cele mai multe în vara lui 2024. Câteva sunt normale oriunde.</p>
                  <figure className="mt-fig">
                    <div className="mt-dotsrow" role="img" aria-label="Găsite: 7 achiziții la 96–100% din plafon. De așteptat, după instituțiile de același tip, la aceleași plafoane: 3.">
                      <div className="mt-dr">
                        <b>Găsite, la 96–100% din plafon</b>
                        <span><i /><i /><i /><i /><i /><i /><i /></span>
                        <em>7</em>
                      </div>
                      <div className="mt-dr mt-exp">
                        <b>De așteptat, după instituțiile de același tip, la aceleași plafoane</b>
                        <span><i /><i /><i /></span>
                        <em>3</em>
                      </div>
                    </div>
                    <figcaption>Câte ar fi de așteptat: după câte achiziții are comuna între jumătate din plafon și 96% din el și după cât de des urcă una până la 96–100% la instituțiile de același tip, cu aceleași plafoane. Aici: 3. Comuna are 7.</figcaption>
                  </figure>
                  <div className="mt-found">
                    <p className="mt-name">Multe sume imediat sub plafon</p>
                    <p className="mt-gl">mai multe sume foarte aproape de plafon decât de obicei</p>
                    <p className="mt-plainline">7, față de 3 de așteptat. E tot despre plafon, ca primul tipar, deci intră doar cu 40% din tăria lui: scorul urcă la <b>38</b>. De ce, în capitolul 5.</p>
                    <details suppressHydrationWarning className="mt-sock">
                      <summary><span className="mt-sumw">Vezi calculul<span className="mt-sumn">: Multe sume imediat sub plafon</span></span></summary>
                      <ul className="mt-calc">
                        <li>Ca numerele mici să nu exagereze, adăugăm 1 la amândouă: (7 + 1) ÷ (3 + 1) = <b>2</b> (fără netezire ar fi 2,3).</li>
                        <li>De 1,5 ori dă nivelul 0, de 2 ori nivelul 1, de 4 ori nivelul 2, de 8 ori nivelul 3. Aici: nivelul <b>1</b>, adică 20 de puncte singur.</li>
                        <li>Cere cel puțin 3 achiziții găsite în zona 96–100% și cel puțin 0,5 de așteptat. Nivelul 2 cere cel puțin 5 găsite, nivelul 3 cel puțin 8.</li>
                        <li>Același fel ca primul tipar: în familia plafonului intră cu 0,4 din nivelul lui. Scorul urcă la <b>38</b>.</li>
                      </ul>
                    </details>
                    <p className="mt-doc"><b>Ce documente lămuresc:</b> ofertele primite și prețurile din catalogul SEAP.</p>
                    <div className="mt-pair">
                      <div><b>Se poate explica</b>Prețul pieței chiar e aproape de plafon, prețul din catalogul SEAP, pus de furnizor, cade acolo, sau bugetul a fost exact atât.</div>
                      <div><b>De ce poate conta</b>Dacă nevoia reală era mai mare, sume puse chiar sub limită pot ocoli procedura.</div>
                    </div>
                  </div>
                  <p className="mt-sr">Scorul Comunei Exemplu ajunge la 38 din 100.</p>
                </article>
                <article className="mt-ev" data-step="3" aria-labelledby="e3">
                  <span className="mt-when" aria-hidden="true">Septembrie – octombrie</span>
                  <h3 id="e3"><span className="mt-sr">Septembrie – octombrie: </span>Două sume declarate peste plafon</h3>
                  <p>Comuna cumpără direct echipamente de 330.000 de lei în septembrie și de 300.000 în octombrie. Fiecare sumă singură trece de plafonul de 270.120 lei; la fel și valoarea estimată la început.</p>
                  <figure className="mt-fig">
                    <div className="mt-blocks mt-b2" role="img" aria-label="Două sume, 330.000 și 300.000 lei, fiecare peste linia plafonului de 270.120 lei">
                      <span className="mt-lim" style={{ left: "67.5%" }} aria-hidden="true"><b>plafon</b></span>
                      <span className="mt-bar mt-o" style={{ left: "0", top: "26px", height: "26px", width: "82.5%" }} aria-hidden="true">330.000</span>
                      <span className="mt-bar mt-o" style={{ left: "0", top: "58px", height: "26px", width: "75%" }} aria-hidden="true">300.000</span>
                    </div>
                    <figcaption>Contează o sumă doar când valoarea estimată trece de plafon sau când suma finală trece de plafon chiar și cu TVA (21%) socotită în ea: o sumă trecută din greșeală cu TVA nu trebuie să pară depășire. Aici, amândouă au valoarea estimată peste plafon.</figcaption>
                  </figure>
                  <div className="mt-found">
                    <p className="mt-name">Declarate directe, peste plafon</p>
                    <p className="mt-gl">achiziții declarate directe, deși trec de limită</p>
                    <p className="mt-plainline">Două cazuri, în luni diferite. Tot despre plafon, deci tot cu 40%: scorul urcă la <b>46</b>.</p>
                    <details suppressHydrationWarning className="mt-sock">
                      <summary><span className="mt-sumw">Vezi calculul<span className="mt-sumn">: Declarate directe, peste plafon</span></span></summary>
                      <ul className="mt-calc">
                        <li>Nivelul se măsoară de două ori, după număr și după bani, și se ia cel mai mic.</li>
                        <li>Un caz = o instituție într-o lună, oricâte sume peste plafon ar avea atunci. După număr: 2 cazuri dau nivelul 1, 3 cazuri nivelul 2, 5 cazuri nivelul 3. Aici: <b>1</b>.</li>
                        <li>După bani, socotiți pe toți anii: nivelul pornește de la 0,25% din tot ce a contractat direct comuna; 0,5% dau nivelul 1, 3% nivelul 2, 10% nivelul 3. Aici: 630.000 din 10,8 milioane = 5,8%, adică 2,4.</li>
                        <li>Cel mai mic: <b>1</b>, adică 20 de puncte singur. Aici numărul ține nivelul jos: banii ar da 2,4, dar două cazuri dau doar 1.</li>
                        <li>Același fel ca primul: intră cu 0,4 din nivelul lui. Scorul urcă la <b>46</b>.</li>
                      </ul>
                    </details>
                    <p className="mt-doc"><b>Ce documente lămuresc:</b> <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: nota justificativă">nota justificativă</button><span className="mt-def" hidden>documentul în care primăria arată cum a ales firma și cum a stabilit valoarea</span> și suma din contract, fără TVA.</p>
                    <div className="mt-pair">
                      <div><b>Se poate explica</b>O greșeală la trecerea în SEAP, de exemplu și valoarea estimată trecută cu TVA. Nu punem aici serviciile din <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: Anexa 2">Anexa 2</button><span className="mt-def" hidden>lista din Legea 98/2016 cu servicii sociale, de sănătate, culturale și altele</span> și produsele medicale (CPV 33). Pentru serviciile din Anexa 2, legea cere o procedură proprie a instituției (art. 111), așa că nu le judecăm după plafonul achiziției directe.</div>
                      <div><b>De ce poate conta</b>Peste plafon, legea cere o procedură.</div>
                    </div>
                  </div>
                  <p className="mt-sr">Scorul Comunei Exemplu ajunge la 46 din 100.</p>
                </article>
                <article className="mt-ev" data-step="4" aria-labelledby="e4">
                  <span className="mt-when" aria-hidden="true">Decembrie</span>
                  <h3 id="e4"><span className="mt-sr">Decembrie: </span>Peste o treime din an, într-o lună</h3>
                  <p>În decembrie apar 35% din banii contractați direct de comună în 2024 (după data publicării în SEAP, care aproximează semnarea). La jumătate din comunele țării, decembrie e sub 15% din an. La fel făcuse și în 2022.</p>
                  <figure className="mt-fig">
                    <div className="mt-months" role="img" aria-label="Partea fiecărei luni din achizițiile directe ale anului: între 4 și 8% pe lună, iar decembrie 35%, față de 15% cât e de obicei decembrie la comune">
                      <i aria-hidden="true" style={{ height: "13%" }} />
                      <i aria-hidden="true" style={{ height: "16%" }} />
                      <i aria-hidden="true" style={{ height: "17%" }} />
                      <i aria-hidden="true" style={{ height: "20%" }} />
                      <i aria-hidden="true" style={{ height: "17%" }} />
                      <i aria-hidden="true" style={{ height: "18%" }} />
                      <i aria-hidden="true" style={{ height: "14%" }} />
                      <i aria-hidden="true" style={{ height: "12%" }} />
                      <i aria-hidden="true" style={{ height: "20%" }} />
                      <i aria-hidden="true" style={{ height: "17%" }} />
                      <i aria-hidden="true" style={{ height: "22%" }} />
                      <i aria-hidden="true" className="mt-dec" style={{ height: "100%" }} />
                      <span className="mt-median" aria-hidden="true" style={{ bottom: "43%" }}><span>decembrie, de obicei: 15%</span></span>
                    </div>
                    <div className="mt-mlab" aria-hidden="true">
                      <span>ian</span>
                      <span />
                      <span>mar</span>
                      <span />
                      <span>mai</span>
                      <span />
                      <span>iul</span>
                      <span />
                      <span>sep</span>
                      <span />
                      <span>nov</span>
                      <span><b>dec</b></span>
                    </div>
                  </figure>
                  <div className="mt-found">
                    <p className="mt-name">Mulți bani contractați în decembrie</p>
                    <p className="mt-gl">o lună cu mare parte din banii anului</p>
                    <p className="mt-plainline">Mult peste obicei, în doi ani diferiți. E alt fel de tipar decât primele trei, așa că ia doar din ce a rămas până la 100: scorul urcă la <b>55</b> (de ce, în capitolul 5). Decembrie singur nu trece niciodată de „slab”: multe primării primesc bani târziu.</p>
                    <details suppressHydrationWarning className="mt-sock">
                      <summary><span className="mt-sumw">Vezi calculul<span className="mt-sumn">: Mulți bani contractați în decembrie</span></span></summary>
                      <ul className="mt-calc">
                        <li>La decembrie comparăm cu instituțiile de același tip, aici comunele din toată țara, în același an (nu cu grupul de primării din capitolul 6): la jumătate dintre ele decembrie e sub 15% (mediana); doar una din 20 trece de 23%. Așa a fost și în 2022, și în 2024.</li>
                        <li>Ne uităm la cele mai mari două decembrii ale comunei, din 2018 încoace: 35% în 2024 și 35% în 2022.</li>
                        <li>Un an e marcat când decembrie trece de cel al 95% dintre comune (aici 23%) și ajunge la cel puțin 35% din an: aici, amândoi.</li>
                        <li>Luăm cele mai mari două decembrii, deci și o comună obișnuită iese puțin peste mediană; micșorarea de mai jos atenuează asta, nu o corectează.</li>
                        <li>Fiecare e cu (35 − 15) ÷ (23 − 15) = <b>2,5 pași</b> peste obicei; un pas = de la 15% la 23%.</li>
                        <li>Cu doar 8 ani încheiați de date (2018–2025), nu ne grăbim să tragem concluzii, așa că micșorăm cu o cincime: 2,5 × 8 ÷ (8 + 2) = <b>2 pași</b>. Avem puțini ani, așa că micșorăm rezultatul; cu mulți ani de date, micșorarea aproape dispare.</li>
                        <li>Nivel = 1,25 × (pași − 1) ÷ 1,5, cel mult 1,25: 1,25 × (2 − 1) ÷ 1,5 = <b>0,83</b>. Singur, ar da 0,83 × 20 ≈ 17 puncte.</li>
                        <li>Alt fel de tipar: singur ar fi umplut 17 din 100 de pătrățele; aici mai sunt doar 54 goale, deci umple 17 din fiecare 100 goale: scorul urcă de la 46 la <b>55</b>.</li>
                      </ul>
                    </details>
                    <p className="mt-doc"><b>Ce documente lămuresc:</b> hotărârile de <button type="button" className="mt-term" aria-expanded="false" aria-label="Explicație: rectificare a bugetului">rectificare a bugetului</button><span className="mt-def" hidden>schimbarea bugetului în timpul anului, votată de consiliul local</span> și datele contractelor. Dacă ești consilier, verifică data hotărârii.</p>
                    <div className="mt-pair">
                      <div><b>Se poate explica</b>Rectificarea bugetară din toamnă a adus banii târziu, lucrările erau planificate pentru iarnă, sau comenzile din afara catalogului au fost publicate în grup. Contractat în decembrie nu înseamnă plătit în decembrie.</div>
                      <div><b>De ce poate conta</b>La final de an bugetele se închid și contractele se înghesuie: fiecare e mai greu de verificat. Merită întrebat de ce atunci.</div>
                    </div>
                  </div>
                  <p className="mt-sr">Scorul Comunei Exemplu ajunge la 55 din 100, moderat.</p>
                  <p className="mt-how">Ce a aflat Ioana când a cerut documentele: în <a href="#epilog">epilog</a>.</p>
                </article>
                <div className="mt-split-box">
                  <p><b>Pe pagina comunei, cele 55 de puncte se împart fără ordine:</b></p>
                  <ol className="mt-mini-l">
                    <li><span>Adunate, trec de plafon</span><b>28</b></li>
                    <li><span>Multe sume imediat sub plafon</span><b>7</b></li>
                    <li><span>Declarate directe, peste plafon</span><b>7</b></li>
                    <li className="mt-dec"><span>Mulți bani contractați în decembrie</span><b>13</b></li>
                  </ol>
                  <p className="mt-how">Caseta cu scorul arată doar cum crește scorul când afli tiparele pe rând. Pe acestea le citești pe site. Cum se împart: <a href="#impartire">în capitolul 5</a>.</p>
                </div>
              </div>
            </div>
          </section>
          <section className="mt-ch mt-col mt-stack" id="scorul" aria-labelledby="h-scorul">
            <h2 id="h-scorul"><span className="mt-ch-n">Capitolul 5</span>Cum se face scorul: de ce nu adunăm simplu</h2>
            <p>Ioana are acum scorul comunei: 55 din 100. Înainte să-l scrie, vrea să știe de unde vine.</p>
            <p className="mt-pull">Trei semne despre același lucru nu se pun de trei ori.</p>
            <p>Singure, cele patru tipare ar valora 30, 20, 20 și 17 puncte. Scorul e 55, din două motive.</p>
            <h3>1. Tiparele de același fel intră doar parțial</h3>
            <p>Primele trei sunt toate despre plafon: spun aproape același lucru despre aceeași comună. Le numim o <b>familie</b> de tipare. Cel mai puternic intră întreg, celelalte cu 40%.</p>
            <div className="mt-eq mt-lv" role="img" aria-label="Nivelul familiei plafonului: 1,52, plus 0,4 ori 1, plus 0,4 ori 1, egal 2,32; singură, familia ar valora 46 de puncte">
              <span className="mt-t" aria-hidden="true">1,52<small>mobilierul</small></span>
              <span className="mt-op" aria-hidden="true">+</span>
              <span className="mt-t" aria-hidden="true">0,4 × 1<small>sub plafon</small></span>
              <span className="mt-op" aria-hidden="true">+</span>
              <span className="mt-t" aria-hidden="true">0,4 × 1<small>peste plafon</small></span>
              <span className="mt-nb"><span className="mt-op" aria-hidden="true">=</span><span className="mt-t mt-r" aria-hidden="true">2,32<small>× 20 ≈ 46</small></span></span>
            </div>
            <p className="mt-how">Singură, familia plafonului ar valora 46 de puncte.</p>
            <h3>2. Alt fel de tipar ia din ce a mai rămas</h3>
            <p>Decembrie e alt fel de tipar. Singur, ar fi umplut 17 din 100 de pătrățele. Aici mai sunt doar 54 goale, așa că umple o șesime din ele: scorul urcă de la 46 la 55.</p>
            <figure className="mt-fig mt-g100">
              <div className="mt-grid100 mt-anim" id="g5" role="img" aria-label="Așa crește scorul, în 100 de pătrățele: întâi familia plafonului umple 46, apoi decembrie umple încă 9 din cele 54 rămase goale; 45 rămân goale">
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-g" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-o" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
                <i className="mt-e" />
              </div>
              <ul className="mt-legend-l mt-g">
                <li><i className="mt-sw mt-g" />46 · întâi, familia plafonului</li>
                <li><i className="mt-sw mt-o" />9 · apoi decembrie, din ce a rămas</li>
                <li><i className="mt-sw mt-e" />45 · goale</li>
              </ul>
              <figcaption>Așa crește scorul: fiecare familie nouă umple doar din ce a rămas gol, deci scorul nu trece de 100. Pe pagina comunei, punctele nu depind de ordine: <b>28, 7, 7 și 13</b>.</figcaption>
            </figure>
            <details suppressHydrationWarning className="mt-sock" id="impartire">
              <summary>Cum se împart cele 55 de puncte: 28, 7, 7 și 13</summary>
              <ul className="mt-calc">
                <li>Pătrățelele de mai sus și caseta din capitolul 4 arată cum crește scorul când adaugi tiparele pe rând; în altă ordine, fiecare tipar ar părea să adauge altceva.</li>
                <li>Pe pagina comunei ordinea nu contează: fiecare familie ia o parte proporțională cu −ln(1 − 0,2 × F), unde ln e logaritmul natural. Plafonul: −ln(0,536) = 0,624; decembrie: −ln(0,833) = 0,182; din 55 ies 42,6 și 12,4.</li>
                <li>În familia plafonului, 1,52 : 0,4 : 0,4 dau 27,9, 7,3 și 7,3. Rotunjite deodată, cu resturile la zecimalele cele mai mari: <span className="mt-nw">28, 7, 7 și 13</span>.</li>
                <li>Scorul e același, 55. Când citezi, citează scorul și tiparele, nu punctele unui tipar.</li>
              </ul>
            </details>
            <div className="mt-ask">
              <p className="mt-q"><span className="mt-lead">Ce crezi?</span> Dacă ar mai apărea un tipar de alt fel, la fel de puternic ca decembrie, cu cât ar crește scorul?</p>
              <div className="mt-opts" role="group" aria-label="Variante">
                <button type="button" className="mt-opt" aria-pressed="false" data-a="same">Tot cu 9</button>
                <button type="button" className="mt-opt" aria-pressed="false" data-a="less">Cu mai puțin de 9</button>
                <button type="button" className="mt-opt" aria-pressed="false" data-a="more">Cu mai mult de 9</button>
              </div>
              <div className="mt-reveal" hidden data-for="same">
                <p className="mt-tone mt-no">Nu, mai puțin de 9.</p>
                <p>Ar umple tot o șesime din cele goale, dar acum sunt doar 45, nu 54: cam 7,5. Scorul ar ajunge la 62–63.</p>
              </div>
              <div className="mt-reveal" hidden data-for="less">
                <p className="mt-tone mt-ok">Da, mai puțin.</p>
                <p>Ar umple tot o șesime din cele goale, dar acum sunt doar 45: cam 7,5. Scorul ar ajunge la 62–63.</p>
              </div>
              <div className="mt-reveal" hidden data-for="more">
                <p className="mt-tone mt-no">Nu, mai puțin de 9.</p>
                <p>Cu cât scorul e mai mare, cu atât sunt mai puține pătrățele goale. Ar umple cam 17 din fiecare 100 goale; din 45, cam 7,5. Scorul ar ajunge la 62–63.</p>
              </div>
            </div>
            <details suppressHydrationWarning className="mt-sock">
              <summary>Vezi formula</summary>
              <ul className="mt-calc">
                <li>În cuvinte: fiecare familie umple o parte din pătrățelele goale; scorul e câte s-au umplut.</li>
                <li><p className="mt-math">scor = 100 × (1 − (1 − 0,2 × F₁) × (1 − 0,2 × F₂) × …)</p>F₁, F₂… sunt nivelurile familiilor. Comuna: plafonul 1,52 + 0,4 × 1 + 0,4 × 1 = 2,32; decembrie 0,833; 100 × (1 − 0,536 × 0,833) = 55.</li>
                <li>Forma e cea a reuniunii unor evenimente independente, dar nu o citim ca probabilitate: am ales-o pentru că fiecare familie nouă umple o parte din ce a rămas, iar scorul nu trece de 100.</li>
                <li><a href="#formula">Toate regulile formulei</a></li>
              </ul>
            </details>
            <p>Sunt patru familii: <b>plafonul</b> (cele trei de mai sus), <b>legătura cu o singură firmă</b> („O firmă primește mare parte din bani” la instituții, „Un singur client public mare” la firme), <b>decembrie</b> și <b>capacitatea firmei</b> („Contracte directe peste cifra de afaceri”; singură, contează pe jumătate). Un singur tipar ajunge cel mult la 60, adică „moderat”. „Pronunțat” începe de la 68, deci cere cel puțin două tipare.</p>
            <figure className="mt-fig mt-mix" aria-labelledby="mix-t">
              <p id="mix-t" style={{ fontWeight: "600" }}>Încearcă: pornește și oprește tiparele comunei</p>
              <div className="mt-toggles">
                <button type="button" className="mt-tg" data-k="split" aria-pressed="true"><i /><span>Adunate, trec de plafon<small>familia plafonului · singur 30</small></span></button>
                <button type="button" className="mt-tg" data-k="round" aria-pressed="true"><i /><span>Multe sume imediat sub plafon<small>familia plafonului · singur 20</small></span></button>
                <button type="button" className="mt-tg" data-k="above" aria-pressed="true"><i /><span>Declarate directe, peste plafon<small>familia plafonului · singur 20</small></span></button>
                <button type="button" className="mt-tg" data-k="dec" aria-pressed="true"><i /><span>Mulți bani contractați în decembrie<small>familia decembrie · singur 17</small></span></button>
                <button type="button" className="mt-tg" data-k="rel" aria-pressed="false"><i /><span>O firmă primește mare parte din bani<small>exemplu: comuna nu are acest tipar; dacă o firmă ar primi 75% din bani, singur 40</small></span></button>
              </div>
              <div className="mt-big-score" aria-hidden="true">
                <b id="mx">55</b>
                <span>din 100</span>
                <span className="mt-pill" id="mx-b">moderat</span>
              </div>
              <div className="mt-grid100 mt-mxg" id="mx-grid" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="mt-bandwrap" aria-hidden="true">
                <i className="mt-mk" id="mx-mk" style={{ left: "55%" }} />
                <div className="mt-bands">
                  <div>
                    <i />
                    <span><small>0–9</small></span>
                  </div>
                  <div>
                    <i />
                    <span>slab <small>10–39</small></span>
                  </div>
                  <div>
                    <i />
                    <span>moderat <small>40–67</small></span>
                  </div>
                  <div>
                    <i />
                    <span>pronunțat <small>68–100</small></span>
                  </div>
                </div>
              </div>
              <p className="mt-how">„Pronunțat” înseamnă tipare mari și repetate, atât. Sub 10: „fără semnal în scor”.</p>
              <ul className="mt-calc" id="mx-math" />
              <p className="mt-why" id="mx-why" />
              <p className="mt-sr" id="mx-live" aria-live="polite" />
            </figure>
            <div className="mt-key">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <p><b>55 nu e o probabilitate: nu e o vină, nu e o probă.</b> Scorul arată cât de mari și de repetate sunt tiparele. Iar <b>sub 10 nu înseamnă că totul e în regulă</b>: un conflict de interese sau o lucrare nelivrată nu se văd în SEAP. Pragurile nu sunt calibrate pe cazuri judecate; nu știm încă câte alarme sunt false.</p>
            </div>
          </section>
          <section className="mt-ch mt-col mt-stack" id="fata" aria-labelledby="h-fata">
            <h2 id="h-fata"><span className="mt-ch-n">Capitolul 6</span>Cu cine comparăm</h2>
            <p>Redactorul o întreabă pe Ioana dacă 55 e mult. Ea caută primăriile de aceeași mărime.</p>
            <p>Un 55 spune mai mult lângă alții asemănători. Cine cu cine se compară:</p>
            <ul className="mt-plain">
              <li><b>Primăriile:</b> cu primăriile între jumătate și dublul populației lor, comune, orașe și municipii la un loc. Pentru Comuna Exemplu, 4.500–18.000 de locuitori.</li>
              <li><b>Spitalele:</b> nu au comparație: un spital județean și unul orășenesc nu se aseamănă.</li>
              <li><b>Școlile, consiliile județene, primăriile de sector din București, organizațiile utilizatorilor de apă pentru irigații:</b> fiecare cu ale lor.</li>
              <li><b>Firmele:</b> cu firmele din domeniul lor principal, doar dacă sunt cel puțin 100.</li>
              <li><b>Instituțiile fără un tip sigur:</b> cu toată țara.</li>
            </ul>
            <figure className="mt-fig">
                {peers ? (
                  <>
                    <div className="mt-pbar" role="img" aria-label={`Din ${formatInt(peers.n)} alte primării asemănătoare: ${formatInt(peers.zero)} au scorul 0, ${formatInt(peers.lower + peers.same)} au un scor mai mic sau egal cu al Comunei Exemplu, ${formatInt(peers.higher)} au un scor mai mare`}>
                      <i className="mt-z" style={{ flex: String(peers.zero) }}>{formatInt(peers.zero)} au 0</i>
                      <i className="mt-l" style={{ flex: String(peers.lower + peers.same) }}>{formatInt(peers.lower + peers.same)}</i>
                      <i className="mt-me" style={{ flex: "0 0 12px" }} />
                      <i className="mt-h" style={{ flex: String(peers.higher) }}>{formatInt(peers.higher)}</i>
                    </div>
                    <p className="mt-pbar-l" aria-hidden="true">Pe bară: {formatInt(peers.zero)} au 0, {formatInt(peers.lower + peers.same)} au un scor mai mic{peers.same ? " sau egal" : ""}, linia neagră e Comuna Exemplu ({EXAMPLE_TOWN.score}), iar ultimele {formatInt(peers.higher)} au un scor mai mare.</p>
                    <figcaption>{formatInt(peers.n)} alte primării asemănătoare, cu scorurile din {riskDay}. {formatInt(peers.higher)} au un scor mai mare decât Comuna Exemplu, așa că pe pagina ei vezi <b>„{exampleRank(f)} · primăriile cu 4.500–18.000 de locuitori”</b> ({formatInt(peers.n + 1)} = cele {formatInt(peers.n)} și comuna). Locul numără doar primăriile cu scor mai mare: cele {formatInt(peers.zero)} cu 0 nu-l umflă.</figcaption>
                  </>
                ) : (
                  <figcaption>Grupul de comparație nu a putut fi citit acum.</figcaption>
                )}
            </figure>
            <figure className="mt-fig mt-dist" aria-labelledby="dist-t">
              <p id="dist-t" style={{ fontWeight: "600" }}>Cum arată scorurile în toată țara</p>
              {f ? (
                <>
                  <BandBar label="instituții" who="Instituții" b={f.bands.authority} />
                  <BandBar label="firme" who="Firme" b={f.bands.supplier} />
                  <figcaption>Profilurile cu cel puțin 10 achiziții directe, cu scorurile din {riskDay} (<span className="mt-nw">{VERSION}</span>). Instituții: {formatInt(f.bands.authority.none)} au 0, {formatInt(f.bands.authority.slab)} slab, {formatInt(f.bands.authority.moderat)} moderat, {formatInt(f.bands.authority.puternic)} pronunțat. Firme: {formatInt(f.bands.supplier.none)} au 0, {formatInt(f.bands.supplier.slab)} slab, {formatInt(f.bands.supplier.moderat)} moderat, {formatInt(f.bands.supplier.puternic)} pronunțat. Scor moderat sau pronunțat au {pct(f.bands.authority.moderat + f.bands.authority.puternic, f.bands.authority.total)} din instituții: {formatInt(f.bands.authority.moderat + f.bands.authority.puternic)} din {formatInt(f.bands.authority.total)}.</figcaption>
                </>
              ) : (
                <figcaption>Distribuția scorurilor nu a putut fi citită acum.</figcaption>
              )}
            </figure>
            <p>Intră în comparație profilurile cu cel puțin 10 achiziții directe, iar comparația cere cel puțin 5 alți membri: o comună foarte mică, cu puține achiziții, nu e comparată. Pe site, locul apare doar la scor moderat și pronunțat. Spitale: <a href="#spitale">ce se schimbă la ele</a>.</p>
          </section>
          <section className="mt-ch mt-col mt-stack" id="marime" aria-labelledby="h-marime">
            <h2 id="h-marime"><span className="mt-ch-n">Ramură, pentru firme</span>Firme mari, firme mici</h2>
            <p>Ioana se uită și la Mobilier Exemplu SRL, firma cu cele trei comenzi. Vrea să știe cum se citește scorul unei firme.</p>
            <details suppressHydrationWarning className="mt-branch" id="marime-d">
              <summary>Deschide ramura despre firme <span className="mt-bs">cam 5 minute</span></summary>
              <div className="mt-stack">
                <p className="mt-lead-line">Pentru o firmă, întrebarea e: ce parte din tot ce a câștigat direct e suma?</p>
                <div className="mt-key mt-firm-box mt-role-box" id="firma">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v6M12 7.5v.5" />
                  </svg>
                  <div>
                    <p><b>Ai o firmă?</b></p>
                    <ul className="mt-plain mt-three">
                      <li><b>Nu apari dacă</b> câștigi prin licitații, ai sub 10 achiziții directe, o singură depășire de plafon sau lucrări sub 900.400 lei.</li>
                      <li><b>Apari dacă</b> ai depășiri de plafon repetate la aceleași 1–2 instituții, un client public care îți aduce peste 70% din vânzările directe sau contracte directe peste cifra de afaceri din același an.</li>
                      <li><b>Ai o explicație?</b> <a href="#raspuns">Scrie-ne</a>, cu documentele: răspundem în 10 zile lucrătoare. Pragurile: <a href="#praguri-firme">în „Regulile”</a>.</li>
                    </ul>
                  </div>
                </div>
                <p>Calculăm un scor și pentru firme, din achizițiile directe câștigate de la instituții. Plafonul e obligația cumpărătorului, nu a firmei; firma primește puncte pentru că aceleași achiziții, văzute din partea ei, arată unde să te uiți: o firmă care câștigă iar și iar peste plafon de la aceleași instituții arată contractele de verificat. <b>Un scor al firmei nu spune că firma a greșit.</b></p>
                <p>Două firme inventate. <b>Firmei A</b> i s-au atribuit prin achiziții directe 6 milioane de lei din 2018 încoace, aproape tot (85%) de la două primării. <b>Firmei B</b>, 240 de milioane, de la sute de instituții. În 2024, fiecare are 5 achiziții directe peste plafon, de câte 300.000 de lei, în 5 luni diferite: 1,5 milioane în total. La Firma A, toate cinci sunt de la cele două primării. Contează doar achizițiile directe; licitațiile câștigate nu intră aici.</p>
                <div className="mt-ask">
                  <p className="mt-q"><span className="mt-lead">Ce crezi?</span> Care primește mai multe puncte?</p>
                  <div className="mt-opts" role="group" aria-label="Variante">
                    <button type="button" className="mt-opt" aria-pressed="false" data-a="small">Firma A, cea mică</button>
                    <button type="button" className="mt-opt" aria-pressed="false" data-a="same">La fel</button>
                    <button type="button" className="mt-opt" aria-pressed="false" data-a="big">Firma B, cea mare</button>
                  </div>
                  <div className="mt-reveal" hidden data-for="small">
                    <p className="mt-tone mt-ok">Da, Firma A.</p>
                    <p>Pentru Firma A, cele 1,5 milioane sunt un sfert din tot ce i s-a atribuit direct. Pentru Firma B, puțin peste 0,6%.</p>
                  </div>
                  <div className="mt-reveal" hidden data-for="same">
                    <p className="mt-tone mt-no">Nu, Firma A primește mai mult.</p>
                    <p>Suma e aceeași, dar greutatea nu. Pentru Firma A, 1,5 milioane sunt un sfert din tot ce i s-a atribuit direct. Pentru Firma B, puțin peste 0,6%.</p>
                  </div>
                  <div className="mt-reveal" hidden data-for="big">
                    <p className="mt-tone mt-no">Nu, Firma A primește mai mult.</p>
                    <p>Firmei B i s-a atribuit de 40 de ori mai mult. Cele 1,5 milioane sunt pentru ea puțin peste 0,6%; pentru Firma A, un sfert.</p>
                  </div>
                  <div className="mt-vs">
                    <div className="mt-firm">
                      <h3>Firma A</h3>
                      <div className="mt-pie">
                        <svg width="60" height="60" viewBox="0 0 36 36" aria-hidden="true">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line2)" strokeWidth="6" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--orange)" strokeWidth="6" strokeDasharray="25 75" transform="rotate(-90 18 18)" />
                        </svg>
                        <p>1,5 milioane din 6: <b>25%</b></p>
                      </div>
                      <p className="mt-pts" data-after hidden>49 <small>de puncte</small></p>
                    </div>
                    <div className="mt-firm">
                      <h3>Firma B</h3>
                      <div className="mt-pie">
                        <svg width="60" height="60" viewBox="0 0 36 36" aria-hidden="true">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line2)" strokeWidth="6" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--orange)" strokeWidth="6" strokeDasharray="1.6 98.4" transform="rotate(-90 18 18)" />
                        </svg>
                        <p>1,5 milioane din 240: <b>0,63%</b></p>
                      </div>
                      <p className="mt-pts" data-after hidden>6 <small>puncte: sub 10, „fără semnal în scor”</small></p>
                    </div>
                  </div>
                </div>
                <p className="mt-sr" data-after hidden>Firma A are 49 de puncte, Firma B 6, adică „fără semnal în scor”.</p>
                <p><b>Limita de 30 de puncte.</b> La o firmă cu mulți cumpărători, tiparele despre plafon cântăresc împreună cel mult 30 de puncte. Firma A primește aproape tot de la două primării, așa că limita nu i se aplică.</p>
                <details suppressHydrationWarning className="mt-sock">
                  <summary>De ce limita de 30</summary>
                  <ul className="mt-calc">
                    <li>La o firmă cu mulți cumpărători, peste plafon e mai degrabă alegerea fiecărui cumpărător.</li>
                    <li>Când aproape tot vine de la una sau două instituții, aceleași depășiri se repetă cu aceiași cumpărători. Limita slăbește când primele două aduc peste 60% și dispare de la 80%.</li>
                    <li>Exemplu cu doi clienți: o firmă care vinde 45% unei instituții și 40% alteia are 85% la primele două, deci limita nu i se aplică; cu 30% și 25% (55%), tiparele de plafon ar rămâne la cel mult 30 de puncte.</li>
                    <li>Nu e o acuzație la adresa colaborărilor stabile: e locul unde merită citite documentele.</li>
                  </ul>
                </details>
                <details suppressHydrationWarning className="mt-sock">
                  <summary><span className="mt-sumw">Vezi calculul<span className="mt-sumn">: Firma A și Firma B</span></span></summary>
                  <ul className="mt-calc">
                    <li>Scara firmelor la „Declarate directe, peste plafon”: 2% din ce i s-a atribuit direct firmei dau nivelul 1, 12% nivelul 2, 40% nivelul 3, proporțional între ele.</li>
                    <li>După număr: 5 cazuri (o instituție într-o lună) dau nivelul 3, la ambele firme. Contează cel mai mic dintre număr și bani, deci aici banii.</li>
                    <li>Firma A are 60 de achiziții directe, destule ca nivelul să nu fie ținut jos.</li>
                    <li>Firma A: 25% → 2 + (25 − 12) ÷ (40 − 12) = <b>2,46</b> → 2,46 × 20 ≈ <b>49 de puncte</b>.</li>
                    <li>Firma B: 0,63% → 0,625 ÷ 2 ≈ <b>0,31</b> → 0,31 × 20 ≈ <b>6 puncte</b> (sub limita de 30, oricum). Sub 10 puncte, Firma B e „fără semnal în scor”; tiparul se vede pe pagina ei.</li>
                    <li>La instituții, scara e mai strânsă (0,5%, 3%, 10%), pentru că plafonul e chiar obligația lor.</li>
                  </ul>
                </details>
                <p>Și o firmă mică de lucrări care câștigă trei lucrări de câte 300.000 de lei nu primește nimic de aici: fiecare e sub plafonul de lucrări, de 900.400 lei.</p>
                <p><b>„Contracte directe peste cifra de afaceri”</b> pune achizițiile directe câștigate într-un an lângă cifra de afaceri din bilanțul aceluiași an; un an fără bilanț, cum e anul în curs, nu se judecă. Când e singurul tipar al firmei, contează pe jumătate.</p>
                <p><b>„Un singur client public mare”</b> apare când o singură instituție aduce cel puțin 70% din ce i s-a atribuit direct firmei. De la 85%, nivelul depinde de cât de mare e firma pentru instituție: sub 5% din achizițiile ei directe, între 0,5 și 1; 5% dau nivelul 1, 20% nivelul 2, 50% nivelul 3. Între 70% și 85%, nivelul se atinge treptat. Explicația obișnuită: o firmă locală specializată, o piață mică sau un distribuitor exclusiv. Firma A nu îl primește: fiecare dintre cele două primării aduce sub 70%.</p>
                <p><b>Dacă firma ta are un scor:</b> deschide înregistrările de pe pagina firmei, verifică sumele și cumpărătorii și trimite-ne explicația, cu documentele (contracte, comenzi, explicația cumpărătorului). Răspundem în 10 zile lucrătoare. Dacă documentele arată că am citit greșit datele, corectăm; o schimbare de regulă intră în <a href="#istoric">„Ce s-a schimbat și când”</a>.</p>
                <p className="mt-how">O firmă se compară cu firmele din domeniul ei principal: diviziunea CPV (primele două cifre) în care a câștigat cei mai mulți bani, de exemplu „Lucrări de construcții”. Fără domeniu, sau într-un domeniu cu mai puțin de 100 de firme, nu are comparație.</p>
              </div>
            </details>
          </section>
          <section className="mt-ch mt-col mt-stack" id="pista" aria-labelledby="h-pista">
            <h2 id="h-pista"><span className="mt-ch-n">Capitolul 7</span>Ai găsit un semnal. Ce faci?</h2>
            <p>Ioana are patru semnale și nicio concluzie. Ia pașii de mai jos, în ordine.</p>
            <p>Un semnal e începutul unei întrebări, nu răspunsul. Dacă nu ești ziarist, primii trei pași sunt de ajuns.</p>
            <ol className="mt-steps">
              <li><span><b>Deschide înregistrările.</b> Pe pagina instituției, fiecare semnal duce la achizițiile lui, cu linkul spre SEAP. Butonul <span className="mt-chip">Descarcă înregistrările</span> îți dă lista lor, ca fișier.</span></li>
              <li><span><b>Citește documentele.</b> Pentru tiparele cu plafonul ajută programul anual al achizițiilor, referatele de necesitate (de ce a fost nevoie de achiziție) și nota justificativă, acolo unde normele o cer (de ce s-a ales felul ăsta de achiziție); apoi contractul, procesul-verbal de recepție (hârtia care arată ce s-a livrat) și documentele de plată.</span></li>
              <li><span><b>Caută explicația obișnuită.</b> E scrisă lângă fiecare semnal. De multe ori, ea e răspunsul.</span></li>
              <li><span><b>Întreabă instituția.</b> Legea 544/2001, a accesului la informațiile publice, îți dă dreptul să ceri documentele. Instituția trebuie să răspundă în 10 zile, sau în 30 dacă cererea e complicată. Ca ales local, le poți cere și în comisie sau în ședința de consiliu; un parlamentar, printr-o întrebare scrisă. Dacă nu primești răspuns, poți face reclamație la conducerea instituției și apoi plângere la tribunal (Legea 544, art. 21–22).</span></li>
              <li><span><b>Dacă documentele nu explică.</b> Poți sesiza ANAP (felul în care s-a cumpărat), Curtea de Conturi sau, dacă bănuiești o faptă penală, parchetul competent. O sesizare se face cu documentele obținute, nu cu scorul. Datele de aici nu arată intenția sau beneficiul, iar un administrator comun din Registrul Comerțului e o legătură pe hârtie, nu o înțelegere.</span></li>
              <li><span><b>Citează corect.</b> Ca fapt poți cita ce e trecut în SEAP: înregistrarea și suma declarată de instituție (instituția o poate corecta, ca în epilog). Scorul și comparația sunt doar indicatori: îți spun unde să cauți. Când le citezi, spune de unde sunt, ce versiune a metodologiei și din ce zi. Înainte să publici, cere punctul de vedere al instituției și al firmei.</span></li>
            </ol>
            <details suppressHydrationWarning className="mt-sock mt-tpl">
              <summary>Model de cerere (Legea 544/2001)</summary>
              <p className="mt-how">Numerele și datele achizițiilor le iei din fișierul „Descarcă înregistrările”.</p>
              <p className="mt-cite" id="req">Către Primăria Comunei Exemplu. În temeiul Legii nr. 544/2001, vă rog să-mi comunicați, în format electronic: programul anual al achizițiilor publice pe 2024, cu anexa privind achizițiile directe; referatele de necesitate și, acolo unde normele le cer, notele justificative pentru achizițiile directe nr. … din data de …; contractele, procesele-verbale de recepție și documentele de plată aferente. Vă mulțumesc. Nume, adresă de email.</p>
              <button type="button" className="mt-btn" data-copy="req">Copiază cererea</button>
            </details>
            <div className="mt-press" id="citeaza-p">
              <h3>Ești jurnalist?</h3>
              <p className="mt-how">Ca fapt, citezi înregistrarea din SEAP și tiparul. Scorul e un indicator: spune de unde e și din ce zi. Înainte să publici, cere punctul de vedere al instituției și al firmei.</p>
              <div className="mt-write">
                <div className="mt-yes"><b>Așa da</b>„Potrivit datelor din SEAP, Comuna Exemplu a făcut trei comenzi de mobilier la aceeași firmă care, adunate, trec de plafon. Plafonul legal privește valoarea estimată; e un tipar de verificat, nu o constatare: am cerut primăriei documentele.”</div>
                <div className="mt-yes"><b>Așa da, despre o firmă</b>„Un sfert din valoarea contractelor directe atribuite Firmei A din 2018 încoace a venit din achiziții declarate peste plafon, la două primării. Plafonul e obligația cumpărătorului; am cerut punctul de vedere al primăriilor și al firmei.”</div>
                <div className="mt-no"><b>Așa nu</b>„Comuna Exemplu, printre cele mai riscante primării din țară.” Scorul nu e o vină, nu e o probă. În titlu, scrie tiparul, nu scorul sau locul în clasament.</div>
              </div>
              <p className="mt-cite" id="cite">Comuna Exemplu: trei comenzi de mobilier la aceeași firmă, adunate peste plafon (tipar de verificat); scor 55 din 100 (moderat), un indicator, nu o constatare; versiunea metodologiei {VERSION}; scor calculat la {riskDay ?? "…"}, din datele SEAP de până atunci; cinecâștigă?, https://cinecastiga.ro/entitati/… (adresa paginii), consultat la {today}.</p>
              <button type="button" className="mt-btn" data-copy="cite">Copiază modelul de citare</button>
              <p className="mt-how">Pagina arată mereu datele cele mai noi. Păstrează fișierul cu înregistrările descărcat în ziua citării și scrie versiunea și data: la o versiune nouă, scorul se poate schimba.</p>
            </div>
            <div className="mt-key mt-role-box" id="alesi-p">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <div>
                <p><b>Ești ales local?</b> Ceri în comisie, în ședința de consiliu sau printr-o întrebare scrisă: programul anual al achizițiilor, referatele de necesitate, notele justificative și hotărârea de rectificare, cu datele lor.</p>
                <div className="mt-write">
                  <div className="mt-yes"><b>Așa da, în ședință</b>„Trei comenzi de mobilier la aceeași firmă, adunate, trec de plafon. Cer referatele de necesitate și notele justificative.”</div>
                  <div className="mt-no"><b>Așa nu</b>„Primăria are scor 55, e printre cele mai riscante.” Scorul nu e o vină, nu e o probă.</div>
                </div>
                <p>Primăria ta e „fără semnal în scor”? N-am găsit tiparele noastre destul de mari; nu înseamnă că totul e în regulă. Documentele se pot cere oricum.</p>
                <p><b>Model de întrebare scrisă în consiliu</b></p>
                <p className="mt-cite" id="intreb">Către Primăria Comunei Exemplu. În calitate de consilier local, vă rog să-mi comunicați, în scris: programul anual al achizițiilor publice pe 2024, cu anexa privind achizițiile directe; referatele de necesitate și, acolo unde normele le cer, notele justificative pentru achizițiile directe nr. … din data de …; hotărârea de rectificare bugetară din … și data publicării ei. Vă rog să precizați, pentru fiecare, data la care a fost întocmit documentul.</p>
                <button type="button" className="mt-btn" data-copy="intreb">Copiază întrebarea</button>
              </div>
            </div>
            <div className="mt-key mt-role-box" id="achizitor">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                <path d="M5 4h14v16H5z" />
                <path d="M8 9h8M8 13h8M8 17h5" />
              </svg>
              <div>
                <p><b>Lucrezi în achiziții?</b> Site-ul citește ce e în SEAP; ce ajută să fie citit corect: valoarea fără TVA, tipul (produs, serviciu, lucrare) și codul CPV corecte, publicarea la timp, referatul de necesitate la dosar și nota justificativă, acolo unde normele o cer. O sumă trecută cu TVA poate apărea „peste plafon” până o corectezi în SEAP: o preluăm noaptea următoare.</p>
              </div>
            </div>
            <div className="mt-reply" id="raspuns">
              <h3>Ești instituția sau firma din semnal?</h3>
              <p>Dacă o cifră e greșită sau ai explicația unui tipar, scrie-ne la <a href="mailto:contact@cinecastiga.ro">contact@cinecastiga.ro</a>, cu documentele. <b>Răspundem în 10 zile lucrătoare.</b> Dacă documentele arată că am citit greșit datele, corectăm; o schimbare de regulă intră în <a href="#istoric">„Ce s-a schimbat și când”</a>.</p>
              <ul className="mt-plain">
                <li><b>O greșeală a noastră:</b> o corectăm la următoarea actualizare a datelor.</li>
                <li><b>O sumă greșită în SEAP:</b> dacă instituția o poate corecta în SEAP, o preluăm noaptea următoare, iar scorul se reface la calculul săptămânal; dacă nu se mai poate corecta, scrie-ne cu documentul.</li>
              </ul>
              <p>Ajută să trimiți și documentele: programul anual, referatele și, acolo unde normele le cer, notele justificative.</p>
              <div className="mt-cta">
                <a className="mt-report" href="mailto:contact@cinecastiga.ro?subject=Corectur%C4%83">Trimite o corectură</a>
                <a className="mt-s" href="mailto:contact@cinecastiga.ro">contact@cinecastiga.ro</a>
              </div>
            </div>
            <p>Pe site mai sunt semnale care nu intră în scor, de exemplu o singură ofertă la o licitație, și pagina <b>Radiografie</b>, care caută aceleași firme câștigând împreună licitație după licitație. Le citezi la fel: ca lucruri de verificat. Și acolo există explicații obișnuite: firme specializate pe o zonă, asocieri legale, piețe cu puține firme.</p>
            <div className="mt-cta">
              <a className="mt-p" href="/cauta">Caută instituția sau firma ta</a>
              <a className="mt-s" href="/semnale">Vezi toate semnalele</a>
            </div>
          </section>
          <section className="mt-ch mt-col mt-stack" id="epilog" aria-labelledby="h-epilog">
            <h2 id="h-epilog"><span className="mt-ch-n">Epilog</span>Ce s-a aflat la Comuna Exemplu</h2>
            <p>Ioana a văzut semnalele și a trimis primăriei o cerere după Legea 544. Primăria a cerut prelungirea termenului și i-a trimis, după trei săptămâni, 31 de pagini.</p>
            <svg className="mt-scene mt-sm" viewBox="0 0 680 130" role="img" aria-label="Desen: pe birou, dosarul deschis primit de la primărie, un teanc de 31 de pagini și carnetul cu titlul articolului">
              <path d="M0 118h680" stroke="var(--line2)" strokeWidth="2" />
              <path d="M0 118c110-20 220-22 330-10s210 14 350-4v14H0z" fill="var(--sunk)" />
              <g transform="translate(176 34)">
                <path d="M0 8h44l8-8h66v52H0z" fill="var(--c1)" />
                <rect x="6" y="14" width="106" height="38" rx="2" fill="var(--surface)" stroke="var(--line2)" strokeWidth="2" />
                <path d="M16 26h78M16 36h56M16 46h66" stroke="var(--c2)" strokeWidth="3" strokeLinecap="round" />
              </g>
              <rect x="150" y="76" width="380" height="8" rx="3" fill="var(--c4)" />
              <rect x="170" y="84" width="7" height="34" fill="var(--c4)" />
              <rect x="503" y="84" width="7" height="34" fill="var(--c4)" />
              <g transform="translate(318 30)">
                <rect x="0" y="12" width="128" height="34" rx="4" fill="var(--c0)" stroke="var(--line2)" strokeWidth="2" />
                <rect x="6" y="4" width="128" height="38" rx="4" fill="var(--surface)" stroke="var(--line2)" strokeWidth="2" />
                <text x="70" y="28" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="13" fontWeight="600" fill="var(--ink)">31 de pagini</text>
              </g>
              <g transform="translate(462 42)">
                <rect width="58" height="32" rx="3" fill="var(--surface)" stroke="var(--line2)" strokeWidth="2" />
                <path d="M9 11h40M9 21h26" stroke="var(--orange)" strokeWidth="3" strokeLinecap="round" />
              </g>
            </svg>
            <ul className="mt-plain">
              <li><b>Mobilierul:</b> trei referate de necesitate, de la trei școli, în luni diferite. Întrebarea pentru primărie: se putea prevedea nevoia de la început, în programul anual? Dacă da, legea cerea o singură procedură.</li>
              <li><b>Cele două sume peste plafon:</b> cea de 300.000 de lei fusese trecută în SEAP cu TVA; fără TVA (19%, cota din 2024), era 252.100 lei, sub plafon. Primăria a cerut corectarea ei. Cea de 330.000 de lei rămâne o achiziție directă peste plafon, fără explicație în documente.</li>
              <li><b>Decembrie:</b> bugetul fusese suplimentat în noiembrie. Hotărârea de rectificare explică decembrie 2024; decembrie 2022 rămâne de lămurit.</li>
              <li><b>Cele șapte achiziții imediat sub plafon:</b> încă de lămurit; pot fi prețuri din catalog.</li>
            </ul>
            <div className="mt-key">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <p><b>Scorul se schimbă când se schimbă datele sau metodologia.</b> După corectura din SEAP rămâne o singură sumă peste plafon, iar tiparul cere cel puțin două: scorul comunei scade de la 55 la <b>49</b>. Pe pagina comunei, suma de 330.000 apare cu nota: „O singură achiziție directă peste plafon: se vede aici, dar nu intră în scor; tiparul cere cel puțin două cazuri.” Primăria a explicat decembrie cu hotărârea de rectificare bugetară; hotărârea explică doar 2024, așa că tiparul rămâne în scor.</p>
            </div>
            <details suppressHydrationWarning className="mt-sock">
              <summary>Vezi calculul pentru 49</summary>
              <ul className="mt-calc">
                <li>Fără a doua sumă peste plafon, „Declarate directe, peste plafon” nu mai are două cazuri și iese din scor.</li>
                <li>Plafonul: mobilierul 1,52 + 40% din „Multe sume imediat sub plafon” (1) = 1,92; rămân goale 1 − 0,2 × 1,92 = 0,616.</li>
                <li>Decembrie lasă goale 1 − 0,2 × 0,83 = 0,833.</li>
                <li>Scor = 100 × (1 − 0,616 × 0,833) = 48,7 ≈ <b>49</b>. Cu nivelul rotunjit la 1,5 ar ieși 48; pagina comunei folosește cifrele exacte.</li>
              </ul>
            </details>
            <p>Un tipar s-a lămurit, unul a scăzut la un singur caz, două au rămas întrebări. Ioana a scris despre ce a aflat, cu răspunsul primăriei alături, și a spus clar ce nu se știe încă. Titlul ei: „Comuna Exemplu: o achiziție directă peste plafon, încă fără explicație”. Asta înseamnă un semnal: un drum spre documente, nu o concluzie.</p>
          </section>
          <section className="mt-ch mt-col mt-stack" id="cuvinte" aria-labelledby="h-cuvinte">
            <h2 id="h-cuvinte">Cuvintele din pagină</h2>
            <dl className="mt-gloss">
              <dt>SEAP</dt>
              <dd>Sistemul electronic al achizițiilor publice: registrul în care instituțiile își trec achizițiile.</dd>
              <dt>Achiziție directă</dt>
              <dd>Achiziție declarată în SEAP ca directă, fără licitație sau altă procedură; în mod normal, sub plafon.</dd>
              <dt>Plafon</dt>
              <dd>Suma până la care se poate cumpăra direct. În poveste, cuvântul înseamnă doar asta.</dd>
              <dt>Scor</dt>
              <dd>Numărul de la 0 la 100 de pe pagina unei instituții sau firme: cât de mari și de repetate sunt tiparele găsite. Nu e o vină, nu e o probă.</dd>
              <dt>Benzile scorului</dt>
              <dd>Slab (10–39), moderat (40–67), pronunțat (68–100); sub 10, „fără semnal în scor”.</dd>
              <dt>Semnal</dt>
              <dd>Orice lucru marcat pe site ca „de verificat”: tiparele care intră în scor și cele care nu intră (de exemplu o singură ofertă la o licitație).</dd>
              <dt>Tipar</dt>
              <dd>Un obicei care se repetă în achiziții și merită verificat.</dd>
              <dt>Familie de tipare</dt>
              <dd>Tiparele care spun același lucru (de exemplu, toate cele despre plafon).</dd>
              <dt>Comenzi repetate, fără acord-cadru</dt>
              <dd>Produse medicale (CPV 33) sau cel puțin 12 comenzi mărunte la același furnizor: le arătăm, fără puncte.</dd>
              <dt>Cod CPV</dt>
              <dd>Codul european al lucrului cumpărat. Primele două cifre spun domeniul, primele patru clasa (de exemplu 3916 e mobilier pentru școli).</dd>
              <dt>Acord-cadru</dt>
              <dd>O înțelegere pe câțiva ani care spune cât s-ar putea cumpăra, cel mult.</dd>
              <dt>Referat de necesitate</dt>
              <dd>Documentul în care instituția scrie de ce are nevoie de o achiziție.</dd>
              <dt>Notă justificativă</dt>
              <dd>Documentul în care instituția explică felul în care a ales să cumpere, acolo unde normele o cer.</dd>
              <dt>Programul anual al achizițiilor</dt>
              <dd>Lista achizițiilor pe care instituția le plănuiește pentru anul în curs, aprobată la începutul lui, cu valorile estimate.</dd>
              <dt>Anexa 2</dt>
              <dd>Lista din Legea 98/2016 cu servicii sociale, de sănătate, culturale și altele. Pentru serviciile din Anexa 2, legea cere o procedură proprie a instituției (art. 111), așa că nu le judecăm după plafonul achiziției directe.</dd>
              <dt>Legea 544/2001</dt>
              <dd>Legea accesului la informațiile de interes public: îți dă dreptul să ceri documente unei instituții.</dd>
              <dt>ANAP</dt>
              <dd>Agenția Națională pentru Achiziții Publice: verifică felul în care instituțiile cumpără.</dd>
              <dt>Execuția bugetului</dt>
              <dd>Angajamentele și plățile unei instituții, pe capitole și articole, nu pe contracte. Noi nu o avem.</dd>
              <dt>Curtea de Conturi</dt>
              <dd>Instituția care verifică felul în care sunt folosiți banii publici.</dd>
              <dt>Parchetul</dt>
              <dd>Procurorii care cercetează faptele penale.</dd>
              <dt>Primăriile de sector</dt>
              <dd>Primăriile celor șase sectoare ale Bucureștiului.</dd>
              <dt>TED</dt>
              <dd>Jurnalul Uniunii Europene în care apar licitațiile mari.</dd>
            </dl>
          </section>
          <div className="mt-col mt-lane-end">
            <button type="button" className="mt-go" data-go="reguli">Toate regulile, pentru cine verifică</button>
            <button type="button" className="mt-go2" data-go="scurt">Înapoi la „Pe scurt”</button>
          </div>
        </div>
        <div className="mt-lane" id="lane-reguli" role="tabpanel" aria-labelledby="tab-reguli" hidden>
          <section className="mt-col mt-ref" id="detalii" aria-labelledby="h-detalii">
            <h2 id="h-detalii">Toate regulile, pentru cine verifică</h2>
            <p style={{ color: "var(--ink2)", margin: "10px 0 18px" }}>Metodologia în vigoare: <b>{VERSION}</b>, din {VERSION_SINCE}. Aici sunt pragurile, formulele și excepțiile exacte, plus istoricul schimbărilor. Fiecare regulă are linkul ei.</p>
            <div className="mt-ref-tools">
              <button type="button" className="mt-btn mt-openall" aria-pressed="false">Deschide toate regulile</button>
              <a className="mt-btn-l" href={CODE_URL("packages/db/src/profile-flags.ts")}>Codul scorului, la {VERSION}</a>
              <a className="mt-btn-l" href="/metodologie/constants.json">Constantele, ca JSON</a>
            </div>
            <details suppressHydrationWarning open id="constante">
              <summary>Constantele, într-un tabel</summary>
              <div className="mt-body">
                <p>Toate numerele din calcul, la un loc; constantele formulei sunt și în <a href="/metodologie/constants.json">constants.json</a>. Explicația fiecăruia e în secțiunile de mai jos și în „De ce aceste numere”.</p>
                <div className="mt-tw">
                  <table className="mt-ktab">
                    <thead>
                      <tr>
                        <th>Ce</th>
                        <th>Valoare</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Plafon, produse și servicii</td>
                        <td>270.120 lei din 10.09.2022; 135.060 lei din 04.06.2018; 132.519 lei din 26.05.2016 (fără TVA)</td>
                      </tr>
                      <tr>
                        <td>Plafon, lucrări</td>
                        <td>900.400 lei; 450.200 lei; 441.730 lei, de la aceleași date</td>
                      </tr>
                      <tr>
                        <td>Cine are scor</td>
                        <td>Profilurile cu cel puțin 10 achiziții directe. Sub 10 puncte, „fără semnal în scor”: tiparele rămân vizibile, fără număr. Cumpărătorii privați și firmele unei instituții (in-house) nu au scor.</td>
                      </tr>
                      <tr>
                        <td>Nivelul unui tipar</td>
                        <td>Între 0 și 3. Un nivel valorează 20 de puncte (0,2 × nivel).</td>
                      </tr>
                      <tr>
                        <td>Familia</td>
                        <td>Într-o familie, tiparul cel mai puternic contează întreg, iar fiecare dintre celelalte cu 0,4. Limite: la instituții, plafonul 4, legătura cu o firmă 2, decembrie 1,25; la firme, plafonul 4, un singur client 3, capacitatea 3.</td>
                      </tr>
                      <tr>
                        <td>Capacitatea singură</td>
                        <td>Când e singurul tipar al firmei, intră cu jumătate din nivel (nivelul 1 dă 10 puncte, nivelul 3 dă 30); partea urcă spre întreg pe măsură ce plafonul sau legătura cu un client urcă spre nivelul 1.</td>
                      </tr>
                      <tr>
                        <td>Formula</td>
                        <td>scor = 100 × (1 − (1 − 0,2 × F₁) × (1 − 0,2 × F₂) × …)</td>
                      </tr>
                      <tr>
                        <td>Benzi</td>
                        <td>0–9 fără semnal în scor; 10–39 slab; 40–67 moderat; 68–100 pronunțat</td>
                      </tr>
                      <tr>
                        <td>Limita dovezilor</td>
                        <td>Pe tipar. După număr: cel mult 1 la 10 achiziții directe, 3 de la 30, proporțional între ele. La tiparele despre sume („Adunate, trec de plafon”, „Declarate directe, peste plafon”, capacitatea), de la 5 achiziții contează și valoarea: 1 la 0,5 milioane lei, 2 la 1 milion, 3 la 2 milioane; se ia cea mai mare dintre cele două. La „Multe sume imediat sub plafon”, „Un singur client public mare” și „O firmă primește mare parte din bani”, doar numărul. Decembrie are limita lui.</td>
                      </tr>
                      <tr>
                        <td>Adunate, trec de plafon</td>
                        <td>cel puțin 3 achiziții directe: aceeași instituție, firmă, an, clasă CPV (4 cifre) și tip; grupul contează de la 1,2 × plafon (nimic) la 2 × (întreg) și cântărește mai puțin când comenzile sunt mici; nu contează produsele medicale (CPV 33), grupurile mai ales din Anexa 2 și grupurile de cel puțin 12 comenzi cu media sub 10% din plafon; toate grupurile, din toți anii, se adună; nivelul după partea lor din valoarea directă: de la 1% (nivel 0) la 2% (nivel 1), 8% (nivel 2) și 20% (nivel 3); la firme, 2,5%, 5%, 20% și 50%</td>
                      </tr>
                      <tr>
                        <td>Multe sume imediat sub plafon</td>
                        <td>achizițiile la 96–100% din plafon; r = (găsite + 1) ÷ (așteptate + 1), cu cel puțin 0,5 așteptate; nivelul urcă de la 0 la r = 1,5 până la 1 la r = 2, apoi log₂ r (2 la r = 4, 3 la r = 8); cel puțin 3 găsite; nivelul 2 cere cel puțin 5 găsite, nivelul 3 cel puțin 8</td>
                      </tr>
                      <tr>
                        <td>Declarate directe, peste plafon</td>
                        <td>doar sumele de peste 1,1 × plafon cu valoarea estimată peste plafon sau cu suma finală peste 1,21 × plafon (peste plafon și cu TVA de 21%); un caz = o instituție într-o lună; după număr: 2 cazuri dau nivelul 1, 3 cazuri nivelul 2, 5 cazuri nivelul 3; după bani: 0,5% din valoarea directă dă nivelul 1, 3% nivelul 2, 10% nivelul 3, pornind de la 0,25% (la firme 2%, 12%, 40%, pornind de la 0); se ia cel mai mic; la o instituție, cu 2 cazuri, cel puțin 0,5</td>
                      </tr>
                      <tr>
                        <td>Mulți bani contractați în decembrie</td>
                        <td>un an e marcat când partea lui decembrie trece de percentila 95 a instituțiilor de același tip, în același an, și ajunge la cel puțin 35%; pași = (partea lui decembrie − mediana) ÷ (percentila 95 − mediana); media celor mai mari două decembrii × ani ÷ (ani + 2); nivel = 1,25 × (pași − 1) ÷ 1,5, cel mult 1,25</td>
                      </tr>
                      <tr>
                        <td>O firmă primește mare parte din bani</td>
                        <td>partea unui furnizor din valoarea directă, fără cea mai mare achiziție a lui: de la 50% (nivel 0) la 60% (nivel 1), 75% (nivel 2) și 90% (nivel 3); familia legăturii rămâne cel mult 2 la o instituție</td>
                      </tr>
                      <tr>
                        <td>Un singur client public mare</td>
                        <td>cel puțin 70% din vânzările directe ale firmei merg la o instituție (contează întreg de la 85%, treptat între 70% și 85%); nivelul după partea firmei din achizițiile directe ale instituției: sub 5% de la 0,5, 5% dă nivelul 1, 20% nivelul 2, 50% nivelul 3</td>
                      </tr>
                      <tr>
                        <td>Contracte directe peste cifra de afaceri</td>
                        <td>achizițiile directe ale anului ÷ cifra de afaceri din bilanțul aceluiași an (un an fără bilanț nu se judecă): de la 1 × (nivel 0) la 1,5 × (nivel 1), 3 × (nivel 2) și 10 × (nivel 3); +0,5 în primii doi ani de la înregistrarea la Registrul Comerțului; o cifră de afaceri sub 10.000 lei sau 0 angajați la 500.000 lei contractați dau cel puțin nivelul 1</td>
                      </tr>
                      <tr>
                        <td>La o firmă, tiparele de plafon</td>
                        <td>împreună, cel mult 1,5 când primele două instituții au sub 60% din aceste achiziții; limita urcă până la 80%, apoi dispare</td>
                      </tr>
                      <tr>
                        <td>Comparația „Locul N din M”</td>
                        <td>N = 1 + membrii grupului cu un scor strict mai mare; M = membrii grupului, cu profilul; profiluri cu cel puțin 10 achiziții directe; cel puțin 5 alți membri; doar la moderat și pronunțat; spitalele fără; firmele în domeniul CPV principal, cu cel puțin 100 de firme</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
            <details suppressHydrationWarning id="praguri-firme">
              <summary>Pragurile pentru firme</summary>
              <div className="mt-body">
                <p>Aceleași reguli, văzute din partea firmei. Plafonul e obligația cumpărătorului; scorul unei firme arată unde să te uiți, nu că firma a greșit.</p>
                <div className="mt-tw">
                  <table className="mt-ktab">
                    <thead>
                      <tr>
                        <th>Ce</th>
                        <th>Pragul</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Scor</td>
                        <td>doar de la 10 achiziții directe câștigate; sub 10 puncte, „fără semnal în scor”</td>
                      </tr>
                      <tr>
                        <td>Declarate directe, peste plafon</td>
                        <td>cel puțin 2 cazuri; partea din vânzările directe: 2% dă nivelul 1, 12% nivelul 2, 40% nivelul 3, pornind de la 0</td>
                      </tr>
                      <tr>
                        <td>Adunate, trec de plafon</td>
                        <td>grupurile cântăresc 5% din vânzările directe pentru nivelul 1 (de la 2,5%), 20% pentru 2, 50% pentru 3</td>
                      </tr>
                      <tr>
                        <td>Multe sume imediat sub plafon</td>
                        <td>ca la instituții: de 2 ori mai multe decât de așteptat dau nivelul 1, de 4 ori nivelul 2 (cu cel puțin 5), de 8 ori nivelul 3 (cu cel puțin 8)</td>
                      </tr>
                      <tr>
                        <td>Cele trei tipare de plafon, împreună</td>
                        <td>cel mult 1,5 (30 de puncte) când primele două instituții au sub 60% din aceste achiziții; limita urcă până la 80%, apoi dispare; la utilități și furnizorii de masă contează doar partea cu primele două instituții</td>
                      </tr>
                      <tr>
                        <td>Un singur client public mare</td>
                        <td>o instituție aduce cel puțin 70% din vânzările directe (întreg de la 85%); partea firmei din achizițiile ei: sub 5% între 0,5 și 1, 5% dă nivelul 1, 20% nivelul 2, 50% nivelul 3</td>
                      </tr>
                      <tr>
                        <td>Contracte directe peste cifra de afaceri</td>
                        <td>bilanțul aceluiași an: 1,5 × cifra de afaceri dă nivelul 1 (de la 1 ×), 3 × nivelul 2, 10 × nivelul 3; +0,5 în primii doi ani de la înregistrare; cifra de afaceri sub 10.000 lei sau 0 angajați la 500.000 lei: cel puțin nivelul 1; singur, contează pe jumătate</td>
                      </tr>
                      <tr>
                        <td>Produse medicale (CPV 33)</td>
                        <td>nu intră la „Declarate directe, peste plafon” și nici la „Adunate, trec de plafon”</td>
                      </tr>
                      <tr>
                        <td>Comparația</td>
                        <td>în domeniul CPV principal, doar unde domeniul are cel puțin 100 de firme</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
            <details suppressHydrationWarning id="plafoane">
              <summary>Plafoanele achiziției directe, pe perioade</summary>
              <div className="mt-body">
                <p>Valorile sunt fără TVA (Legea 98/2016, art. 7 alin. 5; OUG 45/2018; Legea 208/2022).</p>
                <div className="mt-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Din</th>
                        <th className="mt-n">Produse și servicii</th>
                        <th className="mt-n">Lucrări</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DA_CEILING_ERAS.map((era) => (
                        <tr key={era.validFrom}>
                          <td>{coverageDate(era.validFrom)}</td>
                          <td className="mt-n">{formatInt(era.goodsServices)} lei</td>
                          <td className="mt-n">{formatInt(era.works)} lei</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul>
                  <li>Datele noastre încep în 2018: achizițiile din ianuarie–mai 2018 se compară cu plafoanele din 2016.</li>
                  <li>Tipul declarat are prioritate, dar lipsește aproape mereu; atunci folosim clasificarea CPV. Clasificările necunoscute sunt excluse din comparația cu plafonul.</li>
                  <li>Publicarea aproximează inițierea; în lipsa ei folosim finalizarea. Aceste aproximări sunt declarate în dovezi.</li>
                  <li>Legea privește necesarul estimat; valorile de închidere sunt un reper analitic.</li>
                  <li>Pentru serviciile din Anexa 2, legea cere o procedură proprie a instituției (art. 111), așa că nu le judecăm după plafonul achiziției directe.</li>
                </ul>
              </div>
            </details>
            <details suppressHydrationWarning id="acoperire">
              <summary>Ce date avem și unde sunt limitele</summary>
              <div className="mt-body mt-coverage">
                <DataCoverage />
              </div>
            </details>
            <details suppressHydrationWarning id="totaluri">
              <summary>Ce intră în totaluri</summary>
              <div className="mt-body">
                <p>Totalurile obișnuite folosesc achiziții directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, plus contracte prin proceduri cu valoare pozitivă de cel mult 1 miliard lei, dată și autoritate cunoscute, cel puțin un câștigător diferit de autoritatea contractantă și valoare în lei verificată (declarată sau convertită din sursă). Limitele de 2 milioane și 1 miliard sunt filtre de plauzibilitate ale aplicației, nu praguri legale. O sumă de peste ele e de obicei o greșeală la introducere, dar nu o tratăm ca dovadă: nu o putem verifica, așa că nu o adunăm. Ofertele refuzate sau expirate nu intră.</p>
                <p>Profilurile entităților, partenerii, harta și căutările obișnuite după valoare folosesc aceeași populație. Valorile nule, nepozitive sau peste limită rămân accesibile în lista achizițiilor unei entități, prin opțiunea „Arată achizițiile directe excluse din total”; contractele peste 1 miliard lei sunt numărate și însumate în <a href="#acoperire">inventar</a>, listate pe pagina instituției și a furnizorului, iar pagina contractului arată că nu e inclus în totaluri.</p>
                <p>Când singurul câștigător înregistrat este chiar autoritatea, furnizorul nu este cunoscut: contractul rămâne vizibil, marcat, dar nu intră în totaluri. O achiziție directă al cărei furnizor înregistrat este chiar autoritatea rămâne în totalul autorității, ca o achiziție fără furnizor cunoscut, dar nu apare ca venit de furnizor, partener sau dependență. Fără monedă ori conversie verificabilă, suma nu intră în totaluri. Inventarul declară lipsurile din înregistrările sursă înainte de celelalte filtre.</p>
                <p>Sumele sunt nominale, în lei din anul fiecărei achiziții: adunăm ani cu plafoane și prețuri diferite, fără ajustare pentru inflație. O ofertă acceptată sau un contract semnat nu dovedește că banii au fost plătiți.</p>
                <h4>Consorții</h4>
                <p>Pe profilul entității, fiecare contract apare o singură dată în numărul de contracte distincte. Căutările și lista surselor numără rânduri contract–furnizor: câte unul pentru fiecare câștigător. În lipsa cotelor reale, valoarea unui consorțiu este împărțită egal între membri. Cotele însumate refac valoarea contractului; nu dovedesc venitul încasat de fiecare firmă.</p>
                <h4>Acorduri-cadru</h4>
                <p>Toate plafoanele acordurilor-cadru sunt separate de totaluri, inclusiv când nu avem contracte subsecvente identificate. Însumăm numai contractele și comenzile identificate. Lipsa comenzilor este o limită de acoperire, nu cheltuială zero. Folosim tipul declarat de SEAP; pentru istoricul fără tip, folosim descrierea. Încadrarea după descriere poate greși, de exemplu un acord-cadru al cărui titlu nu spune asta; <a href="#acoperire">inventarul</a> arată câte contracte și ce valoare depind de ea.</p>
                <h4>Republicări</h4>
                <p>Când SEAP republică același contract (același anunț, număr, dată, lot și autoritate), îl numărăm o singură dată, la ultima versiune verificată. Acceptăm și versiunile pe care SEAP nu le marchează ca modificate, dacă diferă doar valoarea, dacă se adaugă furnizori fără să dispară vreunul sau dacă titlul numește un act adițional. Astfel de schimbări sunt semnalate pe pagina contractului. Un titlu schimbat fără mențiunea unui act adițional rămâne exclus până la verificare. Pentru procedurile publicate fără identificator de procedură (negociere fără publicare prealabilă, norme proprii) folosim numărul anunțului de atribuire.</p>
                <h4>Acte adiționale</h4>
                <p>Actele adiționale identificate rămân accesibile în surse, dar nu sunt adăugate ca achiziții noi: suma publicată poate reprezenta un total actualizat, o diferență sau o modificare fără impact financiar. Până la verificarea legăturii cu contractul inițial, totalurile nu includ separat aceste sume și pot să nu reflecte toate ajustările.</p>
                <h4>Excluderi temporare</h4>
                <p>Publicațiile cu identitate incertă sunt excluse temporar din calcule, fără ștergerea surselor. <a href="/metodologie/excluderi">Lista cazurilor, motivele și sursele comparate</a> este publică. Le reverificăm la procesarea datelor; reintră în totaluri numai după verificarea identității. Această excludere nu este o constatare de neregulă.</p>
                <h4>Întrebări și scorul de risc</h4>
                <p>Întrebările care numără înregistrări pot include valori pozitive peste filtrul de plauzibilitate; rezultatul și lista surselor declară această selecție. Răspunsurile despre risc folosesc tot istoricul achizițiilor directe acceptate și spun ce filtre pot aplica. Scorul arată tipare de verificat, nu probabilitatea unei ilegalități (<a href="#indice">cum se calculează</a>).</p>
              </div>
            </details>
            <details suppressHydrationWarning>
              <summary>Alte reguli ale site-ului</summary>
              <div className="mt-body">
                <h4 id="diferente-ani">Diferențe între ani</h4>
                <p>În „Întreabă”, schimbarea între doi ani împarte firmele (sau instituțiile, ori județele) selecției în Creșteri, Noi, Scăderi și Nu mai apar; cele cu aceeași valoare în ambii ani se numără separat, iar grupele adună totalul selecției. Noi înseamnă fără nicio înregistrare în primul an, în selecție; Nu mai apar, fără niciuna în al doilea; Prima dată, dintre cele noi, cele a căror primă înregistrare din toată arhiva este în al doilea an. Un contract intră întreg în anul atribuirii, nu în anii în care se execută. Când al doilea an nu e încheiat în date, ambii ani se compară pe aceleași luni, din ianuarie până la ultima lună completă. Valorile sunt înregistrate, nu plăți.</p>
                <h4 id="grupele-retelei">Partenerii unei entități</h4>
                <p>În „Întreabă”, „Cu cine lucrează X?” împarte partenerii față de un an de referință, încheiat în date (din 2021): Noi, cu prima înregistrare a relației din acel an încoace; Continuă, cu înregistrări și înainte, și de atunci; Nu mai apar, fără nicio înregistrare din acel an. Grupele privesc toate achizițiile dintre cei doi, pe toate canalele; domeniul, canalul sau sediul aleg doar cine apare și valorile, iar perioada se aplică doar la Toți. „Cu semnale” păstrează partenerii cu un semnal oficial pe acea relație. O urmărire pe o grupă își fixează partenerii la activare; cei care intră sau ies din grupă apar doar ca notă. Semnalele sunt piste, nu dovezi; valorile sunt înregistrate, nu plăți.</p>
                <h4 id="verificare">Verificarea unei relații</h4>
                <p>În „Întreabă”, „A cumpărat X de la Y?” are trei răspunsuri. Da: cel puțin o înregistrare a perechii în selecție, sau un rând pe care totalurile îl lasă afară (o achiziție directă peste filtrul de 2 milioane lei ori fără valoare pozitivă, un contract cu identitate nesigură, peste 1 miliard lei, fără valoare în lei sau de tip neclar); acesta din urmă se spune „nu intră în sume”. Acord-cadru: perechea are doar plafoane de acord-cadru, care nu sunt achiziții și nu se adună. Nu: nimic din acestea, cu motivul (alegerile întrebării, o condiție dintr-un link vechi sau nicio înregistrare în date). Concurența se numără doar la licitațiile deschise și restrânse cu numărul ofertelor cunoscut din TED. Ponderea relației compară perechea cu ceilalți parteneri ai fiecărei părți, cu aceleași alegeri. Un „Da” nu dovedește livrarea sau plata.</p>
                <h4 id="cine-conduce">Cine conduce?</h4>
                <p>După valoare, „Cine conduce?” arată primele trei locuri ale clasamentului „Cine câștigă?”, cu partea din total a fiecăruia (valoare înregistrată, nu plăți; în contractele în asociere, cotele sunt egale). După risc arată profilurile cu tipare în ordinea scorului (la același scor, după valoarea achizițiilor directe), cu tiparele fiecăruia. Intră doar profilurile cu cel puțin 20 de achiziții directe acceptate. Un nume de cumpărător cu forma unei societăți sau a unei asociații e marcat ca atare; poate fi o companie a unei instituții sau un cumpărător privat. Semnalele sunt piste, nu dovezi.</p>
                <h4 id="numarare-anunturi">Semnale pe anunțuri</h4>
                <p>Semnalele pe anunțuri de atribuire („Negociere fără anunț prealabil”, „O singură ofertă raportată în TED”) se numără altfel: o apariție pentru fiecare anunț. SEAP republică un anunț de atribuire sub același număr când adaugă contracte subsecvente; versiunile aceleiași autorități cu același număr de anunț dau o singură apariție, la ultima versiune care îndeplinește criteriul. Anul semnalului este anul primului contract din anunț, din oricare versiune, nu data ultimei versiuni. Un anunț fără contract cu dată plauzibilă primește anul primei versiuni preluate, iar semnalul spune asta. Același contract republicat sub alt număr de anunț, sau un acord-cadru și contractul subsecvent atribuit din el, pot apărea ca apariții separate. Fiecare semnal spune ce conține anunțul: contracte obișnuite, doar plafonul unui acord-cadru, doar contracte subsecvente sau tipuri diferite. Valoarea unui anunț care conține doar un acord-cadru este plafonul acordului, nu o cheltuială; valorile semnalelor nu se adună la niciun total.</p>
                <h4 id="tip-institutie">Tipul instituției</h4>
                <p>Întrebările și comparațiile folosesc aceeași clasificare. Primăriile de comună, oraș și municipiu vin din registrul localităților, doar când codul localității este din județul instituției și numele este al administrației locale (primărie, consiliu local, UAT). Fără cod, căutăm o singură localitate cu același nume în același județ; altfel decide numele („Primăria comunei …” este o comună). Primăriile celor șase sectoare ale Bucureștiului sunt numărate cu orașele și municipiile. Spitalele sunt numele care încep cu „Spital” și institutele clinice, de exemplu Fundeni sau institutele oncologice; institutele de medicină legală și de cercetare nu intră. Consiliile județene sunt cele 41 din lista valorii pe locuitor, oricum s-ar numi în SEAP („UAT Județul Alba”, „Consiliul Județul Prahova, Direcția Servicii și Achiziții Publice”). Școlile (cu liceele, colegiile și grădinițele, dar și școli de aviație, poliție sau pompieri) sunt după nume, aproximativ. Un nume care se potrivește la două tipuri nu are tip, iar o instituție cu nume neobișnuit poate rămâne fără tip.</p>
                <h4 id="sediul-firmei">Sediul firmei</h4>
                <p>Județul unei firme, oriunde apare (clasamentele, harta furnizorilor, condiția „cu sediul în …”), este sediul ei social: județul ultimei înmatriculări la Registrul Comerțului, pentru un cod fiscal confirmat; când lipsește sau nu e clar, județul din SEAP. Firmele străine apar separat. „În județul instituției” și „În alt județ” compară sediul cu județul instituției care cumpără, la fiecare înregistrare. Sediul nu e locul lucrării: multe firme mari au sediul în București. O firmă fără sediu cunoscut nu intră în nicio condiție de sediu.</p>
                <h4 id="harta-judete">Harta pe județe</h4>
                <p>Fiecare înregistrare stă în județul instituției care cumpără. „Harta arată” schimbă doar culoarea și ordinea, nu selecția. Culorile sunt cinci grupe cu același număr de județe (cuantile); hașurat înseamnă prea puține date pentru un procent. „Firme din județ” este partea valorii câștigată de firme cu sediul în județul instituției, din toată valoarea județului (cu firmele din alte județe, din străinătate și cu sediu necunoscut); e hașurat sub 20 de înregistrări sau când sediul lipsește pentru peste 10% din valoare. „Cota firmei” este valoarea firmei din toate achizițiile județului cu aceleași condiții, hașurată sub 3 înregistrări ale firmei sau 20 ale județului. Fișa județului arată cel mai mare cumpărător și cea mai mare înregistrare, cu procentul lor din județ.</p>
                <p>„Primăriile și consiliile județene” sunt lista strictă de la valoarea pe locuitor (nume, județ și cod SIRUTA concordante, plus primăriile celor șase sectoare și toate cele 41 de consilii județene), fără instituțiile, serviciile și companiile lor. Fiecare stă în județul pe care îl administrează: Consiliul Județean Ilfov, cu sediul în București, e la Ilfov. „Pe locuitor” împarte valoarea lor la populația rezidentă a județului (INS, recensământul din 2021); un județ al cărui consiliu județean nu e încă în listă e hașurat. Pe mai mulți ani, cifra e a întregii perioade, nu o medie pe an.</p>
                <h4 id="marimea-achizitiei">Mărimea, procedura și tipul achiziției</h4>
                <p>Mărimea este valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător: un contract de 1,2 mil. lei cu doi câștigători intră la „peste 1 mil. lei”, iar sumele rămân pe cote. Plajele (sub 10.000 lei, 10.000–100.000, 100.000–1 mil., peste 1 mil.) nu sunt praguri legale. Procedura este cea declarată în SEAP, doar la contractele din proceduri; negocierea fără publicare este permisă în cazuri anume. Tipul vine din codul CPV ales de cumpărător: 45 lucrări, 50–98 servicii, restul produse.</p>
                <h4 id="angajati-benzi">Angajații firmelor</h4>
                <p>Benzile (fără angajați, 1–9, 10–49, 50–249, 250 sau mai mulți) vin din ultimul bilanț depus la Ministerul Finanțelor, nu din anul atribuirii. Firmele fără bilanț (străine, PFA, înființate recent) nu intră în nicio bandă. Pe un clasament de firme banda restrânge lista; totalul și „% din total” rămân ale întregii selecții.</p>
                <h4>TED</h4>
                <p>Pentru TED păstrăm moneda și sensul sumei: valoare de ofertă sau rezultat, interval, plafon de acord-cadru sau necunoscut. Ofertele multiple nu sunt adunate automat într-o valoare a lotului. Sumele în monede diferite nu sunt însumate. Un număr lipsă sau ambiguu de oferte nu este tratat ca o singură ofertă.</p>
              </div>
            </details>
            <details suppressHydrationWarning id="niveluri">
              <summary>Nivelul fiecărui tipar (1, 2, 3)</summary>
              <div className="mt-body">
                <p>Fiecare tipar găsit are o tărie de la 1 la 3, măsurată față de mărimea profilului; între praguri crește proporțional, de la un prag de început până la nivelul 1. <b>Peste nivelul 1 contează și câte dovezi sunt</b> (limita dovezilor): la tiparele despre sume („Declarate directe, peste plafon”, „Adunate, trec de plafon”, capacitatea), limita urcă cu numărul de achiziții directe (1 la 10, 3 la 30) sau, de la 5 achiziții, cu valoarea lor (1 la 0,5 milioane lei, 2 la 1 milion, 3 la 2 milioane), cea mai mare dintre ele. La celelalte („Multe sume imediat sub plafon”, „Un singur client public mare”, „O firmă primește mare parte din bani”) contează doar numărul. Decembrie are limita lui.</p>
                <div className="mt-tw">
                  <table className="mt-lvtab">
                    <thead>
                      <tr>
                        <th>Tipar</th>
                        <th>Nivelul 1</th>
                        <th>Nivelul 2</th>
                        <th>Nivelul 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row"><a href="#da_above_ceiling">Declarate directe, peste plafon</a></th>
                        <td data-l="Nivelul 1">2 cazuri și 0,5% din valoare, de la 0,25% (firme: 2%, de la 0)</td>
                        <td data-l="Nivelul 2">3 cazuri și 3% (firme: 12%)</td>
                        <td data-l="Nivelul 3">5 cazuri și 10% (firme: 40%)</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_split">Adunate, trec de plafon</a></th>
                        <td data-l="Nivelul 1">grupurile cântăresc 2% din valoare, de la 1% (firme: 5%, de la 2,5%)</td>
                        <td data-l="Nivelul 2">8% (firme: 20%)</td>
                        <td data-l="Nivelul 3">20% (firme: 50%)</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_round">Multe sume imediat sub plafon</a></th>
                        <td data-l="Nivelul 1">de 2 ori mai multe decât media națională, de la 1,5 ori (minimum 3; cel puțin 0,5 așteptate)</td>
                        <td data-l="Nivelul 2">de 4 ori, cu cel puțin 5</td>
                        <td data-l="Nivelul 3">de 8 ori, cu cel puțin 8</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_year_end">Mulți bani contractați în decembrie</a></th>
                        <td data-l="Nivelul 1">cele mai mari două decembrii, la 2,2 pași peste obicei (0,83 la 2 pași; cel mult 1,25, la 2,5 pași)</td>
                        <td data-l="Nivelul 2">—</td>
                        <td data-l="Nivelul 3">—</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_concentration">O firmă primește mare parte din bani</a></th>
                        <td data-l="Nivelul 1">60% din valoare la un furnizor, fără cea mai mare achiziție a lui, de la 50%</td>
                        <td data-l="Nivelul 2">75%</td>
                        <td data-l="Nivelul 3">90% (familia rămâne cel mult 2)</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_dependence">Un singur client public mare</a></th>
                        <td data-l="Nivelul 1">85% din vânzări la o instituție și 5% din achizițiile ei directe (sub 5%: de la 0,5; 70–85% din vânzări: treptat)</td>
                        <td data-l="Nivelul 2">20% din achizițiile ei</td>
                        <td data-l="Nivelul 3">50%</td>
                      </tr>
                      <tr>
                        <th scope="row"><a href="#da_capacity">Contracte directe peste cifra de afaceri</a></th>
                        <td data-l="Nivelul 1">achiziții directe de 1,5 × cifra de afaceri din bilanțul aceluiași an, de la 1 ×</td>
                        <td data-l="Nivelul 2">3 ×</td>
                        <td data-l="Nivelul 3">10 ×</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul>
                  <li><b>Declarate directe, peste plafon:</b> contează doar ce trece de plafon cu valoarea estimată sau, cu suma finală, chiar și cu TVA (21%). Cazuri = cumpărător × lună; contează scara mai mică dintre număr și valoare. La o instituție, 2 cazuri dau cel puțin nivelul 0,5. Numărăm doar la cumpărătorii obligați de plafon și doar unde excepțiile cunoscute nu se pot aplica: Anexa 2, CPV 33, Unifarm, 26.02–14.05.2020 (începutul pandemiei COVID-19), produse și servicii care ar încăpea sub plafonul de lucrări (cel puțin 90% din el, sau CPV 31, 34, 39, 44, 71 sub el), valori de peste două ori estimarea.</li>
                  <li><b>Adunate, trec de plafon:</b> cel puțin 3 achiziții directe ale aceleiași instituții de la aceeași firmă, în același an, cu aceeași clasă CPV și același tip. Un grup cântărește după cât trece suma lui de plafon (nimic la 1,2×, întreg de la 2×) și după mărimea achizițiilor; grupurile mai ales din Anexa 2 nu contează. Nu contează nici produsele medicale (CPV 33), nici grupurile cu cel puțin 12 comenzi sub 10% din plafon în medie: apar ca „comenzi repetate, fără acord-cadru”, fără puncte. Legea cere ca nevoia unui an să fie cumulată, dar asta e o problemă de planificare, nu o pistă de fragmentare. Clasa CPV (primele 4 cifre) e o aproximare a „aceluiași obiect” din lege.</li>
                  <li><b>Multe sume imediat sub plafon:</b> achizițiile la 96–100% din plafon, față de câte ar fi după media națională de același tip și aceleași plafoane: „așteptate” = câte achiziții are profilul între 50% și 96% din plafon, înmulțit cu raportul național dintre achizițiile la 96–100% și cele la 50–96%, pe același tip și aceleași plafoane. Tăria = log₂ al raportului (găsite + 1) ÷ (așteptate + 1), cu cel puțin 0,5 așteptate; nivelul 2 cere cel puțin 5 astfel de achiziții, nivelul 3 cel puțin 8.</li>
                  <li><b>Decembrie:</b> un an e marcat când partea lui decembrie trece de cea a 95% din instituțiile de același tip și ajunge la cel puțin 35%. Tăria: cât de departe sunt cele mai mari două decembrii de mediana lor, micșorată cu ani ÷ (ani + 2); cel mult 1,25, deci singur rămâne „slab”.</li>
                  <li><b>O firmă primește mare parte din bani:</b> tiparul ajunge la nivelul 3, dar familia legăturii rămâne cel mult 2 la o instituție.</li>
                  <li><b>Contracte directe peste cifra de afaceri:</b> doar cu bilanțul aceluiași an; un an fără bilanț, cum e anul în curs, nu se evaluează. O cifră de afaceri sub 10.000 lei sau 0 angajați la 500.000 lei dau nivelul 1; +0,5 pentru o firmă în primii doi ani de la înregistrarea la Registrul Comerțului. Se poate explica: subcontractare, o firmă abia înființată cu un contract mare. Un contract pe mai mulți ani intră întreg în anul atribuirii și poate umfla raportul; de aceea, singur, tiparul contează pe jumătate.</li>
                  <li><b>Pe o firmă</b>, „Declarate directe, peste plafon”, „Adunate, trec de plafon” și „Multe sume imediat sub plafon” țin de obligația cumpărătorului: împreună cântăresc cel mult 1,5 când vânzările firmei sunt împrăștiate; limita urcă treptat de la 60% la primele două instituții și dispare la 80%. La utilități și furnizorii de masă contează doar partea cu primele două instituții.</li>
                  <li><b>Cumpărătorii:</b> plafonul se verifică la instituțiile publice, la asociațiile de dezvoltare intercomunitară (ADI) și la operatorii sectoriali publici. Cumpărătorii privați nu primesc scor: tiparele lor apar doar ca observații. La asociații, inclusiv organizațiile utilizatorilor de apă pentru irigații, „Declarate directe, peste plafon” nu se verifică, iar „Adunate, trec de plafon” cântărește pe jumătate. Firma unei instituții (in-house) nu primește scor. Regimul se citește din forma juridică și din nume, cu excepțiile verificate de mână de mai jos.</li>
                </ul>
                <h4 id="cumparatori-verificati">Cumpărători verificați de mână ({formatInt(BUYER_REGIME_OVERRIDES.length)})</h4>
                <ul>
                  {BUYER_REGIME_OVERRIDES.map((o) => (
                    <li key={o.cui}>{o.name} (CUI {o.cui}): {o.regime === "classic" ? "verificat ca instituție" : "cumpărător privat"}, {o.why}.</li>
                  ))}
                </ul>
              </div>
            </details>
            <details suppressHydrationWarning>
              <summary>De ce aceste numere</summary>
              <div className="mt-body">
                <ul>
                  <li><b>20 de puncte pe nivel, cel mult 60 pentru un tipar:</b> ca un singur tipar, oricât de mare, să nu ajungă „pronunțat” (de la 68).</li>
                  <li><b>40% pentru celelalte tipare din aceeași familie:</b> ca dovezile despre același lucru să nu se adune de parcă ar fi independente.</li>
                  <li><b>Cât contează acel 40%:</b> am recalculat scorurile din 5 noiembrie 2026 (rf-2026.22) cu 30% și cu 50%. La instituții, 1,6% și 1% din profilurile cu scor își schimbă banda, iar dintre primele 100 rămân în top 88, respectiv 84. La firme, 0,2% în ambele cazuri; dintre primele 100 rămân 96. Cu 0% (doar tiparul cel mai puternic) instituțiile „pronunțat” ar scădea de la 44 la 3; cu 100% (adunare simplă) ar urca la 132. Doar 23% din instituțiile cu scor și 6% din firme au două tipare în aceeași familie: regula le atinge doar pe ele, dar printre ele sunt aproape toate cele pronunțate.</li>
                  <li><b>Celelalte numere din calcule:</b> +1 la „Multe sume imediat sub plafon”, ca 2 față de 1 să nu arate ca o dublare, și cel puțin 0,5 așteptate, ca trei sume la un profil fără achiziții mijlocii să nu facă singure un tipar; la decembrie, ani ÷ (ani + 2): cu 8 ani micșorăm cu o cincime, cu 30 de ani aproape deloc, iar ÷ 1,5 face ca nivelul să ajungă la maxim (1,25) la 2,5 pași, adică la percentila 95 plus încă o jumătate de pas; 1,2 și 2 ori plafonul: un grup care abia trece de plafon poate fi o estimare imprecisă, unul dublu nu.</li>
                  <li><b>Decembrie cel mult 1,25 (25 de puncte):</b> multe instituții primesc bani târziu, deci decembrie singur rămâne „slab”.</li>
                  <li><b>1,21 ori plafonul:</b> legea judecă valoarea estimată, fără TVA; o sumă finală trecută cu TVA (21%) nu e numărată ca depășire.</li>
                  <li><b>10 achiziții directe și 10 puncte:</b> sub ele nu dăm un număr; tiparele găsite rămân vizibile pe pagină.</li>
                  <li><b>2 milioane și 1 miliard:</b> filtre de plauzibilitate, nu praguri legale.</li>
                  <li>Pragurile le-am ales noi. Le-am încercat pe 200 de profiluri (100 de instituții, 100 de firme): am citit cazurile cu scor mare și am schimbat regulile acolo unde scorul măsura mărimea, nu tiparul. Asta nu e o validare. Distribuția scorurilor pe benzi e în capitolul 6. Nu sunt calibrate pe cazuri judecate și nu avem încă o rată a alarmelor false: asta ar cere cazuri închise. Scorul e un instrument de orientare.</li>
                  <li>Între 1 și 5 noiembrie 2026 scorul s-a schimbat de patru ori: rf-2026.18 a trecut indicele la scorul 0–100, rf-2026.20 a adus familiile, rf-2026.21 a netezit scara, rf-2026.22 a cerut 10 achiziții directe și 10 puncte și a scos dovezile numărate de două ori (rf-2026.19 n-a schimbat scorul). Orice schimbare primește o versiune nouă și o notă mai jos.</li>
                  <li><b>Ce poți folosi:</b> înregistrările și sumele sunt fapte, din SEAP. Scorul și comparația îți spun unde să cauți; nu sunt argumente în sine.</li>
                </ul>
              </div>
            </details>
            <details suppressHydrationWarning id="formula">
              <summary id="indice">Formula scorului și benzile</summary>
              <div className="mt-body">
                <p>Scorul privește doar achizițiile directe acceptate, cu valoare pozitivă de cel mult 2 milioane lei, din toată arhiva; filtrele unei pagini sau ale unei întrebări nu îl schimbă, iar pagina entității spune ce parte din bani sunt achizițiile directe. <b>Instituții, {RISK_CRITERIA.authority.length} tipare:</b> <PatternList codes={RISK_CRITERIA.authority} />. <b>Firme, {RISK_CRITERIA.supplier.length} tipare:</b> <PatternList codes={RISK_CRITERIA.supplier} />. Semnalele din proceduri, bilanțuri și ONRC nu intră în scor; pagina entității le arată separat.</p>
                <p>Tiparele se grupează în patru familii: evitarea plafonului („Declarate directe, peste plafon”, „Adunate, trec de plafon”, „Multe sume imediat sub plafon”), legătura cu o firmă (concentrare sau dependență), decembrie și capacitatea firmei. O familie ia tiparul cel mai puternic plus 0,4 din celelalte, până la limita familiei: plafonul 4, legătura cu o firmă 2 la instituții și 3 la firme, decembrie 1,25, capacitatea 3. Capacitatea singură contează pe jumătate; cu alte tipare urcă spre întreg. Familiile se combină (F₁, F₂… sunt familiile):</p>
                <p className="mt-math">scor = 100 × (1 − (1 − 0,2 × F₁) × (1 − 0,2 × F₂) × …)</p>
                <p>Benzi: 0–9 „fără semnal în scor” (tiparele mici se văd pe pagină, fără număr); 10–39 slab; 40–67 moderat; 68–100 pronunțat. Un tipar singur ajunge cel mult la 60, deci „pronunțat” cere cel puțin două tipare; o familie singură ajunge cel mult la 80, decembrie singur la 25, capacitatea singură la 30. Sub 10 nu certifică lipsa neregulilor: datele incomplete pot schimba rezultatul; verifică perioada fiecărui semnal și sursele lui. Pagina entității împarte scorul în puncte fără să conteze ordinea: fiecare familie primește o parte proporțională cu −ln(1 − 0,2 × F); în familie, tiparul cel mai puternic contează întreg, celelalte cu 0,4; părțile se rotunjesc deodată, iar punctele rămase merg la părțile cu cele mai mari zecimale. Exemplu: „Adunate, trec de plafon” la tăria 2,51 și concentrare la 2,24 (legătura, plafonată la 2): 100 × (1 − 0,498 × 0,6) ≈ 70 din 100, împărțit în 40 + 30.</p>
                <p>Comparația „{exampleRank(f)} · …” apare doar la moderat și pronunțat. Locul = 1 + câți din grup au un scor strict mai mare, deci profilurile fără scor nu îl umflă; „din” = membrii grupului, cu profilul. Grupurile: primăriile după populație (INS, recensământul din 2021, între jumătate și dublul populației; comune, orașe și municipii laolaltă, doar cele identificate sigur), consiliile județene, primăriile de sector, școlile, organizațiile utilizatorilor de apă pentru irigații între ele; instituțiile fără un tip sigur, toată țara. Spitalele nu au comparație: un spital județean și unul orășenesc nu se aseamănă. Firmele se compară în domeniul lor principal (diviziunea CPV cu cei mai mulți bani), doar unde domeniul are cel puțin 100 de firme. „Unde se situează?” din „Întreabă” arată câți au un scor mai mare, egal sau mai mic; acolo se mai pot alege județul și activitatea apropiată (între jumătate și dublul achizițiilor directe). Intră profilurile cu cel puțin 10 achiziții directe; comparația cere cel puțin 5 alți membri.</p>
                <p>Un profil fără nicio achiziție sau contract în ultimele 24 de luni e „istoric”: scorul și dovezile rămân, clasamentele nu îl arată implicit.</p>
              </div>
            </details>
            <details suppressHydrationWarning id="distributie">
              <summary>Scorurile pe tipuri de instituții</summary>
              <div className="mt-body">
                {f ? (
                  <>
                    <div className="mt-tw">
                      <table className="mt-dtab">
                        <thead>
                          <tr>
                            <th>Tip</th>
                            <th className="mt-n">Profiluri</th>
                            <th className="mt-n">Fără semnal</th>
                            <th className="mt-n">Slab</th>
                            <th className="mt-n">Moderat</th>
                            <th className="mt-n">Pronunțat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.kinds.map((k) => (
                            <tr key={k.key}>
                              <th scope="row">{KIND_ROW_LABEL[k.key]}</th>
                              <td className="mt-n" data-l="Profiluri">{formatInt(k.total)}</td>
                              <td className="mt-n" data-l="Fără semnal">{formatInt(k.none)}</td>
                              <td className="mt-n" data-l="Slab">{formatInt(k.slab)}</td>
                              <td className="mt-n" data-l="Moderat">{formatInt(k.moderat)}</td>
                              <td className="mt-n" data-l="Pronunțat">{formatInt(k.puternic)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ScoreHistogram kinds={f.kinds} />
                    <p>Profilurile cu cel puțin 10 achiziții directe, cu scorurile din {riskDay} (<span className="mt-nw">{VERSION}</span>). Tipul e cel din „Întreabă” (<a href="#tip-institutie">cum se stabilește</a>); organizațiile utilizatorilor de apă și primăriile de sector, ca în comparație.</p>
                  </>
                ) : (
                  <p>Scorurile pe tipuri nu au putut fi citite acum.</p>
                )}
              </div>
            </details>
            <details suppressHydrationWarning id="alte-semnale">
              <summary>Semnalele care nu intră în scor</summary>
              <div className="mt-body">
                <ul>
                  <li><b>O singură achiziție directă peste plafon.</b> Pe pagina entității: <span className="mt-sitequote">„O singură achiziție directă peste plafon: se vede aici, dar nu intră în scor; tiparul cere cel puțin două cazuri.”</span></li>
                  <li><b>Comenzi repetate, fără acord-cadru:</b> produse medicale (CPV 33) sau cel puțin 12 comenzi mărunte (în medie sub 10% din plafon) la același furnizor, în același an. Legea cere ca nevoia unui an să fie cumulată, dar asta ține de planificare: apar fără puncte.</li>
                  <li><b>Profilurile cu mai puțin de 10 achiziții directe:</b> tiparele se văd, fără scor.</li>
                  <li><b>Negociere fără anunț prealabil:</b> procedură fără anunț prealabil; numărul ofertelor se verifică separat. Legea o permite în cazuri anume.</li>
                  <li><b>O singură ofertă raportată în TED:</b> cel puțin un lot cu exact o ofertă raportată și o asociere TED confirmată.</li>
                  <li><b>Concentrare pe un câștigător:</b> o mare parte din valoarea contractelor prin proceduri revine unui singur furnizor.</li>
                  <li><b>Contracte concentrate la o autoritate:</b> majoritatea valorii contractelor unui furnizor provine de la o autoritate.</li>
                  <li><b>Puțini salariați, valori contractate mari:</b> cel mult 5 salariați, cel puțin 2 mil. lei în achiziții înregistrate într-un an. Se poate explica: subcontractare, firmă de intermediere.</li>
                  <li><b>Valori contractate raportate la cifra de afaceri:</b> raport de cel puțin 75%.</li>
                  <li><b>Reprezentant comun, aceeași autoritate:</b> firme cu un reprezentant legal comun au achiziții la aceeași autoritate.</li>
                </ul>
                <p>Semnalele pe anunțuri se numără o dată pentru fiecare anunț de atribuire, nu pentru fiecare versiune.</p>
              </div>
            </details>
            <details suppressHydrationWarning id="semnale">
              <summary>Fiecare semnal: ce măsoară și limita lui</summary>
              <div className="mt-body">
                {FLAG_ORDER.map((c) => {
                  const m = FLAG_META[c]!;
                  const roles = scoreRoles(c);
                  return (
                    <div className="mt-sig" key={c} id={c}>
                      <h4>{m.title} <span className="mt-chip">{SUBJECT_LABEL[m.subject]}</span></h4>
                      {roles && <p className="mt-how">În scorul de risc ({roles}): <a href="#niveluri">nivelurile</a>.</p>}
                      <p><b>Ce măsoară:</b> {m.description}</p>
                      <p><b>Ce merită verificat:</b> {m.rationale}</p>
                      <p className="mt-how"><b>Limită:</b> {m.caveat.endsWith(AWARD_COUNTING_CAVEAT)
                        ? <>{m.caveat.slice(0, -AWARD_COUNTING_CAVEAT.length)}Numărare pe anunț: vezi <a href="#numarare-anunturi">Semnale pe anunțuri</a>.</>
                        : m.caveat}</p>
                    </div>
                  );
                })}
              </div>
            </details>
            <details suppressHydrationWarning id="radiografie">
              <summary>Radiografie</summary>
              <div className="mt-body">
                <p>Pagina <i>Radiografie</i> a unei autorități contractante arată tiparele structurale pe care scorul de risc nu le vede: concentrarea atribuirilor, câștigători care reapar la aceleași proceduri și grupuri de achiziții directe sub prag. Toate se recalculează la fiecare actualizare a datelor, pentru fiecare autoritate.</p>
                <h4>Dependență reciprocă</h4>
                <p>Pentru fiecare furnizor cu cel puțin 0,1% din contractele autorității (sau 500.000 lei): ponderea lui în valoarea contractată de autoritate, ponderea autorității în tot ce a câștigat el pe SEAP și raportul dintre <b>valoarea contractată</b> în ultimii patru ani cu bilanț și <b>cifra de afaceri</b> din anii acoperiți de acele contracte. Un contract sau o comandă identificată acoperă anul semnării; plafoanele acordurilor-cadru sunt excluse. Un raport peste 1 poate însemna încasări viitoare sau lucrări făcute de altcineva; e un semnal, nu o dovadă.</p>
                <h4>Carusel de loturi</h4>
                <p>Doar licitațiile cu cel puțin 3 contracte (loturi), grupate pe clasa CPV (4 cifre). Un consorțiu e un singur câștigător. Tiparele reținute trebuie să se <b>repete</b>:</p>
                <ul>
                  <li><b>rotația</b>: 3+ câștigători care revin împreună în 2+ licitații;</li>
                  <li><b>împărțirea în doi</b>: 2 câștigători care iau împreună toate loturile în 2+ licitații;</li>
                  <li><b>măturarea</b>: un câștigător ia toate loturile în 2+ licitații;</li>
                  <li><b>consorțiul stabil</b>: aceiași parteneri în 3+ licitații, indiferent de loturi; verificăm în Registrul Comerțului dacă membrii au același administrator, identitate = nume + data nașterii.</li>
                </ul>
                <p>Tăria: <i>puternic</i> la 3+ repetiții, ofertant unic dovedit pe 2+ loturi sau același administrator; <i>mediu</i> la 2 repetiții între 3+ firme sau o măturare; <i>slab</i> în rest. „Aceiași actori în altă parte” caută același set câștigând împreună (2+ membri în aceeași licitație) la alte autorități. Numărul ofertelor provine din loturi TED asociate cu încredere ridicată; lipsa sau ambiguitatea datelor rămâne necunoscută. Orice rotație rămâne o pistă de verificat.</p>
                <h4>Feliere de achiziții directe</h4>
                <p>Cel puțin 3 achiziții directe din aceeași clasă CPV și același tip, într-o fereastră de cel mult 60 de zile; fiecare strict sub plafonul propriu. Suma se compară cu cel mai mare plafon aplicabil achizițiilor din fereastră. Sunt luate în calcul și pragurile pentru lucrări. Se reține fereastra cu cel mai mare raport față de plafon.</p>
              </div>
            </details>
            <details suppressHydrationWarning id="cod">
              <summary>Codul, constantele și licența</summary>
              <div className="mt-body">
                <p>Codul care calculează scorul, la versiunea {VERSION}: <a href={CODE_URL("packages/db/src/profile-flags.ts")}>formula și pragurile (profile-flags.ts)</a> și <a href={CODE_URL("apps/ingestion/src/flags/score.ts")}>calculul pe profiluri (score.ts)</a>, pe GitHub. Fiecare versiune a metodologiei are un tag cu numele ei.</p>
                <p>Constantele formulei, ale benzilor și ale limitelor, într-un fișier: <a href="/metodologie/constants.json">constants.json</a>, citit din același cod. Pragurile fiecărui nivel sunt în tabelul <a href="#niveluri">„Nivelul fiecărui tipar”</a>.</p>
                <p>Datele derivate (scorurile și tiparele) sunt publicate sub licența <a href="https://creativecommons.org/licenses/by/4.0/deed.ro">CC BY 4.0</a>.</p>
              </div>
            </details>
            <details suppressHydrationWarning id="citare">
              <summary>Cum citez</summary>
              <div className="mt-body">
                <p>În „Întreabă”, „Copiază întrebarea” copiază linkul cu filtrele aplicate. Pentru celelalte pagini, copiază adresa din browser. Citează astfel: „<i>titlul paginii sau întrebarea</i>” — cinecâștigă?, perioada analizată, sursa indicată în rezultat, data consultării și linkul.</p>
                <p>Linkul nu îngheață datele: păstrează și exportul surselor pentru cifrele citate. Semnalele sunt piste de verificare, nu dovezi de ilegalitate. Despre scor și tipare: <a href="#citeaza-p">Ești jurnalist?</a></p>
              </div>
            </details>
            <details suppressHydrationWarning id="lecturi">
              <summary>Lecturi despre indicatorii de risc</summary>
              <div className="mt-body">
                <p>Ideea de a combina indicatori simpli, calculați din datele publice ale achizițiilor, vine din lucrări ca acestea:</p>
                <ul className="mt-refs">
                  <li>Fazekas, M., Tóth, I. J. și King, L. P. (2016). „An Objective Corruption Risk Index Using Public Procurement Data”. <i>European Journal on Criminal Policy and Research</i>, 22(3), 369–397.</li>
                  <li>OCDE (2016). <i>Preventing Corruption in Public Procurement</i>. Studiu OCDE.</li>
                  <li>Comisia Europeană, <i>Single Market Scoreboard</i>, indicatorii pentru achizițiile publice.</li>
                  <li>DIGIWHIST / Opentender (<a href="https://opentender.eu">opentender.eu</a>): indicatori de risc pe datele achizițiilor din țările Uniunii Europene.</li>
                </ul>
              </div>
            </details>
            <details suppressHydrationWarning id="istoric">
              <summary>Ce s-a schimbat și când</summary>
              <div className="mt-body">
                <ul>
                  <li id="schimbari-risc-20261105"><b>5 noiembrie 2026, rf-2026.22</b>, după un audit al tuturor instituțiilor și firmelor:
                    <ul>
                      <li>Scor doar de la 10 achiziții directe; sub 10 puncte, „fără semnal în scor”.</li>
                      <li>Capacitatea folosește doar bilanțul aceluiași an, iar „firmă nouă” se numără de la înregistrarea la Registrul Comerțului, nu de la primul bilanț din date.</li>
                      <li>„Un singur client public mare” nu mai crește din capacitate: aceeași dovadă contează o singură dată, în familia ei.</li>
                      <li>Limita dovezilor e pe tipar: sumele urcă și cu valoarea (0,5 / 1 / 2 milioane lei), frecvențele și cotele doar cu numărul. Pragul „5 achiziții și 1 milion → fără limită” a dispărut.</li>
                      <li>Produsele medicale și comenzile mărunte repetate nu mai sunt „Adunate, trec de plafon”; apar ca „comenzi repetate, fără acord-cadru”.</li>
                      <li>„Multe sume imediat sub plafon” cere cel puțin 0,5 așteptate și 5 / 8 achiziții pentru nivelurile 2 / 3.</li>
                      <li>Pe o firmă, limita obligației cumpărătorului ține toată familia; capacitatea singură contează pe jumătate.</li>
                      <li>Cumpărătorii privați nu mai au scor; asociațiile scrise greșit sunt recunoscute; câțiva cumpărători sunt verificați de mână.</li>
                      <li>Comparația spune locul în grup, nu un procent; spitalele nu mai au comparație, firmele se compară în domeniul lor.</li>
                      <li>Nume noi, cu aceleași reguli: „Prea des chiar sub plafon” → „Multe sume imediat sub plafon”; „Directe, deși trec de plafon” → „Declarate directe, peste plafon”; „O firmă ia mare parte din bani” → „O firmă primește mare parte din bani”; „Vânzări peste capacitatea firmei” → „Contracte directe peste cifra de afaceri”. Banda de sus se numește „pronunțat” (era „puternic”).</li>
                    </ul>
                  </li>
                  <li id="schimbari-risc-20261104"><b>4 noiembrie 2026, rf-2026.21</b>:
                    <ul>
                      <li>Niciun tipar nu mai sare de la 0 la nivelul 1: fiecare urcă lin, de la un prag de început (coloana „Nivelul 1” spune de unde).</li>
                      <li>„Declarate directe, peste plafon” la firme se măsoară pe o scară de 4 ori mai largă (2% / 12% / 40% din vânzări): aceeași sumă cântărește puțin la o firmă mare. La instituții, două cazuri dau cel puțin nivelul 0,5, iar nivelul 1 vine de la 0,5% din valoare.</li>
                      <li>„Un singur client public mare”: o firmă care înseamnă sub 5% din achizițiile instituției pornește de la nivelul 0,5; captiva care vinde peste capacitate urcă treptat.</li>
                      <li>Limita dovezilor urcă treptat: nivelul 1 la 10 achiziții directe, 3 de la 30 (era un salt la 20). Limita obligației cumpărătorului la firme (1,5) se ridică treptat între 60% și 80% la primele două instituții, iar limita capacității singure (1,5) se ridică odată cu celelalte tipare.</li>
                    </ul>
                  </li>
                  <li id="schimbari-nume-20261104"><b>4 noiembrie 2026, nume noi</b>, cu aceleași reguli și scoruri:
                    <ul>
                      <li>Tiparele au nume care spun ce s-a întâmplat: „Achiziții repetate, peste plafon cumulat” → „Adunate, trec de plafon”; „Chiar sub plafon” → „Prea des chiar sub plafon”; „Peste plafon” → „Directe, deși trec de plafon”; „Vârf în decembrie” → „Mulți bani contractați în decembrie”; „Concentrare pe un furnizor” → „O firmă ia mare parte din bani”; „Dependență de o autoritate” → „Un singur client public mare”.</li>
                      <li>Pe o singură achiziție, numele e la singular: „Chiar sub plafon”, „Directă, deși trece de plafon”, „Adunată cu altele, trece de plafon”.</li>
                    </ul>
                  </li>
                  <li id="schimbari-risc-20261103"><b>3 noiembrie 2026, rf-2026.20</b>:
                    <ul>
                      <li>Scorul se citește „70 din 100”, nu „70%”: nu e un procent și nici o probabilitate.</li>
                      <li>Tiparele se combină pe familii, ca dovezile de același fel să nu se adune ca independente; banda de sus cere cel puțin două tipare.</li>
                      <li>Tăria se măsoară față de mărimea profilului: câteva cazuri la mii de achiziții rămân slabe.</li>
                      <li>„Declarate directe, peste plafon” numără doar cazurile clare (estimarea peste plafon sau închiderea peste plafon și cu TVA) și doar la cumpărătorii obligați de plafon; operatorii sectoriali publici sunt verificați ca orice instituție.</li>
                      <li>„O firmă primește mare parte din bani” se calculează fără cea mai mare achiziție a furnizorului; „Un singur client public mare” apare de la 70%.</li>
                      <li>Tipar nou pentru firme: <a href="#da_capacity">„Contracte directe peste cifra de afaceri”</a>.</li>
                      <li>Firma unei instituții (in-house) nu primește scor; pe o firmă, „Declarate directe, peste plafon” și „Adunate, trec de plafon” cântăresc puțin dacă nu sunt la 1–2 instituții.</li>
                    </ul>
                  </li>
                  <li><b>1 noiembrie 2026, rf-2026.19:</b> identitatea administratorilor din Registrul Comerțului se potrivește după nume, dată de naștere și localitate; scorurile nu s-au schimbat.</li>
                  <li id="schimbari-risc"><b>1 noiembrie 2026, rf-2026.18</b>:
                    <ul>
                      <li>Indicele de risc (criteriile îndeplinite împărțite la 5 sau 4: 0; 0,20; 0,25 …) devine scorul de risc, de la 0 la 100, care ține seama și de cât de pronunțat e fiecare tipar.</li>
                      <li>„Finalizare rapidă” a fost retrasă: nu are temei în lege și apărea la majoritatea instituțiilor.</li>
                      <li>Tipar nou: <a href="#da_above_ceiling">„Declarate directe, peste plafon”</a>, doar unde excepțiile cunoscute nu se pot aplica (Anexa 2, CPV 33, companii și operatori de utilități, 26.02–14.05.2020, Unifarm, plafonul de lucrări, valori de peste două ori estimarea).</li>
                      <li>„Multe sume imediat sub plafon” (pe atunci „Imediat sub plafon”, înainte „Aproape de prag”) începe de la 96% din plafon, nu de la 90%.</li>
                      <li>„Un singur client public mare” (pe atunci „Dependență de o autoritate”) cere 250.000 lei (nu 50.000) și cel puțin 5 achiziții cu instituția principală.</li>
                      <li>„Mulți bani contractați în decembrie” (pe atunci „Vârf în decembrie”) compară fiecare an cu instituțiile de același tip din același an, nu doar cu pragul de 35%.</li>
                      <li>„Posibilă fracționare” se numește „Achiziții repetate, peste plafon cumulat” (azi „Adunate, trec de plafon”); regula nu s-a schimbat.</li>
                      <li>Un link vechi cu un interval al indicelui (0–1) selectează aceleași procente; o urmărire primește o singură notificare „Metodologie modificată”. Un răspuns salvat înainte își păstrează cifrele de atunci.</li>
                    </ul>
                  </li>
                </ul>
              </div>
            </details>
          </section>
          <section className="mt-col mt-despre" id="despre" aria-labelledby="h-despre">
            <h2 id="h-despre">Despre cinecâștigă?</h2>
            <p>Un proiect independent. Codul e public: <a href="https://github.com/Alex-Cosma/seap-new">github.com/Alex-Cosma/seap-new</a>. Contact: <a href="mailto:contact@cinecastiga.ro">contact@cinecastiga.ro</a>. Răspundem în 10 zile lucrătoare.</p>
            <p>Datele despre administratorii firmelor vin din Registrul Comerțului (nume, dată de naștere, localitate) și servesc doar ca să recunoaștem aceeași persoană în mai multe firme; data nașterii nu se publică. Pentru dreptul de opoziție sau de rectificare: <a href="mailto:contact@cinecastiga.ro">contact@cinecastiga.ro</a>.</p>
          </section>
        </div>
      </div>
      <p className="mt-sr" id="live" aria-live="polite" />
    </div>
  );
}
