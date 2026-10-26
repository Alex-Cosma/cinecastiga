"use client";

import { useId, useState } from "react";
import { countWords, formatShare } from "../../../lib/ask/answer-text";
import { OFFERS_KNOWN_MIN, type MixResult, type MixRow } from "../../../lib/ask/facet-parts";
import { PROCEDURE_WORDS, PURCHASE_KIND_WORDS, VALUE_RANGES, valueWords, type Procedure, type PurchaseKind } from "../../../lib/ask/purchase";
import type { AskSpec } from "../../../lib/ask/spec";
import { formatRon } from "../../../lib/format";
import HelpTip from "../builder/HelpTip";
import Segmented from "../builder/Segmented";
import type { KitTip } from "../builder/kit-types";
import { useAnswerFact } from "./use-answer-fact";

/*
 * „Din care” under a total (plan §4.1, final stat §3.7): the same total by the
 * kind of purchase, the procedure (a direct acquisition is one), the size of
 * the whole purchase and, where at least a fifth of the contracts' value has a
 * known number of offers, the offers. Asked once the number is on screen
 * (part `mix`, use-answer-fact.ts). Each row of the first three tabs is a
 * button, „Doar acestea ›”, that asks the total again with that condition
 * (R8: › is another answer); the offers are only read. A tab whose condition
 * is chosen, or with one row, is not drawn.
 */

export type MixTab = "kind" | "procedure" | "size" | "offers";
const TABS: Record<MixTab, string> = { kind: "Tip", procedure: "Procedură", size: "Mărime", offers: "Concurență" };
const TIPS: Record<MixTab, KitTip> = {
  kind: { title: "Tipul", text: "Tipul vine din codul CPV: 45 lucrări, 50–98 servicii, restul produse." },
  procedure: { title: "Procedura", text: "Procedura declarată în SEAP. Negocierea fără publicare e permisă în cazuri anume: o pistă, nu o abatere." },
  size: { title: "Mărimea achiziției", text: "Valoarea întregului contract sau a achiziției directe, nu cota fiecărui câștigător. Plajele nu sunt praguri legale." },
  offers: { title: "Numărul de oferte", text: "Doar pentru contractele găsite și în TED; achizițiile directe nu au ofertanți. „Nu știm” nu înseamnă fără concurență." },
};
const OFFER_LABELS: Record<string, string> = { one: "O singură ofertă", several: "Mai multe oferte", unknown: "Nu știm" };

/** A row's name in its tab. */
export function mixLabel(tab: MixTab, value: string): string {
  if (tab === "kind") return value === "none" ? "Fără cod CPV" : PURCHASE_KIND_WORDS[value as PurchaseKind]?.label ?? value;
  if (tab === "procedure") return value === "da" ? "Achiziții directe" : PROCEDURE_WORDS[value as Procedure]?.label ?? value;
  if (tab === "size") return VALUE_RANGES[Number(value)]?.label ?? value;
  return OFFER_LABELS[value] ?? value;
}

/**
 * The question after „Doar acestea ›” on a row (the same keys the windows write: purchaseKind, the
 * direct acquisitions or a procedure of the contracts, the range of the size), and its words; null
 * for a row that is no condition (records without a code, the offers).
 */
export function mixOnly(spec: AskSpec, tab: MixTab, value: string): { spec: AskSpec; words: string } | null {
  const filters = { ...spec.filters };
  if (tab === "kind") {
    if (value === "none" || !PURCHASE_KIND_WORDS[value as PurchaseKind]) return null;
    filters.purchaseKind = value as PurchaseKind;
    return { spec: { ...spec, filters }, words: `Doar ${PURCHASE_KIND_WORDS[value as PurchaseKind].noun}` };
  }
  if (tab === "procedure") {
    if (value === "da") return { spec: { ...spec, dataset: "da", filters }, words: "Doar achizițiile directe" };
    if (!PROCEDURE_WORDS[value as Procedure]) return null;
    filters.procedure = value as Procedure;
    return { spec: { ...spec, dataset: "contracts", filters }, words: `Doar ${PROCEDURE_WORDS[value as Procedure].the}` };
  }
  if (tab === "size") {
    const range = VALUE_RANGES[Number(value)];
    if (!range) return null;
    delete filters.purchaseValueMin; delete filters.purchaseValueMax;
    if (range.purchaseValueMin !== undefined) filters.purchaseValueMin = range.purchaseValueMin;
    if (range.purchaseValueMax !== undefined) filters.purchaseValueMax = range.purchaseValueMax;
    return { spec: { ...spec, filters }, words: `Doar cele ${valueWords(range)}` };
  }
  return null;
}

