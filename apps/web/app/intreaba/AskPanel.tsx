"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { countyMap, foldCounty } from "@/lib/map";
import { encodeSpec, decodeSpec } from "@/lib/ask/permalink";
import { validateSpec, type AskSpec } from "@/lib/ask/spec";
import { entitySourceSpec, yearSourceLink } from "@/lib/ask/source-spec";
import { describeQuestion } from "@/lib/ask/question-ui";
import { NATURAL_LANGUAGE_ENABLED, NATURAL_LANGUAGE_UNAVAILABLE } from "@/lib/ask/features";
import { validateEvidenceScope, type EvidenceScope } from "@/lib/ask/evidence";
import type { BlockData } from "@/lib/ask/compile";
import {
  CompareBlock,
  DistributionBlock,
  BreakdownBlock,
  ScatterBlock,
  SankeyBlock,
  NetworkBlock,
  EntityCardBlock,
  FactCheckBlock,
  TrendBlock,
  useTip,
} from "./blocks";
import QuestionBuilder from "./QuestionBuilder";
import type { BuilderSpec } from "./Builder";
import EntityTypeahead from "./EntityTypeahead";
import EvidenceDrawer from "./EvidenceDrawer";
import { AnswerEvidence, useAnswerEvidence } from "./AnswerEvidence";
import "./question-results.css";

type TableRow = Extract<BlockData, { block: "table" }>["rows"][number];
type SeriesPoint = Extract<
  BlockData,
  { block: "timeseries" }
>["series"][number];
type CountyValue = Extract<BlockData, { block: "map" }>["counties"][number];
interface AskResponse {
  ok: boolean;
  error?: string;
  question?: string | null;
  spec?: AskSpec;
  pills?: string[];
  caveats?: string[];
  data?: BlockData;
  displaySql?: string;
  tookMs?: number;
  executedAt?: string;
}
export type PanelMode = "search" | "ask" | "build";
const PROFILE_BLOCKS = new Set([
  "compare",
  "distribution",
  "scatter",
  "entity_card",
]);
const EXAMPLES = [
  "Cât s-a cheltuit pe medicamente în Cluj, în 2026?",
  "Cine furnizează cel mai mult pentru spitale?",
  "Cum s-au schimbat achizițiile de lucrări, pe ani?",
];
function sourceCount(data: BlockData): number | null {
  switch (data.block) {
    case "stat":
      return data.stat.count;
    case "fact_check":
      return data.fact.count;
    case "timeseries":
      return data.series.reduce((n, r) => n + r.count, 0);
    case "map":
      return data.counties.reduce((n, r) => n + r.count, 0);
    case "breakdown":
      return data.slices.reduce((n, r) => n + r.count, 0) + data.other.count;
    default:
      return null; // A displayed top N is never the full source population.
  }
}

