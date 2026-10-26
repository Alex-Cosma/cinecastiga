"use client";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import Term from "@/components/Term";
import { countWords, formatDecimal } from "@/lib/ask/answer-text";
import type { CompareData, CompareEntity, ComparePartner, PartialYear } from "@/lib/ask/compile";
import { readableCpvName } from "@/lib/entity-summary";
import { glossaryEntry } from "@/lib/glossary";
import { FLAG_META, criBand } from "@/lib/flags";
import { cleanName, formatInt, formatRon } from "@/lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import { useTip } from "./blocks";
import {
  cardSpan, consortiumWords, generalRow, jointRow, partnersOfWhole, percent, perCapitaShown, seatParts, sharedSubtitle, yearColumns, yearReadout, type YearColumn,
} from "./compare-answer";
import "./compare.css";

/**
 * Two institutions or two firms side by side, on one selection: totals by
 * stream, years, shared counterparties, domains and, for firms, contracts won
 * together. Each card also carries the historical risk profile, labelled as
 * independent of the filters. Answers saved before 24 Oct 2026 lack the extra
 * fields; their cards then show only the totals.
 *
 * F4 (plan §4.6 P8, final compare §3.4, §4): the cards' context rows, each
 * defending a number that would mislead without it (the codes above a
 * domain, the suppliers' seat, "Pe locuitor" between two of one level, the
 * records of a consortium); "Pe ani" with the years before 2018 in one
 * column and a year's figures on a tap; with „Doar clienții comuni” the
 * cards say the selection without P and the part won together, and the
 * mirror is "Pe fiecare client comun". A card without records stays, faded.
 */
export function CompareBlock({ data, partial = [], dataset = "all", shared = false, relax = [], onAllClients }: {
  data: CompareData; partial?: PartialYear[]; dataset?: string;
  /** „Doar clienții comuni” is applied (the answer's spec). */
  shared?: boolean;
  /** Both cards empty: the wider questions (relaxations, at most three). */
  relax?: readonly { label: string; onClick: () => void }[];
  /** The shared clients are none: the same question on every client. */
  onAllClients?: () => void;
}) {
  const [a, b] = data.entities;
  if (!a || !b) return <p className="ask-empty">Niciun rezultat.</p>;
  const firms = a.role === "supplier";
  // Final §5 "Stări goale": no shared client, or no record for either.
  if (shared && data.shared?.total === 0) return <div className="cmp"><div className="cmp-empty" role="status">
    <p>Niciun client comun în selecția aleasă.</p>
    {onAllClients && <div className="cmp-empty-actions"><button type="button" className="qb-link" onClick={onAllClients}>Toți clienții</button></div>}
  </div></div>;
  if (a.count === 0 && b.count === 0) return <div className="cmp"><div className="cmp-empty" role="status">
    <p>Niciuna nu are înregistrări în selecția aleasă.</p>
    {relax.length > 0 && <div className="cmp-empty-actions">{relax.map((r) => <button key={r.label} type="button" className="qb-link" onClick={r.onClick}>{r.label}</button>)}</div>}
  </div></div>;
  const perCapita = perCapitaShown(a, b);
  return (
    <div className="cmp">
      <div className="cmp-cards">
        <CompareCard entity={a} side="a" dataset={dataset} perCapita={perCapita} period={periodOf(a, b)} />
        <CompareCard entity={b} side="b" dataset={dataset} perCapita={perCapita} period={periodOf(a, b)} />
      </div>
      <Years a={a} b={b} partial={partial} />
      {data.shared && <Partners data={data} firms={firms} shared={shared} />}
      <Domains a={a} b={b} firms={firms} />
      {data.joint && data.joint.total > 0 && (
        <section className="cmp-section">
          <h3>Câștigate împreună · {countWords(data.joint.total, "contract", "contracte")} <Term tip title="Câștigate împreună" text="Contracte în care ambele firme sunt printre câștigători: în asociere sau acorduri-cadru cu mai mulți furnizori. Suma este cota celor două, nu valoarea întregului contract." /></h3>
          <ul className="cmp-joint">
            {data.joint.rows.map((row) => (
              <li key={row.nid}>
                <Link href={`/contracte/${row.nid}`}>{cleanName(row.authority ?? "Contract")} →</Link>
                <span>{row.date?.slice(0, 4)} · {formatRon(row.value)}</span>
              </li>
            ))}
          </ul>
          {data.joint.total > data.joint.rows.length && <p className="cmp-none">Primele {data.joint.rows.length}, după valoare.</p>}
        </section>
      )}
    </div>
  );
}

