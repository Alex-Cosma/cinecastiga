"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cancelNavPending } from "../../components/ghost/client";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import EntityName, { linkNames, type NamedEntity } from "../../components/EntityName";
import FollowButton from "@/components/FollowButton";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { encodeSpec, decodeSpec } from "@/lib/ask/permalink";
import { keepAnswer, recallAnswer } from "@/lib/ask/answer-memory";
import { isHistoricalProfile } from "@/lib/ask/population";
import { LOCAL_ADMIN_KIND, NEWER_VERSION_LINK, validateSpec, type AskSpec } from "@/lib/ask/spec";
import { withLens } from "@/lib/ask/map-lens";
import { BLOCK_FILTERS } from "@/lib/ask/filters/blocks";
import { restoreLink } from "@/lib/ask/filters/restore";
import { trendMonthsWaiting } from "@/lib/ask/filters/trend-rules";
import { reloadsFor409 } from "@/lib/ask/source-csv";
import { answerLabels, questionTitle } from "@/lib/ask/filters/title";
import { askLink, entitySourceLink, entitySourceScope, yearSourceLink } from "@/lib/ask/source-spec";
import { questionKey, type QuestionSpec } from "@/lib/ask/question-ui";
import { ANSWER_ERROR, breakdownLead, countWords, entityNoun, fileSlug, formatChange, formatShare, isHumanError, rankingRest, rankingShare, shouldAutoRun, type RankingTotals } from "@/lib/ask/answer-text";
import { employeesWords, localityName } from "@/lib/ask/filters/words";
import type { IntentResult } from "@/lib/intent/types";
import { copyShortLink, prepareShortLink, shortLink } from "@/lib/short-link-client";
import { namedThread, rememberThreadNames } from "./thread-names";
import { NATURAL_LANGUAGE_ENABLED, NATURAL_LANGUAGE_UNAVAILABLE } from "@/lib/ask/features";
import { validateEvidenceScope, validateEvidenceFilters, type EvidenceScope, type EvidenceFilters } from "@/lib/ask/evidence";
import type { BlockData, ExecutedWindow, PartialYear, SankeyData } from "@/lib/ask/compile";
import {
  DistributionBlock,
  BreakdownBlock,
  ScatterBlock,
  EntityCardBlock,
  FactCheckBlock,
  BreakdownGhost,
  useTip,
} from "./blocks";
import TrendBlock from "./TrendAnswer";
import ScatterAnswer, { ScatterGhost } from "./ScatterAnswer";
import { readListReturn } from "./answer/list-return";
import { ensureScatterFacts } from "./scatter-answer";
import { RANK_WORDS, scatterRank } from "@/lib/ask/scatter-shared";
import { flagLabel } from "@/lib/flags";
import NetworkAnswer from "./NetworkAnswer";
import SankeyAnswer from "./SankeyAnswer";
import { NETWORK_LIST_CSV, networkWatch, shownList as shownNetworkList } from "./network-answer";
import { domainName, sankeySuggestion, shownOptions as sankeyShownOptions } from "./sankey-answer";
import { networkList, NETWORK_LIST_LABELS, type NetworkList, type NetworkOrder } from "@/lib/ask/network-shared";
import { sankeyShown } from "@/lib/ask/sankey-shared";
import { TREND_LIST_CSV, retimeScopeLabel, trendWatch } from "./trend-answer";
import { specTrendList, specTrendPartLabel, type TrendList } from "@/lib/ask/trend-shared";
import { isWholeYear, monthsLabel } from "@/lib/ask/months-window";
import QuestionBuilder, { type StripPatch } from "./QuestionBuilder";
import { patchDraft, trendListSwitch } from "./builder/view";
import { readCoverage } from "./builder/coverage";
import SaveQuestionButton from "./SaveQuestionButton";
import type { SavedQuestion } from "./SavedQuestions";
import AnswerStrip, { Crumbs, StripEnd, StripLabelled, Suggest } from "./answer/AnswerStrip";
import Toggle from "./builder/Toggle";
import SeriesAnswer from "./SeriesAnswer";
import { barKey, barName, barSources } from "./series-answer";
import StatMix from "./answer/StatMix";
import { useAnswerFact } from "./answer/use-answer-fact";
import { answerListGroup, type DrawerListGroup } from "./drawer-group";
import { PURCHASE_KIND_WORDS } from "@/lib/ask/purchase";
import TotalLine, { RECORDED_VALUE } from "./answer/TotalLine";
import RankingLocate from "./answer/RankingLocate";
import Locate from "./answer/Locate";
import { FactTag } from "./answer/RowFacts";
import { useRowFacts } from "./answer/use-row-facts";
import { RANKING_PAGE_SIZE, rankedGroupLead, rowFactsWanted, winnerFactTags, type WinnerTag } from "@/lib/ask/winner-words";
import type { WinnerFacts } from "@/lib/ask/winners";
import EmptyState from "./answer/EmptyState";
import { emptyAnswer, emptyMessage, relaxations } from "./answer-empty";
import { countyName } from "../../lib/counties";
import KitLink from "./answer/KitLink";
import RowMenu from "./answer/RowMenu";
import { entityRowActions } from "./answer/row-actions";
import { excludeEntity, excludedRole } from "@/lib/ask/filters/exclusions";
import HelpTip from "./builder/HelpTip";
import { CHART_FIRST_YEAR, seriesAxis, seriesLabels } from "./series-labels";
import Segmented from "./builder/Segmented";
import "./builder/filters-kit.css";
import { answerCsv, type BandState } from "./answer-csv";
import { useCpvName } from "./cpv-name";
import {
  CHANNEL_SHARE_TIP, DATA_RELOADED, STRIP_QUERY_KEYS, answerHoldsList, appliedAfterNetwork, appliedAfterSankeyShown, appliedAfterStrip, appliedAfterTrendList, breakdownSuggestion, channelShares,
  deeperThread, readThread, sameMonthsSwitch, seriesSplitOptions, threadHref,
  shownWords, streamOptions, threadCrumbs, threadWords, totalConditionWords, writeThread, type AnswerVariants, type Thread,
} from "./answer-state";
import EntityTypeahead from "./EntityTypeahead";
import EvidenceDrawer from "./EvidenceDrawer";
import { AnswerEvidence, useAnswerEvidence, type EvidenceOpenOpts } from "./AnswerEvidence";
import { CompareBlock } from "./CompareBlock";
import MapBlock, { MapGhost } from "./MapBlock";
import { countyMetrics, mapFirm, mapLensOptions, mapLocalAdmin, metricWords, shownLens, type MapLensValue } from "./map-answer";
import type { MapFacts } from "@/lib/ask/map-facts";
import "./question-results.css";
import DiscoveryIcon from "../DiscoveryIcon";
import AnswerExports from "./AnswerExports";
import CoverageDisclosure from "@/components/CoverageDisclosure";
import Term from "@/components/Term";
import { AskBox, AskExamples, IntentAnnouncer, IntentChoose, IntentLine, IntentUnknown, MAX_QUESTION_CHARS, type IntentChoice } from "./IntentAsk";
import { understoodLine } from "./intent-line";
import AnswerPills from "./answer/AnswerPills";
import type { AskExample } from "./ask-examples";
import "./ask-intent.css";
import { G, Ghost, rankWidth } from "@/components/ghost/Ghost";
import { useViewer } from "@/lib/use-viewer";
import { isCpvCode } from "./cpv-name";
import { ghostPills, type AskLinkHint } from "./link-hint";
import { MixGhost } from "./answer/StatMix";
import { answerSubject, useChartMotion } from "./answer/chart-motion";

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
  /** The catalogue name of the spec's CPV code, readable (the title names it from the first paint). */
  cpvName?: string;
  /** A locality question's town hall: the identity "primăria X" in the title links to. */
  townHall?: { id: string };
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
/** „Harta arată” (map final §3.7): the lens changes the colours, never the selection. */
const MAP_LENS_TIP = { title: "Harta arată", text: "Schimbă doar culoarea și ordinea. Selecția rămâne aceeași. „Înregistrări”: un rând per câștigător la asocieri." };
/** „Pe locuitor →” (map final §3.7). */
const PER_INHABITANT_TIP = { title: "Pe locuitor", text: "Doar pentru primării și consilii județene: companiile și instituțiile naționale apar în județul sediului, nu unde locuiesc oamenii. Linkul schimbă cumpărătorii din propoziție." };
/** The lens „Pe locuitor” itself (map final §3.8): the figure's words, in place of the lens's tip while it is chosen. */
const PER_INHABITANT_LENS_TIP = { title: "Pe locuitor", text: "Valoarea înregistrată a primăriilor și consiliilor județene, împărțită la populația rezidentă a județului (INS, RPL 2021). Nu sunt plăți. Nu intră ce cumpără serviciile lor sau asociațiile intercomunitare." };
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
            : data.block === "sankey" && data.totals ? data.totals
              : null;
  if (!total) return "Selecția";
  return <>Total: <span className="qb-num">{formatRonFull(total.value)}</span> · {countWords(total.count, "înregistrare", "înregistrări")}</>;
}
const EXAMPLES = [
  "Ce valoare au achizițiile de medicamente din Cluj, în 2026?",
  "Cine furnizează cel mai mult pentru spitale?",
  "Cum s-au schimbat achizițiile de lucrări, pe ani?",
];
function sourceCount(data: BlockData, applied?: AskSpec): number | null {
  switch (data.block) {
    // F4: the records of the list on screen (a group's sources are its partners', relations.ts), the flow's whole selection.
    case "network":
      return data.lists?.[applied ? networkList(applied) : data.list]?.count ?? null;
    case "sankey":
      return data.totals?.count ?? null;
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
    // entity_card-2 (F6c): the sources are place 1's records by value, the tied profiles' on the index (runRows).
    case "entity_card":
      return data.ranking ? data.ranking.rows.reduce((n, r) => n + r.count, 0)
        : data.ties ? data.ties.rows.reduce((n, r) => n + r.count, 0) : data.podium ? data.card.count : null;
    default:
      return null; // A displayed top N is never the full source population.
  }
}

