"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import FollowButton from "@/components/FollowButton";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { countyMap, foldCounty } from "@/lib/map";
import { encodeSpec, decodeSpec } from "@/lib/ask/permalink";
import { isHistoricalProfile } from "@/lib/ask/population";
import { validateSpec, type AskSpec } from "@/lib/ask/spec";
import { entitySourceLink, entitySourceScope, yearSourceLink } from "@/lib/ask/source-spec";
import { describeQuestion, localityScopeError, questionKey } from "@/lib/ask/question-ui";
import { ANSWER_ERROR, breakdownLead, countWords, entityNoun, fileSlug, formatShare, isHumanError, rankingRest, rankingShare, shouldAutoRun, type RankingTotals } from "@/lib/ask/answer-text";
import type { IntentResult } from "@/lib/intent/types";
import { NATURAL_LANGUAGE_ENABLED, NATURAL_LANGUAGE_UNAVAILABLE } from "@/lib/ask/features";
import { validateEvidenceScope, validateEvidenceFilters, type EvidenceScope, type EvidenceFilters } from "@/lib/ask/evidence";
import type { BlockData, PartialYear } from "@/lib/ask/compile";
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
import DiscoveryIcon from "../DiscoveryIcon";
import AnswerExports from "./AnswerExports";
import CoverageDisclosure from "@/components/CoverageDisclosure";
import Term from "@/components/Term";
import { AskBox, AskExamples, IntentAnnouncer, IntentChoose, IntentIntro, IntentOutro, IntentUnknown, MAX_QUESTION_CHARS, type IntentChoice } from "./IntentAsk";
import type { AskExample } from "./ask-examples";
import "./ask-intent.css";

type TableRow = Extract<BlockData, { block: "table" }>["rows"][number];
type SeriesPoint = Extract<
  BlockData,
  { block: "timeseries" }
