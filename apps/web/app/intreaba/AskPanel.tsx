"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import FollowButton from "@/components/FollowButton";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { encodeSpec, decodeSpec } from "@/lib/ask/permalink";
import { isHistoricalProfile } from "@/lib/ask/population";
import { NEWER_VERSION_LINK, validateSpec, type AskSpec } from "@/lib/ask/spec";
import { BLOCK_FILTERS } from "@/lib/ask/filters/blocks";
import { describeConditions } from "@/lib/ask/filters/describe";
import { restoreLink } from "@/lib/ask/filters/restore";
import { answerLabels, questionTitle } from "@/lib/ask/filters/title";
import { askLink, entitySourceLink, entitySourceScope, yearSourceLink } from "@/lib/ask/source-spec";
import { questionKey, type QuestionSpec } from "@/lib/ask/question-ui";
import { ANSWER_ERROR, breakdownLead, countWords, entityNoun, fileSlug, formatShare, isHumanError, rankingRest, rankingShare, shouldAutoRun, type RankingTotals } from "@/lib/ask/answer-text";
import type { IntentResult } from "@/lib/intent/types";
import { NATURAL_LANGUAGE_ENABLED, NATURAL_LANGUAGE_UNAVAILABLE } from "@/lib/ask/features";
import { validateEvidenceScope, validateEvidenceFilters, type EvidenceScope, type EvidenceFilters } from "@/lib/ask/evidence";
import type { BlockData, ExecutedWindow, PartialYear } from "@/lib/ask/compile";
import {
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
import QuestionBuilder, { type StripPatch } from "./QuestionBuilder";
import SaveQuestionButton from "./SaveQuestionButton";
import type { SavedQuestion } from "./SavedQuestions";
import AnswerStrip, { Crumbs, StripEnd, StripLabelled } from "./answer/AnswerStrip";
import TotalLine, { RECORDED_VALUE } from "./answer/TotalLine";
import EmptyState from "./answer/EmptyState";
import { emptyAnswer, relaxations } from "./answer-empty";
import KitLink from "./answer/KitLink";
import HelpTip from "./builder/HelpTip";
import { CHART_FIRST_YEAR, seriesAxis, seriesLabels } from "./series-labels";
import Segmented from "./builder/Segmented";
import "./builder/filters-kit.css";
import { answerCsv, type BandState } from "./answer-csv";
import { useCpvName } from "./cpv-name";
import { STRIP_QUERY_KEYS, appliedAfterStrip, readThread, shownWords, streamOptions, threadCrumbs, threadWords, type AnswerVariants, type Thread } from "./answer-state";
import EntityTypeahead from "./EntityTypeahead";
import EvidenceDrawer from "./EvidenceDrawer";
import { AnswerEvidence, useAnswerEvidence } from "./AnswerEvidence";
import { CompareBlock } from "./CompareBlock";
import MapBlock from "./MapBlock";
import { ProfileNotice } from "./ProfileNotes";
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
  /** trend: the months it counted; its drawer sends them back (409 when the data moved them). */
  executed?: ExecutedWindow;
  displaySql?: string;
  /** The words of each display state of the strip, computed on the server (plan §2.3): the map's lens. */
  variants?: AnswerVariants;
  tookMs?: number;
  executedAt?: string;
}
export type PanelMode = "search" | "ask" | "build";
/**
 * The lead of the total line (G8): the answer's total where it has one,
 * "Selecția" where its rows are not one sum (a comparison, a trend, relations).
 */
