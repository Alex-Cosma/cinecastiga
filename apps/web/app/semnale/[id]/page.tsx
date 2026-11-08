import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import SourceEvidenceView from "@/components/SourceEvidenceView";
import Term from "@/components/Term";
import FirmCard from "@/components/record/FirmCard";
import { LinkList, RecordHead, RecordPage, RecordSection, ShareList, Sources, type RecordValue, type Source } from "@/components/record/Record";
import { countWords } from "@/lib/ask/answer-text";
import { awardUrl } from "@/lib/elicitatie";
import { FLAG_META, FLAG_ORDER, flagFindingLabel, flagLabel } from "@/lib/flags";
import { cleanName, countyLabel, formatExactDecimal, formatRon } from "@/lib/format";
import { tedNoticeUrl } from "@/lib/record-context";
import { procedureLabel } from "@/lib/record-labels";
import { awardValueLabel, noticeContractsNote, riskEvidenceLine, signalPeriodLabel, singleBidValueNote } from "@/lib/risk-presentation";
import { readCaseTarget } from "@/lib/signal-case";
import { caseUnitWords } from "@/lib/signal-case-words";
import { readSignalPageData, type SignalPageData } from "@/lib/signal-page";
import { joinWords, partyShares, ratioNumber, shareWords } from "@/lib/signal-page-words";
import { parseSignalState, signalUrl } from "@/lib/signals-shared";
import { groupSourceRecords } from "@/lib/source-groups";

/*
 * One signal on the record template (owner, 7 November 2026): the head is the finding (who, how much, against what),
 * then what the finding is made of (the suppliers' shares, the firm's balance sheets), the records that triggered it,
 * the entity's other signals, why it is not proof, and the sources. The direct-acquisition patterns open on their
 * entity's case page instead. A signal is a lead to check, not proof; values are recorded, not payments.
 */

export const dynamic = "force-dynamic";

const caseTarget = cache((id: string) => readCaseTarget(id).catch(() => null));
const pageData = cache((id: string, page: number) => readSignalPageData(id, page));
const pageOf = (p: string | undefined) => { const n = Number(p ?? 0); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }>;
}): Promise<Metadata> {
  const [{ id }, { p }] = await Promise.all([params, searchParams]);
  if (await caseTarget(id)) return {};
  const d = await pageData(id, pageOf(p)).catch(() => null);
  if (!d) return { title: "Semnal negăsit" };
  const who = d.code === "net_shared_admin" && d.partner ? d.partner.name : d.entity?.name;
  return { title: `${flagFindingLabel(d.code)} · ${cleanName(who) || "semnal"}`, description: FLAG_META[d.code]?.short };
}

/** An exact decimal from the evidence (a string, or a JSON number that is one), else null. */
function decimalOf(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return /^-?\d+(\.\d+)?$/.test(text) ? text : null;
}
const numOf = (value: unknown): number | null => { const d = decimalOf(value); return d === null ? null : Number(d); };
const lei = (value: unknown) => { const d = decimalOf(value); return d === null ? "valoare necunoscută" : `${formatExactDecimal(d)} lei`; };
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const Party = ({ party, role }: { party: { id: string | null; name: string } | null | undefined; role: "authority" | "supplier" }) =>
  party ? <EntityName id={party.id} role={role}>{cleanName(party.name) || "(fără nume)"}</EntityName> : <span>{role === "authority" ? "o instituție neidentificată" : "o firmă neidentificată"}</span>;

/** Distinct winners of a selection's records, in their order. */
function winnersOf(d: SignalPageData): { id: string | null; name: string }[] {
  const seen = new Map<string, { id: string | null; name: string }>();
  for (const r of d.source.records) {
    const key = r.supplierId ?? r.supplier ?? "";
    if (key && !seen.has(key)) seen.set(key, { id: r.supplierId, name: r.supplier ?? "" });
  }
  return [...seen.values()];
}

