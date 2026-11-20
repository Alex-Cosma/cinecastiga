"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countyMap } from "@/lib/map";
import { formatInt, formatRon } from "@/lib/format";
import { countWords } from "@/lib/ask/answer-text";
import { takesDe } from "@/lib/ro-count";
import { flagLabel } from "@/lib/flags";
import { RISK_BAND_WORD } from "@/lib/risk-score";
import {
  TOUR_DOTS, TOUR_LAST_STEP, TOUR_SEARCH_STEP, TOUR_SIGNAL_DOTS, TOUR_SIGNAL_EXAMPLES, TOUR_TOPICS, TOUR_WIDE_QUERY, contractDots, guessContractDots, guessVerdict, readFigures, tourPercent,
  tourPlace, tourQuery, tourQueryAlternatives, tourRestHidden, type TourData,
} from "@/lib/tour";
import { setViewMode } from "@/components/mode/mode-engine";
import { DEFAULT_VIEW_MODE, VIEW_MODE_LABEL, type ViewMode } from "@/lib/view-mode";
import "./tour.css";

/**
 * The welcome tour (lib/tour.ts): a full-screen dialog over the page. Seven steps: the visitor's county and subject,
 * five ideas shown with that county's real figures, then the choice between Esențial and Complet (lib/view-mode.ts). On the second idea the visitor first guesses how many of
 * 100 acquisitions are direct; the dots follow the slider, then move to the real split. The map of the first step folds into a corner and the
 * acquisitions become 200 dots that change with each idea. „Începe” on the last step sets the chosen mode, dissolves the
 * tour and leaves the search step's question in the home page's search field. "Sari peste" and Escape close it at any step.
 */
const COUNTIES = [...countyMap.shapes].sort((a, b) => a.label.localeCompare(b.label, "ro"));
const SIGNAL_DOT = new Set(TOUR_SIGNAL_DOTS);
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The narrow layout: the picture under the text, the buttons at the bottom of the screen. */
const narrow = () => typeof matchMedia === "function" && !matchMedia(TOUR_WIDE_QUERY).matches;

/** A number that counts up to its value when it appears or changes. */
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (calm()) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 4))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{formatInt(shown)}</>;
}

/** Text that writes itself, a letter at a time. */
function Typed({ text }: { text: string }) {
  const [length, setLength] = useState(text.length);
  useEffect(() => {
    if (calm()) { setLength(text.length); return; }
    setLength(0);
    let i = 0;
    const timer = window.setInterval(() => { i += 1; setLength(i); if (i >= text.length) window.clearInterval(timer); }, 26);
    return () => window.clearInterval(timer);
  }, [text]);
  return <span className="tr-typed" aria-label={text}><span aria-hidden="true">{text.slice(0, length)}</span></span>;
}

const SearchIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M12.2 12.2 16 16" /></svg>;