/** "cumulat 2018–2026": the years both cards' sums cover (the selection's, from 2018). */
function periodOf(a: CompareEntity, b: CompareEntity): string | null {
  const spans = [cardSpan(a).years, cardSpan(b).years].filter((s): s is string => Boolean(s));
  if (!spans.length) return null;
  const years = spans.flatMap((s) => s.split("–").map(Number));
  const from = Math.min(...years), to = Math.max(...years);
  return from === to ? String(from) : `${from}–${to}`;
}

/** The card's kind of entity, with the (?) "Doar primăria" on a town hall (final §4.4). */
function RoleWord({ entity: e }: { entity: CompareEntity }) {
  if (e.role === "supplier") return <>furnizor</>;
  if (e.populationLevel === "county") return <>consiliu județean</>;
  if (e.populationLevel === "local") return <Term id="doar-primaria" tip>primărie</Term>;
  return <>autoritate</>;
}

function CompareCard({ entity: e, side, dataset, perCapita, period }: { entity: CompareEntity; side: "a" | "b"; dataset: string; perCapita: boolean; period: string | null }) {
  const evidence = useAnswerEvidence();
  const firms = e.role === "supplier";
  const contracts = e.streams?.contracts;
  const total = (e.streams?.da.value ?? 0) + (contracts?.value ?? 0);
  const span = cardSpan(e);
  const subtitle = sharedSubtitle(e);
  const consortium = consortiumWords(e), joint = jointRow(e), general = generalRow(e), whole = partnersOfWhole(e);
  const seats = e.seats ? seatParts(e.seats) : null;
  const empty = e.count === 0;
  return (
    <article className={`cmp-card cmp-${side}${empty ? " cmp-card-empty" : ""}`}>
      <h3><Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link></h3>
      <p className="cmp-sub">{subtitle ?? <>
        {e.county ?? (firms ? "sediu necunoscut" : "județ necunoscut")} · <RoleWord entity={e} />
        {span.years && ` · ${span.years}`}{span.older > 0 && ` · +${formatInt(span.older)} mai vechi`}
      </>}</p>
      {empty
        ? <p className="cmp-big">0 lei <small>nicio înregistrare aici</small></p>
        // A consortium's records against its contracts in the (?) of the number (final §4.5, §9 compare 5).
        : <p className="cmp-big">{formatRon(e.value)} <small>{countWords(e.count, "înregistrare", "înregistrări")}{consortium && <> <Term tip title={glossaryEntry("inregistrari-consortiu").title} text={`${glossaryEntry("inregistrari-consortiu").text} ${consortium}`} /></>}</small></p>}
      {e.streams && dataset === "all" && total > 0 && (
        <>
          <div className="cmp-split" aria-hidden="true">
            <i style={{ width: `${(contracts!.value / total) * 100}%` }} />
            <i style={{ width: `${(e.streams.da.value / total) * 100}%` }} />
          </div>
          <p className="cmp-legend">
            <span>Proceduri · {formatRon(contracts!.value)} · {formatInt(contracts!.count)}</span>
            <span>Directe · {formatRon(e.streams.da.value)} · {formatInt(e.streams.da.count)}</span>
          </p>
        </>
      )}
      <dl className="cmp-kv">
        {/* On direct acquisitions there are no offers (final §3.3): the row is not drawn. */}
        {dataset !== "da" && contracts && contracts.count > 0 && contracts.singleBid !== null && (
          <div>
            <dt>O singură ofertă <Term id="oferte-cunoscute" tip /></dt>
            <dd>{contracts.bidsKnown > 0
              ? `${formatInt(contracts.singleBid)} din ${formatInt(contracts.bidsKnown)} (${Math.round((contracts.singleBid / contracts.bidsKnown) * 100)}%)`
              : "necunoscut"}</dd>
          </div>
        )}
        {e.partners !== undefined && (
          <div>
            <dt>{firms ? "Instituții client" : "Firme furnizoare"}</dt>
            <dd>{whole ?? formatInt(e.partners)}</dd>
          </div>
        )}
        {joint && (
          <div>
            <dt>Din care câștigate împreună <Term id="clienti-comuni" tip /></dt>
            <dd>{joint}</dd>
          </div>
        )}
        {seats && (
          <div className="cmp-kv-wide">
            <dt>Sediul furnizorilor <Term id="sediu-furnizori" tip /></dt>
            <dd>
              <span className="cmp-seat" aria-hidden="true">
                <i style={{ "--w": `${seats.same * 100}%` } as CSSProperties} />
                <i style={{ "--w": `${seats.other * 100}%` } as CSSProperties} />
                <i style={{ "--w": `${seats.abroad * 100}%` } as CSSProperties} />
              </span>
              <span className="cmp-seat-legend">
                <span>în același județ {percent(seats.same)}</span>
                <span>în alt județ {percent(seats.other)}</span>
                <span>în străinătate {percent(seats.abroad)}</span>
              </span>
            </dd>
          </div>
        )}
        {e.firm && (
          <div>
            <dt>Firmă (bilanț MF)</dt>
            <dd>{[e.firm.employees !== null ? countWords(e.firm.employees, "angajat", "angajați") : null, e.firm.turnover !== null ? `CA ${formatRon(e.firm.turnover)}` : null].filter(Boolean).join(" · ")}{e.firm.year ? ` (${e.firm.year})` : ""}</dd>
          </div>
        )}
        {perCapita && e.population !== null && e.population > 0 && (
          <div>
            <dt>Pe locuitor <Term tip title="Pe locuitor" text="Suma pe toată perioada, nu pe an. Populația RPL 2021; asocierea primărie–UAT e o inferență a aplicației." /></dt>
            <dd>{formatInt(Math.round(e.value / e.population))} lei/locuitor{period && <small>cumulat {period}</small>}</dd>
          </div>
        )}
        {general && (
          <div>
            <dt>Pe coduri mai generale <Term id="coduri-generale" tip /></dt>
            <dd>{general}</dd>
          </div>
        )}
      </dl>
      <RiskProfile entity={e} />
      {evidence && !empty && (
        <button
          type="button"
          className="cq-record-link"
          onClick={() => evidence.open(undefined, { entityIds: [e.entityId], role: firms ? "supplier" : "authority" }, `${cleanName(e.name)} · sursele selecției`)}
        >
          Vezi cele {countWords(e.count, "înregistrare", "înregistrări")} →
        </button>
      )}
    </article>
  );
}