export default function AskPanel({
  initialMode = "build",
  withSearch = false,
  centered = false,
}: {
  initialMode?: PanelMode;
  withSearch?: boolean;
  centered?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>(
    initialMode === "ask" && !NATURAL_LANGUAGE_ENABLED ? "build" : initialMode,
  );
  const [aiLinkNotice, setAiLinkNotice] = useState(false);
  const [builderInit, setBuilderInit] = useState<BuilderSpec | null>(null);
  const [builderFromAi, setBuilderFromAi] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [layout, setLayout] = useState<"visual" | "table">("visual");
  const [evidence, setEvidence] = useState<{
    spec: AskSpec;
    scope?: EvidenceScope;
    title: string;
  } | null>(null);
  const [tableOpts, setTableOpts] = useState<{
    page: number;
    sort?: string;
    dir?: "asc" | "desc";
  }>({ page: 0 });
  const request = useRef<{ seq: number; controller: AbortController | null }>({
    seq: 0,
    controller: null,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const execute = useCallback(
    async (
      body: Record<string, unknown>,
      drill = false,
      savedScope?: EvidenceScope,
    ) => {
      if (!NATURAL_LANGUAGE_ENABLED && typeof body.question === "string") {
        setError(NATURAL_LANGUAGE_UNAVAILABLE);
        return false;
      }
      request.current.controller?.abort();
      const controller = new AbortController(),
        seq = ++request.current.seq;
      request.current.controller = controller;
      setLoading(true);
      setError(null);
      setEvidence(null);
      try {
        const r = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const answer = (await r.json()) as AskResponse;
        if (seq !== request.current.seq) return false;
        if (!answer.ok || !answer.data || !answer.spec) {
          setError(
            answer.error ?? "Nu am putut calcula răspunsul. Încearcă din nou.",
          );
          return false;
        }
        setResp(answer);
        // The composer owns draft/applied comparison, including edits made
        // during this request and normalized drafts restored from old links.
        if (typeof body.question === "string") {
          setBuilderInit(answer.spec as unknown as BuilderSpec);
          setBuilderFromAi(true);
        }
        if (!("tablePage" in body)) setTableOpts({ page: 0 });
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        url.searchParams.set("spec", encodeSpec(answer.spec));
        url.searchParams.delete("drill");
        url.searchParams.delete("evidence");
        window.history.replaceState(null, "", url);
        if (drill)
          setEvidence({
            spec: answer.spec,
            ...(savedScope ? { scope: savedScope } : {}),
            title:
              answer.question ||
              describeQuestion(answer.spec as unknown as BuilderSpec),
          });
        if (!drill)
          requestAnimationFrame(() =>
            document
              .getElementById("raspuns")
              ?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
                block: "start",
              }),
          );
        return answer.spec;
      } catch (e) {
        if (!controller.signal.aborted && seq === request.current.seq)
          setError(
            "La date nu am putut ajunge acum. Reîncearcă; întrebarea ta este păstrată.",
          );
        return false;
      } finally {
        if (seq === request.current.seq) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search),
        question = params.get("q"),
        encoded = params.get("spec");
      setAiLinkNotice(false);
      if (question && !NATURAL_LANGUAGE_ENABLED) {
        setQ(question);
        setMode("build");
        setAiLinkNotice(true);
      }
      if (question && NATURAL_LANGUAGE_ENABLED) {
        setQ(question);
        setMode("ask");
        void execute({ question });
      } else if (encoded) {
        const parsed = validateSpec(decodeSpec(encoded));
        if ("error" in parsed) {
          setError(
            "Legătura conține o întrebare invalidă. Poți construi una nouă mai jos.",
          );
          return;
        }
        setBuilderInit(parsed as unknown as BuilderSpec);
        setMode("build");
        let scope: EvidenceScope | undefined;
        try {
          const raw = params.get("evidence");
          if (raw) {
            const validated = validateEvidenceScope(JSON.parse(raw));
            if ("error" in validated) throw new Error(validated.error);
            scope = validated;
          }
        } catch {
          setError("Selecția de surse din această legătură este invalidă.");
          return;
        }
        void execute({ spec: parsed }, params.get("drill") === "1", scope);
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      request.current.controller?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [execute]);
  const applied = resp?.spec;
  const title =
    resp?.question ||
    (applied
      ? describeQuestion(applied as unknown as BuilderSpec)
      : "Răspunsul tău");
  const openEvidence = useCallback(
    (spec?: AskSpec, scope?: EvidenceScope, label?: string) => {
      const selected = spec ?? applied;
      if (selected) {
        const effectiveScope =
          scope && (scope.entityIds || scope.excludeEntityIds) && !scope.role
            ? {
                ...scope,
                role:
                  selected.dim === "supplier"
                    ? ("supplier" as const)
                    : ("authority" as const),
              }
            : scope;
        setEvidence({
          spec: selected,
          ...(effectiveScope ? { scope: effectiveScope } : {}),
          title: label ?? title,
        });
      }
    },
    [applied, title],
  );
  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch {
      showToast(
        "Copierea nu este disponibilă. Poți copia adresa din bara browserului.",
      );
    }
  };
  const interceptSource = (event: React.MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    )
      return;
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const url = new URL(href, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.searchParams.get("drill") !== "1"
    )
      return;
    const spec = validateSpec(decodeSpec(url.searchParams.get("spec") ?? ""));
    if ("error" in spec) return;
    event.preventDefault();
    openEvidence(spec, undefined, `${title} · selecția aleasă`);
  };
  const data = resp?.data,
    count = data ? sourceCount(data) : null;
  const isProfile = !!data && PROFILE_BLOCKS.has(data.block);
  return (
    <div
      className={`ask cq-app${centered ? " ask-centered" : ""}`}
      data-mode={mode}
    >
      {toast && (
        <div className="ask-toast" role="status">
          {toast}
        </div>
      )}
      <div className="cq-modes" aria-label="Cum vrei să explorezi?">
        {withSearch && (
          <button
            type="button"
            aria-pressed={mode === "search"}
            onClick={() => setMode("search")}
          >
            Caută o instituție sau firmă
          </button>
        )}
        <button
          type="button"
          aria-pressed={mode === "build"}
          onClick={() => setMode("build")}
        >
          Construiește o întrebare
        </button>
        <button
          type="button"
          aria-pressed={mode === "ask"}
          disabled={!NATURAL_LANGUAGE_ENABLED}
          onClick={() => setMode("ask")}
        >
          Întreabă în cuvintele tale <small>AI</small>
          {!NATURAL_LANGUAGE_ENABLED && <small>În curând</small>}
        </button>
      </div>
      {aiLinkNotice && (
        <div className="cq-unavailable" role="status">
          <p>{NATURAL_LANGUAGE_UNAVAILABLE}</p>
          <p>Întrebarea din legătură: „{q}”</p>
        </div>
      )}
      {mode === "search" && (
        <EntityTypeahead
          q={q}
          setQ={setQ}
          placeholder="O instituție, o firmă, un loc…"
        />
      )}
      {mode === "ask" && NATURAL_LANGUAGE_ENABLED && (
        <section className="cq-natural">
          <p className="cq-eyebrow">CURIOZITATEA ÎNCEPE CU O ÎNTREBARE</p>
          <h2>Ce ai vrea să afli?</h2>
          <form
            className="ask-box"
            onSubmit={(e) => {
              e.preventDefault();
              void execute({ question: q });
            }}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cine furnizează medicamente spitalelor din județul meu?"
              aria-label="Întrebarea ta"
              maxLength={500}
              required
            />
            <button type="submit" disabled={loading}>
              Vezi răspunsul →
            </button>
          </form>
          <p>
            Îți arătăm cum am înțeles întrebarea, apoi poți verifica fiecare
            înregistrare.
          </p>
          <div className="cq-examples">
            {EXAMPLES.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => {
                  setQ(text);
                  inputRef.current?.focus();
                }}
              >
                {text} ↗
              </button>
            ))}
          </div>
        </section>
      )}
      {
        <div hidden={mode !== "build"}>
          <QuestionBuilder
            key={builderInit ? encodeSpec(builderInit) : "start"}
            initial={builderInit}
            fromAi={builderFromAi}
            running={loading}
            onDraftChange={setDirty}
            onRun={(spec) => execute({ spec })}
          />
        </div>
      }
      {loading && <Loader label="Căutăm răspunsul în date" />}
      {error && (
        <div className="cq-error" role="alert">
          <strong>Întrebarea ta este păstrată.</strong>
          <p>{error}</p>
        </div>
      )}
      {resp?.ok && data && applied && (
        <AnswerEvidence.Provider value={{ open: openEvidence }}>
          <section
            className="cq-answer"
            id="raspuns"
            aria-busy={loading}
            onClick={interceptSource}
          >
            <div className="cq-answer-head">
              <div>
                <p className="cq-eyebrow">
                  {dirty || loading || error
                    ? "RĂSPUNSUL APLICAT"
                    : "RĂSPUNSUL TĂU"}{" "}
                  <span>✓ Verificabil, până la sursă</span>
                </p>
                <h2>{title}</h2>
                <div className="cq-scope">
                  {(resp.pills ?? []).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
                {dirty && (
                  <p className="cq-pending" role="status">
                    Ai modificări neaplicate. Răspunsul și sursele de mai jos
                    păstrează întrebarea anterioară.
                  </p>
                )}
              </div>
              <div className="cq-answer-actions">
                <button
                  type="button"
                  className="cq-source-main"
                  onClick={() => openEvidence()}
                >
                  ☷ Vezi înregistrările
                  {count !== null && <b>{formatInt(count)}</b>}
                </button>
                <ClipButton
                  kind="query"
                  spec={applied}
                  snapshot={{
                    title,
                    pills: resp.pills ?? [],
                    headline:
                      count === null
                        ? title
                        : `${formatInt(count)} înregistrări`,
                    result: data,
                    executedAt: resp.executedAt,
                    caveats: resp.caveats ?? [],
                    displaySql: resp.displaySql,
                  }}
                  label={title}
                />
              </div>
            </div>
            <div className="cq-proof">
              <span className="cq-proof-icon" aria-hidden>
                ✓
              </span>
              <div>
                <strong>
                  {count === null
                    ? "Selecția completă"
                    : `${formatInt(count)} înregistrări`}
                </strong>
                <small>
                  {isProfile
                    ? "Înregistrările din baza profilurilor"
                    : "Condițiile întrebării aplicate"}
                </small>
              </div>
              <span aria-hidden>→</span>
              <div>
                <strong>Fiecare valoare, la vedere</strong>
                <small>Calcul, stare și sursă SEAP</small>
              </div>
              <button type="button" onClick={() => openEvidence()}>
                Verifică tu →
              </button>
            </div>
            {isProfile && (
              <p className="cq-profile-notice">
                <strong>
                  Valoare înregistrată în profil, inclusiv oferte neacceptate.
                </strong>{" "}
                Profilurile folosesc istoricul achizițiilor directe; nu
                reprezintă plăți efectuate. Stările și baza de calcul sunt în
                lista surselor.
              </p>
            )}
            {(resp.caveats?.length ?? 0) > 0 && (
              <details
                className="cq-caveats"
                open={resp.caveats!.some((c) =>
                  /am ales|Am restrâns|nu există|ignor|în afara/i.test(c),
                )}
              >
                <summary>
                  Despre această selecție · {resp.caveats!.length} precizări
                </summary>
                {resp.caveats!.map((c) => (
                  <p key={c}>{c}</p>
                ))}
              </details>
            )}
            {["table", "timeseries", "map"].includes(data.block) && (
              <div className="cq-display">
                <span>
                  {data.block === "table"
                    ? "Un clasament pe care îl poți verifica."
                    : "Aceleași date, în forma potrivită pentru tine."}
                </span>
                <div>
                  <button
                    type="button"
                    aria-pressed={layout === "visual"}
                    onClick={() => setLayout("visual")}
                  >
                    Vizual
                  </button>
                  <button
                    type="button"
                    aria-pressed={layout === "table"}
                    onClick={() => setLayout("table")}
                  >
                    Tabel
                  </button>
                </div>
              </div>
            )}
            <div className={`cq-result cq-result-${data.block}`}>
              {data.block === "stat" && (
                <StatBlock stat={data.stat} measure={applied.measure} />
              )}
              {data.block === "table" &&
                (layout === "visual" ? (
                  <RankingBars
                    rows={data.rows}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ) : (
                  <TableBlock
                    rows={data.rows}
                    spec={applied}
                    perCapita={applied.measure === "value_per_capita"}
                    meta={
                      data.total !== undefined
                        ? {
                            total: data.total,
                            page: data.page ?? 0,
                            pageSize: data.pageSize ?? 25,
                          }
                        : null
                    }
                    sort={tableOpts.sort}
                    dir={tableOpts.dir}
                    onFetch={(page, sort, dir) => {
                      setTableOpts({
                        page,
                        ...(sort ? { sort } : {}),
                        ...(dir ? { dir } : {}),
                      });
                      void execute({
                        spec: applied,
                        tablePage: page,
                        tableSort: sort,
                        tableDir: dir,
                      });
                    }}
                  />
                ))}
              {data.block === "timeseries" &&
                (layout === "visual" ? (
                  <SeriesBlock series={data.series} spec={applied} />
                ) : (
                  <ExactSeries
                    series={data.series}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ))}
              {data.block === "map" &&
                (layout === "visual" ? (
                  <MapBlock counties={data.counties} spec={applied} />
                ) : (
                  <CountyValues
                    counties={data.counties}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ))}
              {data.block === "compare" && (
                <CompareBlock entities={data.entities} />
              )}
              {data.block === "distribution" && (
                <DistributionBlock
                  distribution={data.distribution}
                  spec={applied}
                />
              )}
              {data.block === "breakdown" && (
                <BreakdownBlock
                  slices={data.slices}
                  other={data.other}
                  spec={applied}
                />
              )}
              {data.block === "scatter" && (
                <ScatterBlock points={data.points} density={data.density} />
              )}
              {data.block === "sankey" && (
                <SankeyBlock
                  flows={data.flows}
                  focal={data.focal}
                  spec={applied}
                />
              )}
              {data.block === "network" && (
                <NetworkBlock nodes={data.nodes} focal={data.focal} />
              )}
              {data.block === "entity_card" && (
                <EntityCardBlock card={data.card} />
              )}
              {data.block === "fact_check" && (
                <FactCheckBlock fact={data.fact} />
              )}
              {data.block === "trend" && (
                <TrendBlock
                  rows={data.rowsTrend}
                  yearA={data.yearA}
                  yearB={data.yearB}
                  spec={applied}
                />
              )}
            </div>
            <div className="cq-answer-tools">
              <button
                type="button"
                onClick={() =>
                  void copy(
                    `${window.location.origin}/intreaba?spec=${encodeURIComponent(encodeSpec(applied))}`,
                    "Întrebarea aplicată a fost copiată.",
                  )
                }
              >
                Copiază întrebarea ↗
              </button>
              <button type="button" onClick={() => openEvidence()}>
                Datele și exportul CSV ↓
              </button>
              <button type="button" onClick={() => exportCsv(data)}>
                Exportă rezultatul afișat ↓
              </button>
              {mode === "ask" && (
                <button
                  type="button"
                  onClick={() => {
                    setBuilderInit(applied as unknown as BuilderSpec);
                    setBuilderFromAi(true);
                    setMode("build");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Ajustează întrebarea ↑
                </button>
              )}
            </div>
            <details className="cq-calculation">
              <summary>Cum s-a calculat răspunsul</summary>
              <p>
                Calculele folosesc condițiile de mai sus. Lista surselor explică
                selecția și valorile înregistrate; pagina de metodologie descrie
                indicatorii.
              </p>
              <Link href="/metodologie">Deschide metodologia ↗</Link>
              {resp.displaySql && (
                <details>
                  <summary>Interogarea SQL · avansat</summary>
                  <pre>
                    <code>{resp.displaySql}</code>
                  </pre>
                </details>
              )}
            </details>
            <div className="cq-promise">
              <div className="cq-paper" aria-hidden>
                SEAP
                <span />
                <span />
                <span />
              </div>
              <div>
                <p className="cq-eyebrow">CIFRELE NU CER ÎNCREDERE OARBĂ.</p>
                <h3>
                  Ai întrebări despre un rezultat?
                  <br />
                  Începe cu înregistrările lui.
                </h3>
                <p>
                  Vezi cine, ce, când și la ce valoare. Deschide sursa SEAP sau
                  exportă datele ca să faci propriile calcule.
                </p>
              </div>
              <button type="button" onClick={() => openEvidence()}>
                Deschide sursele →
              </button>
            </div>
          </section>
        </AnswerEvidence.Provider>
      )}
      {evidence && (
        <EvidenceDrawer
          key={JSON.stringify(evidence)}
          spec={evidence.spec}
          title={evidence.title}
          {...(evidence.scope ? { scope: evidence.scope } : {})}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}

function RankingBars({
  rows,
  spec,
  onSources,
}: {
  rows: TableRow[];
  spec: AskSpec;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
}) {
  const metric = (r: TableRow) =>
    spec.measure === "count"
      ? r.count
      : spec.measure === "value_per_capita"
        ? r.population
          ? r.value / r.population
          : 0
        : r.value;
  const max = Math.max(...rows.map(metric), 1);
  if (!rows.length)
    return (
      <p className="ask-empty">
        Nu am găsit înregistrări pentru aceste condiții. Încearcă o perioadă mai
        largă.
      </p>
    );
  return (
    <>
      <div className="cq-ranking">
        {rows.map((r, i) => (
          <button
            type="button"
            key={r.entityId ?? r.name}
            onClick={() =>
              onSources(
                entitySourceSpec(spec, r),
                undefined,
                `${cleanName(r.name)} · înregistrările din clasament`,
              )
            }
          >
            <span className="cq-rank-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="cq-rank-name">
              <strong>{cleanName(r.name)}</strong>
              <span className="cq-bar-track">
                <i
                  style={{
                    width: `${Math.max(0.5, (metric(r) / max) * 100)}%`,
                    opacity: Math.max(0.35, 1 - i * 0.08),
                  }}
                />
              </span>
            </span>
            <span className="cq-rank-value">
              <strong>
                {spec.measure === "count"
                  ? formatInt(r.count)
                  : formatRonFull(metric(r))}
                {spec.measure === "value_per_capita" ? " / locuitor" : ""}
              </strong>
              <small>{formatInt(r.count)} înregistrări →</small>
            </span>
          </button>
        ))}
      </div>
      <p className="ask-fine">
        {rows.length} rezultate afișate. „Vezi înregistrările” păstrează
        întreaga selecție, inclusiv rezultatele din afara acestui clasament.
      </p>
    </>
  );
}
function ExactSeries({
  series,
  spec,
  onSources,
}: {
  series: SeriesPoint[];
  spec: AskSpec;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
}) {
  return (
    <table className="ask-table cq-exact-table">
      <thead>
        <tr>
          <th>An</th>
          <th>Valoare înregistrată</th>
          <th>Înregistrări</th>
          <th>Surse</th>
        </tr>
      </thead>
      <tbody>
        {series.map((r) => (
          <tr key={r.year}>
            <th>{r.year}</th>
            <td>{formatRonFull(r.value)}</td>
            <td>{formatInt(r.count)}</td>
            <td>
              <button
                type="button"
                onClick={() =>
                  onSources(
                    spec,
                    { years: [r.year] },
                    `${r.year} · înregistrările anului`,
                  )
                }
              >
                Vezi înregistrările →
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function CountyValues({
  counties,
  spec,
  onSources,
}: {
  counties: CountyValue[];
  spec: AskSpec;
  onSources: (spec: AskSpec) => void;
}) {
  return (
    <table className="ask-table cq-exact-table">
      <thead>
        <tr>
          <th>Județ</th>
          <th>Valoare înregistrată</th>
          <th>Înregistrări</th>
          <th>Surse</th>
        </tr>
      </thead>
      <tbody>
        {[...counties]
          .sort((a, b) => b.value - a.value)
          .map((r) => (
            <tr key={r.county}>
              <th>{r.county}</th>
              <td>{formatRonFull(r.value)}</td>
              <td>{formatInt(r.count)}</td>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    onSources({
                      block: "stat",
                      measure: spec.measure === "count" ? "count" : "value",
                      ...(spec.dataset ? { dataset: spec.dataset } : {}),
                      filters: { ...spec.filters, county: r.county },
                    })
                  }
                >
                  Vezi înregistrările →
                </button>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
function StatBlock({
  stat,
  measure,
}: {
  measure: string;
  stat: {
    value: number;
    count: number;
    byStream?: { src: "da" | "contracts"; value: number; count: number }[];
  };
}) {
  const da = stat.byStream?.find((s) => s.src === "da");
  const ctr = stat.byStream?.find((s) => s.src === "contracts");
  return (
    <div className="ask-bigstat">
      <div className="v">
        {measure === "count" ? formatInt(stat.count) : formatRon(stat.value)}
      </div>
      <div className="d">
        {formatRonFull(stat.value)} · {formatInt(stat.count)} înregistrări
      </div>
      {stat.byStream && (
        <div className="ask-streamsplit">
          {formatRon(da?.value ?? 0)} achiziții directe (
          {formatInt(da?.count ?? 0)}) + {formatRon(ctr?.value ?? 0)} contracte
          ({formatInt(ctr?.count ?? 0)})
        </div>
      )}
    </div>
  );
}

function TableBlock({
  rows,
  spec,
  perCapita,
  meta,
  sort,
  dir,
  onFetch,
}: {
  rows: TableRow[];
  spec?: unknown;
  perCapita: boolean;
  /** Present only in paged mode (clasament without explicit topN). */
  meta?: { total: number; page: number; pageSize: number } | null;
  sort?: string | undefined;
  dir?: "asc" | "desc" | undefined;
  onFetch?: (page: number, sort?: string, dir?: "asc" | "desc") => void;
}) {
  // acquisitions-count click → same filters narrowed to this row, drill opened
  const rowUrl = (r: TableRow) =>
    `/intreaba?spec=${encodeURIComponent(encodeSpec(entitySourceSpec(spec as AskSpec, r)))}&drill=1`;
  const paged = Boolean(meta && onFetch);
  const page = meta?.page ?? 0;
  const pageSize = meta?.pageSize ?? rows.length;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
  const sortBy = (key: string) => {
    if (!paged) return;
    const d =
      sort === key
        ? dir === "desc"
          ? "asc"
          : "desc"
        : key === "name" || key === "county"
          ? "asc"
          : "desc";
    onFetch!(0, key, d);
  };
  const Th = ({
    k,
    label,
    num,
  }: {
    k: string;
    label: string;
    num?: boolean;
  }) =>
    paged ? (
      <th
        className={(num ? "num" : "") + " sortable"}
        onClick={() => sortBy(k)}
        title="sortează"
      >
        {label}
        {sort === k ? (dir === "desc" ? " ▾" : " ▴") : ""}
      </th>
    ) : (
      <th className={num ? "num" : undefined}>{label}</th>
    );
  if (rows.length === 0)
    return <p className="ask-empty">Niciun rezultat pentru aceste filtre.</p>;
  return (
    <div className="ask-tablewrap">
      {paged && (
        <div className="ask-detmeta">
          {formatInt(meta!.total)} entități · pagina {page + 1} din{" "}
          {formatInt(pages)}
        </div>
      )}
      <table className="ask-table">
        <thead>
          <tr>
            <th className="pos">#</th>
            <Th k="name" label="Nume" />
            <Th k="county" label="Județ" />
            {perCapita && <th className="num">Populație</th>}
            {perCapita && <Th k="percap" label="lei / locuitor" num />}
            <Th k="value" label="Valoare" num />
            <Th k="count" label="Achiziții" num />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entityId ?? r.name}>
              <td className="pos">{page * pageSize + i + 1}</td>
              <td>
                {r.entityId ? (
                  <Link href={`/entitati/${r.entityId}`}>
                    {cleanName(r.name)}
                  </Link>
                ) : (
                  cleanName(r.name)
                )}
              </td>
              <td>{r.county ?? "—"}</td>
              {perCapita && (
                <td className="num">
                  {r.population ? formatInt(r.population) : "—"}
                </td>
              )}
              {perCapita && (
                <td className="num strong">
                  {r.population
                    ? formatInt(Math.round(r.value / r.population))
                    : "—"}
                </td>
              )}
              <td className="num">{formatRonFull(r.value)}</td>
              <td className="num">
                {(() => {
                  const u = rowUrl(r);
                  return u ? (
                    <a href={u} target="_blank" rel="noopener">
                      {formatInt(r.count)} ↗
                    </a>
                  ) : (
                    formatInt(r.count)
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {paged && pages > 1 && (
        <div className="ask-pager">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onFetch!(page - 1, sort, dir)}
          >
            ‹ anterioare
          </button>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => onFetch!(page + 1, sort, dir)}
          >
            următoare ›
          </button>
        </div>
      )}
      <p className="ask-fine">
        nume → profilul entității · numărul de achiziții → lista lor în căutare
      </p>
    </div>
  );
}

function SeriesBlock({
  series,
  spec,
}: {
  series: SeriesPoint[];
  spec: unknown;
}) {
  const t = useTip();
  const evidence = useAnswerEvidence();
  const asCount = (spec as AskSpec).measure === "count";
  const metric = (p: SeriesPoint) => (asCount ? p.count : p.value);
  const display = (p: SeriesPoint) =>
    asCount ? formatInt(p.count) : formatRon(p.value);
  // year-bar click → same filters, scoped to that year, drill rows opened
  const yearUrl = (year: number | string) =>
    yearSourceLink(spec as AskSpec, Number(year));
  if (series.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  const max = Math.max(...series.map(metric), 1);
  const peak = series.reduce((a, b) => (metric(b) > metric(a) ? b : a));
  return (
    <div>
      {t.el}
      <div className="ask-ts">
        {series.map((p) => (
          <a
            key={p.year}
            className="col"
            href={yearUrl(p.year)}
            onClick={(event) => {
              if (evidence && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                evidence.open(
                  spec as AskSpec,
                  { years: [p.year] },
                  `${p.year} · înregistrările anului`,
                );
              }
            }}
            target="_blank"
            rel="noopener"
            {...t.bind(
              String(p.year),
              asCount
                ? formatInt(p.count) + " înregistrări"
                : formatRonFull(p.value),
              `${formatInt(p.count)} achiziții${p.year === peak.year ? " · vârful seriei" : ""} · click → achizițiile anului`,
            )}
          >
            <div className="cv">{display(p)}</div>
            <div
              className={p.year === peak.year ? "bar peak" : "bar"}
              style={{ height: `${Math.max(2, (metric(p) / max) * 100)}%` }}
            />
            <div className="cl">{p.year}</div>
          </a>
        ))}
      </div>
      <p className="ask-fine">
        vârful ({peak.year}) este marcat · valori contractate, nu plăți · click
        pe un an → lista achizițiilor lui
      </p>
    </div>
  );
}

const MAP_COLORS = ["#e4ead8", "#c7d5b2", "#9cb786", "#6e9365", "#285b45"];
const MAP_NO_DATA = "#e8eade";

function MapBlock({
  counties,
  spec,
}: {
  counties: CountyValue[];
  spec: unknown;
}) {
  const asCount = (spec as AskSpec).measure === "count";
  const display = (v: number) =>
    asCount ? formatInt(v) + " înreg." : formatRon(v);
  // county click → same filters, scoped to that county, drill rows opened
  const countyUrl = (label: string): string => {
    const s = (spec ?? {}) as {
      measure?: string;
      dataset?: string;
      filters?: Record<string, unknown>;
    };
    const next: Record<string, unknown> = {
      block: "stat",
      measure: s.measure === "count" ? "count" : "value",
      filters: { ...(s.filters ?? {}), county: label },
    };
    if (s.dataset) next["dataset"] = s.dataset;
    return `/?spec=${encodeURIComponent(encodeSpec(next))}&drill=1`;
  };
  const byKey = new Map<string, number>();
  const cntByKey = new Map<string, number>();
  for (const c of counties) {
    const k = foldCounty(c.county);
    byKey.set(k, (byKey.get(k) ?? 0) + (asCount ? c.count : c.value));
    cntByKey.set(k, (cntByKey.get(k) ?? 0) + c.count);
  }
  const national = counties.reduce(
    (s, c) => s + (asCount ? c.count : c.value),
    0,
  );
  const [tip, setTip] = useState<{
    label: string;
    value: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);
  const values = countyMap.shapes
    .map((s) => byKey.get(s.key) ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const th: number[] = [];
  for (let i = 1; i < MAP_COLORS.length; i++) {
    th.push(
      values[
        Math.min(
          Math.floor((i / MAP_COLORS.length) * values.length),
          values.length - 1,
        )
      ] ?? 0,
    );
  }
  const bucket = (v: number) => {
    let b = 0;
    while (b < th.length && v > th[b]!) b++;
    return b;
  };
  const ranked = countyMap.shapes
    .map((s) => ({ label: s.label, key: s.key, value: byKey.get(s.key) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="ask-maplayout">
      <div className="ask-mapwrap">
        <svg
          viewBox={`0 0 ${countyMap.width} ${countyMap.height}`}
          className="ask-choropleth"
          role="img"
          aria-label="Hartă pe județe"
        >
          {countyMap.shapes.map((s) => {
            const v = byKey.get(s.key) ?? 0;
            const move = (e: React.MouseEvent) =>
              setTip({
                label: s.label,
                value: v,
                count: cntByKey.get(s.key) ?? 0,
                x: e.clientX,
                y: e.clientY,
              });
            return (
              <a
                key={s.key}
                href={countyUrl(s.label)}
                target="_blank"
                rel="noopener"
              >
                <path
                  d={s.d}
                  fill={v > 0 ? MAP_COLORS[bucket(v)] : MAP_NO_DATA}
                  stroke="#fff"
                  strokeWidth={0.8}
                  className={tip?.label === s.label ? "hovered" : undefined}
                  onMouseEnter={move}
                  onMouseMove={move}
                  onMouseLeave={() => setTip(null)}
                />
              </a>
            );
          })}
        </svg>
        <div className="ask-legend">
          <span>mai puțin</span>
          {MAP_COLORS.map((c) => (
            <span key={c} className="sw" style={{ background: c }} />
          ))}
          <span>mai mult</span>
        </div>
        {tip && (
          <div
            className="ask-maptip"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
          >
            <div className="t">{tip.label}</div>
            {tip.value > 0 ? (
              <>
                <div className="v">{display(tip.value)}</div>
                <div className="s">
                  {formatInt(tip.count)} achiziții
                  {national > 0 &&
                    ` · ${((tip.value / national) * 100).toFixed(1)}% din total`}
                </div>
                <div className="s">click → deschide achizițiile județului</div>
              </>
            ) : (
              <div className="s">fără date pentru aceste filtre</div>
            )}
          </div>
        )}
      </div>
      <table className="ask-table ask-mapside">
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.key}>
              <td className="pos">{i + 1}</td>
              <td>
                <a href={countyUrl(r.label)} target="_blank" rel="noopener">
                  {r.label} ↗
                </a>
              </td>
              <td className="num">{display(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Animated loading indicator: three pulsing bars + elapsed seconds once the
 * query stops being instant, so long queries (up to the 20s cap) read as
 * "working", not "stuck".
 */
function Loader({ label }: { label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ask-loader" role="status" aria-live="polite">
      <span className="bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>
        {label}…{secs >= 3 && ` ${secs}s`}
        {secs >= 8 && " — interogare mare, poate dura până la 20s"}
      </span>
    </div>
  );
}

function csvQ(s: string | null | undefined): string {
  const text = s ?? "";
  const safe = /^[\s\uFEFF]*[=+@-]/.test(text) ? "'" + text : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(data: BlockData) {
  let lines: string[];
  switch (data.block) {
    case "table":
      lines = [
        "nume,judet,valoare_lei,achizitii,populatie",
        ...data.rows.map(
          (r) =>
            `${csvQ(r.name)},${csvQ(r.county)},${r.value},${r.count},${r.population ?? ""}`,
        ),
      ];
      break;
    case "timeseries":
      lines = [
        "an,valoare_lei,achizitii",
        ...data.series.map((p) => `${p.year},${p.value},${p.count}`),
      ];
      break;
    case "map":
      lines = [
        "judet,valoare_lei,achizitii",
        ...data.counties.map((c) => `${csvQ(c.county)},${c.value},${c.count}`),
      ];
      break;
    case "stat":
      lines = [
        "valoare_lei,achizitii",
        `${data.stat.value},${data.stat.count}`,
      ];
      break;
    case "compare":
      lines = [
        "nume,judet,valoare_lei,achizitii,cri,semnale,flags",
        ...data.entities.map(
          (e) =>
            `${csvQ(e.name)},${csvQ(e.county)},${e.value},${e.count},${e.cri ?? ""},${e.nFlags},${csvQ(e.flags.join("|"))}`,
        ),
      ];
      break;
    case "distribution":
      lines = [
        "cri_de,cri_pana,entitati",
        ...data.distribution.buckets.map((b) => `${b.from},${b.to},${b.n}`),
      ];
      break;
    case "breakdown":
      lines = [
        "categorie,cod,valoare_lei,achizitii",
        ...data.slices.map(
          (s2) => `${csvQ(s2.name)},${s2.code},${s2.value},${s2.count}`,
        ),
        `"alte categorii",,${data.other.value},${data.other.count}`,
      ];
      break;
    case "scatter":
      lines = [
        "nume,judet,valoare_lei,cri,semnale",
        ...data.points.map(
          (p) =>
            `${csvQ(p.name)},${csvQ(p.county)},${p.value},${p.cri},${p.nFlags}`,
        ),
      ];
      break;
    case "sankey":
      lines = [
        "partener,categorie,valoare_lei",
        ...data.flows.map(
          (f) => `${csvQ(f.partner)},${csvQ(f.category)},${f.value}`,
        ),
      ];
      break;
    case "network":
      lines = [
        "partener,valoare_lei,achizitii",
        ...data.nodes.map((n) => `${csvQ(n.name)},${n.value},${n.count}`),
      ];
      break;
    case "entity_card": {
      const c = data.card;
      lines = [
        "nume,judet,valoare_lei,achizitii,cri,semnale,flags",
        `${csvQ(c.name)},${csvQ(c.county)},${c.value},${c.count},${c.cri ?? ""},${c.nFlags},${csvQ(c.flags.join("|"))}`,
      ];
      break;
    }
    case "fact_check":
      lines = [
        "cod,data,ce,valoare_lei",
        ...data.fact.samples.map(
          (s2) =>
            `${csvQ(s2.daCode)},${csvQ(s2.date)},${csvQ(s2.cpvName)},${s2.value}`,
        ),
      ];
      break;
    case "trend":
      lines = [
        `nume,judet,${data.yearA},${data.yearB}`,
        ...data.rowsTrend.map(
          (r) => `${csvQ(r.name)},${csvQ(r.county)},${r.valueA},${r.valueB}`,
        ),
      ];
      break;
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "intreaba-rezultat.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