export default function Tour({ onSkip, onFinish }: { onSkip(): void; onFinish(query: string, county?: string): void }) {
  const [step, setStep] = useState(0);
  const [county, setCounty] = useState(""), [topicKey, setTopicKey] = useState("");
  const [byValue, setByValue] = useState(false);
  // The guess on the second idea: `guess` once answered, `live` while the slider moves. A new choice asks again.
  const [guess, setGuess] = useState<number | null>(null), [live, setLive] = useState(50);
  const [data, setData] = useState<TourData | null>(null);
  const [asked, setAsked] = useState<string | null>(null), [understood, setUnderstood] = useState<{ query: string; sentence: string } | null>(null);
  const [tip, setTip] = useState<{ dot: number; left: number; top: number; arrow: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  // The last step's choice. Esențial is chosen from the start: it is what a reader who skips the tour gets too.
  const [mode, setMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  // How the signal step says to open an example: a finger taps, a mouse points (UX audit Z1-35). The tour renders in the
  // browser only (TourGate loads it without server rendering), so the media query is read at once.
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches);
  const root = useRef<HTMLDivElement>(null), dots = useRef<HTMLDivElement>(null);
  // The press on a signal dot under way: a tap focuses the dot before its click, and the focus must not open the
  // example the click then toggles shut (14 November 2026: on a phone only a long press, with no click, showed it).
  const pressing = useRef<{ dot: number; at: number; open: boolean; mouse: boolean } | null>(null);

  const shape = COUNTIES.find((c) => c.key === county), topic = TOUR_TOPICS.find((t) => t.key === topicKey);
  const chosen = shape !== undefined && topic !== undefined;
  const chooseCounty = (key: string) => { setCounty(key); setGuess(null); setLive(50); };
  const chooseTopic = (key: string) => { setTopicKey(key); setGuess(null); setLive(50); };
  const reading = useMemo(() => (chosen ? readFigures(data?.rows[shape.key]?.[topic.key]) : null), [chosen, data, shape, topic]);
  const year = data?.year ?? new Date().getFullYear() - 1;
  const place = shape ? tourPlace(shape.key, shape.label) : "";
  const query = chosen ? asked ?? tourQuery(topic, shape.label) : "";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tur", { signal: controller.signal }).then((response) => (response.ok ? response.json() : null)).then((json: TourData | null) => { if (json?.rows) setData(json); }, () => {});
    return () => controller.abort();
  }, []);

  // The page behind does not scroll under the tour; the focus starts inside it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; };
  }, []);

  const go = useCallback((next: number) => {
    setTip(null);
    setStep(Math.max(0, Math.min(TOUR_LAST_STEP, next)));
    root.current?.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
  }, []);
  const finish = useCallback(() => {
    // The page under the tour is not seen yet: it changes at once, and the tour dissolves over it.
    setViewMode(mode, { animate: false });
    if (calm()) { onFinish(query, county); return; }
    setLeaving(true);
    window.setTimeout(() => onFinish(query, county), 620);
  }, [onFinish, query, county, mode]);
  const forward = useCallback(() => { if (step === 0 && !chosen) return; if (step === TOUR_LAST_STEP) finish(); else go(step + 1); }, [chosen, finish, go, step]);
  // „Continuă” on a narrow screen: a press first shows the rest of the step, the next one goes on (lib/tour.ts,
  // tourRestHidden). A press without a pointer, from the keyboard or an assistive technology, goes on at once:
  // nothing on the step is hidden from it. The arrow keys go on at once too.
  const press = useCallback((event: React.MouseEvent) => {
    const box = root.current;
    if (box && event.detail > 0 && narrow() && tourRestHidden(box.scrollTop, box.scrollHeight, box.clientHeight)) box.scrollTo({ top: box.scrollHeight, behavior: calm() ? "auto" : "smooth" });
    else forward();
  }, [forward]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || leaving) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT" || target.closest(".tl"))) return;
      if (event.key === "Escape") { event.preventDefault(); onSkip(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); forward(); }
      else if (event.key === "ArrowLeft" && step > 0) { event.preventDefault(); go(step - 1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [forward, go, leaving, onSkip, step]);

  // How the site reads the question on the search step: the real interpreter's own sentence.
  useEffect(() => {
    if (step !== TOUR_SEARCH_STEP || !query) return;
    const controller = new AbortController();
    fetch(`/api/intent?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => (response.ok ? response.json() : null))
      .then((json: { sentence?: string } | null) => { if (json?.sentence) setUnderstood({ query, sentence: json.sentence }); }, () => {});
    return () => controller.abort();
  }, [query, step]);

  const showTip = (dot: number, element: HTMLElement) => {
    const box = dots.current;
    if (!box || step !== 4) return;
    const centre = element.offsetLeft + element.offsetWidth / 2, width = Math.min(270, box.clientWidth * 0.92);
    const left = Math.max(0, Math.min(centre - width / 2, box.clientWidth - width));
    setTip({ dot, left, top: element.offsetTop + element.offsetHeight + 13, arrow: centre - left });
  };
  useEffect(() => {
    if (!tip) return;
    const close = (event: Event) => { if (!(event.target instanceof Element) || !event.target.closest(".tr-dot-hot")) setTip(null); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [tip]);

  const share = reading ? (byValue ? reading.shareByValue : reading.shareByCount) : 0.9;
  const guessing = step === 2 && guess === null && reading !== null;
  const firstContractDot = TOUR_DOTS - (guessing ? guessContractDots(live) : contractDots(share));
  const perDot = reading ? Math.max(1, Math.round(reading.count / TOUR_DOTS)) : 0;
  const example = tip ? TOUR_SIGNAL_EXAMPLES[TOUR_SIGNAL_DOTS.indexOf(tip.dot) % TOUR_SIGNAL_EXAMPLES.length]! : null;
  const alternatives = chosen ? [tourQuery(topic, shape.label), ...tourQueryAlternatives(topic, shape.label, year)].filter((q) => q !== query) : [];

  return <div className={`tr${leaving ? " tr-leave" : ""}`} ref={root} role="dialog" aria-modal="true" aria-label="Tur de bun venit" tabIndex={-1} data-step={step} data-guess={guessing ? "wait" : undefined}>
    <header className="tr-top">
      <span className="tr-wm" aria-hidden="true">cinecâștigă<i>?</i></span>
      <ol className="tr-prog" aria-hidden="true">{Array.from({ length: TOUR_LAST_STEP + 1 }, (_, i) => <li key={i} className={i <= step ? "done" : undefined} />)}</ol>
      <button type="button" className="tr-skip" onClick={onSkip}>Sari peste</button>
    </header>

    <div className="tr-main">
      <section className="tr-text">
        {/* The key replays the entrance when the step changes. */}
        <div className="tr-copy" key={step} aria-live="polite">
          {step === 0 && <>
            <h1>De unde ești și ce te interesează?</h1>
            <p>Turul durează un minut și folosește cifrele reale pentru alegerea ta.</p>
            <div className="tr-pick">
              <label>Județul
                <select value={county} onChange={(event) => chooseCounty(event.target.value)}>
                  <option value="">Alege județul</option>
                  {COUNTIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
              <div role="group" aria-labelledby="tr-topic-label"><span className="tr-label" id="tr-topic-label">Subiectul</span>
                <div className="tr-chips">{TOUR_TOPICS.map((t) => <button type="button" key={t.key} className="tr-chip" aria-pressed={t.key === topicKey} onClick={() => chooseTopic(t.key)}>{t.label}</button>)}</div>
              </div>
            </div>
          </>}
          {step === 1 && <>
            <h1>Totul vine din SEAP.</h1>
            <p>SEAP este sistemul public în care instituțiile statului își publică achizițiile. Noi le adunăm și le facem ușor de citit.</p>
            <p><em>Fiecare cifră de pe site duce la înregistrarea ei din SEAP.</em> <span className="tr-nw">O poți verifica singur.</span></p>
          </>}
          {step === 2 && <>
            <h1>Două feluri de a cumpăra.</h1>
            <p><b>Achiziție directă:</b> instituția alege singură firma, fără concurs. Legea o permite până la un plafon: 270.120 lei la produse și servicii, 900.400 lei la lucrări.</p>
            <p><b>Licitație:</b> peste plafon, mai multe firme pot depune oferte.</p>
          </>}
          {step === 3 && <>
            <h1>Contractat nu înseamnă încasat.</h1>
            <p>SEAP arată valoarea din contract, nu plățile. O firmă poate încasa mai puțin, mai târziu sau deloc.</p>
            <p>De aceea scriem <em>„a contractat”</em>, niciodată „a primit”.</p>
          </>}
          {step === 4 && <>
            <h1>Un semnal e o pistă, nu o dovadă.</h1>
            <p>Căutăm automat tipare care merită o a doua privire, ca „{flagLabel("da_concentration")}” sau „{flagLabel("da_round")}”.</p>
            <p>Un semnal spune <em>„uită-te aici”</em>. Nu spune că cineva a greșit. Scorul de risc, de la 0 la 100, arată cât de pronunțate sunt tiparele unei instituții sau firme.</p>
          </>}
          {step === 5 && <>
            <h1>Caută cu cuvintele tale.</h1>
            <p>Scrie un subiect, un loc, o instituție sau o firmă. Îți arătăm cum am înțeles întrebarea, ca să o poți corecta.</p>
          </>}
          {step === 6 && <>
            <h1>Cât vrei să vezi?</h1>
            <p>Schimbi oricând, din comutatorul de sus.</p>
          </>}
        </div>
      </section>

      <section className="tr-vis">
        {step === 6 && <div className="tr-modes" role="radiogroup" aria-label="Cât vrei să vezi">
          <button type="button" role="radio" aria-checked={mode === "esential"} className="tr-mode" onClick={() => setMode("esential")}>
            <svg viewBox="0 0 160 96" aria-hidden="true"><rect x="14" y="14" width="62" height="7" rx="3.5" className="tr-m-ink" /><rect x="14" y="31" width="92" height="15" rx="4" className="tr-m-accent" /><g className="tr-m-line"><rect x="14" y="58" width="132" height="5" rx="2.5" /><rect x="14" y="69" width="132" height="5" rx="2.5" /><rect x="14" y="80" width="96" height="5" rx="2.5" /></g></svg>
            <b>{VIEW_MODE_LABEL.esential}</b><span>Doar răspunsul: cine, cât și de la cine.</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === "complet"} className="tr-mode" onClick={() => setMode("complet")}>
            <svg viewBox="0 0 160 96" aria-hidden="true"><rect x="10" y="9" width="46" height="6" rx="3" className="tr-m-ink" /><g className="tr-m-soft"><rect x="10" y="21" width="22" height="6" rx="3" /><rect x="35" y="21" width="22" height="6" rx="3" /><rect x="60" y="21" width="22" height="6" rx="3" /><rect x="85" y="21" width="22" height="6" rx="3" /></g><rect x="10" y="33" width="58" height="10" rx="3" className="tr-m-accent" /><g className="tr-m-bars"><rect x="78" y="47" width="7" height="10" /><rect x="88" y="40" width="7" height="17" /><rect x="98" y="44" width="7" height="13" /><rect x="108" y="35" width="7" height="22" /><rect x="118" y="42" width="7" height="15" /><rect x="128" y="38" width="7" height="19" /></g><g className="tr-m-line"><rect x="10" y="48" width="58" height="4" rx="2" /><rect x="10" y="56" width="50" height="4" rx="2" /><rect x="10" y="65" width="140" height="4" rx="2" /><rect x="10" y="72" width="140" height="4" rx="2" /><rect x="10" y="79" width="140" height="4" rx="2" /><rect x="10" y="86" width="104" height="4" rx="2" /></g></svg>
            <b>{VIEW_MODE_LABEL.complet}</b><span>Și filtre, comparații, scoruri și metodă.</span>
          </button>
        </div>}
        <div className="tr-head">
          <div className="tr-map">
            <svg viewBox={`0 0 ${countyMap.width} ${countyMap.height}`} role="group" aria-label="Harta județelor. Aceleași opțiuni sunt în lista de județe.">
              {countyMap.shapes.map((c) => <path key={c.key} d={c.d} className={c.key === county ? "on" : undefined} onClick={step === 0 ? () => chooseCounty(c.key) : undefined}><title>{c.label}</title></path>)}
            </svg>
          </div>
          <div className="tr-where">{shape ? <>{shape.label}<small>{topic ? topic.label : "alege și un subiect"}</small></> : <small>Atinge un județ pe hartă sau alege-l din listă.</small>}</div>
        </div>

        <div className="tr-dots" ref={dots} aria-hidden={step === 4 ? undefined : true}>
          {Array.from({ length: TOUR_DOTS }, (_, i) => {
            const hot = SIGNAL_DOT.has(i), contract = i >= firstContractDot;
            const className = `tr-dot${contract ? " tr-dot-contract" : ""}${hot ? " tr-dot-hot" : ""}${tip?.dot === i ? " open" : ""}`;
            if (!hot || step !== 4) return <i key={i} className={className} style={{ "--i": i } as React.CSSProperties} />;
            return <i key={i} className={className} style={{ "--i": i } as React.CSSProperties} role="button" tabIndex={0} aria-label="Exemplu de semnal"
              onPointerEnter={(event) => { if (event.pointerType !== "touch") showTip(i, event.currentTarget); }}
              onPointerLeave={(event) => { if (event.pointerType !== "touch") setTip(null); }}
              onPointerDown={(event) => { pressing.current = { dot: i, at: event.timeStamp, open: tip?.dot === i, mouse: event.pointerType === "mouse" }; }}
              onFocus={(event) => { const press = pressing.current; if (!press || press.dot !== i || event.timeStamp - press.at > 1000) showTip(i, event.currentTarget); }}
              onBlur={() => setTip(null)}
              onClick={(event) => {
                // A mouse keeps the example its hover opened; a tap shows it, and a second tap on the same dot hides it.
                const press = pressing.current?.dot === i ? pressing.current : null;
                pressing.current = null;
                if (press?.mouse || !(press ? press.open : tip?.dot === i)) showTip(i, event.currentTarget); else setTip(null);
              }} />;
          })}
          {tip && example && <div className="tr-tip tipcard" role="tooltip" style={{ left: tip.left, top: tip.top, "--ox": `${tip.arrow}px` } as React.CSSProperties}>
            <b className="tipcard-t">{example[0]}</b>{example[1]}<small>Exemplu ilustrativ. Pe site, fiecare semnal duce la achizițiile lui.</small>
          </div>}
        </div>

        <div className="tr-fig" key={`${step}-${county}-${topicKey}`}>
          {step === 1 && reading && <>
            <p className="tr-stat">În {year}, în {place}, la {topic!.inText}: <span className="tr-nw"><b><Count value={reading.count} /></b> {reading.count === 1 ? "achiziție" : `${takesDe(reading.count) ? "de " : ""}achiziții`},</span> <span className="tr-nw">publicate de <b><Count value={reading.authorities} /></b> {reading.authorities === 1 ? "instituție" : `${takesDe(reading.authorities) ? "de " : ""}instituții`}.</span></p>
            <p className="tr-cap">Un punct înseamnă cam {countWords(perDot, "achiziție", "achiziții")}.</p>
          </>}
          {step === 2 && guessing && <div className="tr-guess">
            <label htmlFor="tr-guess-range">Din 100 de achiziții de aici, câte crezi că sunt directe, fără licitație?</label>
            <div className="tr-guess-row"><output htmlFor="tr-guess-range">{live} din 100</output><input id="tr-guess-range" type="range" min={0} max={100} value={live} onChange={(event) => setLive(Number(event.target.value))} /></div>
            <div className="tr-guess-foot"><button type="button" className="tr-btn tr-btn-primary" onClick={() => setGuess(live)}>Arată răspunsul</button><div className="tr-key"><span><i className="tr-key-direct" />directe</span><span><i className="tr-key-contract" />prin licitație</span></div></div>
          </div>}
          {step === 2 && !guessing && <>
            {guess !== null && reading && <p className="tr-cap tr-said">{guessVerdict(guess, reading.shareByCount)}</p>}
            <div className="tr-toggle" role="group" aria-label="Cum împărțim achizițiile">
              <button type="button" aria-pressed={!byValue} onClick={() => setByValue(false)}>După număr</button>
              <button type="button" aria-pressed={byValue} onClick={() => setByValue(true)}>După bani</button>
            </div>
            {reading && <p className="tr-stat">{byValue
              ? <><b>{tourPercent(reading.shareByValue)}</b> din bani trec prin achiziții directe: {formatRon(reading.daValue)} din {formatRon(reading.value)}.</>
              : <><b>{tourPercent(reading.shareByCount)}</b> din achiziții sunt directe: {formatInt(reading.daCount)} din {formatInt(reading.count)}.</>}</p>}
            <div className="tr-key"><span><i className="tr-key-direct" />achiziții directe</span><span><i className="tr-key-contract" />licitații și alte proceduri</span></div>
          </>}
          {step === 3 && <div className="tr-paid">
            <div className="tr-paid-yes"><strong>{reading ? formatRon(reading.value) : "Valoarea din contract"}</strong><span>{reading ? `contractați în ${year}, ${topic!.inText}, ${place}` : "este ce publică SEAP"}</span></div>
            <div className="tr-paid-no"><strong>?</strong><span>plătiți efectiv. SEAP nu publică plățile.</span></div>
          </div>}
          {step === 4 && <>
            <p className="tr-cap">Câteva puncte ies în evidență. {touch ? "Atinge un punct portocaliu" : "Treci cu mouse-ul peste un punct portocaliu"} ca să vezi un exemplu de semnal.</p>
            <div className="tr-score" role="img" aria-label="Exemplu: scor de risc 73 din 100"><span className="tr-score-mark">73 din 100</span><div className="tr-score-track" /><div className="tr-score-ends"><span>0 · {RISK_BAND_WORD.none}</span><span>100 · tipare pronunțate</span></div></div>
          </>}
          {step === 5 && chosen && <div className="tr-search">
            <div className="tr-search-box"><SearchIcon /><Typed text={query} /></div>
            <p className="tr-read">{understood?.query === query ? <>Am înțeles: <span>{understood.sentence}</span></> : <>Am înțeles: <span>subiect: {topic.query}</span> <span>loc: {place}</span></>}</p>
            <div className="tr-alt"><span className="tr-cap">Merg și așa:</span>{alternatives.map((q) => <button type="button" key={q} onClick={() => setAsked(q)}>{q}</button>)}</div>
          </div>}
        </div>
      </section>
    </div>

    <footer className="tr-nav">
      {/* On the first step there is nothing to go back to: on wide screens „Continuă” then stands at the text's edge
          (tour.css), on phones the row keeps its place (UX audit Z1-35). */}
      <button type="button" className="tr-btn tr-nav-back" onClick={() => go(step - 1)} aria-hidden={step === 0 || undefined} tabIndex={step === 0 ? -1 : undefined}>Înapoi</button>
      <span className="tr-count">{step + 1} din {TOUR_LAST_STEP + 1}</span>
      <button type="button" className="tr-btn tr-btn-primary" onClick={press} disabled={step === 0 && !chosen}>{step === TOUR_LAST_STEP ? "Începe" : "Continuă"}</button>
    </footer>
  </div>;
}