function RiskProfile({ entity: e }: { entity: CompareEntity }) {
  if (e.hasProfile === undefined) return null;
  const scored = e.hasProfile && e.cri !== null && e.cri > 0;
  return (
    <div className={`cmp-risk${scored ? "" : " cmp-risk-none"}`}>
      <p>
        {!e.hasProfile ? "Fără profil de risc: prea puține achiziții directe"
          : scored ? <>Profil de risc <b>{formatDecimal(e.cri!, 2)} · {criBand(e.cri!).label.toLowerCase()}</b> · {countWords(e.nFlags, "semnal", "semnale")}</>
          : <>Profil de risc <b>{formatDecimal(e.cri ?? 0, 2)}</b> · niciun criteriu îndeplinit</>}
        {" "}<Term id="profil-risc" tip />
      </p>
      {e.flags.length > 0 && (
        <div className="cmp-flags">{e.flags.map((flag) => <span key={flag} title={FLAG_META[flag]?.short}>{FLAG_META[flag]?.title ?? flag}</span>)}</div>
      )}
      <small>Tot istoricul de achiziții directe; nu urmează filtrele.</small>
    </div>
  );
}

const shortName = (name: string) => cleanName(name).split(/\s+/).slice(0, 2).join(" ");

/**
 * "Pe ani" (final §4.6): the years before 2018 in one faded column
 * ("înainte de 2018", "<2018" on a phone), the partly covered years hatched;
 * a column is a button whose tap (or hover) says both figures of its year.
 */
