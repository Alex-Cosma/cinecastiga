"use client";

import { countyName } from "../../lib/counties";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { EntityCardData } from "../../lib/ask/compile";
import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { leadOverSecond, podiumRest, type Podium, type PodiumFact, type Ties } from "../../lib/ask/entity-card-shared";
import { retarget } from "../../lib/ask/filters/retarget";
import { employeesWords } from "../../lib/ask/filters/words";
import { FLAG_META, flagLabel } from "../../lib/flags";
import { askLink, leaderAlone, leaderAloneSpecs } from "../../lib/ask/source-spec";
import type { QuestionSpec } from "../../lib/ask/question-ui";
import type { AskSpec } from "../../lib/ask/spec";
import { cleanName, formatInt, formatRon, formatRonFull } from "../../lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import AnswerRow, { AnswerList } from "./answer/AnswerRow";
import KitLink, { recordsWords } from "./answer/KitLink";
import { focusFirstNew } from "./answer/ListFoot";
import { FactTag, type RowFact } from "./answer/RowFacts";
import RowMenu from "./answer/RowMenu";
import { entityRowActions } from "./answer/row-actions";
import TotalLine from "./answer/TotalLine";
import { useAnswerFact } from "./answer/use-answer-fact";
import HelpTip from "./builder/HelpTip";
import {
  categoryLead, largestWords, leadWords, placeFacts, placeWords, restWords, riskCloudLink, shareWords, tieFacts, tiePlace, tiesHeadline, tiesNoneSources, tiesRest,
  tiesShown, totalLead,
} from "./entity-card-answer";
import "./entity-card.css";

/*
 * "Cine conduce?" (entity_card-2, plan §4.13, final entity_card §3.9–§3.10, frames C, E, F).
 * By value: place 1 with its three figures, its tags (the part in joint contracts, a single large record, the band
 * of CÂȘTIGĂTORII it was chosen under), the distance from place 2, the bar of places 1–3 against the total, places 2
 * and 3 as rows, the total line, then "Vezi cele N înregistrări →" and "Tot clasamentul ›". The facts of the places
 * are asked once the podium is drawn (part `podium`): "…" until they come. On the index: the group at the top, never
 * one name chosen among the tied, in the order of value ("Indicele nu le deosebește"), "Arată toate cele 14" and
 * "Pe harta riscului ›". A group of one (a county council) and an answer stored before entity_card-2 keep their
 * own, older, forms. Signals are leads, not proof; recorded values, not payments.
 */

type Data = { card: EntityCardData; podium?: Podium; ties?: Ties };


export default function EntityCardAnswer({ data, spec, historical = true, conditions = [] }: { data: Data; spec?: QuestionSpec; historical?: boolean; conditions?: readonly string[] }) {
  const { card } = data;
  const alone = spec ? leaderAlone(spec) : null;
  if (alone && spec) {
    const { peers, total } = leaderAloneSpecs(spec, card);
    return (
      <div className="qb qb-empty ask-alone">
        <p>{alone}</p>
        <h3><Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link></h3>
        <div className="qb-relax">
          <KitLink className="qb-relax-link" link={{ label: "Unde se situează față de celelalte", glyph: "›", href: askLink(peers) }} />
          <KitLink className="qb-relax-link" link={{ label: "Cât cumpără", glyph: "›", href: askLink(total) }} />
        </div>
      </div>
    );
  }
  if (data.podium && spec) return <PodiumAnswer podium={data.podium} spec={spec} conditions={conditions} />;
  if (data.ties && spec) return <TiesAnswer ties={data.ties} spec={spec} />;
  return <LegacyCard card={card} historical={historical} spec={spec} />;
}

/* ── by value ───────────────────────────────────────────────────────────── */