export default function AskPanel({
  initialMode = "build",
  withSearch = false,
  centered = false,
  link = null,
}: {
  initialMode?: PanelMode;
  withSearch?: boolean;
  centered?: boolean;
  /** What the server read in the address (link-hint.ts): the first paint is already the link's question. */
  link?: AskLinkHint | null;
}) {
  // A link that runs opens folded on its answer's ghost from the first paint; restore() on mount runs it (owner,
  // 6 November 2026): no start page, then an empty page, then the answer.
  const linked = link?.kind === "spec" ? link : null;
  const [mode, setMode] = useState<PanelMode>(
    linked ? "build" : initialMode === "ask" && !NATURAL_LANGUAGE_ENABLED ? "build" : initialMode,
  );
  const [aiLinkNotice, setAiLinkNotice] = useState(false);
  const [builderInit, setBuilderInit] = useState<QuestionSpec | null>(linked?.spec ?? null);
  const [builderResolution, setBuilderResolution] = useState<{ submitted: QuestionSpec; resolved: QuestionSpec } | null>(null);
  const [builderFromAi, setBuilderFromAi] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(Boolean(linked?.run));
  /** The question on its way: while no answer is on screen, its ghost is shaped by it (null: words, not yet a spec). */
  const [asked, setAsked] = useState<AskSpec | null>(linked?.run ? linked.link : null);
  const [dirty, setDirty] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(link?.kind === "error" ? link.error : null);
  /** Technical text behind a failed answer, shown only under "Detalii tehnice". */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const lastBody = useRef<Record<string, unknown> | null>(null);
  /** A link that already holds the question opens on its answer; the builder waits under "Schimbă întrebarea". */
  const [builderCollapsed, setBuilderCollapsed] = useState(Boolean(linked?.run && !linked.drill));
  /** The same, for execute (a stable callback): a strip's new query reaches a folded builder through its initial question. */
  const builderCollapsedRef = useRef(false);
  builderCollapsedRef.current = builderCollapsed;
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
  // A link's thread carries its levels' codes only (fir=33.331): the crumbs wait for their names from the catalogue.
  useEffect(() => {
    if (!thread) return;
    if (thread.steps.every((s) => s.name !== null)) { rememberThreadNames(thread); return; }
    let live = true;
    void namedThread(thread).then((named) => { if (live) setThread((current) => current === thread ? named : current); });
    return () => { live = false; };
  }, [thread]);
  /** A link the builder opens without running it (a refused condition): "Vezi răspunsul" stays. */
  const [linkRuns, setLinkRuns] = useState(linked?.run ?? true);
  /** What opening that link changed (restoreLink's notes): the builder says it while the link waits. */
  const [linkNotes, setLinkNotes] = useState<string[]>(linked?.notes ?? []);
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
    /** The drawer's first order (a bar's largest record, F3). */
    sort?: "value";
    /** The answer's group its whole sources list (a band, a network's group): the drawer says both figures (S4 review). */
    listGroup?: DrawerListGroup;
  } | null>(null);
  const [tableOpts, setTableOpts] = useState<{
    page: number;
    sort?: string;
    dir?: "asc" | "desc";
  }>({ page: 0 });
  /** The answer on screen is the reload of a 409 (reloadOutdated): its sources' next 409 is said, not reloaded. */
  const reloadedFor409 = useRef(false);
  const request = useRef<{ seq: number; controller: AbortController | null }>({
    seq: 0,
    controller: null,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Free-text question → /api/intent (deterministic rules) → editable builder.
  const [askText, setAskText] = useState(link?.kind === "text" ? link.question : "");
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<IntentChoice | null>(null);
  /**
   * The readings of the typed question answered so far, by their answer's link (`spec`): the interpretation line stays
   * with the answer its reading gave, also back and forth between two readings («Înapoi»).
   */
  const [understood, setUnderstood] = useState<Record<string, IntentChoice>>({});
  const [builderOpen, setBuilderOpen] = useState(Boolean(linked));
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
       * `held`: a link the builder holds before its run (a trend's months the data do not
       * confirm): refused, and `waits` agreeing, `run` opens the builder instead of the error.
       */
      opts: {
        strip?: { path: StripPatch["path"]; value: string }; thread?: Thread | null; drillLabel?: string | ((answer: AskResponse) => string); reloaded?: true;
        held?: { waits: () => Promise<boolean>; run: () => void };
        /** `replace`: a link opened or restored («Înapoi», «Înainte») stays its step; `push`: a new step even for a page. */
        history?: "push" | "replace";
        /** The link's own `spec` parameter, the key its answer was kept under (answer-memory.ts). */
        memo?: string;
      } = {},
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
      setAsked((body.spec as AskSpec | undefined) ?? null);
      setError(null);
      setErrorDetail(null);
      setEvidence(null);
      try {
        // A question this tab answered a moment ago shows at once (owner, 1 November 2026); a reload for a 409 asks again.
        const memo = Object.keys(body).length === 1 && body.spec ? opts.memo ?? encodeSpec(body.spec as AskSpec) : null;
        const kept = memo && !opts.reloaded ? recallAnswer<AskResponse>(memo) : undefined;
        let status = 200;
        let answer: AskResponse;
        // Awaited like a request: the caller's own history step (interpret's `q`) is written before this answer's.
        if (kept) answer = await Promise.resolve(kept);
        else {
          const r = await fetch("/api/ask", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          status = r.status;
          answer = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as AskResponse;
        }
        if (seq !== request.current.seq) return false;
        if (!answer.ok || !answer.data || !answer.spec) {
          if (opts.held && await opts.held.waits()) {
            if (seq === request.current.seq) opts.held.run();
            return false;
          }
          // Explanations written for people stay visible; technical text goes under "Detalii tehnice".
          const human = isHumanError(status, answer.error);
          setError(human ? answer.error! : ANSWER_ERROR);
          setErrorDetail(human ? null : answer.error ?? `HTTP ${status}`);
          revealError();
          return false;
        }
        setResp(answer);
        // An answer reloaded for a 409 is not reloaded again for one (reloadOutdated); a new page of it stays that answer.
        if (!("tablePage" in body)) reloadedFor409.current = Boolean(opts.reloaded);
        // The executed identities, plus an explicit data stream the link asked for.
        const submitted = body.spec as AskSpec | undefined;
        const executed = submitted?.dataset && !answer.spec.dataset ? { ...answer.spec, dataset: submitted.dataset } : answer.spec;
        setAppliedSpec(executed);
        if (memo && !kept) keepAnswer([memo, encodeSpec(executed)], answer);
        if (!("tablePage" in body)) setThread(opts.thread ?? null);
        // The builder gets the stream the engine resolved, not the one asked (validateSpec can put it back).
        if (opts.strip) {
          const patch = {
            ...opts.strip, ...(opts.strip.path === "dataset" ? { value: executed.dataset ?? "all" } : {}),
            // The evolution's options as the engine ran them (F3): the draft gets the whole key.
            ...(opts.strip.path === "timeseries" ? { timeseries: executed.timeseries ?? null } : {}),
            // The network's reference year (F4): its options as the engine ran them.
            ...(opts.strip.path === "network" ? { network: executed.network ?? null } : {}),
          };
          setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, ...patch }));
          // A builder folded under "Schimbă întrebarea" is not mounted: it opens on the strip's key too (F4-network-sankey).
          if (builderCollapsedRef.current) {
            setBuilderInit((current) => current ? patchDraft(current, patch) : current);
            setBuilderResolution((current) => current ? { submitted: patchDraft(current.submitted, patch), resolved: patchDraft(current.resolved, patch) } : current);
          }
        } else if (body.spec && !("tablePage" in body)) {
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
          if (opts.thread?.steps.length) url.searchParams.set("fir", writeThread(opts.thread));
          else url.searchParams.delete("fir");
        }
        url.searchParams.delete("drill");
        url.searchParams.delete("evidence");
        url.searchParams.delete("sourceFilters");
        // A new question is a new step, so «Înapoi» brings the answer before it (owner, 1 November 2026). A link opened or
        // restored, a page or an order of the table and the page's first answer replace the step. A click while an answer
        // loads aborts it before it writes here, so quick clicks make one step.
        const shown = new URLSearchParams(window.location.search).get("spec");
        const step = opts.history ?? ("tablePage" in body || shown === null || shown === url.searchParams.get("spec") ? "replace" : "push");
        if (step === "push") window.history.pushState(null, "", url);
        else window.history.replaceState(null, "", url);
        if (drill)
          setEvidence({
            spec: answer.spec,
            ...(savedScope ? { scope: savedScope } : {}),
            ...(savedFilters ? { filters: savedFilters } : {}),
            title:
              answer.question ||
              questionTitle(answer.spec, answerLabels(answer)),
            ...(opts.drillLabel ? { scopeLabel: typeof opts.drillLabel === "function" ? opts.drillLabel(answer) : opts.drillLabel } : {}),
            // A trend's sources list the months this answer counted (plan §2.8).
            ...(answer.executed ? { months: answer.executed.months } : {}),
          });
        // "Înapoi" from a page a row of the risk cloud's list opened (answer/list-return.ts): the list puts itself back,
        // with the focus on that row, so the answer is not brought under the header.
        if (!drill && scroll && !readListReturn(executed))
          // Two frames: the answer is rendered before it is brought under the sticky header (its scroll-margin-top
          // is the header's real height). One scroll (owner, 1 November 2026): a folded builder's "Schimbă întrebarea",
          // right above the answer, comes into view with it; the focus goes to the answer's title.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            (document.querySelector("#intrebarea.ia-builder-collapsed:not([hidden])") ?? document.getElementById("raspuns"))
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
  /**
   * The choice to make or the words not understood, under the box: focus on its heading; the page moves only when the
   * heading is out of view, so the question stays in sight.
   */
  const focusResult = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const heading = document.getElementById("ia-result-title");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "nearest",
      });
    }));
  }, []);
  /**
   * One reading is chosen: the interpreter's only reading, a choice the person
   * clicked, or one of the line's "Sau: … ›". Each already holds a whole
   * question, so it is answered at once, and opens as a linked answer does
   * (owner, 1 November 2026): the builder folded under "Schimbă întrebarea",
   * the interpretation one line under the answer's title, one scroll.
   */
  const adopt = useCallback((choice: IntentChoice, scroll = true) => {
    setChosen(choice);
    setBuilderInit(choice.spec);
    setLinkRuns(true);
    setBuilderResolution(null);
    setBuilderFromAi(false);
    setBuilderOpen(true);
    setBuilderCollapsed(true);
    // The folded builder is not mounted: an earlier draft's "modificat" does not stay on this answer.
    setDirty(false);
    setMode("build");
    void execute({ spec: choice.spec }, false, undefined, undefined, scroll).then((ran) => {
      const link = ran ? new URLSearchParams(window.location.search).get("spec") : null;
      if (link) setUnderstood((readings) => ({ ...readings, [link]: choice }));
    });
  }, [execute]);
  /** `scroll`: false for the question the page opened with (`?q=`), whose answer is already in view under it. */
  const interpret = useCallback(async (raw: string, fromHistory = false, scroll = true) => {
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
      setUnderstood({});
      // A new question starts a new answer: the previous one belonged to other words.
      setResp(null);
      setError(null);
      setEvidence(null);
      if (shouldAutoRun(body)) adopt({ spec: body.spec!, sentence: body.sentence! }, scroll);
      else {
        setChosen(null);
        setBuilderInit(null);
        setBuilderOpen(false);
        focusResult();
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
    /**
     * `opened`: the page's first restore (a link, a reload). Its answer takes its ghost's place where the page stands,
     * already in view under the folded builder: no scroll (owner, 6 November 2026). «Înapoi» and «Înainte» bring the
     * answer under the header as before.
     */
    const restore = (opened = false) => {
      const params = new URLSearchParams(window.location.search),
        question = params.get("q"),
        encoded = params.get("spec");
      setAiLinkNotice(false);
      if (question && !NATURAL_LANGUAGE_ENABLED && !encoded) {
        // A question in the address (also from the home search) is read by the rules.
        setAskText(question);
        void interpret(question, true, !opened);
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
          setLoading(false);
          // The server may have opened the link's builder (link-hint.ts): a rejected link leaves none behind.
          setBuilderInit(null);
          setBuilderOpen(false);
          setBuilderCollapsed(false);
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
          setLoading(false);
          return;
        }
        // A refused condition (or a locality its view cannot honour) waits in the builder, which says
        // why on its chip; the answer of another question does not stay under it.
        if (!restored.run) { setResp(null); setAppliedSpec(null); setLoading(false); return; }
        const link = restored.link as unknown as AskSpec;
        // A trend on `auto` months (every one the builder makes) whose year the data do not confirm: the engine
        // refuses it, where the builder would have held it (RC-keyed-link-refused). Refused, the link waits in the
        // builder, on „2026: luni neconfirmate” and „Compară pe aceleași luni…”; the run never waits for the coverage.
        const coverage = link.block === "trend" && link.trend?.months === "auto" ? readCoverage() : null;
        const held = coverage ? {
          waits: async () => {
            const periods = (await coverage)?.periods;
            return Boolean(periods && trendMonthsWaiting(restored.spec, { year: new Date().getFullYear(), coverage: periods }));
          },
          run: () => { setResp(null); setAppliedSpec(null); setLinkRuns(false); setBuilderCollapsed(false); },
        } : null;
        void execute({ spec: link }, params.get("drill") === "1", scope, sourceFilters, !opened, { thread: readThread(params.get("fir"), link), ...(held ? { held } : {}), history: "replace", memo: encoded });
      }
    };
    restore(true);
    const back = () => restore();
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      request.current.controller?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [execute, interpret, revealError]);
  const applied = appliedSpec ?? undefined;
  // A CPV code is named as the builder names it ("pentru [lucrări de construcții]").
  const appliedCpv = applied?.filters.cpvTerm === undefined ? undefined : String(applied.filters.cpvTerm);
  // The answer brings its code's name: the title never says „CPV 45” before it (S4, a fresh page).
  const cpvName = useCpvName(appliedCpv, resp?.spec && String(resp.spec.filters.cpvTerm ?? "") === appliedCpv ? resp.cpvName : undefined);
  // One title per answered spec, the builder's sentence and the conditions under it (G7): the same
  // words whether the answer came from typed text, a builder edit or a shared link, in every view,
  // the drawer and the export. A trend's title says the years and months its answer ran (answerLabels).
  // F5: a map's county facts (part `map`), asked once it is drawn, on its selection (never its lens): every lens of
  // „Harta arată” then switches with no request. The lens drawn is the asked one once its facts can draw it.
  const mapFacts = useAnswerFact(resp?.data?.block === "map" && applied ? withLens(applied, "value") : null, "map");
  const lensChoices = resp?.data?.block === "map" && applied ? mapLensOptions(applied, mapFacts) : null;
  const mapLens = lensChoices && applied ? shownLens(applied, lensChoices) : null;
  // The map's title follows the lens drawn (map final §3.7); the saved question's follows the lens it asks (title.ts).
  const titled = applied && mapLens ? withLens(applied, mapLens) : applied;
  const title =
    resp?.question ||
    (titled
      ? questionTitle(titled, { cpvName, ...answerLabels(resp) })
      : "Răspunsul tău");
  // The strip beside the answer (P6): the keys BLOCK_FILTERS puts there, on the applied question.
  const stripKeys = applied ? BLOCK_FILTERS[applied.block]?.strip ?? [] : [];
  const shown = resp && applied ? shownWords(resp, applied) : { pills: [] as string[] };
  // What the answer adds to the pills' words (a trend's months, a cloud's group): which pill states what (pill-filters.ts).
  const pillLabels = useMemo(() => answerLabels(resp), [resp]);
  // The interpretation line stays with the answer its reading gave (a pill, the strip or the builder make another question).
  const reading = intent && applied ? understood[encodeSpec(applied)] : undefined;
  const line = intent && reading ? understoodLine(intent, reading) : null;
  const crumbs = thread && applied && thread.steps.every((s) => s.name !== null) ? threadCrumbs(thread, applied) : null;
  const band: BandState = applied ? {
    ...(stripKeys.includes("dataset") ? { stream: (applied.dataset ?? "all") as NonNullable<BandState["stream"]> } : {}),
    ...(stripKeys.includes("measure") ? { lens: mapLens ?? (applied.measure === "count" ? "count" as const : "value" as const) } : {}),
    ...(thread ? { thread: threadWords(thread) } : {}),
    // A trend's group buttons and its months (plan §4.7 Export): in the header and the file name.
    // `grupa` names the part as its drawer and its watch do (with the answer's years when the link has none).
    ...(resp?.data?.block === "trend" && resp.data.composition ? {
      group: specTrendPartLabel({ ...applied, filters: { ...applied.filters, yearFrom: applied.filters.yearFrom ?? resp.data.yearA, yearTo: applied.filters.yearTo ?? resp.data.yearB } }),
      groupFile: TREND_LIST_CSV[specTrendList(applied)],
    } : {}),
    ...(resp?.data?.block === "trend" && resp.data.months && !isWholeYear(resp.data.months) ? { months: monthsLabel(resp.data.months) } : {}),
    // F6b: the risk cloud's order and signal beside the chart, in the header (and the signal in the file name).
    ...(resp?.data?.block === "scatter" && "scatter" in resp.data ? {
      rank: RANK_WORDS[scatterRank(applied)],
      ...(applied.scatter?.flag ? { signal: flagLabel(applied.scatter.flag), signalFile: fileSlug(flagLabel(applied.scatter.flag), "") } : {}),
    } : {}),
    // F4: the network's group on screen, with its year (the file name says the group).
    ...(resp?.data?.block === "network" && shownNetworkList(applied) !== "all" ? {
      group: `${NETWORK_LIST_LABELS[shownNetworkList(applied)]} din ${resp.data.since}`, groupFile: NETWORK_LIST_CSV[shownNetworkList(applied)],
    } : {}),
  } : {};
  const appliedKey = applied ? questionKey(applied) : "";
  /**
   * The channel shares of the flow, the network and the breakdown (F3, F4): an answer on every channel brings them; on
   * one channel the flow and an anchored breakdown read that channel only (S4 review: a second pass of every channel
   * for the shares alone), so the strip keeps the shares of the same question on every channel, the last one this page
   * answered (its block, its question without the channel and the display keys).
   */
  const streamsMemo = useRef<{ key: string; streams: NonNullable<SankeyData["streams"]> } | null>(null);
  const streamsKey = (block: string, spec: AskSpec) => `${block}|${questionKey({ ...spec, dataset: undefined, measure: undefined, sankey: undefined,
    network: spec.network?.signals ? { signals: true } : undefined } as unknown as QuestionSpec)}`;
  /**
   * A network's „Toți” on one channel or in a period lists its partners from the records it bounds (S4 review); its
   * whole relation (the groups, the years, the signals, the strip's shares) is asked once it is drawn (part=network),
   * for the question answered: the group buttons then switch the applied question on it with no request.
   */
  const networkWhole = useAnswerFact(resp?.data?.block === "network" && resp.data.relation === "pending" && resp.spec ? resp.spec : null, "network");
  const answered: BlockData | undefined = resp?.data?.block === "network" && resp.data.relation === "pending" && networkWhole.status === "ready" ? networkWhole.value.data : resp?.data;
  if (answered && applied && (answered.block === "sankey" || answered.block === "breakdown" || answered.block === "network") && answered.streams)
    streamsMemo.current = { key: streamsKey(answered.block, applied), streams: answered.streams };
  const keptStreams = (block: string, spec: AskSpec) => streamsMemo.current?.key === streamsKey(block, spec) ? streamsMemo.current.streams : undefined;
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
  /**
   * „Doar clienții comuni” beside a comparison of two firms (F4, plan §2.3 "restrângere"): a new query in a new
   * history entry, so "Înapoi" brings the comparison of every client back; the builder hears of it as of any strip key.
   */
  const applySharedPartners = (on: boolean) => {
    if (!applied) return;
    applyStripChange("sharedPartners", on ? "true" : "");
  };
  /**
   * A trend's group button (plan §4.7 P6, owner-R-facts-all-lists): the answer
   * holds every list, so only the applied question's `trend` changes, in the
   * URL and the builder (no "modificat"), with no request.
   */
  const applyTrendList = (list: TrendList) => {
    if (!applied || !resp?.spec) return;
    const next = appliedAfterTrendList(applied, resp.spec, list);
    const patch = { path: "trend" as const, value: list, trend: next.trend ?? null };
    setAppliedSpec(next);
    setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, ...patch }));
    // A builder folded under "Schimbă întrebarea" is not mounted: it opens on the group shown, not the link's.
    if (builderCollapsed) {
      setBuilderInit((current) => current ? patchDraft(current, patch) : current);
      setBuilderResolution((current) => current ? { submitted: patchDraft(current.submitted, patch), resolved: patchDraft(current.resolved, patch) } : current);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("spec", encodeSpec(next));
    window.history.replaceState(null, "", url);
  };
  /**
   * The network's groups and order beside the answer (F4, owner-R-facts-all-lists): the answer holds every
   * list and order, so the applied question changes in the URL and the builder, with no request. Its
   * reference year counts the groups again: a new query, the builder told as by any strip change.
   */
  const applyNetwork = (change: { list?: NetworkList; order?: NetworkOrder }) => {
    if (!applied || resp?.data?.block !== "network") return;
    const { spec: next, dropPeriod } = appliedAfterNetwork(applied, change, resp.data.since);
    const patch = { path: "network" as const, value: change.list ?? change.order ?? "", network: next.network ?? null, ...(dropPeriod ? { dropPeriod: true as const } : {}) };
    setAppliedSpec(next);
    setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, ...patch }));
    if (builderCollapsed) {
      setBuilderInit((current) => current ? patchDraft(current, patch) : current);
      setBuilderResolution((current) => current ? { submitted: patchDraft(current.submitted, patch), resolved: patchDraft(current.resolved, patch) } : current);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("spec", encodeSpec(next));
    window.history.replaceState(null, "", url);
  };
  const applyNetworkSince = (since: number) => {
    if (!applied || resp?.data?.block !== "network") return;
    const { spec: next } = appliedAfterNetwork(applied, { since }, resp.data.since);
    void execute({ spec: next }, false, undefined, undefined, false, { strip: { path: "network", value: String(since) }, thread });
  };
  /** The flow's „Arată 6 · 10 · 15” (F4): the answer holds the first 15, so the length switches with no request. */
  const applySankeyShown = (shown: number) => {
    if (!applied) return;
    const next = appliedAfterSankeyShown(applied, shown);
    const patch = { path: "sankey" as const, value: String(shown), sankey: next.sankey ?? null };
    setAppliedSpec(next);
    setStripPatch((current) => ({ seq: (current?.seq ?? 0) + 1, ...patch }));
    if (builderCollapsed) {
      setBuilderInit((current) => current ? patchDraft(current, patch) : current);
      setBuilderResolution((current) => current ? { submitted: patchDraft(current.submitted, patch), resolved: patchDraft(current.resolved, patch) } : current);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("spec", encodeSpec(next));
    window.history.replaceState(null, "", url);
  };
  /** The sentence's "Ce fel de schimbare?" chose a group the answer holds: the same switch as its button (no request). */
  const trendListFromBuilder = (list: TrendList): boolean => {
    if (loading || !answerHoldsList(resp?.data, list)) return false;
    applyTrendList(list);
    return true;
  };
  const openEvidence = useCallback(
    (spec?: AskSpec, scope?: EvidenceScope, label?: string, opts: EvidenceOpenOpts = {}) => {
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
        // The applied trend's (and evolution's, F3) sources list the months its answer counted (plan §2.8).
        const months = selected === applied || selected.block === "timeseries" && applied?.block === "timeseries" && selected.timeseries?.months !== undefined
          ? resp?.executed?.months : undefined;
        // The whole answer's sources of a band or a network's group: the group's figures beside the selection's.
        const listGroup = !effectiveScope && selected === applied ? answerListGroup(answered, applied) : null;
        setEvidence({
          spec: selected,
          ...(effectiveScope ? { scope: effectiveScope } : {}),
          ...(opts.filters ? { filters: opts.filters } : {}),
          title,
          ...(label ? { scopeLabel: label } : {}),
          ...(months ? { months } : {}),
          ...(opts.sort ? { sort: opts.sort } : {}),
          ...(listGroup ? { listGroup } : {}),
        });
      }
    },
    [applied, title, resp?.executed?.months, answered],
  );
  /**
   * A trend's sources answered 409 (plan §2.8): the data moved the months its
   * answer counted. The applied question runs again (`auto` resolved anew), the
   * page says so once it has the new answer, and a drawer that was open reopens
   * on the new months, its row's label in their words; the old answer never
   * gets another list under it. At most one reload per reader action: on the
   * answer that reload brought, the next 409 returns false and the drawer (or
   * the export's line) says DATA_STILL_CHANGING, never a loop of reloads; the
   * try after it reloads again (reloadsFor409).
   */
  const reloadOutdated = useCallback((reopen: boolean): boolean => {
    if (!applied || !reloadsFor409(reloadedFor409)) return false;
    const drawer = reopen ? evidence : null;
    const label = drawer?.scopeLabel, before = resp?.data;
    setEvidence(null);
    const drillLabel = label && before?.block === "trend"
      ? (answer: AskResponse) => answer.data?.block === "trend" ? retimeScopeLabel(label, before, answer.data) : label
      : label;
    void execute({ spec: applied }, !!drawer, drawer?.scope, drawer?.filters, false, { reloaded: true, ...(drillLabel ? { drillLabel } : {}) })
      .then((ran) => { if (ran) showToast(DATA_RELOADED); });
    return true;
  }, [applied, evidence, execute, resp?.data, showToast]);
  /** The answer's short link (/l/…), or its long address when the short one cannot be made. */
  const copyLink = async (path: string) => {
    try {
      await copyShortLink(path);
      showToast("Link copiat. Îl poți lipi în WhatsApp.");
    } catch {
      showToast(
        "Copierea nu este disponibilă. Poți copia adresa din bara browserului.",
      );
    }
  };
  /** The phone's share sheet when there is one; otherwise the link is copied. */
  const share = async (path: string, text: string) => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url: await shortLink(path) });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copyLink(path);
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
    cancelNavPending();
    openEvidence(spec, scope, "selecția aleasă");
  };
  const data = answered,
    count = data ? sourceCount(data, applied) : null;
  const watchedGroup = data?.block === "trend" && applied ? trendWatch(data, applied) : data?.block === "network" && applied ? networkWatch(data, applied) : null;
  const isProfile = !!applied && isHistoricalProfile(applied);
  // What changes the total outside the sentence (G8), on the applied question as it ran (a trend's months).
  const totalWords = applied ? totalConditionWords(applied, resp?.executed?.months) : [];
  const empty = Boolean(data && emptyAnswer(data));
  /**
   * „Pe locuitor →” beside the map's lens (map final §3.7): the buyers become „Primăriile și consiliile județene” and
   * the lens per inhabitant, a new question the sentence shows, in a new history entry.
   */
  const perInhabitant = () => {
    if (!applied) return;
    const next = withLens({ ...applied, filters: { ...applied.filters, authorityKind: LOCAL_ADMIN_KIND } }, "value_per_capita") as AskSpec;
    setBuilderInit(next as unknown as QuestionSpec);
    setLinkRuns(true);
    void execute({ spec: next }, false, undefined, undefined, false);
  };
  /** A wider question from the empty answer (G2): the builder takes it as its draft, then it runs. */
  const runWider = (next: AskSpec) => {
    setBuilderInit(next as unknown as QuestionSpec);
    setLinkRuns(true);
    void execute({ spec: next });
  };
  /**
   * A pill's window chose (owner, 1 November 2026): a new question in a new history entry, the builder's draft, the
   * page where it is; what the choice changed besides is said. A trend's group the answer holds switches as its button.
   */
  const applyPill = (next: QuestionSpec, notes: string[]) => {
    const list = trendListSwitch(next, applied as unknown as QuestionSpec);
    if (list && trendListFromBuilder(list)) return;
    setBuilderInit(next);
    setLinkRuns(true);
    void execute({ spec: next as unknown as AskSpec }, false, undefined, undefined, false);
    if (notes.length) showToast(notes.join(" "));
  };
  /**
   * "Scoate din calcul" (F4, plan §2.3 "restrângere"): the applied question without the row's entity, a new
   * answer in a new history entry, so "Înapoi" brings the one before back (popstate restores the link). The page
   * stays where it is; the total line says the new total (aria-live) and the "⋯" of the row that took the place of
   * the one left out (the next, else the last) takes the focus once it is drawn (kit §5.13).
   */
  const refocusRow = useRef<number | null>(null);
  const excludeRow = useCallback((entity: { id: string; name: string; field?: "authority" | "supplier" | "cpv" }, index: number) => {
    const question = applied as unknown as QuestionSpec | undefined;
    // A flow's domain says its field (a CPV code); every other row is of the answer's role (BLOCK_FILTERS.exclude).
    const role = question ? entity.field ?? excludedRole(question) : null;
    const next = question && role ? excludeEntity(question, { field: role, value: entity.id, label: entity.name }) : null;
    if (!next) return;
    refocusRow.current = index;
    setBuilderInit(next);
    setLinkRuns(true);
    void execute({ spec: next as unknown as AskSpec }, false, undefined, undefined, false);
  }, [applied, execute]);
  // F5: the facts of the ranking's rows on screen (part `rows`), asked once they are drawn; "Unde e o firmă?" opens the
  // whole ranking, in pages, on the page of the place it found.
  const factIds = data?.block === "table" && applied && rowFactsWanted(applied) ? data.rows.flatMap((r) => r.entityId ? [r.entityId] : []) : [];
  const rowFacts = useRowFacts(factIds.length ? applied ?? null : null, factIds);
  const wholeRanking = (rank: number) => {
    if (!applied) return;
    const { topN: _topN, ...rest } = applied;
    const page = Math.floor((rank - 1) / RANKING_PAGE_SIZE);
    setBuilderInit(rest as unknown as QuestionSpec);
    setLinkRuns(true);
    setLayout("table");
    setTableOpts({ page });
    void execute({ spec: rest, tablePage: page }, false, undefined, undefined, false, { history: "push" });
  };
  useEffect(() => {
    const index = refocusRow.current;
    if (index === null || loading) return;
    refocusRow.current = null;
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLElement>("#raspuns [data-qb-arow]");
      const row = rows[Math.min(index, rows.length - 1)];
      (row?.querySelector<HTMLElement>(".qb-more") ?? document.getElementById("raspuns-titlu"))?.focus();
    });
  }, [resp, loading]);
  /** „Vizual | Tabel”: the strip's last control; a ranking, with no strip of its own, has it beside „Unde e o firmă?”. */
  const layoutToggle = <Segmented
    label="Cum arată răspunsul"
    size="sm"
    value={layout}
    options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]}
    onChange={(value) => setLayout(value as "visual" | "table")}
  />;
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
          <h2 className="ia-builder-title">Construiește întrebarea pas cu pas</h2>
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
            onTrendList={trendListFromBuilder}
          />
        </div>
      ) : (
        <button type="button" className="ia-open-builder" onClick={() => setBuilderOpen(true)}>
          <strong>Construiește întrebarea pas cu pas</strong>
          <span>Alege din 13 modele de întrebări: clasamente, totaluri, evoluții, comparații, relații și semnale.</span>
        </button>
      )}
      {loading && <Loader label="Căutăm răspunsul în date" />}
      {/* No answer on screen yet (a link, a first question, a retry): its ghost where it will stand, shaped by the
          question asked, after 120 ms so a quick answer never shows it. A new answer over one on screen dims it instead. */}
      {loading && !error && !(resp?.ok && answered && appliedSpec) && <AnswerGhost spec={asked} />}
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
        <AnswerEvidence.Provider value={{ open: openEvidence, exclude: excludeRow }}>
          <section
            // A new answer over this one: it stays in place, dimmed (g-stale). No g-content entrance here: its filled
            // animation would hold the opacity and skip g-stale's 250 ms delay.
            className={`cq-answer${loading ? " g-stale" : ""}`}
            id="raspuns"
            aria-busy={loading}
            onClick={interceptSource}
          >
            <div className="cq-answer-head">
              <div>
                <h2 id="raspuns-titlu" tabIndex={-1}>{linkNames(title, titleEntities(applied, resp.townHall))}</h2>
                {line && <IntentLine line={line} onAdopt={adopt} />}
                <AnswerPills spec={applied} pills={shown.pills} labels={pillLabels} cpvName={cpvName} onApply={applyPill} />
                {dirty && (
                  <p className="cq-pending" role="status">
                    Răspuns pentru întrebarea anterioară
                  </p>
                )}
              </div>
              <div className="cq-answer-actions">
                {/* G2: an empty answer has no records to open; its relaxations are below. */}
                {!empty && <button
                  type="button"
                  className="cq-source-main"
                  onClick={() => openEvidence()}
                >
                  <DiscoveryIcon name="database"/>
                  {applied.block==='scatter'&&applied.scatter?.flag?'Vezi înregistrările semnalului':count===null||count===0?'Vezi înregistrările sursă':isProfile||applied.dataset==='da'
                    ?count===1?'Vezi achiziția':`Vezi cele ${countWords(count, 'achiziție', 'achiziții')}`
                    :count===1?'Vezi înregistrarea sursă':`Vezi cele ${countWords(count, 'înregistrare', 'înregistrări')}`}
                </button>}
                <button
                  type="button"
                  className="cq-share"
                  onPointerDown={() => prepareShortLink(answerPath(applied, thread))}
                  onClick={() => void share(answerPath(applied, thread), title)}
                >
                  <ShareIcon />
                  Trimite
                </button>
                <SaveQuestionButton spec={applied} active={answerSaved} onSaved={setAnswerSaved} disabled={loading} compact />
                {/* A trend's or a network's group: the watch fixes its members (plan §2.8); too large a group says how to narrow it. */}
                <FollowButton key={JSON.stringify(applied)} spec={applied} title={title}
                  {...(watchedGroup ? { label: watchedGroup.label, blocked: watchedGroup.blocked } : {})} />
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
            {/* A profile's kind is in the line under the sentence („achiziții directe”); „Ce include calculul” adds the
                archive, the ceiling and „valori înregistrate, nu plăți”. No banner (owner, 2 November 2026). */}
            {/* The trend's groups (its strip keys) are drawn by its block, above its rows: no empty strip here. A ranking's
                strip would hold only „Vizual | Tabel” (owner, 1 November 2026): it ends the row of „Unde e o firmă?” instead. */}
            {(stripKeys.some((key) => key === "dataset" || key === "measure") || crumbs || ["timeseries", "map"].includes(data.block)) && (
              <div className="qb cq-strip"><AnswerStrip>
                {stripKeys.includes("dataset") && (() => {
                  // A breakdown's channels say their share of the whole selection (F3, final breakdown §3.6), with the unit beside.
                  // F4: the network's and the flow's from their own `streams` (the selection on every channel); on one channel,
                  // those of the same question on every channel this page answered (streamsMemo).
                  const streams = data.block === "breakdown" || data.block === "network" || data.block === "sankey" ? data.streams ?? keptStreams(data.block, applied) : undefined;
                  const shares = streams ? channelShares({ streams }, data.block === "breakdown" && applied.measure === "count") : null;
                  const control = <Segmented
                    label="Ce fel de achiziții"
                    value={streamShown ?? applied.dataset ?? "all"}
                    options={shares ? shares.options(streamOptions(applied)) : streamOptions(applied)}
                    onChange={(value) => {
                      if (value === (streamShown ?? applied.dataset ?? "all")) return;
                      setStreamShown(value);
                      applyStripChange("dataset", value);
                    }}
                  />;
                  return shares ? <StripLabelled after={shares.unit} wide>{control}<HelpTip tip={CHANNEL_SHARE_TIP} /></StripLabelled> : control;
                })()}
                {/* Two firms (F4, final compare §3.4): „Doar clienții comuni N”, N the shared clients of the answer on screen. */}
                {data.block === "compare" && stripKeys.includes("sharedPartners") && data.entities[0]?.role === "supplier" && (() => {
                  const on = applied.filters.sharedPartners === true, n = data.shared?.total ?? 0;
                  return <span className="qb-pair qb-tipwrap-sm">
                    <Toggle id="cmp-shared" label="Doar clienții comuni" pressed={on} count={formatInt(n)}
                      {...(!on && n === 0 ? { availability: { state: "disabled" as const, reason: "Nicio instituție nu a cumpărat de la amândouă în selecția aleasă." } } : {})}
                      onToggle={(_id, pressed) => applySharedPartners(pressed)} />
                    <HelpTip tip={{ id: "clienti-comuni" }} />
                  </span>;
                })()}
                {/* The evolution's split and same months (F3, final timeseries §3.8–§3.9): each a new grouping. */}
                {data.block === "timeseries" && stripKeys.includes("timeseriesSplit") && (
                  <StripLabelled before="Împarte" smHide>
                    <Segmented
                      label="Împarte"
                      value={`split:${applied.timeseries?.split ?? ""}`}
                      options={seriesSplitOptions(applied)}
                      onChange={(value) => { if (value !== `split:${applied.timeseries?.split ?? ""}`) applyStripChange("timeseries", value); }}
                    />
                  </StripLabelled>
                )}
                {data.block === "timeseries" && stripKeys.includes("timeseriesMonths") && (() => {
                  const window = sameMonthsSwitch(data, applied);
                  return window && <span className="qb-pair qb-tipwrap-sm">
                    <Toggle id="ts-months" label={`Aceleași luni: ${window.label}`} pressed={window.on}
                      onToggle={(_id, pressed) => applyStripChange("timeseries", pressed ? "months:auto" : "months:")} />
                    <HelpTip tip={{ title: "Aceleași luni", text: `Fiecare an e tăiat la ${window.label}, ultimele luni complete din ${window.year}. 2018 nu intră în comparație.` }} />
                  </span>;
                })()}
                {/* The breakdown's kind is the first level of its thread (F3, final breakdown §3.7): „toate” goes back. */}
                {data.block === "breakdown" && !crumbs && applied.filters.purchaseKind && PURCHASE_KIND_WORDS[applied.filters.purchaseKind] && (
                  <Crumbs label="Domenii" items={[{ label: "toate", onClick: () => applyStripChange("purchaseKind", "") }]} current={PURCHASE_KIND_WORDS[applied.filters.purchaseKind].label} />
                )}
                {data.block === "breakdown" && (() => {
                  const deeper = breakdownSuggestion(data, applied, thread);
                  return deeper && <Suggest text={deeper.text} href={deeper.href} />;
                })()}
                {/* The flow's length, its domains' thread and the suggestion to go down (F4, final sankey §3.2–§3.4). */}
                {data.block === "sankey" && stripKeys.includes("sankeyShown") && (
                  <StripLabelled before="Arată" after={data.focal.role === "authority" ? "firme" : "instituții"}>
                    <Segmented label="Câți parteneri arăți" size="sm" value={String(sankeyShown(applied))} options={sankeyShownOptions(data)}
                      onChange={(value) => { if (Number(value) !== sankeyShown(applied)) applySankeyShown(Number(value)); }} />
                  </StripLabelled>
                )}
                {data.block === "sankey" && !crumbs && (applied.filters.cpvTerm
                  ? <Crumbs label="Domenii" items={[{ label: "toate", href: threadHref(applied, null, null) }]} current={cpvName ?? `„${String(applied.filters.cpvTerm)}”`} />
                  : <span className="qb-row qb-tipwrap-sm"><Crumbs label="Domenii" items={[]} current="toate" /><HelpTip tip={{ title: "Domenii", text: "Domeniul = codul CPV declarat de instituție pentru fiecare înregistrare. Detaliază coboară un nivel." }} /></span>)}
                {data.block === "sankey" && (() => {
                  const deeper = sankeySuggestion(data);
                  return deeper && <Suggest text={deeper.text} href={threadHref(applied, deeper.code, deeperThread(thread, applied, deeper.code, deeper.name))} />;
                })()}
                {stripKeys.includes("measure") && data.block === "map" && lensChoices && mapLens && (
                  <span className="qb-row qb-row--wide qb-tipwrap-sm ask-maplens">
                    <StripLabelled before="Harta arată">
                      <Segmented
                        label="Harta arată"
                        value={mapLens}
                        options={lensChoices}
                        onChange={(value) => { if (value !== mapLens) applyStripChange("measure", value); }}
                      />
                    </StripLabelled>
                    <HelpTip tip={mapLens === "value_per_capita" ? PER_INHABITANT_LENS_TIP : MAP_LENS_TIP} />
                    {/* Per inhabitant only for the local administrations (map final §3.7): the link changes the buyers, in view. */}
                    {!mapFirm(applied) && !mapLocalAdmin(applied) && (
                      <span className="qb-row ask-percap-link">
                        <button type="button" className="qb-link" onClick={() => perInhabitant()}>Pe locuitor<span className="qb-glyph" aria-hidden="true">→</span></button>
                        <HelpTip tip={PER_INHABITANT_TIP} />
                      </span>
                    )}
                  </span>
                )}
                {crumbs && <Crumbs label="Domenii" items={crumbs.items} current={crumbs.current} />}
                {["timeseries", "map", "sankey"].includes(data.block) && <StripEnd>{layoutToggle}</StripEnd>}
              </AnswerStrip></div>
            )}
            {data.block === "breakdown" && breakdownLead(data.slices, data.other) && (
              <p className="cq-lead">{breakdownLead(data.slices, data.other)}</p>
            )}
            {/* G2: an answer with no record offers at most three wider questions (kit component 17). */}
            {empty ? <div className="qb cq-result cq-result-empty">
              <EmptyState
                message={emptyMessage(data, isProfile)}
                relax={relaxations(applied).map((r) => ({ id: r.id, label: r.label, onClick: () => runWider(r.spec) }))}
                titleId="raspuns-titlu"
              />
            </div>
              // Keyed by its subject (chart-motion.ts): another block, unit or entity enters anew; a filter, a measure or
              // a group changes the same charts in place, so their marks tween.
              : <div key={answerSubject(applied)} className={`cq-result cq-result-${data.block}`}>
              {data.block === "stat" && <>
                <StatBlock stat={data.stat} measure={applied.measure} />
                {/* „Din care” (F3): asked once the number is drawn; „Doar acestea ›” asks the total again with that row, a
                    restriction in a new history entry (plan §2.3), so "Înapoi" brings the whole total back. */}
                <StatMix spec={applied} onOnly={(next, words) => { runWider(next); showToast(`${words}.`); }} />
              </>}
              {data.block === "table" && (applied.dim === "supplier" || applied.dim === "authority") && applied.measure !== "value_per_capita" && data.rows.length > 0
                ? <RankingLocate spec={applied} onWhole={wholeRanking} end={layoutToggle}
                  shown={data.total !== undefined ? ((data.page ?? 0) + 1) * (data.pageSize ?? RANKING_PAGE_SIZE) : data.rows.length} />
                : data.block === "table" && <div className="qb cq-layout-row">{layoutToggle}</div>}
              {data.block === "table" &&
                (layout === "visual" ? (
                  <RankingBars
                    rows={data.rows}
                    spec={applied}
                    conditions={totalWords}
                    totals={(data.page ?? 0) === 0 && !tableOpts.sort ? data.totals : undefined}
                    group={(data.page ?? 0) === 0 && !tableOpts.sort ? data.group : undefined}
                    onSources={openEvidence}
                    facts={rowFacts}
                  />
                ) : (
                  <TableBlock
                    rows={data.rows}
                    spec={applied}
                    facts={rowFacts}
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
                  <SeriesAnswer key={data.grain ?? "year"} data={data} spec={applied} partial={resp.partialYears ?? []} onSources={openEvidence} />
                ) : (
                  <ExactSeries
                    data={data}
                    partial={resp.partialYears ?? []}
                    spec={applied}
                    onSources={openEvidence}
                  />
                ))}
              {data.block === "map" &&
                (layout === "visual" ? (
                  <MapBlock counties={data.counties} unknown={data.unknown} spec={applied} {...(data.local ? { local: data.local } : {})}
                    facts={mapFacts} {...(mapLens ? { lens: mapLens } : {})} />
                ) : (
                  <CountyValues
                    counties={data.counties}
                    unknown={data.unknown}
                    spec={applied}
                    onSources={openEvidence}
                    facts={mapFacts.status === "ready" ? mapFacts.value : null}
                    {...(data.local ? { local: data.local } : {})}
                    lens={mapLens ?? "value"}
                  />
                ))}
              {data.block === "compare" && (
                <CompareBlock data={data} partial={resp.partialYears ?? []} dataset={applied.dataset ?? "all"} shared={applied.filters.sharedPartners === true}
                  relax={relaxations(applied).map((r) => ({ label: r.label, onClick: () => runWider(r.spec) }))} onAllClients={() => applySharedPartners(false)} />
              )}
              {data.block === "distribution" && (
                <DistributionBlock
                  distribution={data.distribution}
                  spec={applied}
                  onChangeGroup={(value) => applyStripChange("peers", value)}
                />
              )}
              {data.block === "breakdown" && (
                <BreakdownBlock
                  slices={data.slices}
                  other={data.other}
                  base={data.base}
                  spec={applied}
                  thread={thread}
                  onKind={(kind) => applyStripChange("purchaseKind", kind)}
                  onMeasure={(measure) => { if (measure !== (applied.measure === "count" ? "count" : "value")) applyStripChange("measure", measure); }}
                />
              )}
              {data.block === "scatter" && ("scatter" in data
                ? <ScatterAnswer data={data.scatter} spec={applied} onStrip={(value) => applyStripChange("scatter", value)} />
                : <>
                  <p className="cq-oldnote">Captură veche: norul de dinainte de semnale și de lista cu locuri.</p>
                  <ScatterBlock points={data.points} density={data.density} />
                </>)}
              {data.block === "sankey" && (
                <SankeyAnswer data={data} spec={applied} layout={layout}
                  deeperHref={(code) => threadHref(applied, code, deeperThread(thread, applied, code, domainName(data.domains.find((d) => d.code === code) ?? { code, name: null })))} />
              )}
              {data.block === "network" && (
                <NetworkAnswer data={data} spec={applied} conditions={totalWords}
                  {...(data.relation === "pending" ? { relation: networkWhole.status === "none" ? "failed" as const : "loading" as const } : {})}
                  onList={(list) => applyNetwork({ list })} onOrder={(order) => applyNetwork({ order })} onSince={applyNetworkSince} />
              )}
              {data.block === "entity_card" && (
                <EntityCardBlock data={data} historical={isProfile} spec={applied} conditions={totalWords} />
              )}
              {data.block === "fact_check" && (
                <FactCheckBlock fact={data.fact} spec={applied} onWider={runWider} />
              )}
              {data.block === "trend" && (
                <TrendBlock
                  data={data}
                  spec={applied}
                  partial={resp.partialYears ?? []}
                  conditions={totalWords}
                  onList={applyTrendList}
                  strip={stripKeys}
                  onWider={runWider}
                />
              )}
            </div>}
            {/* G8: what changed the total outside the sentence; the ranking says it in its own total line. A risk
                profile has no total in lei: its seat is the sentence's, and «nu plăți» would speak of sums it does not show. */}
            {totalWords.length > 0 && !empty && !isProfile && !(data.block === "table" && layout === "visual") && !(data.block === "trend" && data.composition) && data.block !== "network" && data.block !== "entity_card" && (
              <div className="qb cq-total"><TotalLine conditions={totalWords}>{totalLead(data)}</TotalLine></div>
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
                onPointerDown={() => prepareShortLink(answerPath(applied, thread))}
                onClick={() => void copyLink(answerPath(applied, thread))}
              >
                <CopyIcon />
                Copiază linkul
              </button>
              <AnswerExports key={encodeSpec(applied)} spec={applied} disabled={loading} onResult={async()=>{if(data.block==="scatter"&&"scatter" in data)await ensureScatterFacts(applied,data.scatter.list.map((r)=>r.entityId));downloadCsv(answerCsv(data,applied,title,band,{mapFacts:mapFacts.status==="ready"?mapFacts.value:null}));}}
                months={resp.executed?.months} onStale={() => reloadOutdated(false)}/>
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
          {...(evidence.months ? { months: evidence.months, onStale: () => reloadOutdated(true) } : {})}
          {...(evidence.sort ? { initialSort: evidence.sort } : {})}
          {...(evidence.listGroup ? { listGroup: evidence.listGroup } : {})}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}

/*
 * The first answer's ghost (owner, 6 November 2026: "ghost data loading"). While no answer is on screen (a link opened,
 * a first question, a retry) the place of the answer holds its shape: the title and the pills the spec already says,
 * the actions, the strip, the block's own ghost (blocks.tsx, ScatterAnswer.tsx, MapBlock.tsx, StatMix.tsx and the
 * ranking below) and the foot. Every part is the real element with its real classes, so the answer replaces it where
 * it stands; controls are quiet replicas (inert). It fades in after 120 ms (a quick answer never shows it); the
 * floating loader is its status.
 */
function AnswerGhost({ spec }: { spec: AskSpec | null }) {
  const viewer = useViewer();
  const cpv = spec?.filters.cpvTerm === undefined ? "" : String(spec.filters.cpvTerm);
  // A CPV code is named by the catalogue the answer brings: until then the title is lines, never „CPV 45”.
  const title = spec && !isCpvCode(cpv) ? questionTitle(spec) : null;
  const block = spec?.block;
  const profile = Boolean(spec && isHistoricalProfile(spec));
  const n = <G.Line inline w="9ch" />;
  // The records' button says its count where the answer has one (sourceCount): its width sets the title's.
  const counted = block !== undefined && ["network", "sankey", "stat", "fact_check", "timeseries", "map", "breakdown", "entity_card"].includes(block);
  const source = block === "scatter" && spec?.scatter?.flag ? "Vezi înregistrările semnalului"
    : !counted ? "Vezi înregistrările sursă"
      : <span>Vezi cele {n} {profile || spec?.dataset === "da" ? "de achiziții" : "de înregistrări"}</span>;
  const totalWords = spec && block !== "table" && block !== "network" && block !== "entity_card" && !profile ? totalConditionWords(spec) : [];
  return <Ghost as="section" className="cq-answer" name="ask-answer" wait="client">
    <div className="cq-answer-head">
      <div>
        <h2>{title ?? <><G.Line w="94%" /><G.Line w="48%" /></>}</h2>
        <div inert>{spec
          // The cloud's first pill is its group's window (labels.scatterGroup): a pill, its words a line.
          ? <AnswerPills spec={spec} pills={ghostPills(spec)} labels={spec.block === "scatter" ? { scatterGroup: 0 } : {}} onApply={() => undefined} />
          : <div className="cq-scope"><G.Line inline w="44%" /></div>}</div>
      </div>
      <div className="cq-answer-actions g-quiet" inert>
        <button type="button" className="cq-source-main"><DiscoveryIcon name="database" />{source}</button>
        <button type="button" className="cq-share"><ShareIcon />Trimite</button>
        <span className="cq-save-wrap"><button type="button" className="cq-save-question">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4V4Z" /></svg>
          <span>Salvează</span>
        </button></span>
        {/* A signed-in reader's „Urmărește” and „Salvează în anchetă”: one more pair. */}
        {viewer.userId && <span className="cq-ghost-pair g-block" />}
      </div>
    </div>
    {spec && <StripGhost spec={spec} />}
    {block === "breakdown" && <p className="cq-lead" aria-hidden="true"><G.Line w="64%" /><G.Line w="38%" only="phone" /></p>}
    <div className={`cq-result${block ? ` cq-result-${block}` : ""}`}>
      {!spec ? <GenericGhost />
        : block === "table" ? <RankingGhost spec={spec} />
          : block === "stat" ? <StatGhost spec={spec} />
            : block === "breakdown" ? <BreakdownGhost spec={spec} />
              : block === "scatter" ? <ScatterGhost spec={spec} />
                : block === "map" ? <MapGhost />
                  : <GenericGhost />}
    </div>
    {totalWords.length > 0 && <div className="qb cq-total" inert><TotalLine conditions={totalWords}><G.Line inline w="40%" /></TotalLine></div>}
    <div inert className="g-quiet">
      <details className="cq-caveats"><summary>Ce include calculul · <G.Line inline w="1ch" /></summary></details>
      {spec && <CoverageDisclosure spec={spec} />}
      <div className="cq-answer-tools">
        <button type="button" className="cq-copy"><CopyIcon />Copiază linkul</button>
        {spec && <AnswerExports spec={spec} disabled onResult={() => undefined} />}
      </div>
    </div>
  </Ghost>;
}

/** The strip beside the answer (as the answer draws it above), from its spec: the channels, the map's lens, an evolution's split. */
function StripGhost({ spec }: { spec: AskSpec }) {
  const keys = BLOCK_FILTERS[spec.block]?.strip ?? [];
  if (!(keys.some((key) => key === "dataset" || key === "measure") || spec.block === "timeseries" || spec.block === "map")) return null;
  const share = <G.Line inline w="5ch" />;
  const toggle = <Segmented label="Cum arată răspunsul" size="sm" value="visual" options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]} />;
  const channels = keys.includes("dataset") && (spec.block === "breakdown" || spec.block === "network" || spec.block === "sankey")
    // A breakdown's channels say their share (channelShares): the place of the number beside each.
    ? streamOptions(spec).map((option) => option.value === "da" || option.value === "contracts" ? { ...option, label: <>{option.label} {share}</> } : option)
    : streamOptions(spec);
  return <div className="qb cq-strip g-quiet" inert><AnswerStrip>
    {keys.includes("dataset") && (spec.block === "breakdown"
      ? <StripLabelled after={spec.measure === "count" ? "% din înregistrări" : "% din valoare"} wide><Segmented label="Ce fel de achiziții" value={spec.dataset ?? "all"} options={channels} /><HelpTip tip={CHANNEL_SHARE_TIP} /></StripLabelled>
      : <Segmented label="Ce fel de achiziții" value={spec.dataset ?? "all"} options={channels} />)}
    {spec.block === "map" && keys.includes("measure") && <span className="qb-row qb-row--wide qb-tipwrap-sm ask-maplens">
      <StripLabelled before="Harta arată"><Segmented label="Harta arată" value={spec.measure === "count" ? "count" : "value"} options={mapLensOptions(spec, { status: "loading" })} /></StripLabelled>
      <HelpTip tip={MAP_LENS_TIP} />
      {!mapFirm(spec) && !mapLocalAdmin(spec) && <span className="qb-row ask-percap-link"><button type="button" className="qb-link">Pe locuitor<span className="qb-glyph" aria-hidden="true">→</span></button><HelpTip tip={PER_INHABITANT_TIP} /></span>}
    </span>}
    {spec.block === "timeseries" && keys.includes("timeseriesSplit") && <StripLabelled before="Împarte" smHide><Segmented label="Împarte" value={`split:${spec.timeseries?.split ?? ""}`} options={seriesSplitOptions(spec)} /></StripLabelled>}
    {(spec.block === "timeseries" || spec.block === "map") && <StripEnd>{toggle}</StripEnd>}
  </AnswerStrip></div>;
}