function Years({ a, b, partial }: { a: CompareEntity; b: CompareEntity; partial: PartialYear[] }) {
  const t = useTip();
  const [chosen, setChosen] = useState<string | null>(null);
  const columns = yearColumns(a, b);
  if (columns.length === 0) return null;
  const max = Math.max(...columns.flatMap((c) => [c.a.value, c.b.value]), 1);
  const nameA = shortName(a.name), nameB = shortName(b.name);
  const read = (column: YearColumn) => yearReadout(column, { a: nameA, b: nameB });
  const shown = columns.find((c) => c.key === chosen) ?? null;
  return (
    <section className="cmp-section">
      <h3>Pe ani</h3>
      <p className="cmp-key"><span className="cmp-key-a">{nameA}</span><span className="cmp-key-b">{nameB}</span>{partial.length > 0 && <span>hașurat = an acoperit parțial</span>}</p>
      {t.el}
      <div className="cmp-years" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, maxWidth: columns.length * 120 }}>
        {columns.map((column) => {
          const part = !column.older && partial.some((p) => String(p.year) === column.key) ? " cmp-part" : "";
          const [one, two] = read(column);
          return (
            <button key={column.key} type="button" className={`cmp-year${column.older ? " cmp-year-old" : ""}`} aria-pressed={chosen === column.key}
              aria-label={`${column.label}: ${one}; ${two}`} onClick={() => setChosen((current) => current === column.key ? null : column.key)}
              {...t.bind(column.label, one, two)}>
              <span className="cmp-bars" aria-hidden="true">
                <i className={`cmp-bar-a${part}`} style={{ height: `${(column.a.value / max) * 100}%` }} />
                <i className={`cmp-bar-b${part}`} style={{ height: `${(column.b.value / max) * 100}%` }} />
              </span>
              <span className="cmp-year-label" aria-hidden="true"><span className="cmp-long">{column.label}</span><span className="cmp-short">{column.short}</span>{part ? "*" : ""}</span>
            </button>
          );
        })}
      </div>
      {shown && <p className="cmp-year-read" aria-live="polite"><b>{shown.label}</b> {read(shown).map((line) => <span key={line}>{line}</span>)}</p>}
    </section>
  );
}

const SHOWN_SHARED = 6;

function Partners({ data, firms, shared }: { data: CompareData; firms: boolean; shared: boolean }) {
  const [all, setAll] = useState(false);
  const [a, b] = data.entities as [CompareEntity, CompareEntity];
  const both = data.shared!;
  if (both.total === 0) {
    return (
      <section className="cmp-section">
        <h3>{firms ? "Clienți" : "Furnizori"}</h3>
        <p className="cmp-none">{firms ? "Niciun client comun." : "Niciun furnizor comun."}</p>
        <div className="cmp-two">
          <TopPartners entity={a} side="a" firms={firms} />
          <TopPartners entity={b} side="b" firms={firms} />
        </div>
      </section>
    );
  }
  const rows = all ? both.rows : both.rows.slice(0, SHOWN_SHARED);
  const max = Math.max(...both.rows.flatMap((r) => [r.a.value, r.b.value]), 1);
  const width = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 1 : 0)}%`;
  // With P, each bar hatches the part won together (final §3.4): its share of the bar.
  const jointPart = (side: { value: number; joint?: number }) => side.joint && side.value > 0 ? `${Math.min(side.joint / side.value, 1) * 100}%` : null;
  const anyJoint = both.rows.some((r) => (r.a.joint ?? 0) > 0 || (r.b.joint ?? 0) > 0);
  const Bar = ({ side }: { side: { value: number; joint?: number } }) => {
    const part = jointPart(side);
    return <i style={{ width: width(side.value) }}>{part && <b style={{ width: part }} />}</i>;
  };
  return (
    <section className="cmp-section">
      <h3>{shared ? "Pe fiecare client comun" : firms ? "Clienți comuni" : "Furnizori comuni"} · {countWords(both.total, firms ? "instituție" : "firmă", firms ? "instituții" : "firme")}{shared && <> <Term id="clienti-comuni" tip /></>}</h3>
      {shared && anyJoint && <p className="cmp-key"><span className="cmp-key-a">{shortName(a.name)}</span><span className="cmp-key-b">{shortName(b.name)}</span><span className="cmp-key-joint">câștigat împreună</span></p>}
      <div className="cmp-mirror">
        <p className="cmp-mirror-head"><span>{shortName(a.name)}</span><span>{firms ? "Instituția" : "Firma"}</span><span>{shortName(b.name)}</span></p>
        {rows.map((row) => (
          <div className="cmp-mirror-row" key={row.entityId}>
            <Link className="cmp-mirror-name" href={`/entitati/${row.entityId}`}>{cleanName(row.name)}</Link>
            <div className="cmp-mirror-a"><span>{formatRon(row.a.value)} · {formatInt(row.a.count)}</span><Bar side={row.a} /></div>
            <div className="cmp-mirror-b"><Bar side={row.b} /><span>{formatRon(row.b.value)} · {formatInt(row.b.count)}</span></div>
          </div>
        ))}
      </div>
      {both.rows.length > SHOWN_SHARED && (
        <button type="button" className="cmp-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Arată mai puține" : both.total > both.rows.length ? `Arată primele ${both.rows.length}, după valoare` : `Arată toate cele ${both.total}`}
        </button>
      )}
    </section>
  );
}

function TopPartners({ entity: e, side, firms }: { entity: CompareEntity; side: "a" | "b"; firms: boolean }) {
  const rows: ComparePartner[] = e.topPartners ?? [];
  return (
    <div className={`cmp-panel cmp-${side}`}>
      <p className="cmp-panel-head">{cleanName(e.name)}{e.partners !== undefined && ` · ${countWords(e.partners, firms ? "instituție" : "firmă", firms ? "instituții" : "firme")}`}</p>
      {rows.length === 0 ? <p className="cmp-none">Niciunul în selecție.</p> : rows.map((row) => (
        <ShareRow key={row.entityId} label={<Link href={`/entitati/${row.entityId}`}>{cleanName(row.name)}</Link>} value={row.value} total={e.value} detail={countWords(row.count, "înregistrare", "înregistrări")} />
      ))}
      <Link className="cmp-all" href={`/entitati/${e.entityId}#parteneri`}>Toți {firms ? "clienții" : "furnizorii"} →</Link>
    </div>
  );
}