>["series"][number];
type CountyValue = Extract<BlockData, { block: "map" }>["counties"][number];
type MapUnknown = Extract<BlockData, { block: "map" }>["unknown"];
interface AskResponse {
  ok: boolean;
  error?: string;
  question?: string | null;
  spec?: AskSpec;
  pills?: string[];
  caveats?: string[];
  data?: BlockData;
  /** timeseries/trend: years the archive covers only in part (audit F19). */
  partialYears?: PartialYear[];
  displaySql?: string;
  tookMs?: number;
  executedAt?: string;
}
export type PanelMode = "search" | "ask" | "build";
const EXAMPLES = [
  "Ce valoare au achizițiile de medicamente din Cluj, în 2026?",
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
  const [builderResolution, setBuilderResolution] = useState<{ submitted: BuilderSpec; resolved: BuilderSpec } | null>(null);
  const [builderFromAi, setBuilderFromAi] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Technical text behind a failed answer, shown only under "Detalii tehnice". */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const lastBody = useRef<Record<string, unknown> | null>(null);
  /** A link that already holds the question opens on its answer; the builder waits under "Schimbă întrebarea". */
  const [builderCollapsed, setBuilderCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [layout, setLayout] = useState<"visual" | "table">("visual");
  const [evidence, setEvidence] = useState<{
    spec: AskSpec;
    scope?: EvidenceScope;
    filters?: EvidenceFilters;
    title: string;
    scopeLabel?: string;
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
  // Free-text question → /api/intent (deterministic rules) → editable builder.
  const [askText, setAskText] = useState("");
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<IntentChoice | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const askRef = useRef<HTMLInputElement>(null);
  const intentRequest = useRef<AbortController | null>(null);
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  /** The error appears where the person is looking (on a phone it would otherwise sit under the fold). */
  const revealError = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById("raspuns-eroare")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "center",
      });
    }));
  }, []);
  const execute = useCallback(
    async (
      body: Record<string, unknown>,
      drill = false,
      savedScope?: EvidenceScope,
      savedFilters?: EvidenceFilters,
      /** False when the page opens from a link: keep the question and heading in view. */
      scroll = true,
    ) => {
      if (!NATURAL_LANGUAGE_ENABLED && typeof body.question === "string") {
        setError(NATURAL_LANGUAGE_UNAVAILABLE);
        return false;
      }
      request.current.controller?.abort();
      const controller = new AbortController(),
        seq = ++request.current.seq;
      request.current.controller = controller;
      lastBody.current = body;
      setLoading(true);
      setError(null);
      setErrorDetail(null);
      setEvidence(null);
      try {
        const r = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const answer = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as AskResponse;
        if (seq !== request.current.seq) return false;
        if (!answer.ok || !answer.data || !answer.spec) {
          // Explanations written for people stay visible; technical text goes under "Detalii tehnice".
          const human = isHumanError(r.status, answer.error);
          setError(human ? answer.error! : ANSWER_ERROR);
          setErrorDetail(human ? null : answer.error ?? `HTTP ${r.status}`);
          revealError();
          return false;
        }
        setResp(answer);
        if (body.spec && !("tablePage" in body)) {
          setBuilderResolution({ submitted: body.spec as BuilderSpec, resolved: answer.spec as unknown as BuilderSpec });
        }
        // The composer owns draft/applied comparison, including edits made
        // during this request and normalized drafts restored from old links.
        if (typeof body.question === "string") {
          setBuilderInit(answer.spec as unknown as BuilderSpec);
          setBuilderFromAi(true);
        }
        if (!("tablePage" in body)) setTableOpts({ page: 0 });
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        // The executed identities, plus an explicit data stream the link asked for.
        const submitted = body.spec as AskSpec | undefined;
        url.searchParams.set("spec", encodeSpec(submitted?.dataset && !answer.spec.dataset ? { ...answer.spec, dataset: submitted.dataset } : answer.spec));
        url.searchParams.delete("drill");
        url.searchParams.delete("evidence");
        url.searchParams.delete("sourceFilters");
        window.history.replaceState(null, "", url);
        if (drill)
          setEvidence({
            spec: answer.spec,
            ...(savedScope ? { scope: savedScope } : {}),
            ...(savedFilters ? { filters: savedFilters } : {}),
            title:
              answer.question ||
              describeQuestion(answer.spec as unknown as BuilderSpec),
          });
        if (!drill && scroll)
          // Two frames: the answer is rendered before it is brought under the sticky header.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            document
              .getElementById("raspuns")
              ?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
            document.getElementById("raspuns-titlu")?.focus({ preventScroll: true });
          }));
        return answer.spec;
      } catch (e) {
        if (!controller.signal.aborted && seq === request.current.seq) {
          setError(ANSWER_ERROR);
          setErrorDetail(e instanceof Error ? e.message : String(e));
          revealError();
        }
        return false;
      } finally {
        if (seq === request.current.seq) setLoading(false);
      }
    },
    [revealError],
  );
  /** Bring the understood question (or the choice to make) into view and move focus to its heading. */
  const focusResult = useCallback((id: string, scrollTo: string) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(scrollTo)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
      document.getElementById(id)?.focus({ preventScroll: true });
    }));
  }, []);
  /**
   * One reading is chosen: the interpreter's only reading, a choice the person
   * clicked, or "Sau întreabă altfel". Each already holds a whole question, so it
   * is answered at once; the editable builder stays above the answer.
   */
  const adopt = useCallback((choice: IntentChoice) => {
    setChosen(choice);
    setBuilderInit(choice.spec as unknown as BuilderSpec);
    setBuilderResolution(null);
    setBuilderFromAi(false);
    setBuilderOpen(true);
    setBuilderCollapsed(false);
    setMode("build");
    focusResult("ia-understood", "intrebarea");
    void execute({ spec: choice.spec });
  }, [focusResult, execute]);
  const interpret = useCallback(async (raw: string, fromHistory = false) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
    if (text.length < 2) return;
    intentRequest.current?.abort();
    const controller = new AbortController();
    intentRequest.current = controller;
    setIntentLoading(true);
    setIntentError(null);
    try {
      const r = await fetch(`/api/intent?q=${encodeURIComponent(text)}`, { signal: controller.signal });
      const body = (await r.json()) as IntentResult & { error?: string };
      if (controller.signal.aborted) return;
      if (!r.ok || body.error) {
        setIntentError(body.error ?? "Nu am putut citi întrebarea acum. Încearcă din nou.");
        return;
      }
      setIntent(body);
      // A new question starts a new answer: the previous one belonged to other words.
      setResp(null);
      setError(null);
      setEvidence(null);
      if (shouldAutoRun(body)) adopt({ spec: body.spec!, sentence: body.sentence! });
      else {
        setChosen(null);
        setBuilderInit(null);
        setBuilderOpen(false);
        focusResult("ia-result-title", "ia-result-title");
      }
      if (!fromHistory) {
        const url = new URL(window.location.href);
        url.searchParams.set("q", text);
        for (const key of ["spec", "drill", "evidence", "sourceFilters"]) url.searchParams.delete(key);
        window.history.pushState(null, "", url);
      }
    } catch {
      if (!controller.signal.aborted) setIntentError("Nu am putut citi întrebarea acum. Încearcă din nou; textul tău este păstrat.");
    } finally {
      if (intentRequest.current === controller) setIntentLoading(false);
    }
  }, [adopt, focusResult]);
  const pickExample = useCallback((example: AskExample) => {
    if (example.fill) {
      setAskText(example.fill);
      requestAnimationFrame(() => {
        const input = askRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(example.fill!.length, example.fill!.length);
        input.scrollIntoView({ block: "center" });
      });
      return;
    }
    setAskText(example.text);
    void interpret(example.text);
  }, [interpret]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search),
        question = params.get("q"),
        encoded = params.get("spec");
      setAiLinkNotice(false);
      if (question && !NATURAL_LANGUAGE_ENABLED && !encoded) {
        // A question in the address (also from the home search) is read by the rules.
        setAskText(question);
        void interpret(question, true);
      }
      if (question && NATURAL_LANGUAGE_ENABLED) {
        setQ(question);
        setMode("ask");
        void execute({ question });
      } else if (encoded) {
        const decoded = decodeSpec(encoded);
        const parsed = validateSpec(decoded);
        if ("error" in parsed) {
          setError(
            "Legătura conține o întrebare invalidă. Poți construi una nouă mai jos.",
          );
          return;
        }
        setBuilderInit(parsed as unknown as BuilderSpec);
        setBuilderOpen(true);
        setBuilderCollapsed(params.get("drill") !== "1");
        setMode("build");
        let scope: EvidenceScope | undefined;
        let sourceFilters: EvidenceFilters | undefined;
        try {
          const raw = params.get("evidence");
          if (raw) {
            const validated = validateEvidenceScope(JSON.parse(raw));
            if ("error" in validated) throw new Error(validated.error);
            scope = validated;
          }
          const rawFilters = params.get("sourceFilters");
          if (rawFilters) {
            const validated = validateEvidenceFilters(JSON.parse(rawFilters));
            if ("error" in validated) throw new Error(validated.error);
            sourceFilters = validated;
          }
        } catch {
          setError("Selecția de surse din această legătură este invalidă.");
          return;
        }
        // validateSpec omits the default stream; a link that names it keeps it.
        const linkDataset = decoded && typeof decoded === "object" && "dataset" in decoded ? (decoded as { dataset?: unknown }).dataset : undefined;
        const asGiven = typeof linkDataset === "string" && !parsed.dataset ? { ...parsed, dataset: linkDataset as AskSpec["dataset"] } : parsed;
        // An old link with a locality its view cannot honour opens in the builder, which explains the
        // condition to remove; it is not run (the API would refuse it too).
        if (localityScopeError(asGiven as AskSpec)) { setBuilderCollapsed(false); return; }
        void execute({ spec: asGiven }, params.get("drill") === "1", scope, sourceFilters);
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      request.current.controller?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [execute, interpret]);
  const applied = resp?.spec;
  // One title per answered spec: the same words whether the answer came from
  // typed text, a builder edit or a shared link, in every view, the drawer and the export.
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
          title,
          ...(label ? { scopeLabel: label } : {}),
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
  /** The phone's share sheet when there is one; otherwise the link is copied. */
  const share = async (url: string, text: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(url, "Link copiat. Îl poți lipi în WhatsApp.");
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
    let scope: EvidenceScope | undefined;
    const encodedScope = url.searchParams.get("evidence");
    if (encodedScope) {
      try {
        const parsedScope = validateEvidenceScope(JSON.parse(encodedScope));
        if ("error" in parsedScope) return;
        scope = parsedScope;
      } catch { return; }
    }
    event.preventDefault();
    openEvidence(spec, scope, "selecția aleasă");
  };
  const data = resp?.data,
    count = data ? sourceCount(data) : null;
  const isProfile = !!applied && isHistoricalProfile(applied);
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
      {/* The page title is the question box's label: one line says what this page does. */}
      <header className="cq-workspace-header ia-head">
        <h1><label htmlFor="ia-question" className="ia-title-label">Ce vrei să afli despre banii publici?</label></h1>
      </header>
      <AskBox value={askText} onChange={setAskText} onSubmit={(text) => void interpret(text)} loading={intentLoading} inputRef={askRef} />
      {intentError && <div className="cq-error" role="alert"><strong>Întrebarea ta este păstrată.</strong><p>{intentError}</p></div>}
      <IntentAnnouncer result={intent} error={intentError} />
      {intent && !intent.spec && intent.alternatives.some((alt) => alt.kind !== "intent") && !chosen && <IntentChoose result={intent} onAdopt={adopt} />}
      {intent && !intent.spec && !intent.alternatives.some((alt) => alt.kind !== "intent") && <IntentUnknown result={intent} onPick={pickExample} />}
      {!intent && !builderInit && !resp && <AskExamples onPick={pickExample} />}
      {(withSearch || NATURAL_LANGUAGE_ENABLED) && <div className="cq-modes" aria-label="Cum vrei să explorezi?">
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
      </div>}
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
                {text} →
              </button>
            ))}
          </div>
        </section>
      )}
      {builderOpen && builderCollapsed ? (
        <div hidden={mode !== "build"} id="intrebarea" className="ia-builder ia-builder-collapsed">
          <button type="button" className="ia-change-question" aria-expanded="false" onClick={() => setBuilderCollapsed(false)}>
            <PencilIcon />
            Schimbă întrebarea
          </button>
        </div>
      ) : builderOpen ? (
        <div hidden={mode !== "build"} id="intrebarea" className="ia-builder">
          {!chosen && <h2 className="ia-builder-title">Construiește întrebarea pas cu pas</h2>}
          <QuestionBuilder
            key={builderInit ? encodeSpec(builderInit) : "start"}
            initial={builderInit}
            resolution={builderInit && builderResolution && questionKey(builderInit) === questionKey(builderResolution.submitted) ? builderResolution : null}
            fromAi={builderFromAi}
            running={loading}
            onDraftChange={setDirty}
            onRun={(spec) => execute({ spec })}
            initialApplied={!chosen}
            {...(chosen && intent ? {
              intro: <IntentIntro />,
              outro: <IntentOutro result={intent} chosen={chosen} onAdopt={adopt} />,
            } : {})}
          />
        </div>
      ) : (
        <button type="button" className="ia-open-builder" onClick={() => setBuilderOpen(true)}>
          <strong>Construiește întrebarea pas cu pas</strong>
          <span>Alege din 13 modele de întrebări: clasamente, totaluri, evoluții, comparații, relații și semnale.</span>
        </button>
      )}
      {loading && <Loader label="Căutăm răspunsul în date" />}
      {error && (
        <div className="cq-error" role="alert" id="raspuns-eroare">
          <strong>{error}</strong>
          <p>Întrebarea ta este păstrată.</p>
          {lastBody.current && (
            <button type="button" className="cq-retry" disabled={loading} onClick={() => { if (lastBody.current) void execute(lastBody.current); }}>
              Reîncearcă
            </button>
          )}
          {errorDetail && (
            <details className="cq-error-detail">
              <summary>Detalii tehnice</summary>
              <p>{errorDetail}</p>
            </details>
          )}
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
                <h2 id="raspuns-titlu" tabIndex={-1}>{title}</h2>
                <div className="cq-scope">
                  {(resp.pills ?? []).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
                {dirty && (
                  <p className="cq-pending" role="status">
                    Răspuns pentru întrebarea anterioară
                  </p>
                )}
              </div>
              <div className="cq-answer-actions">
                <button
                  type="button"
                  className="cq-source-main"
                  onClick={() => openEvidence()}
                >
                  <DiscoveryIcon name="database"/>
                  {count===null||count===0?'Vezi înregistrările sursă':isProfile||applied.dataset==='da'
                    ?count===1?'Vezi achiziția':`Vezi cele ${countWords(count, 'achiziție', 'achiziții')}`
                    :count===1?'Vezi înregistrarea sursă':`Vezi cele ${countWords(count, 'înregistrare', 'înregistrări')}`}
                </button>
                <button
                  type="button"
                  className="cq-share"
                  onClick={() => void share(answerLink(applied), title)}
                >
                  <ShareIcon />
                  Trimite
                </button>
                <FollowButton key={JSON.stringify(applied)} spec={applied} title={title} />
                <ClipButton
                  kind="query"
                  spec={applied}
                  snapshot={{
                    title,
                    pills: resp.pills ?? [],
                    headline:
                      count === null
                        ? title
                        : countWords(count, "înregistrare", "înregistrări"),
                    result: data,
                    executedAt: resp.executedAt,
                    caveats: resp.caveats ?? [],
                    displaySql: resp.displaySql,
                  }}
                  label={title}
                />
              </div>
            </div>
            {isProfile && (
              <p className="cq-profile-notice">
                <strong>
                  Valori din profil, inclusiv oferte neacceptate; nu plăți.
                </strong>{" "}
                <Term tip title="Profil istoric" text="Profilurile folosesc istoricul achizițiilor directe. Stările și calculul sunt în lista surselor." />
              </p>
            )}
            {["table", "timeseries", "map"].includes(data.block) && (
              <div className="cq-display">
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
            {data.block === "breakdown" && breakdownLead(data.slices, data.other) && (
              <p className="cq-lead">{breakdownLead(data.slices, data.other)}</p>
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
                    totals={(data.page ?? 0) === 0 && !tableOpts.sort ? data.totals : undefined}
                    onSources={openEvidence}
                  />
                ) : (
                  <TableBlock
                    rows={data.rows}
                    spec={applied}
                    totals={data.totals}
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
                  <SeriesBlock series={data.series} spec={applied} partial={resp.partialYears ?? []} />
                ) : (
                  <ExactSeries
                    series={data.series}
                    partial={resp.partialYears ?? []}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ))}
              {data.block === "map" &&
                (layout === "visual" ? (
                  <MapBlock counties={data.counties} unknown={data.unknown} spec={applied} />
                ) : (
                  <CountyValues
                    counties={data.counties}
                    unknown={data.unknown}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ))}
              {data.block === "compare" && (
                <CompareBlock entities={data.entities} historical={isProfile} />
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
                <EntityCardBlock card={data.card} historical={isProfile} />
              )}
              {data.block === "fact_check" && (
                <FactCheckBlock fact={data.fact} />
              )}
              {data.block === "trend" && (
                <TrendBlock
                  rows={data.rowsTrend}
                  yearA={data.yearA}
                  yearB={data.yearB}
                  partial={resp.partialYears ?? []}
                  spec={applied}
                />
              )}
            </div>
            {/* How the number was built reads after the answer, not before it. */}
            {(resp.caveats?.length ?? 0) > 0 && (
              <details
                className="cq-caveats"
                open={resp.caveats!.some((c) =>
                  /am ales|Am restrâns|nu există|ignor|în afara/i.test(c),
                )}
              >
                <summary>
                  Ce include calculul · {resp.caveats!.length}
                </summary>
                {resp.caveats!.map((c) => (
                  <p key={c}>{c}</p>
                ))}
              </details>
            )}
            <CoverageDisclosure key={JSON.stringify(applied)} spec={applied}>
              {resp.displaySql && (
                <details>
                  <summary>Interogarea SQL · avansat</summary>
                  <pre>
                    <code>{resp.displaySql}</code>
                  </pre>
                </details>
              )}
            </CoverageDisclosure>
            <div className="cq-answer-tools">
              <button
                type="button"
                className="cq-copy"
                onClick={() =>
                  void copy(answerLink(applied), "Link copiat. Îl poți lipi în WhatsApp.")
                }
              >
                <CopyIcon />
                Copiază linkul
              </button>
              <AnswerExports key={encodeSpec(applied)} spec={applied} disabled={loading} onResult={()=>exportCsv(data,applied,title)}/>
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

          </section>
        </AnswerEvidence.Provider>
      )}
      {evidence && (
        <EvidenceDrawer
          key={JSON.stringify(evidence)}
          spec={evidence.spec}
          title={evidence.title}
          scopeLabel={evidence.scopeLabel}
          {...(evidence.scope ? { scope: evidence.scope } : {})}
          {...(evidence.filters ? { initialFilters: evidence.filters } : {})}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}

function RankingBars({
  rows,
  spec,
  totals,
  onSources,
}: {
  rows: TableRow[];
  spec: AskSpec;
  totals?: RankingTotals | undefined;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
}) {
  // Shares are of money: a per-capita ranking has no meaningful "% din total".
  const shareTotals = spec.measure === "value_per_capita" ? undefined : totals;
  const rest = rankingRest(rows, shareTotals);
  const metric = (r: TableRow) =>
    spec.measure === "count"
      ? r.count
      : spec.measure === "value_per_capita"
        ? r.population
          ? r.value / r.population
          : 0
        : r.value;
  const max = Math.max(...rows.map(metric), 1);
  const hasTotal = shareTotals !== undefined && shareTotals.value > 0;
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
                spec,
                entitySourceScope(spec, r),
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
                  ? countWords(r.count, "înregistrare", "înregistrări")
                  : formatRonFull(metric(r))}
                {spec.measure === "value_per_capita" ? " / locuitor" : ""}
              </strong>
              <small>
                {spec.measure === "count"
                  ? formatRonFull(r.value)
                  : countWords(r.count, "înregistrare", "înregistrări")}
                {rankingShare(r.value, shareTotals) !== null && <> · {formatShare(rankingShare(r.value, shareTotals)!)} din total</>}
                {" →"}
              </small>
            </span>
          </button>
        ))}
        {rest && (
          <div className="cq-rank-rest">
            <span className="cq-rank-number" aria-hidden="true">…</span>
            <span className="cq-rank-name">
              <strong>Alte {entityNoun(spec.dim, rest.entities)}</strong>
            </span>
            <span className="cq-rank-value">
              <strong>{spec.measure === "count" ? countWords(rest.count, "înregistrare", "înregistrări") : formatRonFull(rest.value)}</strong>
              <small>{spec.measure === "count" ? formatRonFull(rest.value) : countWords(rest.count, "înregistrare", "înregistrări")} · {formatShare(rest.share)} din total</small>
            </span>
          </div>
        )}
      </div>
      {/* A consortium's value is split equally among its winners, so some firms show the same amount. */}
      {(hasTotal || spec.dim === "supplier") && (
        <p className="ask-fine cq-total-line">
          {hasTotal && <>Total: {formatRonFull(shareTotals.value)} la {entityNoun(spec.dim, shareTotals.entities)} · valoare înregistrată, nu plăți</>}
          {hasTotal && spec.dim === "supplier" && " · "}
          {spec.dim === "supplier" && <>consorții: cote egale <Term id="consortiu" tip /></>}
        </p>
      )}
    </>
  );
}
function ExactSeries({
  series,
  partial,
  spec,
  onSources,
}: {
  series: SeriesPoint[];
  partial: PartialYear[];
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
        {series.map((r) => {
          const part = partial.find((p) => p.year === r.year);
          return (
          <tr key={r.year}>
            <th>
              {r.year}
              {part && <small className="ask-partial-note">{part.provisional ? "date parțiale sau provizorii" : "an acoperit parțial"}: {part.note}</small>}
            </th>
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
          );
        })}
      </tbody>
    </table>
  );
}
function CountyValues({
  counties,
  unknown,
  spec,
  onSources,
}: {
  counties: CountyValue[];
  unknown: MapUnknown;
  spec: AskSpec;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
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
                    onSources(spec, { county:r.county }, `${r.county} · înregistrările județului`)
                  }
                >
                  Vezi înregistrările →
                </button>
              </td>
            </tr>
          ))}
        {unknown.count > 0 && (
          <tr>
            <th>Județ necunoscut</th>
            <td>{formatRonFull(unknown.value)}</td>
            <td>{formatInt(unknown.count)}</td>
            <td>nu apar pe hartă</td>
          </tr>
        )}
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
        {formatRonFull(stat.value)} · {countWords(stat.count, "înregistrare", "înregistrări")}
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
  totals,
  perCapita,
  meta,
  sort,
  dir,
  onFetch,
}: {
  rows: TableRow[];
  spec?: unknown;
  totals?: RankingTotals | undefined;
  perCapita: boolean;
  /** Present only in paged mode (clasament without explicit topN). */
  meta?: { total: number; page: number; pageSize: number } | null;
  sort?: string | undefined;
  dir?: "asc" | "desc" | undefined;
  onFetch?: (page: number, sort?: string, dir?: "asc" | "desc") => void;
}) {
  // acquisitions-count click → same filters narrowed to this row, drill opened
  const rowUrl = (r: TableRow) =>
    entitySourceLink(spec as AskSpec, r);
  const paged = Boolean(meta && onFetch);
  const shareTotals = perCapita ? undefined : totals;
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
    tip,
  }: {
    k: string;
    label: string;
    num?: boolean;
    tip?: ReactNode;
  }) =>
    paged ? (
      <th
        className={(num ? "num" : "") + " sortable"}
        // The (?) opens its explanation; it does not sort the column.
        onClick={(event) => { if (!(event.target as Element).closest(".term")) sortBy(k); }}
        title="sortează"
      >
        {label}
        {sort === k ? (dir === "desc" ? " ▾" : " ▴") : ""}
        {tip && <> {tip}</>}
      </th>
    ) : (
      <th className={num ? "num" : undefined}>{label}{tip && <> {tip}</>}</th>
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
            <Th k="county" label="Județ" tip={(spec as AskSpec | undefined)?.dim === "supplier" ? <Term tip title="Județ" text="Județul firmei, nu al instituțiilor care au cumpărat de la ea." /> : undefined} />
            {perCapita && <th className="num">Populație</th>}
            {perCapita && <Th k="percap" label="lei / locuitor" num />}
            <Th k="value" label="Valoare" num />
            {shareTotals && <th className="num cq-share-col">% din total</th>}
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
              {shareTotals && <td className="num cq-share-col">{rankingShare(r.value, shareTotals) !== null ? formatShare(rankingShare(r.value, shareTotals)!) : "—"}</td>}
              <td className="num">
                {(() => {
                  const u = rowUrl(r);
                  return u ? (
                    <a href={u}>
                      {formatInt(r.count)} →
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
    </div>
  );
}

function SeriesBlock({
  series,
  spec,
  partial,
}: {
  series: SeriesPoint[];
  spec: unknown;
  partial: PartialYear[];
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
  const shownPartial = partial.filter((x) => series.some((p) => p.year === x.year));
  return (
    <div>
      {t.el}
      <div className="ask-ts">
        {series.map((p) => {
          const part = partial.find((x) => x.year === p.year);
          return (
          <a
            key={p.year}
            className={part ? "col partial" : "col"}
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
            {...t.bind(
              String(p.year),
              asCount
                ? formatInt(p.count) + " înregistrări"
                : formatRonFull(p.value),
              `${formatInt(p.count)} achiziții${p.year === peak.year ? " · vârful seriei" : ""}${part ? ` · ${part.provisional ? "date parțiale sau provizorii" : "an acoperit parțial"}: ${part.note}` : ""} · click → achizițiile anului`,
            )}
          >
            <div className="cv">{display(p)}</div>
            <div
              className={p.year === peak.year ? "bar peak" : "bar"}
              style={{ height: `${Math.max(2, (metric(p) / max) * 100)}%` }}
            />
            <div className="cl">{part ? `${p.year}*` : p.year}</div>
          </a>
          );
        })}
      </div>
      <p className="ask-fine">valori contractate, nu plăți</p>
      {shownPartial.length > 0 && (
        <p className="ask-fine ask-partial-note">
          * {shownPartial.some((x) => x.provisional) ? "an cu date parțiale sau provizorii" : "an acoperit parțial"}, nu se compară direct cu un an întreg:{" "}
          {shownPartial.map((x) => `${x.year} (${x.note})`).join(", ")}.
        </p>
      )}
    </div>
  );
}

const MAP_COLORS = ["#e4ead8", "#c7d5b2", "#9cb786", "#6e9365", "#285b45"];
const MAP_NO_DATA = "#e8eade";

function MapBlock({
  counties,
  unknown,
  spec,
}: {
  counties: CountyValue[];
  unknown: MapUnknown;
  spec: unknown;
}) {
  const asCount = (spec as AskSpec).measure === "count";
  const display = (v: number) =>
    asCount ? formatInt(v) + " înreg." : formatRon(v);
  // county click → same filters, scoped to that county, drill rows opened
  const countyUrl = (label: string): string =>
    `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}&drill=1&evidence=${encodeURIComponent(JSON.stringify({ county:label }))}`;

  const byKey = new Map<string, number>();
  const cntByKey = new Map<string, number>();
  for (const c of counties) {
    const k = foldCounty(c.county);
    byKey.set(k, (byKey.get(k) ?? 0) + (asCount ? c.count : c.value));
    cntByKey.set(k, (cntByKey.get(k) ?? 0) + c.count);
  }
  // Shares are of the whole selection, including records whose authority has
  // no known county and so are not on the map (audit F13).
  const unknownMeasure = asCount ? unknown.count : unknown.value;
  const national =
    counties.reduce((s, c) => s + (asCount ? c.count : c.value), 0) +
    unknownMeasure;
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
        {unknown.count > 0 && national > 0 && (
          <p className="ask-fine">
            {display(unknownMeasure)} ({formatShare(unknownMeasure / national)} din
            selecție, {formatInt(unknown.count)} înregistrări) au instituția fără județ
            cunoscut și nu apar pe hartă · procentele sunt din totalul selecției
          </p>
        )}
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
                    ` · ${formatShare(tip.value / national)} din total`}
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
                <a href={countyUrl(r.label)}>
                  {r.label} →
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

/** The link that reopens this answer (the page runs it on arrival). */
function answerLink(spec: AskSpec): string {
  return `${window.location.origin}/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}`;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function exportCsv(data: BlockData, spec: AskSpec, title: string) {
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
        ...(data.unknown.count > 0
          ? [`${csvQ("Județ necunoscut")},${data.unknown.value},${data.unknown.count}`]
          : []),
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
        isHistoricalProfile(spec) ? "nume,judet,valoare_lei,achizitii,cri,semnale,flags" : "nume,judet,valoare_lei,inregistrari",
        ...data.entities.map(
          (e) =>
            `${csvQ(e.name)},${csvQ(e.county)},${e.value},${e.count}${isHistoricalProfile(spec) ? `,${e.cri ?? ""},${e.nFlags},${csvQ(e.flags.join("|"))}` : ""}`,
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
        isHistoricalProfile(spec) ? "nume,judet,valoare_lei,achizitii,cri,semnale,flags" : "nume,judet,valoare_lei,inregistrari",
        `${csvQ(c.name)},${csvQ(c.county)},${c.value},${c.count}${isHistoricalProfile(spec) ? `,${c.cri ?? ""},${c.nFlags},${csvQ(c.flags.join("|"))}` : ""}`,
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
  // Same file conventions as the source export: UTF-8 BOM (Excel keeps the diacritics) and CRLF.
  const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileSlug(title)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
