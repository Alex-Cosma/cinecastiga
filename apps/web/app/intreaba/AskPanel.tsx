"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatRon, formatRonFull, formatInt, cleanName } from "@/lib/format";
import { countyMap, foldCounty } from "@/lib/map";
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
import type {
  BlockData as EngineBlockData,
} from "@/lib/ask/compile";
import Builder, { type BuilderSpec } from "./Builder";

import { encodeSpec, decodeSpec } from "@/lib/ask/permalink";

/**
 * Duplicate-fire guard: React dev StrictMode remounts reset in-component refs,
 * so the URL-run effect used to dispatch the same request twice within ~1ms
 * (observed in the request log). Module scope survives the remount; identical
 * requests within the window are dropped — a deliberate re-run seconds later
 * still goes through.
 */
const recentFires = new Map<string, number>();
function dupFire(key: string, windowMs = 1500): boolean {
  const now = Date.now();
  const last = recentFires.get(key);
  recentFires.set(key, now);
  if (recentFires.size > 40) {
    for (const [k, t] of recentFires) if (now - t > 60_000) recentFires.delete(k);
  }
  return last !== undefined && now - last < windowMs;
}

/**
 * The "Întreabă" client panel: natural-language question → /api/ask →
 * answer envelope (pills → caveats → result block → SQL toggle → actions).
 * Bounded output vocabulary: the server only ever returns one of the four
 * block types rendered here.
 */

type BlockData = EngineBlockData;
type TableRow = Extract<BlockData, { block: "table" }>["rows"][number];
type SeriesPoint = Extract<BlockData, { block: "timeseries" }>["series"][number];
type CountyValue = Extract<BlockData, { block: "map" }>["counties"][number];

interface AskResponse {
  ok: boolean;
  error?: string;
  question?: string | null;
  spec?: { measure?: string } & Record<string, unknown>;
  pills?: string[];
  caveats?: string[];
  data?: BlockData;
  displaySql?: string;
  tookMs?: number;
}

interface DrillRow {
  daCode: string | null;
  date: string | null;
  authorityId: string | null;
  authority: string | null;
  supplierId: string | null;
  supplier: string | null;
  county: string | null;
  cpvName: string | null;
  value: number;
  src: "da" | "contracts";
  refId: string | null;
  caNoticeId: string | null;
  tedPubnum: string | null;
  estimatedValueRon?: number | null;
  valueSuspect?: boolean;
}
interface DrillResp {
  ok: boolean;
  error?: string;
  rows?: DrillRow[];
  total?: number;
  page?: number;
  pageSize?: number;
}
interface DrillOpts {
  sort?: string;
  dir?: "asc" | "desc";
  stream?: "da" | "contracts" | undefined;
}

const BLOCK_LABEL_RO: Record<string, string> = {
  table: "clasament",
  stat: "valoare unică",
  timeseries: "evoluție în timp",
  map: "hartă (județe)",
  compare: "comparație",
  distribution: "distribuție + poziție",
  breakdown: "compoziție",
  scatter: "risc vs volum",
  sankey: "fluxul banilor",
  network: "rețea de parteneri",
  entity_card: "profil-superlativ",
  fact_check: "verificare cu dovezi",
  trend: "schimbare între ani",
};

/** Blocks that aggregate da_transactions — mirror of DRILLABLE_BLOCKS server-side. */
const DRILLABLE = new Set([
  "table",
  "stat",
  "timeseries",
  "map",
  "breakdown",
  "sankey",
  "network",
  "fact_check",
  "trend",
]);

const EXAMPLES: { icon: string; q: string }[] = [
  { icon: "📊", q: "Top 10 comune cu cei mai mulți bani pe lemne, pe cap de locuitor" },
  { icon: "🔢", q: "Cât s-a cheltuit total pe medicamente?" },
  { icon: "📈", q: "Evoluția cheltuielilor pe asfaltare, pe ani" },
  { icon: "🗺️", q: "Cheltuiala pe mobilier, pe județe" },
  { icon: "⚖️", q: "Compară Comuna Brăești din Botoșani cu Comuna Dumbrăveni" },
  { icon: "🎯", q: "Cât de riscantă e Comuna Brăești față de restul autorităților?" },
  { icon: "🧩", q: "Din ce se compune cheltuiala publică, pe categorii?" },
  { icon: "🔬", q: "Autorități cu risc mare dar volum mic (outlieri)" },
  { icon: "💸", q: "Urmărește banii Spitalului Județean Vaslui" },
  { icon: "🕸️", q: "Rețeaua de furnizori a Primăriei Cluj-Napoca" },
  { icon: "🏛️", q: "Care e cea mai riscantă comună?" },
  { icon: "✅", q: "A cumpărat Comuna Brăești de la Ligna Prod Com?" },
  { icon: "📉", q: "Cum s-a schimbat cheltuiala pe lemne între 2018 și 2019?" },
];

