"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import Term from "@/components/Term";
import { countWords, formatDecimal } from "@/lib/ask/answer-text";
import type { CompareData, CompareEntity, ComparePartner, PartialYear } from "@/lib/ask/compile";
import { readableCpvName } from "@/lib/entity-summary";
import { FLAG_META, criBand } from "@/lib/flags";
import { cleanName, formatInt, formatRon } from "@/lib/format";
import { useAnswerEvidence } from "./AnswerEvidence";
import { useTip } from "./blocks";
import "./compare.css";

/**
 * Two institutions or two firms side by side, on one selection: totals by
 * stream, years, shared counterparties, domains and, for firms, contracts won
 * together. Each card also carries the historical risk profile, labelled as
 * independent of the filters. Answers saved before 24 Oct 2026 lack the extra
 * fields; their cards then show only the totals.
 */
export function CompareBlock({ data, partial = [], dataset = "all" }: { data: CompareData; partial?: PartialYear[]; dataset?: string }) {
  const [a, b] = data.entities;
  if (!a || !b) return <p className="ask-empty">Niciun rezultat.</p>;
  const firms = a.role === "supplier";
  return (
    <div className="cmp">
      <div className="cmp-cards">
        <CompareCard entity={a} side="a" dataset={dataset} />
        <CompareCard entity={b} side="b" dataset={dataset} />
      </div>
      <Years a={a} b={b} partial={partial} />
      {data.shared && <Partners data={data} firms={firms} />}
      <Domains a={a} b={b} firms={firms} />
      {data.joint && data.joint.total > 0 && (
        <section className="cmp-section">
          <h3>Câștigate împreună · {countWords(data.joint.total, "contract", "contracte")} <Term tip title="Câștigate împreună" text="Contracte în care ambele firme sunt printre câștigători: consorții sau acorduri-cadru cu mai mulți furnizori. Suma este cota celor două, nu valoarea întregului contract." /></h3>
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

function CompareCard({ entity: e, side, dataset }: { entity: CompareEntity; side: "a" | "b"; dataset: string }) {
  const evidence = useAnswerEvidence();
  const firms = e.role === "supplier";
  const contracts = e.streams?.contracts;
  const total = (e.streams?.da.value ?? 0) + (contracts?.value ?? 0);
  const active = e.active?.from && e.active.to ? ` · activ ${e.active.from === e.active.to ? e.active.from : `${e.active.from}–${e.active.to}`}` : "";
  return (
    <article className={`cmp-card cmp-${side}`}>
      <h3><Link href={`/entitati/${e.entityId}`}>{cleanName(e.name)}</Link></h3>
      <p className="cmp-sub">{e.county ?? "județ necunoscut"} · {firms ? "furnizor" : "autoritate"}{active}</p>
      <p className="cmp-big">{formatRon(e.value)} <small>{countWords(e.count, "înregistrare", "înregistrări")}</small></p>
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
        {contracts && contracts.count > 0 && contracts.singleBid !== null && (
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
            <dd>{formatInt(e.partners)}</dd>
          </div>
        )}
        {e.firm && (
          <div>
            <dt>Firmă (bilanț MF)</dt>
            <dd>{[e.firm.employees !== null ? `${formatInt(e.firm.employees)} angajați` : null, e.firm.turnover !== null ? `CA ${formatRon(e.firm.turnover)}` : null].filter(Boolean).join(" · ")}{e.firm.year ? ` (${e.firm.year})` : ""}</dd>
          </div>
        )}
        {e.population !== null && e.population > 0 && (
          <div>
            <dt>Lei / locuitor</dt>
            <dd>{formatInt(Math.round(e.value / e.population))}</dd>
          </div>
        )}
      </dl>
      <RiskProfile entity={e} />
      {evidence && (
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

function Years({ a, b, partial }: { a: CompareEntity; b: CompareEntity; partial: PartialYear[] }) {
  const t = useTip();
  const all = [...(a.years ?? []), ...(b.years ?? [])];
  if (all.length === 0) return null;
  const from = Math.min(...all.map((y) => y.year)), to = Math.max(...all.map((y) => y.year));
  if (from === to) return null;
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const value = (e: CompareEntity, year: number) => e.years?.find((y) => y.year === year)?.value ?? 0;
  const max = Math.max(...all.map((y) => y.value), 1);
  const nameA = shortName(a.name), nameB = shortName(b.name);
  return (
    <section className="cmp-section">
      <h3>Pe ani</h3>
      <p className="cmp-key"><span className="cmp-key-a">{nameA}</span><span className="cmp-key-b">{nameB}</span>{partial.length > 0 && <span>hașurat = an acoperit parțial</span>}</p>
      {t.el}
      <div className="cmp-years" style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))`, maxWidth: years.length * 120 }} aria-hidden="true">
        {years.map((year) => {
          const part = partial.some((p) => p.year === year) ? " cmp-part" : "";
          return (
            <div key={year} className="cmp-year" {...t.bind(String(year), `${nameA}: ${formatRon(value(a, year))}`, `${nameB}: ${formatRon(value(b, year))}`)}>
              <div className="cmp-bars">
                <i className={`cmp-bar-a${part}`} style={{ height: `${(value(a, year) / max) * 100}%` }} />
                <i className={`cmp-bar-b${part}`} style={{ height: `${(value(b, year) / max) * 100}%` }} />
              </div>
              <span>{year}{part ? "*" : ""}</span>
            </div>
          );
        })}
      </div>
      {/* A table ignores the 1 px box of .d-sr-only and would widen a phone page. */}
      <div className="d-sr-only"><table>
        <caption>Valoarea pe ani</caption>
        <thead><tr><th scope="col">An</th><th scope="col">{cleanName(a.name)}</th><th scope="col">{cleanName(b.name)}</th></tr></thead>
        <tbody>{years.map((year) => <tr key={year}><th scope="row">{year}</th><td>{formatRon(value(a, year))}</td><td>{formatRon(value(b, year))}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

const SHOWN_SHARED = 6;

function Partners({ data, firms }: { data: CompareData; firms: boolean }) {
  const [all, setAll] = useState(false);
  const [a, b] = data.entities as [CompareEntity, CompareEntity];
  const shared = data.shared!;
  if (shared.total === 0) {
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
  const rows = all ? shared.rows : shared.rows.slice(0, SHOWN_SHARED);
  const max = Math.max(...shared.rows.flatMap((r) => [r.a.value, r.b.value]), 1);
  const width = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 1 : 0)}%`;
  return (
    <section className="cmp-section">
      <h3>{firms ? "Clienți comuni" : "Furnizori comuni"} · {countWords(shared.total, firms ? "instituție" : "firmă", firms ? "instituții" : "firme")}</h3>
      <div className="cmp-mirror">
        <p className="cmp-mirror-head"><span>{shortName(a.name)}</span><span>{firms ? "Instituția" : "Firma"}</span><span>{shortName(b.name)}</span></p>
        {rows.map((row) => (
          <div className="cmp-mirror-row" key={row.entityId}>
            <Link className="cmp-mirror-name" href={`/entitati/${row.entityId}`}>{cleanName(row.name)}</Link>
            <div className="cmp-mirror-a"><span>{formatRon(row.a.value)} · {formatInt(row.a.count)}</span><i style={{ width: width(row.a.value) }} /></div>
            <div className="cmp-mirror-b"><i style={{ width: width(row.b.value) }} /><span>{formatRon(row.b.value)} · {formatInt(row.b.count)}</span></div>
          </div>
        ))}
      </div>
      {shared.rows.length > SHOWN_SHARED && (
        <button type="button" className="cmp-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Arată mai puține" : shared.total > shared.rows.length ? `Arată primele ${shared.rows.length}, după valoare` : `Arată toate cele ${shared.total}`}
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