interface Head { title: ReactNode; lot?: string | null; parties?: ReactNode; value?: RecordValue | null; meta?: ReactNode[] }

/** The finding with its key number against its reference, per signal. */
function headOf(d: SignalPageData): Head {
  const e = d.evidence;
  const entity = d.entity ? <Party party={d.entity} role={d.entity.role} /> : null;
  const contracts = groupSourceRecords(d.source.records).length;
  const winners = winnersOf(d);
  const winnerNames = winners.length ? joinWords(winners.map((w, i) => <Party key={i} party={w} role="supplier" />)) : ["un câștigător neprecizat"];
  switch (d.code) {
    case "award_concentration": {
      const shares = partyShares(d.source.records, "supplier"), top = shares[0];
      if (!top) break;
      return {
        title: <>{cap(shareWords(top.share))} din valoarea contractelor instituției e la o singură firmă: <Party party={top} role="supplier" /></>,
        parties: <>{entity} · {countWords(shares.length, "furnizor", "furnizori")} cu contracte prin proceduri</>,
        value: { amount: cap(shareWords(top.share)), label: "din valoarea contractelor prin proceduri", notes: [<>{lei(top.valueExact)} din {lei(d.source.totalExact)}</>] },
      };
    }
    case "award_dependence": {
      const shares = partyShares(d.source.records, "authority"), top = shares[0];
      if (!top) break;
      return {
        title: <>{cap(shareWords(top.share))} din valoarea contractelor firmei vin de la o singură instituție: <Party party={top} role="authority" /></>,
        parties: <>{entity} · contracte cu {countWords(shares.length, "instituție", "instituții")}</>,
        value: { amount: cap(shareWords(top.share)), label: "din valoarea contractelor firmei, prin proceduri", notes: [<>{lei(top.valueExact)} din {lei(d.source.totalExact)}</>] },
      };
    }
    case "award_single_bid":
    case "award_no_competition": {
      const note = singleBidValueNote(e).trim();
      const framework = e.notice_contracts && e.notice_contracts !== "contract" ? noticeContractsNote(e).trim() : "";
      return {
        title: d.code === "award_single_bid"
          ? <>{contracts ? countWords(contracts, "contract atribuit", "contracte atribuite") : "Contracte atribuite"} cu o singură ofertă <Term tip id="concurenta-oferte" /></>
          : <>{contracts ? countWords(contracts, "contract atribuit", "contracte atribuite") : "Atribuire"} fără anunț prealabil <Term tip id="procedura" /></>,
        lot: d.award?.title ? cleanName(d.award.title) : null,
        parties: <>{entity ?? "Instituția"} a contractat cu {winnerNames}</>,
        // The finding's own sum leads (what a reader cites); the notice's value, defined differently, is a note.
        value: contracts > 0
          ? { amount: lei(d.source.totalExact), label: d.code === "award_single_bid" ? "contractele cu o singură ofertă" : "contractele anunțului", notes: [
              <>{cap(awardValueLabel(e))}: {lei(e.value)}</>, note || null, framework || null] }
          : { amount: lei(e.value), label: cap(awardValueLabel(e)), notes: [note || null, framework || null] },
        // The procedure is the finding of a no-notice negotiation (its name says it); a single bid's is context.
        meta: d.code === "award_single_bid" ? [procedureLabel(d.award?.procedure ?? (typeof e.procedure === "string" ? e.procedure : null))] : [],
      };
    }
    case "award_calloffs_over_ceiling": {
      const value = numOf(e.value), ceiling = numOf(e.ceiling), repeats = numOf(e.calloffs_repeating_ceiling) ?? 0, calloffs = numOf(e.calloffs);
      const times = value !== null && ceiling ? (Math.round((value / ceiling) * 10) / 10).toFixed(1).replace(".", ",") : null;
      return {
        title: <>Comenzi declarate peste plafonul acordului-cadru <Term tip id="plafon-acord-cadru" /></>,
        lot: d.award?.title ? cleanName(d.award.title) : null,
        parties: <>{entity ?? "Instituția"} a declarat comenzi către {winnerNames}</>,
        value: { amount: lei(e.value), label: `${calloffs ? countWords(calloffs, "comandă declarată", "comenzi declarate") : "comenzile declarate"} în SEAP`, notes: [
          <>Plafonul acordului-cadru: {lei(e.ceiling)}{times ? <>, depășit de {times} ori</> : null}</>,
          repeats >= 2 ? <>{repeats} comenzi au exact suma plafonului: probabil plafonul copiat în fiecare comandă, o eroare de completare în SEAP</>
            : <>Poate fi o depășire reală sau o eroare de completare în SEAP</>] },
        meta: [],
      };
    }
    case "fin_tiny_staff": {
      const year = String(e.year ?? d.period ?? ""), staff = numOf(e.employees), total = numOf(e.total);
      return {
        title: <>În {year}, firma a avut {staff === null ? "puțini salariați" : countWords(staff, "salariat", "salariați")} și contracte publice de {total === null ? "valoare necunoscută" : lei(e.total)}</>,
        parties: <>{entity}{d.entity?.county ? ` · ${countyLabel(d.entity.county)}` : ""}</>,
        value: {
          amount: lei(e.total), label: `în achiziții înregistrate în ${year}`,
          notes: [
            staff !== null && <>{countWords(staff, "salariat", "salariați")} în medie · bilanț MF {year}{numOf(e.per_employee) !== null && <> · {formatRon(numOf(e.per_employee))} pe salariat</>}</>,
            "Pragul semnalului: cel mult 5 salariați și cel puțin 2 mil. lei într-un an.",
          ],
        },
      };
    }
    case "fin_public_reliance": {
      const ratio = numOf(e.ratio), years = numOf(e.years);
      const words = ratio === null ? "necunoscută" : ratio >= 1 ? `${ratioNumber(ratio)}×` : shareWords(ratio);
      return {
        title: ratio !== null && ratio >= 1
          ? <>Contractele publice ale firmei sunt de {ratioNumber(ratio)} ori cifra ei de afaceri</>
          : <>Contractele publice ale firmei sunt {words} din cifra ei de afaceri</>,
        parties: <>{entity}{years !== null ? ` · ${countWords(years, "an", "ani")} cu bilanț și contracte` : ""}</>,
        value: {
          amount: words, label: "valori contractate față de cifra de afaceri",
          notes: [<>{lei(e.public_total)} contractați · {lei(e.revenue_total)} cifră de afaceri</>, "Pragul semnalului: cel puțin 75%. Nu e partea încasărilor de la stat."],
        },
      };
    }
    case "net_shared_admin": {
      const firms = numOf(e.n_firms);
      const roles = Array.isArray(e.roles) ? e.roles.filter((r): r is string => typeof r === "string" && r.trim() !== "") : [];
      // The firms with records at the institution (the ones the rule counts), else the group the registry links.
      const withRecords = partyShares(d.source.records, "supplier");
      const related = withRecords.length ? withRecords : d.related.length ? d.related : d.entity ? [d.entity] : [];
      return {
        title: <>{firms === null ? "Mai multe firme" : countWords(firms, "firmă", "firme")} cu același reprezentant legal au contracte la <Party party={d.partner} role="authority" /></>,
        parties: <>Reprezentant comun: <strong>{cleanName(String(e.person ?? "")) || "nume nepublicat"}</strong>{roles.length ? ` (${roles.join("; ")})` : ""} · {joinWords(related.map((f, i) => <Party key={f.id ?? i} party={f} role="supplier" />))}</>,
        value: { amount: lei(e.combined), label: "înregistrați de aceste firme la instituție", notes: ["Registrul ONRC de acum: nu arată o legătură la data atribuirii."] },
      };
    }
  }
  // Any other signal (a direct-acquisition pattern without its entity's case page): its name and its evidence line.
  return {
    title: flagFindingLabel(d.code),
    parties: entity,
    value: { amount: lei(d.source.totalExact), label: "valoarea înregistrărilor de mai jos", notes: [riskEvidenceLine(d.code, e)] },
  };
}