const SHOWN_DOMAINS = 4;

function Domains({ a, b, firms }: { a: CompareEntity; b: CompareEntity; firms: boolean }) {
  const [all, setAll] = useState(false);
  if (!a.domains?.length && !b.domains?.length) return null;
  const more = [a, b].some((e) => (e.domains?.length ?? 0) > SHOWN_DOMAINS);
  return (
    <section className="cmp-section">
      <h3>{firms ? "Ce vinde fiecare" : "Ce cumpără fiecare"}</h3>
      <div className="cmp-two">
        {[a, b].map((e, i) => {
          const shown = (e.domains ?? []).slice(0, all ? undefined : SHOWN_DOMAINS);
          return (
            <div key={e.entityId} className={`cmp-panel cmp-${i === 0 ? "a" : "b"}`}>
              <p className="cmp-panel-head">{cleanName(e.name)}</p>
              {shown.map((d) => (
                <ShareRow key={d.code} label={d.name ? readableCpvName(d.name) : `CPV ${d.code}`} value={d.value} total={e.value} />
              ))}
              <RestRow entity={e} shown={shown} />
            </div>
          );
        })}
      </div>
      {more && (
        <button type="button" className="cmp-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Arată mai puține" : "Vezi toate domeniile"}
        </button>
      )}
    </section>
  );
}

/** The value outside the listed groups, so each panel adds up to 100%. */
function RestRow({ entity: e, shown }: { entity: CompareEntity; shown: NonNullable<CompareEntity["domains"]> }) {
  const listed = shown.reduce((sum, d) => sum + d.value, 0);
  const rest = Math.max(e.value - listed, 0);
  if (e.domainCount === undefined) return null;
  const groups = e.domainCount - shown.length;
  const noCpv = (e.noCpvValue ?? 0) > 0;
  // Unlisted groups always get the line, however small; otherwise only CPV-less value.
  if (groups <= 0 && (!noCpv || rest <= e.value * 0.0005)) return null;
  const label = groups > 0
    ? `Restul · ${countWords(groups, "domeniu", "domenii")}${noCpv ? " și fără cod CPV" : ""}`
    : "Fără cod CPV";
  return <div className="cmp-rest"><ShareRow label={label} value={rest} total={e.value} /></div>;
}

function ShareRow({ label, value, total, detail }: { label: ReactNode; value: number; total: number; detail?: string }) {
  const share = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="cmp-share">
      <p><span className="cmp-share-label">{label}</span><span className="num">{formatRon(value)} · {share < 0.5 ? "<1" : Math.round(share)}%</span></p>
      <div className="cmp-track"><i style={{ width: `${Math.min(share, 100)}%` }} /></div>
      {detail && <small>{detail}</small>}
    </div>
  );
}