/** The ranking (RankingBars) on its way: "Unde e o firmă?" with „Vizual | Tabel”, its N rows and its total line. */
function RankingGhost({ spec }: { spec: AskSpec }) {
  const rows = spec.topN ?? RANKING_PAGE_SIZE;
  const toggle = <Segmented label="Cum arată răspunsul" size="sm" value="visual" options={[{ value: "visual", label: "Vizual" }, { value: "table", label: "Tabel" }]} />;
  const locate = (spec.dim === "supplier" || spec.dim === "authority") && spec.measure !== "value_per_capita";
  const conditions = totalConditionWords(spec);
  return <>
    {locate
      ? <div className="qb cq-locate g-quiet" inert>
        <Locate label={spec.dim === "supplier" ? "Unde e o firmă?" : "Unde e o instituție?"} results={[]} loading={false} onSearch={() => undefined} onPick={() => undefined} />
        <span className="cq-locate-end">{toggle}</span>
      </div>
      : <div className="qb cq-layout-row g-quiet" inert>{toggle}</div>}
    <div className="cq-ranking" inert>
      <G.Rows n={rows} as="div" className="cq-rank-row" cells={(i) => <>
        <div className="cq-rank-main">
          <span className="cq-rank-number">{String(i + 1).padStart(2, "0")}</span>
          <span className="cq-rank-name">
            <span className="cq-rank-title"><G.Line w={`${[26, 18, 12, 22, 34, 16, 20, 28, 14, 24][i % 10]}ch`} /></span>
            <span className="cq-bar-track"><i className="g-block" style={{ width: rankWidth(i, 100, 9, 22), background: "var(--line)" }} /></span>
          </span>
          <span className="cq-rank-value">
            <strong><G.Line inline w="15ch" /></strong>
            {/* On a phone the records' words wrap beside the sum: two lines. */}
            <button type="button" className="cq-rank-records"><G.Line inline w="24ch" /><G.Line w="12ch" only="phone" /></button>
          </span>
        </div>
        {spec.dim !== "county" && <span className="qb cq-rank-menu g-quiet"><button type="button" className="qb-more">⋯</button></span>}
      </>} />
      {/* The rest of the selection after the rows shown (rankingRest). */}
      <div className="cq-rank-rest">
        <span className="cq-rank-number">…</span>
        <span className="cq-rank-name"><strong>Alte <G.Line inline w="12ch" /></strong></span>
        <span className="cq-rank-value"><strong><G.Line inline w="15ch" /></strong><small><G.Line inline w="26ch" /></small></span>
      </div>
    </div>
    {conditions.length > 0
      ? <div className="qb cq-total" inert><TotalLine conditions={conditions}><G.Line inline w="44%" /></TotalLine></div>
      : <p className="ask-fine cq-total-line" inert>
        {spec.measure !== "value_per_capita" && <>Total: <G.Line inline w="13ch" /> la <G.Line inline w="12ch" /> · valoare înregistrată, nu plăți</>}
        {spec.measure !== "value_per_capita" && spec.dim === "supplier" && " · "}
        {spec.dim === "supplier" && <>în asociere: cote egale <Term id="in-asociere" tip /></>}
      </p>}
  </>;
}