function totalLead(data: BlockData): ReactNode {
  const sum = (rows: readonly { value: number; count: number }[]) => rows.reduce((t, r) => ({ value: t.value + r.value, count: t.count + r.count }), { value: 0, count: 0 });
  const total = data.block === "stat" ? data.stat
    : data.block === "timeseries" ? sum(data.series)
      : data.block === "map" ? sum([...data.counties, data.unknown])
        : data.block === "breakdown" ? sum([...data.slices, data.other])
          : data.block === "table" && data.totals && (data.page ?? 0) === 0 ? data.totals
            : null;
  if (!total) return "Selecția";
  return <>Total: <span className="fk-num">{formatRonFull(total.value)}</span> · {countWords(total.count, "înregistrare", "înregistrări")}</>;
}
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
  const [builderInit, setBuilderInit] = useState<QuestionSpec | null>(null);
  const [builderResolution, setBuilderResolution] = useState<{ submitted: QuestionSpec; resolved: QuestionSpec } | null>(null);
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
  /**
   * The question the answer on screen answers (plan §2.3): the server's resolved
   * spec, then what the strip changed on it. Sources, Salvează, Trimite,
   * Urmărește, captures and both exports read it, never resp.spec.
   */
  const [appliedSpec, setAppliedSpec] = useState<AskSpec | null>(null);
  /** The key the strip last wrote, for the builder (no remount: its draft survives). */
  const [stripPatch, setStripPatch] = useState<StripPatch | null>(null);
  /** The breakdown's thread ("fir" in the URL): the levels above the one on screen. Gone at any new run. */
  const [thread, setThread] = useState<Thread | null>(null);
  /** A link the builder opens without running it (a refused condition): "Vezi răspunsul" stays. */
  const [linkRuns, setLinkRuns] = useState(true);
  /** What opening that link changed (restoreLink's notes): the builder says it while the link waits. */
  const [linkNotes, setLinkNotes] = useState<string[]>([]);
  const [answerSaved, setAnswerSaved] = useState<SavedQuestion | null>(null);
  /** The stream chosen in the strip while its answer is on its way (the radio moves at once). */
  const [streamShown, setStreamShown] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{
    spec: AskSpec;
    scope?: EvidenceScope;
    filters?: EvidenceFilters;
    title: string;
    scopeLabel?: string;
    months?: ExecutedWindow["months"];
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
      /**
       * `strip`: the strip beside the answer changed one key of the applied question (a new
       * query): the builder hears of it through StripPatch, not as a run of its draft.
       * `thread`: the breakdown's thread this run keeps (a level opened from the answer);
       * any other run drops it (plan §2.3).
       */
      opts: { strip?: { path: StripPatch["path"]; value: string }; thread?: Thread | null } = {},
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
        // The executed identities, plus an explicit data stream the link asked for.
        const submitted = body.spec as AskSpec | undefined;
        const executed = submitted?.dataset && !answer.spec.dataset ? { ...answer.spec, dataset: submitted.dataset } : answer.spec;
        setAppliedSpec(executed);
        if (!("tablePage" in body)) setThread(opts.thread ?? null);
        // The builder gets the stream the engine resolved, not the one asked (validateSpec can put it back).
        if (opts.strip) setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, ...opts.strip!, ...(opts.strip!.path === "dataset" ? { value: executed.dataset ?? "all" } : {}) }));
        else if (body.spec && !("tablePage" in body)) {
          setBuilderResolution({ submitted: body.spec as QuestionSpec, resolved: answer.spec });
        }
        // The composer owns draft/applied comparison, including edits made
        // during this request and normalized drafts restored from old links.
        if (typeof body.question === "string") {
          setBuilderInit(answer.spec);
          setLinkRuns(true);
          setBuilderFromAi(true);
        }
        if (!("tablePage" in body)) setTableOpts({ page: 0 });
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        url.searchParams.set("spec", encodeSpec(executed));
        if (!("tablePage" in body)) {
          if (opts.thread?.steps.length) url.searchParams.set("fir", JSON.stringify(opts.thread));
          else url.searchParams.delete("fir");
        }
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
              questionTitle(answer.spec, answerLabels(answer)),
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
    setBuilderInit(choice.spec);
    setLinkRuns(true);
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
        // The link opens in the builder with its conditions as chips; it runs only what /api/ask runs
        // as it is. A key this release reads but does not apply keeps F0a's message, without a builder
        // that would show the question without that condition (plan §2.4, F1b restore.ts).
        const restored = restoreLink(decodeSpec(encoded));
        if (restored.kind === "error") {
          setError(restored.error);
          // Below the examples on a phone: bring the reason into view.
          revealError();
          return;
        }
        setBuilderInit(restored.spec);
        setLinkRuns(restored.run);
        setLinkNotes(restored.notes);
        setBuilderOpen(true);
        setBuilderCollapsed(restored.run && params.get("drill") !== "1");
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
        // A refused condition (or a locality its view cannot honour) waits in the builder, which says
        // why on its chip; the answer of another question does not stay under it.
        if (!restored.run) { setResp(null); setAppliedSpec(null); return; }
        const link = restored.link as unknown as AskSpec;
        void execute({ spec: link }, params.get("drill") === "1", scope, sourceFilters, true, { thread: readThread(params.get("fir"), link) });
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      request.current.controller?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [execute, interpret, revealError]);
  const applied = appliedSpec ?? undefined;
  // A CPV code is named as the builder names it ("pentru [lucrări de construcții]").
  const cpvName = useCpvName(applied?.filters.cpvTerm === undefined ? undefined : String(applied.filters.cpvTerm));
  // One title per answered spec, the builder's sentence and the conditions under it (G7): the same
  // words whether the answer came from typed text, a builder edit or a shared link, in every view,
  // the drawer and the export. A trend's title says the years and months its answer ran (answerLabels).
  const title =
    resp?.question ||
    (applied
      ? questionTitle(applied, { cpvName, ...answerLabels(resp) })
      : "Răspunsul tău");
  // The strip beside the answer (P6): the keys BLOCK_FILTERS puts there, on the applied question.
  const stripKeys = applied ? BLOCK_FILTERS[applied.block]?.strip ?? [] : [];
  const shown = resp && applied ? shownWords(resp, applied) : { pills: [] as string[] };
  const crumbs = thread && applied ? threadCrumbs(thread, applied) : null;
  const band: BandState = applied ? {
    ...(stripKeys.includes("dataset") ? { stream: (applied.dataset ?? "all") as NonNullable<BandState["stream"]> } : {}),
    ...(stripKeys.includes("measure") ? { lens: applied.measure === "count" ? "count" as const : "value" as const } : {}),
    ...(thread ? { thread: threadWords(thread) } : {}),
  } : {};
  const appliedKey = applied ? questionKey(applied) : "";
  useEffect(() => { setStreamShown(null); setAnswerSaved(null); }, [appliedKey]);
  /**
   * The strip changed one key of the applied question (plan §2.3): the data
   * stream is a new query (sources, caveats and SQL change); the map's lens
   * switches on the data already fetched, with the server's words for it
   * (variants). Either way the builder gets the key and keeps its draft.
   */
  const applyStripChange = (path: StripPatch["path"], value: string) => {
    if (!applied) return;
    const next = appliedAfterStrip(applied, path, value);
    if (STRIP_QUERY_KEYS.has(path)) {
      // A failed or refused query puts the radio back on the answer on screen (a newer click keeps its own).
      void execute({ spec: next }, false, undefined, undefined, false, { strip: { path, value }, thread })
        .then((ok) => { if (!ok) setStreamShown((shown) => shown === value ? null : shown); });
      return;
    }
    setAppliedSpec(next);
    setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, path, value }));
    const url = new URL(window.location.href);
    url.searchParams.set("spec", encodeSpec(next));
    window.history.replaceState(null, "", url);
  };
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
        // The applied trend's sources list the months its answer counted (plan §2.8).
        const months = selected === applied ? resp?.executed?.months : undefined;
        setEvidence({
          spec: selected,
          ...(effectiveScope ? { scope: effectiveScope } : {}),
          title,
          ...(label ? { scopeLabel: label } : {}),
          ...(months ? { months } : {}),
        });
      }
    },
    [applied, title, resp?.executed?.months],
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
    // A newer link is not opened in place; the page then says why.
    const spec = validateSpec(decodeSpec(url.searchParams.get("spec") ?? ""), { refuseNewer: NEWER_VERSION_LINK });
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
  // What changes the total outside the sentence (G8), on the applied question.
  const totalWords = applied ? describeConditions(applied).totalWords : [];
  const empty = Boolean(data && emptyAnswer(data));
  /** A wider question from the empty answer (G2): the builder takes it as its draft, then it runs. */
  const runWider = (next: AskSpec) => {
    setBuilderInit(next as unknown as QuestionSpec);
    setLinkRuns(true);
    void execute({ spec: next });
  };
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
            initialApplied={!chosen && linkRuns}
            {...(!chosen && !linkRuns ? { initialNotes: linkNotes } : {})}
            stripPatch={stripPatch}
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
                  {shown.pills.map((p) => (
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
                <SaveQuestionButton spec={applied} active={answerSaved} onSaved={setAnswerSaved} disabled={loading} />
                <FollowButton key={JSON.stringify(applied)} spec={applied} title={title} />
                <ClipButton
                  kind="query"
                  spec={applied}
                  snapshot={{
                    title,
                    pills: shown.pills,
                    headline:
                      count === null
                        ? title
                        : countWords(count, "înregistrare", "înregistrări"),
                    result: data,
                    executedAt: resp.executedAt,
                    caveats: resp.caveats ?? [],
                    displaySql: shown.displaySql,
                    // The server builds a query capture from the spec and keeps only evidenceOptions of this
                    // snapshot (validateCaptureRequest): the spec already carries the thread's domain and the
                    // lens, so the numbers are the ones on screen; the thread's crumbs are not kept.
                  }}
                  label={title}
                />
              </div>
            </div>
            {/* The profile line under the sentence and the pill say the basis; the banner stays where the answer shows lei (not payments). */}
            {isProfile && applied.block !== "distribution" && <ProfileNotice />}
            {/* The trend's groups (its strip keys) are drawn by its block, above its rows: no empty strip here. */}
            {(stripKeys.some((key) => key === "dataset" || key === "measure") || crumbs || ["table", "timeseries", "map"].includes(data.block)) && (
              <div className="fk cq-strip"><AnswerStrip>
                {stripKeys.includes("dataset") && (
                  <Segmented
                    label="Ce fel de achiziții"
                    value={streamShown ?? applied.dataset ?? "all"}
                    options={streamOptions(applied)}
                    onChange={(value) => {
                      if (value === (streamShown ?? applied.dataset ?? "all")) return;
                      setStreamShown(value);
                      applyStripChange("dataset", value);
                    }}
                  />
                )}
                {stripKeys.includes("measure") && data.block === "map" && (
                  <StripLabelled before="Harta arată">
                    <Segmented
                      label="Harta arată"
                      value={applied.measure === "count" ? "count" : "value"}
                      options={[{ value: "value", label: "Valoare" }, { value: "count", label: "Înregistrări" }]}
                      onChange={(value) => { if (value !== (applied.measure === "count" ? "count" : "value")) applyStripChange("measure", value); }}
                    />
                  </StripLabelled>
                )}
                {crumbs && <Crumbs label="Domenii" items={crumbs.items} current={crumbs.current} />}
                {["table", "timeseries", "map"].includes(data.block) && (
                  <StripEnd>
                    <Segmented
                      label="Cum arată răspunsul"
                      size="sm"
                      value={layout}
                      options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]}
                      onChange={(value) => setLayout(value as "visual" | "table")}
                    />
                  </StripEnd>
                )}
              </AnswerStrip></div>
            )}
            {data.block === "breakdown" && breakdownLead(data.slices, data.other) && (
              <p className="cq-lead">{breakdownLead(data.slices, data.other)}</p>
            )}
            {/* G2: an answer with no record offers at most three wider questions (kit component 17). */}
            {empty ? <div className="fk cq-result cq-result-empty">
              <EmptyState
                message="Nicio înregistrare pentru această întrebare."
                relax={relaxations(applied).map((r) => ({ id: r.id, label: r.label, onClick: () => runWider(r.spec) }))}
                titleId="raspuns-titlu"
              />
            </div> : <div className={`cq-result cq-result-${data.block}`}>
              {data.block === "stat" && (
                <StatBlock stat={data.stat} measure={applied.measure} />
              )}
              {data.block === "table" &&
                (layout === "visual" ? (
                  <RankingBars
                    rows={data.rows}
                    spec={applied}
                    conditions={totalWords}
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
                <CompareBlock data={data} partial={resp.partialYears ?? []} dataset={applied.dataset ?? "all"} />
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
                  thread={thread}
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
                <EntityCardBlock card={data.card} historical={isProfile} spec={applied} />
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
            </div>}
            {/* G8: what changed the total outside the sentence; the ranking says it in its own total line. A risk
                profile has no total in lei: its seat is the sentence's, and «nu plăți» would speak of sums it does not show. */}
            {totalWords.length > 0 && !empty && !isProfile && !(data.block === "table" && layout === "visual") && (
              <div className="fk cq-total"><TotalLine conditions={totalWords}>{totalLead(data)}</TotalLine></div>
            )}
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
                    <code>{shown.displaySql ?? resp.displaySql}</code>
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
              <AnswerExports key={encodeSpec(applied)} spec={applied} disabled={loading} onResult={()=>downloadCsv(answerCsv(data,applied,title,band))}/>
              {mode === "ask" && (
                <button
                  type="button"
                  onClick={() => {
                    setBuilderInit(applied);
                    setLinkRuns(true);
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
          {...(evidence.months ? { months: evidence.months } : {})}
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
  conditions = [],
  onSources,
}: {
  rows: TableRow[];
  spec: AskSpec;
  totals?: RankingTotals | undefined;
  /** What changed the total outside the sentence (G8): the total line says it. */
  conditions?: readonly string[];
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
      {conditions.length > 0 ? <>
        <div className="fk cq-total"><TotalLine conditions={conditions}>{hasTotal ? <>Total: <span className="fk-num">{formatRonFull(shareTotals.value)}</span> la {entityNoun(spec.dim, shareTotals.entities)}</> : "Selecția"}</TotalLine></div>
        {spec.dim === "supplier" && <p className="ask-fine cq-total-line">în asociere: cote egale <Term id="in-asociere" tip /></p>}
      </> : (hasTotal || spec.dim === "supplier") && (
        <p className="ask-fine cq-total-line">
          {hasTotal && <>Total: {formatRonFull(shareTotals.value)} la {entityNoun(spec.dim, shareTotals.entities)} · valoare înregistrată, nu plăți</>}
          {hasTotal && spec.dim === "supplier" && " · "}
          {spec.dim === "supplier" && <>în asociere: cote egale <Term id="in-asociere" tip /></>}
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
          {formatInt(da?.count ?? 0)}) + {formatRon(ctr?.value ?? 0)} contracte din proceduri
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
          {countWords(meta!.total, "entitate", "entități")} · pagina {page + 1} din{" "}
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
            {perCapita && <Th k="percap" label="Pe locuitor (lei)" num />}
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
  const metric = (p: { value: number; count: number }) => (asCount ? p.count : p.value);
  const display = (p: { value: number; count: number }) =>
    asCount ? formatInt(p.count) : formatRon(p.value);
  // year-bar click → same filters, scoped to that year, drill rows opened
  const yearUrl = (year: number | string) =>
    yearSourceLink(spec as AskSpec, Number(year));
  if (series.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  // From 2018, continuous; the older contracts are one row under the chart (display only, final timeseries §4).
  const { bars, before } = seriesAxis(series);
  const f = (spec as AskSpec).filters;
  // One year with data is one number, not a chart of one bar (final timeseries §5.4).
  if (bars.length === 1 && !before) {
    const only = bars[0]!;
    return (
      <div className="ask-bigstat ask-ts-one">
        <div className="v">{display(only)}</div>
        <div className="d">{only.year} · {formatRonFull(only.value)} · {countWords(only.count, "înregistrare", "înregistrări")}</div>
        {(f.yearFrom || f.yearTo) && (
          <div className="fk fk-relax">
            <KitLink className="fk-relax-link" link={{ label: "Toți anii", glyph: "›", href: askLink(withoutPeriod(spec as AskSpec)) }} />
          </div>
        )}
      </div>
    );
  }
  const max = Math.max(...bars.map(metric), 1);
  const peak = bars.reduce((a, b) => (metric(b) > metric(a) ? b : a));
  const shownPartial = partial.filter((x) => bars.some((p) => p.year === x.year && !("empty" in p)));
  const labels = seriesLabels(bars.length, bars.indexOf(peak));
  const off = (on: boolean, className: string) => (on ? "" : ` ${className}`);
  const yearLabel = (year: number, mark: string) => (
    <><span className="ts-y">{year}{mark}</span><span className="ts-y-short" aria-hidden="true">’{String(year).slice(2)}{mark}</span></>
  );
  return (
    <div>
      {t.el}
      <div className="ask-ts">
        {bars.map((p, i) => {
          const part = partial.find((x) => x.year === p.year);
          if ("empty" in p)
            return (
              <div key={p.year} className="col empty" role="img" aria-label={`${p.year}: nicio înregistrare`}>
                <div className="cv ts-off" aria-hidden="true">0</div>
                <div className="bar" style={{ height: "0%" }} />
                <div className={`cl${off(labels.yearPhone.has(i), "ts-off-sm")}`}>{yearLabel(p.year, "")}</div>
              </div>
            );
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
                ? countWords(p.count, "înregistrare", "înregistrări")
                : formatRonFull(p.value),
              `${countWords(p.count, "achiziție", "achiziții")}${p.year === peak.year ? " · vârful seriei" : ""}${part ? ` · ${part.provisional ? "date parțiale sau provizorii" : "an acoperit parțial"}: ${part.note}` : ""} · click → achizițiile anului`,
            )}
          >
            <div className={`cv${off(labels.value.has(i), "ts-off")}${off(labels.valuePhone.has(i), "ts-off-sm")}`}>{display(p)}</div>
            <div
              className={p.year === peak.year ? "bar peak" : "bar"}
              style={{ height: `${Math.max(2, (metric(p) / max) * 100)}%` }}
            />
            <div className={`cl${off(labels.yearPhone.has(i), "ts-off-sm")}`}>{yearLabel(p.year, part ? "*" : "")}</div>
          </a>
          );
        })}
      </div>
      {/* One-line notes, the details in their (?) (final timeseries §4; owner: terse copy). */}
      <div className="fk ask-ts-notes">
        {before && (
          <p className="ask-fine">
            {countWords(before.count, "înregistrare", "înregistrări")} datate {before.from === before.to ? before.from : `${before.from}–${before.to}`} ({formatRon(before.value)}) nu apar pe axă.{" "}
            <KitLink
              className="fk-rec"
              link={{ label: "Vezi-le", glyph: "→", onClick: () => evidence?.open(spec as AskSpec, { years: before.years }, `${before.from}–${before.to} · înregistrările dinainte de ${CHART_FIRST_YEAR}`) }}
            />
          </p>
        )}
        {shownPartial.length > 0 && (
          <p className="ask-fine ask-partial-note fk-tipwrap">
            * {shownPartial.map((x) => x.year).join(", ").replace(/, (\d+)$/, " și $1")} {shownPartial.length === 1 ? "e incomplet" : "sunt incomplete"}{" "}
            <HelpTip tip={{
              title: shownPartial.length === 1 ? "An incomplet" : "Ani incompleți",
              text: `${shownPartial.map((x) => `${x.year}: ${x.note}`).join("; ")}. Nu se compară direct cu un an întreg.`,
            }} />
          </p>
        )}
        <p className="ask-fine fk-tipwrap">{RECORDED_VALUE.text} <HelpTip tip={RECORDED_VALUE.tip} /></p>
      </div>
    </div>
  );
}

/** The same question without its years ("Toți anii", the first row of "Când?"). */
function withoutPeriod(spec: AskSpec): AskSpec {
  const filters = { ...spec.filters };
  for (const key of ["yearFrom", "yearTo", "monthFrom", "monthTo"] as const) delete filters[key];
  return { ...spec, filters };
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

/** The shown result as a file (answer-csv.ts): the browser saves it under its name. */
function downloadCsv(file: { text: string; filename: string }) {
  const blob = new Blob([file.text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