function PodiumAnswer({ podium, spec, conditions }: { podium: Podium; spec: QuestionSpec; conditions: readonly string[] }) {
  const evidence = useAnswerEvidence();
  const ids = podium.places.map((place) => place.entityId);
  const loaded = useAnswerFact(spec as unknown as AskSpec, "podium", ids);
  const facts = loaded.status === "ready" ? new Map<string, PodiumFact>(loaded.value.places.map((fact) => [fact.entityId, fact])) : null;
  // The data's latest filing year: an older balance sheet is amber against it (an answer kept before it: none is).
  const balanceYear = loaded.status === "ready" ? loaded.value.balanceYear ?? null : null;
  const [first, ...others] = podium.places;
  if (!first) return null;
  const role = spec.dim === "supplier" ? "supplier" as const : "authority" as const;
  const total = totalLead(podium, spec), rest = podiumRest(podium), lead = leadOverSecond(podium);
  const open = (place: { entityId: string; name: string }) => evidence
    ? () => evidence.open(undefined, { entityIds: [place.entityId], role }, `${cleanName(place.name)} · achizițiile selectate`) : undefined;
  const menu = (place: { entityId: string; name: string }, index: number) => {
    const entity = { id: place.entityId, name: cleanName(place.name) };
    const records = open(place);
    return evidence?.exclude
      ? entityRowActions(spec as unknown as AskSpec, entity, { ...(records ? { records } : {}), exclude: () => evidence.exclude!(entity, index) }) : [];
  };
  // „Tot clasamentul ›”: the same question as a ranking, every condition as it is (retarget keeps what the ranking applies).
  const ranking = retarget(spec, "table");
  ranking.topN = 10;
  delete ranking.rankBy;
  const stack = podium.total && podium.total.value > 0 ? podium.places.map((place) => place.value / podium.total!.value) : null;
  const firstFact = facts?.get(first.entityId);
  const tags = placeFacts(first, firstFact, spec, balanceYear);
  const largest = largestWords(firstFact);
  const actions = menu(first, 0);
  return (
    <div className="qb ec">
      <div className="ec-winner">
        <span className="ec-medal" aria-hidden="true">1</span>
        <div className="ec-winner-body">
          <div className="ec-head" data-qb-arow="">
            <h3 className="ec-name"><Link href={`/entitati/${first.entityId}`}>{cleanName(first.name)}</Link></h3>
            {actions.length > 0 && <span className="qb cq-rank-menu"><RowMenu name={cleanName(first.name)} actions={actions} /></span>}
          </div>
          <p className="ec-meta">{placeWords(first, spec)}</p>
          <div className="ec-kpis">
            <div className="ec-kpi"><b className="num">{formatRon(first.value)}</b><span>valoare înregistrată</span></div>
            {podium.total && <div className="ec-kpi"><b className="num">{shareWords(first, podium)}</b><span>{podium.selection ? "din categorie" : "din total"}</span></div>}
            <div className="ec-kpi"><b className="num">{formatInt(first.count)}</b><span>înregistrări</span></div>
          </div>
          <div className="ec-facts" aria-live="polite">
            <PlaceTags tags={tags} loading={loaded.status === "loading"} />
            {largest && <span>Cea mai mare înregistrare: <b className="num">{largest}</b></span>}
          </div>
          {lead !== null && <p className="ec-lead">Diferența față de locul 2: <b className="num">{leadWords(lead)}</b> <HelpTip tip={{ id: "diferenta-locul-doi" }} /></p>}
        </div>
      </div>
      {stack && (
        <>
          <div className="ec-stack" role="img" aria-label={`Locurile 1–3: ${podium.places.map((place, i) => `${i + 1}, ${formatShare(stack[i]!)}`).join("; ")}${rest ? `; ${restWords(rest, spec)}` : ""}`}>
            {stack.map((share, i) => <i key={podium.places[i]!.entityId} className={`ec-seg ec-seg-${i + 1}`} style={{ width: `${share * 100}%` }} />)}
          </div>
          <p className="ec-legend" aria-hidden="true">
            {podium.places.map((place, i) => <span key={place.entityId}><b className={`ec-sw ec-seg-${i + 1}`} />locul {i + 1}</span>)}
            {rest && <span><b className="ec-sw ec-sw-rest" />{restWords(rest, spec)}</span>}
          </p>
        </>
      )}
      {others.length > 0 && (
        <AnswerList label="Locurile 2 și 3">
          {others.map((place, i) => {
            const records = open(place);
            return <AnswerRow
              key={place.entityId}
              name={`${i + 2}. ${cleanName(place.name)}`}
              place={placeWords(place, spec).replace(/^(Firmă|Instituție) · /, "")}
              facts={placeFacts(place, facts?.get(place.entityId), spec, balanceYear)}
              value={formatRon(place.value)}
              {...(shareWords(place, podium) ? { share: shareWords(place, podium)! } : {})}
              {...(records ? { records: { label: recordsWords(place.count), onClick: records } } : {})}
              actions={menu(place, i + 1)}
            />;
          })}
        </AnswerList>
      )}
      {total && podium.total && (
        <div className="qb ec-total"><TotalLine conditions={conditions}>
          {podium.selection
            ? <>{categoryLead(podium, spec)}: <span className="qb-num">{formatRonFull(podium.total.value)}</span>, {formatShare(podium.total.value / podium.selection.value)} din <span className="qb-num">{formatRonFull(podium.selection.value)}</span></>
            : <>Din <span className="qb-num">{total.value}</span>{total.link}{total.who}</>}
        </TotalLine></div>
      )}
      <div className="ec-actions">
        {evidence && <button type="button" className="qb-secondary" onClick={open(first)}>
          {first.count === 1 ? "Vezi înregistrarea" : `Vezi cele ${recordsWords(first.count)}`}<span className="qb-glyph" aria-hidden="true">→</span>
        </button>}
        <KitLink className="qb-secondary" link={{ label: "Tot clasamentul", glyph: "›", href: askLink(ranking) }} />
      </div>
    </div>
  );
}