/** The total (StatBlock) on its way: the number, its line, the channels' split, then „Din care” (StatMix). */
function StatGhost({ spec }: { spec: AskSpec }) {
  return <>
    <div className="ask-bigstat" aria-hidden="true">
      <div className="v"><G.Line inline w="6ch" /></div>
      <div className="d"><G.Line inline w="34ch" /></div>
      {(spec.dataset ?? "all") === "all" && <div className="ask-streamsplit"><G.Line inline w="62ch" /><G.Line w="40ch" only="phone" /></div>}
    </div>
    <MixGhost />
  </>;
}

/** Any other answer on its way (the block is not known yet, or has no ghost of its own): a sentence, a chart, rows. */
function GenericGhost() {
  return <div aria-hidden="true">
    <p className="ask-fine"><G.Line w="56%" /></p>
    <G.Block h="240px" />
    <table className="ask-table cq-exact-table"><tbody>
      <G.Rows n={3} as="tr" cells={(i) => <><th><G.Line w={rankWidth(i, 70, 6)} /></th><td><G.Line inline w="12ch" /></td><td><G.Line inline w="8ch" /></td></>} />
    </tbody></table>
  </div>;
}

/** «conduse azi de»: an individual practice in by its holder's name only (owner, 1 November 2026), first among the facts. */
const byNameTag = (r: TableRow): WinnerTag[] => r.byName ? [{ text: "după nume", tone: "caveat" }] : [];