/** Who holds how much: the suppliers of a concentration, the institutions of a dependence, the firms of a shared representative. */
function Shares({ d }: { d: SignalPageData }) {
  const side = d.code === "award_dependence" ? "authority" : d.code === "award_concentration" || d.code === "net_shared_admin" ? "supplier" : null;
  if (!side) return null;
  const shares = partyShares(d.source.records, side);
  if (!shares.length) return null;
  const SHOWN = 12;
  const title = d.code === "award_dependence" ? "Instituțiile firmei" : d.code === "net_shared_admin" ? "Firmele, la această instituție" : "Furnizorii instituției";
  const rest = shares.slice(SHOWN);
  return <RecordSection id="parti" title={title}>
    <p className="record-lead">{d.code === "net_shared_admin" ? "Achiziții directe și cote din contracte, înregistrate" : "Contracte prin proceduri; la o asociere, cota fiecărui câștigător"} <Term tip id="consortiu" /></p>
    <ShareList label={title} rows={shares.slice(0, SHOWN).map((s) => ({
      key: s.id ?? s.name, name: <Party party={s} role={side} />, share: s.share, shareText: shareWords(s.share),
      detail: <>{formatExactDecimal(s.valueExact)} lei · {d.code === "net_shared_admin" ? countWords(s.count, "înregistrare", "înregistrări") : countWords(s.count, "contract", "contracte")}</>,
    }))} />
    {rest.length > 0 && <p className="record-shares-more">Și încă {countWords(rest.length, side === "authority" ? "instituție" : "furnizor", side === "authority" ? "instituții" : "furnizori")}, cu {shareWords(rest.reduce((a, s) => a + s.share, 0))} împreună: toate în tabelul de mai jos.</p>}
  </RecordSection>;
}