function PlaceTags({ tags, loading }: { tags: readonly RowFact[]; loading: boolean }) {
  if (!tags.length) return loading ? <span className="ec-wait" aria-label="Se încarcă faptele">…</span> : null;
  return <>{tags.map((tag, index) => <FactTag key={`${index}:${tag.text}`} fact={tag} />)}</>;
}

/* ── the index ──────────────────────────────────────────────────────────── */

function Level({ n, of }: { n: number; of: number }) {
  return <span className="ec-level" role="img" aria-label={`${countWords(n, "semnal", "semnale")} din ${of}`}>
    {Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? "on" : undefined} />)}
  </span>;
}

function TiesAnswer({ ties, spec }: { ties: Ties; spec: QuestionSpec }) {
  const evidence = useAnswerEvidence();
  const [all, setAll] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const head = tiesHeadline(ties, spec);
  // The kicker names the list (final §4, „Accesibilitate”): one id per answer, two answers on a page never share it.
  const kickerId = `${useId()}-kicker`;
  const { rows, hidden } = tiesShown(ties, all);
  const role = spec.dim === "supplier" ? "supplier" as const : "authority" as const;
  const open = (row: { entityId: string; name: string }) => evidence
    ? () => evidence.open(undefined, { entityIds: [row.entityId], role }, `${cleanName(row.name)} · înregistrările profilului`) : undefined;
  // „Pe harta riscului ›”: the same group of profiles as the risk cloud (the cloud applies the county, the seat and the
  // kind; a band of employees is left out, with its (?)).
  const cloud = riskCloudLink(spec);
  const rest = tiesRest(ties, hidden);
  return (
    <div className="qb ec">
      <div className="ec-ties-head">
        {head.kicker && <p className="ec-kicker" id={kickerId}>
          {head.kicker}{head.notDistinct && <> <HelpTip tip={{ id: "indice-egalitate" }} /></>}
        </p>}
        {head.none ? <>
          <p className="ec-ties-text">{head.lead}.</p>
          {/* The sources and the CSV still hold the first profiles by value (runRows): said, never silent. */}
          {ties.rows.length > 0 && <p className="ec-rest">{tiesNoneSources(ties)}</p>}
        </> : head.lead ? (
          <p className="ec-ties-text">
            <b>{head.lead}</b>, <b className="num">{head.level}</b> <Level n={ties.maxFlags} of={ties.criteria} /> {head.signals}.
          </p>
        ) : (
          <p className="ec-ties-text"><b className="num">{head.level}</b> <Level n={ties.maxFlags} of={ties.criteria} /> {head.signals}.{head.next && <> {head.next}</>}</p>
        )}
      </div>
      {!head.none && (
        <>
          {ties.count > 1 && <p className="ec-order">În ordinea valorii, nu a riscului <HelpTip tip={{ id: "ordinea-valorii" }} /></p>}
          <AnswerList label="Profilurile cu cel mai ridicat indice" listRef={list} {...(head.kicker ? { describedBy: kickerId } : {})}>
            {rows.map((row) => {
              const records = open(row);
              const entity = { id: row.entityId, name: cleanName(row.name) };
              const actions = entityRowActions(spec as unknown as AskSpec, entity, { ...(records ? { records } : {}) });
              return <AnswerRow
                key={row.entityId}
                name={entity.name}
                place={tiePlace(row)}
                facts={tieFacts(row, spec)}
                value={formatRon(row.value)}
                actions={actions}
              />;
            })}
          </AnswerList>
          {rest && <p className="ec-rest">{rest}</p>}
        </>
      )}
      <div className="ec-actions">
        {!head.none && ties.rows.length > rows.length && (
          <button type="button" className="qb-more-btn" onClick={() => { setAll(true); requestAnimationFrame(() => focusFirstNew(list.current, rows.length)); }}>
            {ties.rows.length === ties.count ? `Arată toate cele ${formatInt(ties.count)}` : `Arată primele ${formatInt(ties.rows.length)}`}
          </button>
        )}
        {cloud.tip ? (
          <span className="ec-cloud qb-tipwrap-sm">
            <KitLink className="qb-secondary" link={{ label: "Pe harta riscului", glyph: "›", href: askLink(cloud.spec) }} />
            <HelpTip tip={{ title: "Pe harta riscului", text: cloud.tip }} />
          </span>
        ) : <KitLink className="qb-secondary" link={{ label: "Pe harta riscului", glyph: "›", href: askLink(cloud.spec) }} />}
      </div>
      <p className="ec-meth">Semnal statistic, nu dovadă de neregulă · <Link href="/metodologie">Cum se calculează</Link></p>
    </div>
  );
}