/** The tabs drawn for this question and composition (final stat §3.7 „Se ascunde când”). */
export function mixTabs(spec: AskSpec, mix: Pick<MixResult, "kind" | "procedure" | "size" | "offers">): MixTab[] {
  const f = spec.filters, da = spec.dataset === "da";
  const tabs: MixTab[] = [];
  if (!f.purchaseKind && mix.kind.filter((r) => r.value !== "none").length > 1) tabs.push("kind");
  if (!f.procedure && !da && mix.procedure.length > 1) tabs.push("procedure");
  if (f.purchaseValueMin === undefined && f.purchaseValueMax === undefined && mix.size.length > 1) tabs.push("size");
  if (!da && mix.offers && mix.offers.known >= OFFERS_KNOWN_MIN) tabs.push("offers");
  return tabs;
}

export default function StatMix({ spec, onOnly }: { spec: AskSpec; onOnly: (next: AskSpec, words: string) => void }) {
  const fact = useAnswerFact(spec, "mix");
  const base = useId();
  const [chosen, setChosen] = useState<MixTab | null>(null);
  if (fact.status === "loading") return <section className="qb qb-mix is-loading" aria-label="Din care" aria-busy="true">
    <p className="qb-mix-head">Din care</p>
    {[0, 1, 2].map((i) => <div key={i} className="qb-mix-skel" aria-hidden="true" />)}
  </section>;
  if (fact.status === "none") return <section className="qb qb-mix" aria-label="Din care">
    <p className="qb-mix-head qb-tipwrap">Din care: {fact.precompute ? "nu e calculat pe această selecție" : "nu a putut fi calculat acum"}
      {fact.precompute && <> <HelpTip tip={{ title: "Din care", text: "Pe toată țara, cu un domeniu, cu angajați sau cu o mărime aleasă de mână, compoziția cere un calcul pregătit noaptea. Cifra de mai sus e completă." }} /></>}</p>
  </section>;
  const mix = fact.value;
  const tabs = mixTabs(spec, mix);
  if (!tabs.length) return null;
  const tab = chosen && tabs.includes(chosen) ? chosen : tabs[0]!;
  const rows: readonly MixRow[] = tab === "offers" ? mix.offers!.rows : mix[tab];
  const contracts = mix.procedure.filter((r) => r.value !== "da").reduce((t, r) => t + r.value_ron, 0);
  return <section className="qb qb-mix" aria-label="Din care">
    <div className="qb-mix-top">
      <span className="qb-mix-head">Din care</span>
      {tabs.length === 1 && <span className="qb-mix-head">· {TABS[tab]}</span>}
      <HelpTip tip={TIPS[tab]} />
      {tabs.length > 1 && <Segmented label="Din care" mode="tabs" size="sm" value={tab} onChange={(value) => setChosen(value as MixTab)}
        options={tabs.map((t) => ({ value: t, label: TABS[t], controls: `${base}-p` }))} />}
    </div>
    <div id={`${base}-p`} role="tabpanel" aria-label={TABS[tab]}>
      <div className="qb-mix-bar" aria-hidden="true">
        {rows.map((row, i) => <i key={row.value} className={`qb-mix-seg qb-mix-seg--${tab === "offers" && row.value === "unknown" ? "unknown" : i % 4}`} style={{ width: `${row.share * 100}%` }} />)}
      </div>
      <ul className="qb-mix-rows">
        {rows.map((row) => {
          const only = tab === "offers" ? null : mixOnly(spec, tab, row.value);
          const body = <>
            <span className="qb-mix-l">{mixLabel(tab, row.value)}</span>
            <span className="qb-mix-n">{countWords(row.n, "înregistrare", "înregistrări")} · {formatRon(row.value_ron)} · <b className="qb-num">{formatShare(row.share)}</b></span>
          </>;
          return <li key={row.value}>
            {only ? <button type="button" className="qb-mix-row" aria-label={`${only.words}: ${mixLabel(tab, row.value)}, ${formatShare(row.share)}`} onClick={() => onOnly(only.spec, only.words)}>
              {body}<span className="qb-mix-only" aria-hidden="true">Doar acestea<span className="qb-glyph">›</span></span>
            </button> : <div className={`qb-mix-row is-read${row.value === "unknown" ? " is-unknown" : ""}`}>{body}</div>}
          </li>;
        })}
      </ul>
      {tab === "procedure" && !tabs.includes("offers") && mix.offers && contracts > 0 && <p className="qb-mix-foot qb-tipwrap">
        Oferte cunoscute: {formatShare(mix.offers.known)} din valoarea contractelor <HelpTip tip={TIPS.offers} />
      </p>}
    </div>
  </section>;
}