export type PanelMode = "search" | "ask" | "build";

export default function AskPanel({
  initialMode = "ask",
  withSearch = false,
  centered = false,
}: {
  initialMode?: PanelMode;
  withSearch?: boolean;
  centered?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>(initialMode);
  const [builderInit, setBuilderInit] = useState<BuilderSpec | null>(null);
  const [builderFromAi, setBuilderFromAi] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  const [detail, setDetail] = useState<{
    open: boolean;
    loading: boolean;
    data: DrillResp | null;
    opts: DrillOpts;
  }>({ open: false, loading: false, data: null, opts: {} });
  const ranFromUrl = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(
    async (spec: unknown, page: number, opts: DrillOpts = {}) => {
      if (dupFire(`d:${JSON.stringify({ spec, page, opts })}`)) return;
      setDetail((d) => ({ open: true, loading: true, data: d.data, opts }));
      try {
        const r = await fetch("/api/ask/rows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spec, page, ...opts }),
        });
        setDetail({ open: true, loading: false, data: (await r.json()) as DrillResp, opts });
      } catch (e) {
        setDetail({
          open: true,
          loading: false,
          data: { ok: false, error: `Eroare de rețea: ${String(e)}` },
          opts,
        });
      }
    },
    [],
  );

  const run = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (dupFire(`q:${trimmed}`)) return;
    setLoading(true);
    setResp(null);
    setShowSql(false);
    setDetail({ open: false, loading: false, data: null, opts: {} });
    const url = new URL(window.location.href);
    url.searchParams.set("q", trimmed);
    window.history.replaceState(null, "", url.toString());
    setTableOpts({ page: 0 });
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      setResp((await r.json()) as AskResponse);
    } catch (e) {
      setResp({ ok: false, error: `Eroare de rețea: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  // paged clasament (table without topN): current page/sort, reset per query
  const [tableOpts, setTableOpts] = useState<{
    page: number;
    sort?: string;
    dir?: "asc" | "desc";
  }>({ page: 0 });
  const loadTable = useCallback(
    async (spec: unknown, page: number, sort?: string, dir?: "asc" | "desc") => {
      setTableOpts({ page, ...(sort ? { sort } : {}), ...(dir ? { dir } : {}) });
      setLoading(true);
      try {
        const r = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spec, tablePage: page, tableSort: sort, tableDir: dir }),
        });
        setResp((await r.json()) as AskResponse);
      } catch (e) {
        setResp({ ok: false, error: `Eroare de rețea: ${String(e)}` });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const runSpec = useCallback(async (spec: unknown) => {
    if (dupFire(`s:${JSON.stringify(spec)}`)) return;
    setLoading(true);
    setResp(null);
    setShowSql(false);
    setTableOpts({ page: 0 });
    setDetail({ open: false, loading: false, data: null, opts: {} });
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    url.searchParams.set("spec", encodeSpec(spec));
    window.history.replaceState(null, "", url.toString());
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      setResp((await r.json()) as AskResponse);
    } catch (e) {
      setResp({ ok: false, error: `Eroare de rețea: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ranFromUrl.current) return;
    ranFromUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("q");
    const specUrl = params.get("spec");
    if (fromUrl) {
      setQ(fromUrl);
      setMode("ask");
      void run(fromUrl);
    } else if (specUrl) {
      const spec = decodeSpec(specUrl);
      if (spec) {
        setMode("build");
        setBuilderInit(spec as BuilderSpec);
        void runSpec(spec);
        // deep links from evidence tables (&drill=1): open the rows directly
        if (params.get("drill") === "1") void loadDetail(spec, 0);
      }
    }
  }, [run, runSpec, loadDetail]);

  const perCapita = resp?.spec?.measure === "value_per_capita";

  return (
    <div className={centered ? "ask ask-centered" : "ask"}>
      {toast && (
        <div className="ask-toast" role="status">
          {toast}
        </div>
      )}
      <div className="ask-modes" role="tablist" aria-label="Mod de interogare">
        {withSearch && (
          <button
            type="button"
            role="tab"
            aria-selected={mode === "search"}
            className={mode === "search" ? "on" : ""}
            onClick={() => setMode("search")}
          >
            🔍 Caută
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={mode === "build"}
          className={mode === "build" ? "on" : ""}
          onClick={() => {
            setMode("build");
            setBuilderFromAi(false);
          }}
        >
          🧱 Construiește
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ask"}
          className={mode === "ask" ? "on" : ""}
          onClick={() => setMode("ask")}
        >
          ✨ Întreabă <span className="ask-aibadge">AI</span>
        </button>
      </div>

      {mode === "search" && (
        <>
          <form
            className="ask-box"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) window.location.href = `/cauta?q=${encodeURIComponent(q.trim())}`;
            }}
          >
            <span className="ask-ic" aria-hidden>
              🔍
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="caută o primărie, un consiliu județean, o firmă…"
              aria-label="Caută o entitate"
            />
            <button type="submit">Caută</button>
          </form>
          <p className="ask-hint">
            Caută orice autoritate sau firmă din achizițiile publice — profil complet, cu
            tranzacții, parteneri și semnale de risc.
          </p>
        </>
      )}

      {mode === "ask" && (
        <>
          <form
            className="ask-box"
            onSubmit={(e) => {
              e.preventDefault();
              void run(q);
            }}
          >
            <span className="ask-ic" aria-hidden>
              ✨
            </span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ex: top comune după cheltuiala pe lemne, pe cap de locuitor"
              aria-label="Întrebare"
            />
            <button type="submit" disabled={loading}>
              {loading ? "…" : "Întreabă"}
            </button>
          </form>

          <div className="ask-chips">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.q}
                type="button"
                className="ask-chip"
                onClick={() => {
                  setQ(ex.q);
                  void run(ex.q);
                }}
              >
                {ex.icon} {ex.q}
              </button>
            ))}
          </div>

          <p className="ask-hint">
            Pune o întrebare în limbaj natural. AI-ul o traduce într-o interogare pe datele noastre,
            îți arată ce a înțeles și limitele — tu verifici. Acoperire: achiziții directe 2018–2026.
          </p>
        </>
      )}

      {mode === "build" && (
        <>
          <Builder
            key={builderInit ? encodeSpec(builderInit) : "blank"}
            initial={builderInit}
            fromAi={builderFromAi}
            onRun={(spec) => void runSpec(spec)}
            running={loading}
          />
          <p className="ask-hint">
            Construiește o interogare din opțiuni — fără AI, complet determinist. Același tip de
            rezultat, cu „vezi toate rândurile” la fiecare răspuns.
          </p>
        </>
      )}

      {loading && <Loader label="Interpretez întrebarea și interoghez datele" />}

      {resp && !resp.ok && (
        <div className="ask-result">
          <div className="ask-error">
            {resp.error}
            {resp.caveats?.map((c) => <div key={c} className="ask-error-sub">{c}</div>)}
          </div>
        </div>
      )}

      {resp?.ok && resp.data && (
        <div className="ask-result">
          {resp.question && (
            <div className="ask-r-q">
              <div className="ask-lab">Întrebarea ta</div>
              <div className="ask-q">
                <span>{resp.question}</span>
                <button
                  type="button"
                  className="ask-refine"
                  onClick={() => {
                    setMode("ask");
                    setQ(resp.question ?? "");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    inputRef.current?.focus();
                  }}
                >
                  ✎ rafinează
                </button>
              </div>
            </div>
          )}

          <div className="ask-r-block">
            <div className="ask-lab">Am înțeles</div>
            <div className="ask-pills">
              {(resp.pills ?? []).map((p) => (
                <span key={p} className="ask-pill">
                  {p}
                </span>
              ))}
              <button type="button" className="ask-sqltoggle" onClick={() => setShowSql((s) => !s)}>
                vezi interogarea (avansat) {showSql ? "▴" : "▾"}
              </button>
            </div>
            {showSql && resp.displaySql && (
              <div>
                <div className="ask-sqlfence">
                  ⚠ Interogare afișată pentru transparență — execuția reală e parametrizată, cu
                  plafoane, limite de timp și limite de rânduri aplicate automat.
                </div>
                <pre className="ask-sql">
                  <code>{resp.displaySql}</code>
                </pre>
              </div>
            )}
          </div>

          {(resp.caveats?.length ?? 0) > 0 && (
            // Collapsed by default; auto-open when grounding made a judgement
            // call the user should see (picked one entity among several).
            <details
              className="ask-caveats-d"
              open={resp.caveats!.some((c) => c.includes("am ales"))}
            >
              <summary>ⓘ acoperire &amp; limite ({resp.caveats!.length})</summary>
              <div className="ask-caveats-body">
                {resp.caveats!.map((c) => (
                  <div key={c} className="ask-caveat">
                    {c}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* the answer stays visible; the drill rows open BELOW it */}
          <div className="ask-r-block">
            <div className="ask-lab">
              Rezultat · {BLOCK_LABEL_RO[resp.data.block] ?? resp.data.block}
              {(["compare", "distribution", "scatter", "entity_card"].includes(resp.data.block) ||
                resp.spec?.measure === "value_per_capita") && (
                <>
                  {" "}
                  <Link className="ask-meth" href="/metodologie">
                    · cum se calculează
                  </Link>
                </>
              )}
            </div>
            {resp.data.block === "stat" && <StatBlock stat={resp.data.stat} />}
            {resp.data.block === "table" && (
              <TableBlock
                rows={resp.data.rows}
                spec={resp.spec}
                perCapita={perCapita}
                meta={
                  resp.data.total !== undefined
                    ? {
                        total: resp.data.total,
                        page: resp.data.page ?? 0,
                        pageSize: resp.data.pageSize ?? 25,
                      }
                    : null
                }
                sort={tableOpts.sort}
                dir={tableOpts.dir}
                onFetch={(page, sort, dir) => void loadTable(resp.spec, page, sort, dir)}
              />
            )}
            {resp.data.block === "timeseries" && (
              <SeriesBlock series={resp.data.series} spec={resp.spec} />
            )}
            {resp.data.block === "map" && (
              <MapBlock counties={resp.data.counties} spec={resp.spec} />
            )}
            {resp.data.block === "compare" && <CompareBlock entities={resp.data.entities} />}
            {resp.data.block === "distribution" && (
              <DistributionBlock distribution={resp.data.distribution} spec={resp.spec} />
            )}
            {resp.data.block === "breakdown" && (
              <BreakdownBlock slices={resp.data.slices} other={resp.data.other} spec={resp.spec} />
            )}
            {resp.data.block === "scatter" && <ScatterBlock points={resp.data.points} />}
            {resp.data.block === "sankey" && (
              <SankeyBlock flows={resp.data.flows} focal={resp.data.focal} spec={resp.spec} />
            )}
            {resp.data.block === "network" && (
              <NetworkBlock nodes={resp.data.nodes} focal={resp.data.focal} />
            )}
            {resp.data.block === "entity_card" && <EntityCardBlock card={resp.data.card} />}
            {resp.data.block === "fact_check" && <FactCheckBlock fact={resp.data.fact} />}
            {resp.data.block === "trend" && (
              <TrendBlock rows={resp.data.rowsTrend} yearA={resp.data.yearA} yearB={resp.data.yearB} />
            )}
          </div>

          {detail.open && (
            <div className="ask-r-block">
              <div className="ask-lab">
                Rândurile din spatele răspunsului{" "}
                <button
                  type="button"
                  className="ask-detback"
                  onClick={() => setDetail({ open: false, loading: false, data: null, opts: {} })}
                >
                  ✕ închide
                </button>
              </div>
              {detail.loading && <Loader label="Încarc rândurile" />}
              {detail.data && !detail.data.ok && (
                <p className="ask-error" style={{ padding: 0 }}>{detail.data.error}</p>
              )}
              {detail.data?.ok && detail.data.rows && (
                <DrillView
                  data={detail.data}
                  opts={detail.opts}
                  showStream={!(resp.spec as { dataset?: string } | null)?.dataset}
                  hideCounty={Boolean(
                    (resp.spec as { filters?: { county?: string; uatSiruta?: number } } | null)
                      ?.filters?.county ??
                      (resp.spec as { filters?: { uatSiruta?: number } } | null)?.filters
                        ?.uatSiruta,
                  )}
                  onFetch={(page, opts) => void loadDetail(resp.spec, page, opts)}
                />
              )}
            </div>
          )}

          <div className="ask-r-actions">
            {!detail.open && DRILLABLE.has(resp.data.block) && (
              <button
                type="button"
                className="primary"
                onClick={() => void loadDetail(resp.spec, 0)}
              >
                → vezi toate rândurile
              </button>
            )}
            <button
              type="button"
              disabled={csvBusy}
              onClick={() => {
                if (detail.open) {
                  setCsvBusy(true);
                  void exportRowsCsv(resp.spec, detail.opts).finally(() => setCsvBusy(false));
                } else {
                  exportCsv(resp.data!);
                }
              }}
            >
              {csvBusy ? "⬇ export… (toate rândurile)" : "⬇ export CSV"}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => showToast("Permalink copiat ✓"));
              }}
            >
              🔗 copiază permalink
            </button>
            <button
              type="button"
              onClick={() => {
                const what =
                  resp.question ??
                  (resp.pills ? resp.pills.join(" · ") : BLOCK_LABEL_RO[resp.data!.block]);
                void navigator.clipboard
                  .writeText(
                    `„${what}” — SEAP Transparent, pe baza datelor publice e-licitatie.ro ` +
                      `(achiziții directe 2018–2026). Accesat ${new Date().toLocaleDateString("ro-RO")}. ` +
                      window.location.href,
                  )
                  .then(() => showToast("Citare copiată ✓"));
              }}
            >
              📋 citează
            </button>
            {mode === "ask" && resp.spec && (
              <button
                type="button"
                onClick={() => {
                  setBuilderInit(resp.spec as unknown as BuilderSpec);
                  setBuilderFromAi(true);
                  setMode("build");
                }}
              >
                🧱 ajustează în Construiește
              </button>
            )}
            <span className="ask-took">
              fiecare rezultat → profilul entității (dovadă)
              {resp.tookMs != null ? ` · ${resp.tookMs} ms` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Outbound source links — see memory `seap-deep-links` for the URL patterns. */
function rowLinks(r: DrillRow): { seap: string | null; ted: string | null } {
  const seap =
    r.src === "da"
      ? r.refId
        ? `https://e-licitatie.ro/pub/direct-acquisition/view/${r.refId}`
        : null
      : r.caNoticeId
        ? `https://e-licitatie.ro/pub/notices/ca-notices/view-c/${r.caNoticeId}`
        : null;
  const ted = r.tedPubnum ? `https://ted.europa.eu/en/notice/-/detail/${r.tedPubnum}` : null;
  return { seap, ted };
}

const DRILL_COLS: { key: string; label: string; sortable: boolean; num?: boolean }[] = [
  { key: "date", label: "Dată", sortable: true },
  { key: "src", label: "Tip", sortable: false },
  { key: "authority", label: "Autoritate", sortable: true },
  { key: "supplier", label: "Furnizor", sortable: true },
  { key: "cpv", label: "Ce s-a cumpărat", sortable: true },
  { key: "county", label: "Județ", sortable: true },
  { key: "value", label: "Valoare", sortable: true, num: true },
  { key: "links", label: "Sursa", sortable: false },
];

function DrillView({
  data,
  opts,
  showStream,
  hideCounty,
  onFetch,
}: {
  data: DrillResp;
  opts: DrillOpts;
  showStream: boolean;
  /** County/locality already fixed by the query — the column is redundant. */
  hideCounty: boolean;
  onFetch: (page: number, opts: DrillOpts) => void;
}) {
  const tip = useTip();
  const rows = data.rows ?? [];
  const total = data.total ?? 0;
  const page = data.page ?? 0;
  const pageSize = data.pageSize ?? 10;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sortKey = opts.sort ?? "value";
  const sortDir = opts.dir ?? "desc";
  const sortBy = (key: string) => {
    const dir = sortKey === key ? (sortDir === "desc" ? "asc" : "desc") : key === "value" || key === "date" ? "desc" : "asc";
    onFetch(0, { ...opts, sort: key, dir });
  };
  const setStream = (stream: DrillOpts["stream"]) => onFetch(0, { ...opts, stream });
  const cols = DRILL_COLS.filter(
    (c) =>
      (c.key !== "src" || (showStream && !opts.stream)) && (c.key !== "county" || !hideCounty),
  );
  return (
    <div>
      {tip.el}
      {showStream && (
        <div className="ask-streamtoggle">
          {(
            [
              [undefined, "toate sursele"],
              ["da", "achiziții directe"],
              ["contracts", "contracte"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={l}
              type="button"
              className={opts.stream === v ? "on" : ""}
              onClick={() => setStream(v)}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="ask-detmeta">
        {formatInt(total)} înregistrări
        {showStream && !opts.stream ? " (ambele canale)" : ""} · pagina {page + 1} din{" "}
        {formatInt(pages)}
      </div>
      <div className="ask-tablewrap">
        <table className="ask-table ask-drill">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`col-${c.key}` + (c.num ? " num" : "") + (c.sortable ? " sortable" : "")}
                  onClick={c.sortable ? () => sortBy(c.key) : undefined}
                  title={c.sortable ? "sortează" : undefined}
                >
                  {c.label}
                  {c.sortable && sortKey === c.key ? (sortDir === "desc" ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const { seap, ted } = rowLinks(r);
              return (
                <tr key={`${r.src}-${r.refId ?? i}-${i}`}>
                  <td>{r.date ?? "—"}</td>
                  {showStream && !opts.stream && (
                    <td>
                      <span
                        className={`ask-srctag ${r.src}`}
                        title={
                          r.src === "da"
                            ? "achiziție directă (sub prag)"
                            : "contract din procedură (peste prag)"
                        }
                      >
                        {r.src === "da" ? "directă" : "contract"}
                      </span>
                    </td>
                  )}
                  <td className="clip" {...tip.bindClip(cleanName(r.authority))}>
                    {r.authorityId ? (
                      <Link href={`/entitati/${r.authorityId}`}>{cleanName(r.authority)}</Link>
                    ) : (
                      cleanName(r.authority)
                    )}
                  </td>
                  <td className="clip" {...tip.bindClip(cleanName(r.supplier))}>
                    {r.supplierId ? (
                      <Link href={`/entitati/${r.supplierId}`}>{cleanName(r.supplier)}</Link>
                    ) : (
                      cleanName(r.supplier)
                    )}
                  </td>
                  <td className="clip cpv" {...tip.bindClip(r.cpvName)}>
                    {r.cpvName ?? "—"}
                  </td>
                  {!hideCounty && <td>{r.county ?? "—"}</td>}
                  <td className={`num${r.valueSuspect ? " val-suspect" : ""}`}>
                    {formatRonFull(r.value)}
                    {r.valueSuspect && (
                      <span
                        className="val-warn"
                        {...tip.bind(
                          "valoare implauzibilă",
                          r.estimatedValueRon
                            ? `estimat: ${formatRonFull(r.estimatedValueRon)}`
                            : undefined,
                          (r.estimatedValueRon && r.value < r.estimatedValueRon
                            ? "valoare simbolică — probabil sub-înregistrată (rest de preț unitar sau substituent)"
                            : "probabil eroare de introducere (preț unitar cu separator de mii)") +
                            " — valoarea NU e de încredere în totaluri sau statistici",
                        )}
                      >
                        {" "}
                        ⚠{r.estimatedValueRon ? ` est. ${formatRon(r.estimatedValueRon)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="ask-srclinks">
                    {r.src === "contracts" && r.refId && (
                      <a
                        href={`/contracte/i/${r.refId}`}
                        target="_blank"
                        rel="noopener"
                        title="pagina noastră de detalii a contractului"
                      >
                        detalii→
                      </a>
                    )}
                    {seap && (
                      <a href={seap} target="_blank" rel="noopener noreferrer" title="deschide pe e-licitatie.ro">
                        SEAP↗
                      </a>
                    )}
                    {ted && (
                      <a href={ted} target="_blank" rel="noopener noreferrer" title="deschide pe ted.europa.eu">
                        TED↗
                      </a>
                    )}
                    {!seap && !ted && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ask-pager">
        <button type="button" disabled={page === 0} onClick={() => onFetch(page - 1, opts)}>
          ‹ anterioare
        </button>
        <button type="button" disabled={page + 1 >= pages} onClick={() => onFetch(page + 1, opts)}>
          următoare ›
        </button>
      </div>
    </div>
  );
}

function StatBlock({
  stat,
}: {
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
      <div className="v">{formatRon(stat.value)}</div>
      <div className="d">
        {formatRonFull(stat.value)} · {formatInt(stat.count)} înregistrări
      </div>
      {stat.byStream && (
        <div className="ask-streamsplit">
          {formatRon(da?.value ?? 0)} achiziții directe ({formatInt(da?.count ?? 0)}) +{" "}
          {formatRon(ctr?.value ?? 0)} contracte ({formatInt(ctr?.count ?? 0)})
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
  const rowUrl = (r: TableRow): string | null => {
    const s = (spec ?? {}) as {
      dim?: string;
      dataset?: string;
      filters?: Record<string, unknown>;
    };
    const dim = s.dim ?? "authority";
    let extra: Record<string, unknown>;
    if (dim === "county") extra = { county: r.name };
    else if (dim === "supplier") {
      if (!r.entityId) return null;
      extra = { supplierName: r.name, supplierId: Number(r.entityId) };
    } else {
      if (!r.entityId) return null;
      extra = { authorityName: r.name, authorityId: Number(r.entityId) };
    }
    const next: Record<string, unknown> = {
      block: "stat",
      measure: "value",
      filters: { ...(s.filters ?? {}), ...extra },
    };
    if (s.dataset) next["dataset"] = s.dataset;
    return `/?spec=${encodeURIComponent(encodeSpec(next))}&drill=1`;
  };
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
  const Th = ({ k, label, num }: { k: string; label: string; num?: boolean }) =>
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
  if (rows.length === 0) return <p className="ask-empty">Niciun rezultat pentru aceste filtre.</p>;
  return (
    <div className="ask-tablewrap">
      {paged && (
        <div className="ask-detmeta">
          {formatInt(meta!.total)} entități · pagina {page + 1} din {formatInt(pages)}
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
                  <Link href={`/entitati/${r.entityId}`}>{cleanName(r.name)}</Link>
                ) : (
                  cleanName(r.name)
                )}
              </td>
              <td>{r.county ?? "—"}</td>
              {perCapita && <td className="num">{r.population ? formatInt(r.population) : "—"}</td>}
              {perCapita && (
                <td className="num strong">
                  {r.population ? formatInt(Math.round(r.value / r.population)) : "—"}
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

function SeriesBlock({ series, spec }: { series: SeriesPoint[]; spec: unknown }) {
  const t = useTip();
  // year-bar click → same filters, scoped to that year, drill rows opened
  const yearUrl = (year: number | string): string => {
    const s = (spec ?? {}) as { dataset?: string; filters?: Record<string, unknown> };
    const y = Number(year);
    const next: Record<string, unknown> = {
      block: "stat",
      measure: "value",
      filters: { ...(s.filters ?? {}), yearFrom: y, yearTo: y },
    };
    if (s.dataset) next["dataset"] = s.dataset;
    return `/?spec=${encodeURIComponent(encodeSpec(next))}&drill=1`;
  };
  if (series.length === 0) return <p className="ask-empty">Niciun rezultat.</p>;
  const max = Math.max(...series.map((p) => p.value), 1);
  const peak = series.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <div>
      {t.el}
      <div className="ask-ts">
        {series.map((p) => (
          <a
            key={p.year}
            className="col"
            href={yearUrl(p.year)}
            target="_blank"
            rel="noopener"
            {...t.bind(
              String(p.year),
              formatRonFull(p.value),
              `${formatInt(p.count)} achiziții${p.year === peak.year ? " · vârful seriei" : ""} · click → achizițiile anului`,
            )}
          >
            <div className="cv">{formatRon(p.value)}</div>
            <div
              className={p.year === peak.year ? "bar peak" : "bar"}
              style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
            />
            <div className="cl">{p.year}</div>
          </a>
        ))}
      </div>
      <p className="ask-fine">
        vârful ({peak.year}) este marcat · valori contractate, nu plăți · click pe un an → lista
        achizițiilor lui
      </p>
    </div>
  );
}

const MAP_COLORS = ["#f3ead0", "#e7c98d", "#d99f57", "#c06a3a", "#9a2b1f"];
const MAP_NO_DATA = "#e9e6dd";

function MapBlock({ counties, spec }: { counties: CountyValue[]; spec: unknown }) {
  // county click → same filters, scoped to that county, drill rows opened
  const countyUrl = (label: string): string => {
    const s = (spec ?? {}) as { measure?: string; dataset?: string; filters?: Record<string, unknown> };
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
    byKey.set(k, (byKey.get(k) ?? 0) + c.value);
    cntByKey.set(k, (cntByKey.get(k) ?? 0) + c.count);
  }
  const national = counties.reduce((s, c) => s + c.value, 0);
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
    th.push(values[Math.min(Math.floor((i / MAP_COLORS.length) * values.length), values.length - 1)] ?? 0);
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
              <a key={s.key} href={countyUrl(s.label)} target="_blank" rel="noopener">
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
                <div className="v">{formatRon(tip.value)}</div>
                <div className="s">
                  {formatInt(tip.count)} achiziții
                  {national > 0 && ` · ${((tip.value / national) * 100).toFixed(1)}% din total`}
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
              <td className="num">{formatRon(r.value)}</td>
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
        {label}…
        {secs >= 3 && ` ${secs}s`}
        {secs >= 8 && " — interogare mare, poate dura până la 20s"}
      </span>
    </div>
  );
}

function csvQ(s: string | null | undefined): string {
  return `"${(s ?? "").replaceAll('"', '""')}"`;
}

/**
 * Full-result export: when the drill table is open, the CSV comes from the
 * server with ALL matching rows (same sort/stream as on screen, capped
 * server-side), not just the visible page.
 */
async function exportRowsCsv(spec: unknown, opts: DrillOpts): Promise<void> {
  const r = await fetch("/api/ask/rows/csv", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec, ...opts }),
  });
  if ((r.headers.get("content-type") ?? "").includes("application/json")) {
    const j = (await r.json()) as { error?: string };
    alert(j.error ?? "Exportul a eșuat.");
    return;
  }
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "randuri.csv";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCsv(data: BlockData) {
  let lines: string[];
  switch (data.block) {
    case "table":
      lines = [
        "nume,judet,valoare_lei,achizitii,populatie",
        ...data.rows.map(
          (r) => `${csvQ(r.name)},${csvQ(r.county)},${r.value},${r.count},${r.population ?? ""}`,
        ),
      ];
      break;
    case "timeseries":
      lines = ["an,valoare_lei,achizitii", ...data.series.map((p) => `${p.year},${p.value},${p.count}`)];
      break;
    case "map":
      lines = [
        "judet,valoare_lei,achizitii",
        ...data.counties.map((c) => `${csvQ(c.county)},${c.value},${c.count}`),
      ];
      break;
    case "stat":
      lines = ["valoare_lei,achizitii", `${data.stat.value},${data.stat.count}`];
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
        ...data.slices.map((s2) => `${csvQ(s2.name)},${s2.code},${s2.value},${s2.count}`),
        `"alte categorii",,${data.other.value},${data.other.count}`,
      ];
      break;
    case "scatter":
      lines = [
        "nume,judet,valoare_lei,cri,semnale",
        ...data.points.map((p) => `${csvQ(p.name)},${csvQ(p.county)},${p.value},${p.cri},${p.nFlags}`),
      ];
      break;
    case "sankey":
      lines = [
        "partener,categorie,valoare_lei",
        ...data.flows.map((f) => `${csvQ(f.partner)},${csvQ(f.category)},${f.value}`),
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
        ...data.fact.samples.map((s2) => `${csvQ(s2.daCode)},${csvQ(s2.date)},${csvQ(s2.cpvName)},${s2.value}`),
      ];
      break;
    case "trend":
      lines = [
        `nume,judet,${data.yearA},${data.yearB}`,
        ...data.rowsTrend.map((r) => `${csvQ(r.name)},${csvQ(r.county)},${r.valueA},${r.valueB}`),
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