/** The years a firm signal reads, marked in its balance sheets. */
function signalYears(d: SignalPageData): number[] {
  if (d.code === "fin_tiny_staff") return [Number(d.evidence.year ?? d.period)].filter(Number.isInteger);
  if (d.code === "fin_public_reliance" && Array.isArray(d.source.context.financials))
    return (d.source.context.financials as { year: unknown }[]).map((f) => Number(f.year)).filter(Number.isInteger);
  return [];
}

/** A single bid's TED lot, offers and procedure under each of its contracts. */
function lotNotes(d: SignalPageData): Record<string, ReactNode> {
  if (d.code !== "award_single_bid") return {};
  const procedure = procedureLabel(d.award?.procedure);
  return Object.fromEntries(Object.entries(d.tedLots).map(([id, lot]) => [`contracts:${id}`, <>
    {lot.lot ? `Lotul ${lot.lot}` : "Lot"}{lot.publication ? ` în TED ${lot.publication}` : ""} · {lot.tenders == null ? "oferte necunoscute" : countWords(lot.tenders, "ofertă", "oferte")}{procedure ? ` · ${procedure}` : ""}
  </>]));
}

export default async function SignalPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }>;
}) {
  const [{ id }, { p }] = await Promise.all([params, searchParams]);
  // The direct-acquisition patterns' cases live on their entity's pattern page (owner, 6 November 2026).
  const target = await caseTarget(id);
  if (target) redirect(target);
  const page = pageOf(p);
  const d = await pageData(id, page);
  if (!d) notFound();
  const meta = FLAG_META[d.code];
  const head = headOf(d);
  const role = d.entity?.role ?? "authority";
  const caseHref = d.entity ? signalUrl(parseSignalState({ tip: d.code, rol: role, ent: d.entity.id })) : `/semnale?tip=${encodeURIComponent(d.code)}`;
  const period = d.period === "all" ? "Toată perioada disponibilă" : d.period
    ? <>Anul {d.period}{typeof d.evidence.period_source === "string" && <> <Term tip title="Anul semnalului" text={signalPeriodLabel(d.period, d.evidence)} /></>}</> : null;
  const others = Object.entries(d.counts).filter(([code, n]) => code !== d.code && n > 0 && FLAG_META[code])
    .sort(([a], [b]) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b));
  const pubs = [...new Set(Object.values(d.tedLots).map((l) => l.publication).filter((x): x is string => !!x))];
  const sources: Source[] = [
    ...(d.award ? [{ href: awardUrl(d.award.caNoticeId), label: `Anunțul de atribuire${d.award.noticeNo ? ` ${d.award.noticeNo}` : ""} în SEAP`, external: true }] : []),
    ...pubs.flatMap((pub) => { const url = tedNoticeUrl(pub); return url ? [{ href: url, label: `Publicarea în TED ${pub}`, external: true }] : []; }),
    ...(d.award ? [{ href: `/anunturi/${d.award.caNoticeId}`, label: "Anunțul, cu toate contractele lui" }] : []),
    { href: "/metodologie#semnale", label: `Cum se calculează: ${flagLabel(d.code)}` },
    { href: "/metodologie#citare", label: "Cum citez" },
  ];
  return <RecordPage className="signal-record">
    <Link href={caseHref} className="back">← {d.entity ? `Toate cazurile ${role === "supplier" ? "firmei" : "instituției"}` : "Toate cazurile acestui semnal"}</Link>
    <RecordHead
      title={head.title}
      lot={head.lot ?? null}
      lotLabel="Obiect"
      parties={head.parties}
      value={head.value ?? null}
      meta={[
        <span className="record-kind" key="k">{flagFindingLabel(d.code)}</span>,
        period && <span key="p">{period}</span>,
        ...(head.meta ?? []).filter(Boolean).map((m, i) => <span key={`m${i}`}>{m}</span>),
        <span key="l">Pistă de verificat, nu dovadă <Term tip id="semnal" /></span>,
      ]}
      actions={<>
        {d.award && <a className="record-seap" href={awardUrl(d.award.caNoticeId)} target="_blank" rel="noopener noreferrer">Verifică în SEAP <span aria-hidden="true">↗</span><span className="sr-only"> (anunțul de atribuire, filă nouă)</span></a>}
        <ClipButton kind="signal" refId={id} label={flagFindingLabel(d.code)} />
      </>}
    />

    <Shares d={d} />
    {d.firm && <FirmCard firm={d.firm} years={signalYears(d)} title={d.code === "net_shared_admin" ? "Firma semnalului" : "Firma"} />}

    <RecordSection id="inregistrari" title={d.code === "award_single_bid" ? "Contractele cu o singură ofertă" : d.code === "award_no_competition" ? "Contractele anunțului" : d.code === "award_calloffs_over_ceiling" ? "Comenzile anunțului" : "Înregistrările din semnal"}>
      <SourceEvidenceView evidence={d.source} href={`/semnale/${id}`} page={page} kind="signal" refId={id} heading={null} save={false} titles={d.titles} notes={lotNotes(d)} />
    </RecordSection>

    {others.length > 0 && d.entity && <RecordSection id="alte-semnale" title={`Alte semnale ale ${role === "supplier" ? "firmei" : "instituției"}`}>
      <LinkList items={others.map(([code, n]) => ({ key: code, href: signalUrl(parseSignalState({ tip: code, rol: role, ent: d.entity!.id })), label: flagLabel(code), count: caseUnitWords(code, n) }))} />
    </RecordSection>}

    {meta?.caveat && <details className="record-caveat"><summary>De ce nu e o dovadă</summary><p>{meta.caveat}</p></details>}

    <Sources sources={sources}>
      <p>Calcul {d.methodology}. Lista urmează calculul curent și se poate schimba la recalculare <Term tip id="recalculare-semnale" />.</p>
    </Sources>
  </RecordPage>;
}