/** F5 (kit P8): a ranking row's facts, inline in the row (a span: the row is a button), at most three. */
/** The entities a question names (its institution, its firm, the one compared with), as its title may spell them. */
function titleEntities(spec: AskSpec | null | undefined, townHall?: { id: string }): NamedEntity[] {
  if (!spec) return [];
  const f = spec.filters as Record<string, unknown>, out: NamedEntity[] = [];
  // "primăria Râmnicu Sărat (Buzău)" / "ale primăriei …": the whole phrase is the town hall's name here.
  if (townHall && typeof f["uatName"] === "string" && f["uatName"]) {
    const place = localityName(f["uatName"]);
    for (const lead of ["primăria ", "primăriei "]) out.push({ id: townHall.id, name: lead + place, role: "authority" });
  }
  const add = (id: unknown, name: unknown, role: "authority" | "supplier") => {
    if (id && typeof name === "string" && name) out.push({ id: String(id), name, role }, { id: String(id), name: cleanName(name), role });
  };
  add(f["authorityId"], f["authorityName"], "authority");
  add(f["supplierId"], f["supplierName"], "supplier");
  add(f["compareWithId"], f["compareWith"], f["authorityId"] ? "authority" : "supplier");
  return out;
}

function FactTags({ tags }: { tags: readonly WinnerTag[] }) {
  if (!tags.length) return null;
  return <span className="qb-tags cq-rank-facts">{tags.slice(0, 3).map((tag) => <FactTag key={tag.text} fact={tag} />)}</span>;
}