/* ── an answer stored before entity_card-2 ──────────────────────────────── */

/** The bands such an answer showed (the index before rf-2026.18): it stays as captured. */
function legacyBand(cri: number): string {
  return cri >= 0.6 ? "Ridicat" : cri >= 0.3 ? "Mediu" : cri > 0 ? "Scăzut" : "Niciun criteriu îndeplinit";
}

function LegacyCard({ card, historical, spec }: { card: EntityCardData; historical: boolean; spec?: QuestionSpec | undefined }) {
  const evidence = useAnswerEvidence();
  const band = card.cri !== null ? legacyBand(card.cri) : null;
  // P7 on place 1 by value (F4, plan §4.13): its records, "Scoate din calcul" (the next one is crowned), its page.
  const records = evidence ? () => evidence.open(undefined, { entityIds: [card.entityId], role: card.role === "supplier" ? "supplier" : "authority" },
    `${cleanName(card.name)} · ${historical ? "înregistrările profilului" : "achizițiile selectate"}`) : undefined;
  const entity = { id: card.entityId, name: cleanName(card.name) };
  const actions = !historical && spec && evidence?.exclude
    ? entityRowActions(spec as unknown as AskSpec, entity, { ...(records ? { records } : {}), exclude: () => evidence.exclude!(entity, 0) }) : [];
  return (
    <div className="ask-ecard">
      {actions.length ? <div className="ask-ecard-head" data-qb-arow="">
        <h3><Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link></h3>
        <span className="qb cq-rank-menu"><RowMenu name={entity.name} actions={actions} /></span>
      </div> : <h3>
        <Link href={`/entitati/${card.entityId}`}>{cleanName(card.name)}</Link>
      </h3>}
      <div className="badges">
        <span className="badge">{card.role === "authority" ? "Autoritate" : "Furnizor"}</span>
        {card.county && <span className="badge">{countyName(card.county)}</span>}
        {card.population !== null && card.population > 0 && <span className="badge">{countWords(card.population, "locuitor", "locuitori")}</span>}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="v num">{formatRon(card.value)}</div>
          <div className="l">{historical ? "valoare înregistrată în profil" : "valoarea achizițiilor selectate"}</div>
        </div>
        <div className="kpi">
          <div className="v num">{formatInt(card.count)}</div>
          <div className="l">înregistrări</div>
        </div>
        {historical && <div className="kpi">
          <div className="v num risk">{card.cri !== null ? formatDecimal(card.cri, 2) : "—"}</div>
          <div className="l">indice risc{band ? ` · ${band}` : ""}</div>
        </div>}
        {historical && <div className="kpi">
          <div className="v num risk">{card.nFlags}</div>
          <div className="l">semnale</div>
        </div>}
      </div>
      {evidence && (
        <button type="button" className="cq-record-link" onClick={records}>
          {card.count === 1 ? "Vezi înregistrarea →" : `Vezi cele ${recordsWords(card.count)} →`}
        </button>
      )}
      {card.flags.length > 0 && (
        <div className="ask-fchips">
          {card.flags.map((f) => <span key={f} className="ask-fchip" title={FLAG_META[f]?.short}>{flagLabel(f)}</span>)}
        </div>
      )}
      {historical && <p className="ask-methnote">
        Indicele de risc (CRI) e un semnal statistic, nu o dovadă de neregulă —{" "}
        <Link href="/metodologie">cum se calculează</Link>.
      </p>}
    </div>
  );
}