function RankingBars({
  rows,
  spec,
  totals,
  group,
  conditions = [],
  onSources,
  facts = null,
}: {
  rows: TableRow[];
  spec: AskSpec;
  /** F5: the facts of the rows shown (use-row-facts.ts), once read. */
  facts?: Record<string, WinnerFacts> | null;
  totals?: RankingTotals | undefined;
  /** F3 (table:employees-2): the ranked firms of a band, the list; `totals` stay the whole selection's. */
  group?: RankingTotals | undefined;
  /** What changed the total outside the sentence (G8): the total line says it. */
  conditions?: readonly string[];
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
}) {
  // Shares are of money: a per-capita ranking has no meaningful "% din total".
  const shareTotals = spec.measure === "value_per_capita" ? undefined : totals;
  // The rest row is the list's (the band's firms after the shown ones), its share of the whole selection.
  const rest = rankingRest(rows, group ?? shareTotals, group ? shareTotals : undefined);
  const band = group && shareTotals && shareTotals.value > 0 ? employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees) : null;
  // F5: the list of a chip of the row says its own words ("177 de furnizori noi din 2024"); the band alone keeps F3's.
  const lead = group && shareTotals && shareTotals.value > 0
    ? rankedGroupLead(spec, group.entities) ?? (band ? `${entityNoun(spec.dim, group.entities)} ${band}` : null) : null;
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
  // P7 (F4): a row of an institution or a firm has its "⋯": its records, "Scoate din calcul".
  const answer = useAnswerEvidence();
  // The bars grow top down when the ranking first shows; a re-query or a measure tweens their widths where a row stays,
  // the rows take their new order at once (no sliding), a row the answer adds fades in (owner, 6 November 2026).
  const motion = useChartMotion();
  if (!rows.length)
    return (
      <p className="ask-empty">
        Nu am găsit înregistrări pentru aceste condiții. Încearcă o perioadă mai
        largă.
      </p>
    );
  return (
    <>
      <div className="cq-ranking" {...motion.root}>
        {rows.map((r, i) => {
          // A county's row is named as the pages spell it (lib/counties.ts); its scope keeps the data's.
          const shown = r.entityId ? cleanName(r.name) : countyName(cleanName(r.name));
          const records = () => onSources(spec, entitySourceScope(spec, r), `${shown} · înregistrările din clasament`);
          const entity = r.entityId ? { id: r.entityId, name: cleanName(r.name) } : null;
          const actions = entity && answer?.exclude ? entityRowActions(spec, entity, { records, exclude: () => answer.exclude!(entity, i) }) : [];
          // The name opens the entity's page; its records are the line under the sum (owner, 2 November 2026).
          const row = (
          <div className="cq-rank-main" key={r.entityId ?? r.name} ref={actions.length ? undefined : motion.join}>
            <span className="cq-rank-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="cq-rank-name">
              {r.entityId
                ? <EntityName id={r.entityId} role={spec.dim === "authority" ? "authority" : spec.dim === "supplier" ? "supplier" : null} className="cq-rank-title">{shown}</EntityName>
                : <strong>{shown}</strong>}
              <FactTags tags={[...byNameTag(r), ...(r.entityId ? winnerFactTags(spec, facts?.[r.entityId], undefined, r.value) : [])]} />
              <span className="cq-bar-track">
                <i
                  className={`cm-tw ${motion.enter("cm-x")}`}
                  style={{
                    width: `${Math.max(0.5, (metric(r) / max) * 100)}%`,
                    opacity: Math.max(0.35, 1 - i * 0.08),
                    "--i": i,
                  } as CSSProperties}
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
              <button type="button" className="cq-rank-records" onClick={records} aria-label={`Înregistrările din clasament: ${shown}`}>
                {spec.measure === "count"
                  ? formatRonFull(r.value)
                  : countWords(r.count, "înregistrare", "înregistrări")}
                {rankingShare(r.value, shareTotals) !== null && <> · {formatShare(rankingShare(r.value, shareTotals)!)} din total</>}
                {" →"}
              </button>
            </span>
          </div>
          );
          // The kit's menu in its own .qb box (its reset and focus ring), anchored to the row.
          return actions.length ? <div className="cq-rank-row" key={r.entityId ?? r.name} data-qb-arow="" ref={motion.join}>
            {row}
            <span className="qb cq-rank-menu"><RowMenu name={cleanName(r.name)} actions={actions} /></span>
          </div> : row;
        })}
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
      {/* F3: the band of CÂȘTIGĂTORII narrows the list; its line says the list's sum against the whole selection's. */}
      {lead && group && shareTotals ? <>
        <div className="qb cq-total"><TotalLine conditions={conditions}>
          {lead}: <span className="qb-num">{formatRonFull(group.value)}</span>, {formatShare(group.value / shareTotals.value)} din{" "}
          <span className="qb-num">{formatRonFull(shareTotals.value)}</span> ({entityNoun(spec.dim, shareTotals.entities)})
        </TotalLine></div>
        <p className="ask-fine cq-total-line">în asociere: cote egale <Term id="in-asociere" tip /></p>
      </> : conditions.length > 0 ? <>
        <div className="qb cq-total"><TotalLine conditions={conditions}>{hasTotal ? <>Total: <span className="qb-num">{formatRonFull(shareTotals.value)}</span> la {entityNoun(spec.dim, shareTotals.entities)}</> : "Selecția"}</TotalLine></div>
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
/**
 * The evolution as a table (final timeseries §4 „Vizual | Tabel”): a row per
 * year or month, a column per part of a split, and the change against the
 * year before only between two complete years.
 */
function ExactSeries({
  data,
  partial,
  spec,
  onSources,
}: {
  data: Extract<BlockData, { block: "timeseries" }>;
  partial: PartialYear[];
  spec: AskSpec;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string) => void;
}) {
  const monthly = data.grain === "month";
  const parts = data.parts ?? [];
  const rows = [...data.series].sort((a, b) => barKey(a).localeCompare(barKey(b)));
  const complete = (year: number) => year > 2018 && !partial.some((p) => p.year === year);
  return (
    <table className="ask-table cq-exact-table">
      <thead>
        <tr>
          <th>{monthly ? "Luna" : "An"}</th>
          <th>Valoare înregistrată</th>
          <th>Înregistrări</th>
          {parts.map((part) => <th key={part.key}>{part.label}</th>)}
          {!monthly && <th>Față de anul anterior</th>}
          <th>Surse</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const part = monthly ? undefined : partial.find((p) => p.year === r.year);
          const previous = monthly ? undefined : rows.find((p) => p.year === r.year - 1);
          const change = previous && previous.value > 0 && complete(r.year) && complete(r.year - 1) ? formatChange((r.value / previous.value - 1) * 100) : "—";
          const sources = barSources(spec, r);
          return (
          <tr key={barKey(r)}>
            <th>
              {barName(r)}
              {part && <small className="ask-partial-note">{part.provisional ? "date parțiale sau provizorii" : "an acoperit parțial"}: {part.note}</small>}
            </th>
            <td>{formatRonFull(r.value)}</td>
            <td>{formatInt(r.count)}</td>
            {parts.map((p) => <td key={p.key}>{formatRonFull(r.parts?.[p.key]?.value ?? 0)}</td>)}
            {!monthly && <td>{change}</td>}
            <td>
              <button type="button" onClick={() => onSources(sources.spec, sources.scope, `${barName(r)} · înregistrările ${monthly ? "lunii" : "anului"}`)}>
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
  facts = null,
  local,
  lens = "value",
}: {
  counties: CountyValue[];
  unknown: MapUnknown;
  spec: AskSpec;
  onSources: (spec: AskSpec, scope?: EvidenceScope, title?: string, opts?: EvidenceOpenOpts) => void;
  /** F5 (map final §3.11): the county facts, for the columns of the card and the lens. */
  facts?: MapFacts | null;
  local?: Extract<BlockData, { block: "map" }>["local"];
  lens?: MapLensValue;
}) {
  const metrics = countyMetrics({ counties, ...(local ? { local } : {}) }, lens, facts);
  const lensColumn = lens === "value_per_capita" ? "Pe locuitor" : lens === "seat" ? "Firme din județ" : lens === "share" ? (spec.filters.adminName ? "Cota firmelor" : "Cota firmei") : null;
  const firm = mapFirm(spec);
  return (
    <div>
    <table className="ask-table cq-exact-table cq-map-table">
      <thead>
        <tr>
          <th>Județ</th>
          <th>Valoare înregistrată</th>
          <th>Înregistrări</th>
          {lensColumn && <th>{lensColumn}</th>}
          {!firm && <th>Cel mai mare cumpărător</th>}
          <th>Cea mai mare înregistrare</th>
          <th>Surse</th>
        </tr>
      </thead>
      <tbody>
        {[...counties]
          .sort((a, b) => b.value - a.value)
          .map((r) => {
            const f = facts?.counties[r.county], m = metrics.get(r.county);
            return (
            <tr key={r.county}>
              <th>{countyName(r.county)}</th>
              <td data-label="Valoare">{formatRonFull(r.value)}</td>
              <td data-label="Înregistrări">{formatInt(r.count)}</td>
              {lensColumn && <td data-label={lensColumn}>{m?.metric !== null && m?.metric !== undefined ? `${metricWords(lens, m.metric)}${m.muted ? " ·" : ""}` : "—"}</td>}
              {!firm && <td data-label="Cel mai mare cumpărător">{f?.buyer ? <><EntityName id={f.buyer.id} role="authority">{f.buyer.name}</EntityName> · {formatShare(f.buyer.value / f.value)}</> : "—"}</td>}
              <td data-label="Cea mai mare înregistrare">{f?.record ? `${formatRon(f.record.value)} · ${formatShare(f.record.value / f.value)}` : "—"}</td>
              <td className="cq-map-src">
                <button
                  type="button"
                  onClick={() =>
                    onSources(spec, { county:r.county }, `${countyName(r.county)} · înregistrările județului`)
                  }
                >
                  Vezi înregistrările →
                </button>
              </td>
            </tr>
            );
          })}
        {unknown.count > 0 && (
          <tr>
            <th>Județ necunoscut</th>
            <td data-label="Valoare">{formatRonFull(unknown.value)}</td>
            <td data-label="Înregistrări">{formatInt(unknown.count)}</td>
            {lensColumn && <td className="cq-map-empty" />}
            {!firm && <td className="cq-map-empty" />}
            <td className="cq-map-empty" />
            <td className="cq-map-src">nu apar pe hartă</td>
          </tr>
        )}
      </tbody>
    </table>
    {lensColumn && metrics.size > 0 && [...metrics.values()].some((m) => m.muted) && <p className="ask-fine">„·”: prea puține înregistrări pentru un procent (gri pe hartă).</p>}
    </div>
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
  facts = null,
  totals,
  perCapita,
  meta,
  sort,
  dir,
  onFetch,
}: {
  rows: TableRow[];
  spec?: unknown;
  /** F5: the facts of the rows shown (use-row-facts.ts), under each name. */
  facts?: Record<string, WinnerFacts> | null;
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
            <Th k="county" label="Județ" tip={(spec as AskSpec | undefined)?.dim === "supplier" ? <Term id="sediul-firmei" tip /> : undefined} />
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
                  countyName(cleanName(r.name))
                )}
                <FactTags tags={[...byNameTag(r), ...(r.entityId && spec ? winnerFactTags(spec as AskSpec, facts?.[r.entityId], undefined, r.value) : [])]} />
              </td>
              <td>{countyName(r.county) ?? "—"}</td>
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

/**
 * Animated loading indicator: three pulsing bars + elapsed seconds once the
 * query stops being instant, so long queries (up to the 20s cap) read as
 * "working", not "stuck". It floats under the header (the kit's FloatStatus place) and shows only once the wait
 * passes 150 ms (`g-float`), so a quick answer never flashes it.
 */
function Loader({ label }: { label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ask-loader g-float" role="status" aria-live="polite">
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
/** The answer's address on the site, with its thread; the copy and share buttons turn it into a short link (/l/…). */
function answerPath(spec: AskSpec, thread: Thread | null): string {
  return `/intreaba?spec=${encodeURIComponent(encodeSpec(spec))}${thread?.steps.length ? `&fir=${encodeURIComponent(writeThread(thread))}` : ""}`;
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
