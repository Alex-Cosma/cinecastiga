import type { Metadata } from "next";
import { cache, type ReactNode } from "react";
import Link from "next/link";
import ClipButton from "@/components/ClipButton";
import EntityName from "@/components/EntityName";
import SourceEvidenceView from "@/components/SourceEvidenceView";
import Term from "@/components/Term";
import { RecordHead, RecordPage, RecordSection, Sources, type RecordValue } from "@/components/record/Record";
import { countWords } from "@/lib/ask/answer-text";
import { redirectCanonicalEntity } from "@/lib/entity-navigation";
import { cleanName, formatCalendarDate, formatExactDecimal } from "@/lib/format";
import { ghostHold } from "@/lib/ghost-hold";
import { validateRadiografieSelection } from "@/lib/radiografie-evidence";
import { readRadiografieSources, type RadiografieSourcesData } from "@/lib/radiografie-page";
import { sharedSql } from "@/lib/shared-db";
import { daySpan, decimalDifference, joinWords, patternTitle, PATTERN_LABEL, radiografieWarnings, ratioNumber } from "@/lib/signal-page-words";
import type { DbSql } from "@seap/db";

/*
 * The records behind one Radiografie finding, on the record template (owner, 7 November 2026): the head names the
 * institution and the finding in plain words (a repeated lot pattern with its members, or a firm's direct acquisitions
 * adding up over the ceiling in force), then the records, each contract once with its members' shares, and the
 * sources. A pattern is a lead to check, not proof; values are recorded, not payments.
 */

export const dynamic = "force-dynamic";

type Search = { tip?: string; furnizor?: string; tipar?: string; fingerprint?: string; p?: string };

const selectionOf = (search: Search) => validateRadiografieSelection(search.tip === "slicing"
  ? { type: "slicing", supplierId: search.furnizor }
  : { type: "pattern", patternId: search.tipar, ...(search.fingerprint ? { expectedFingerprint: search.fingerprint } : {}) });
const pageOf = (p: string | undefined) => { const n = Number(p ?? 0); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };

/** One read per request: the tab title and the page share it. */
const load = cache(async (id: string, key: string, page: number): Promise<RadiografieSourcesData | null> => {
  const selection = validateRadiografieSelection(JSON.parse(key));
  if (!selection) return null;
  const sql = sharedSql();
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '30s'`;
    return readRadiografieSources(tx as unknown as DbSql, id, selection, page);
  });
});

export async function generateMetadata({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }): Promise<Metadata> {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const selection = selectionOf(search);
  const data = selection ? await load(id, JSON.stringify(selection), pageOf(search.p)).catch(() => null) : null;
  if (!data) return { title: "Sursele Radiografiei" };
  const what = data.pattern ? PATTERN_LABEL[data.pattern.kind] ?? "Tipar de loturi" : `Achiziții adunate · ${cleanName(data.slice?.supplier.name)}`;
  return { title: `${what} · ${cleanName(data.authority.name)}` };
}

const lei = (value: string | null | undefined) => value == null ? "valoare necunoscută" : `${formatExactDecimal(value)} lei`;
const yearsWords = (y0: string | null, y1: string | null) => !y0 ? null : !y1 || y0 === y1 ? y0 : `${y0}–${y1}`;

interface Head { title: ReactNode; parties: ReactNode; value: RecordValue; meta: ReactNode[]; caveat: string }

function headOf(data: RadiografieSourcesData): Head {
  const institution = <EntityName id={data.authority.id} role="authority">{cleanName(data.authority.name)}</EntityName>;
  const lead = <span key="l">Pistă de verificat, nu dovadă <Term tip id="semnal" /></span>;
  if (data.pattern) {
    const p = data.pattern;
    const members = joinWords(p.members.map((m) => <EntityName key={m.id} id={m.id} role="supplier">{cleanName(m.name)}</EntityName>));
    const who = p.kind === "consortiu" ? <>a contractat de fiecare dată cu asocierea {members}</>
      : p.kind === "maturare" ? <>· câștigătorul: {members}</>
      : p.kind === "impartire" ? <>· loturile, împărțite între {members}</>
      : <>· câștigătorii: {members}</>;
    return {
      title: patternTitle(p.kind, p.reps),
      parties: <>{institution} {who}</>,
      value: {
        amount: lei(p.valueExact), label: "valoarea contractelor din aceste anunțuri",
        notes: [
          p.known > 0 ? `${countWords(p.single, "lot", "loturi")} cu ofertă unică, din ${countWords(p.known, "lot", "loturi")} cu oferte cunoscute` : "Numărul ofertelor nu e cunoscut.",
          p.sharedAdmin && <>Administrator comun în ONRC: {cleanName(p.sharedAdmin)}. De verificat în documentele de acum.</>,
        ],
      },
      meta: [
        <span className="record-kind" key="k">{PATTERN_LABEL[p.kind] ?? "Tipar de loturi"}</span>,
        yearsWords(p.y0, p.y1) && <span key="y">{yearsWords(p.y0, p.y1)}</span>,
        <span key="c">CPV {p.cpvClass}{p.cpvName ? ` · ${p.cpvName}` : ""}</span>,
        lead,
      ],
      caveat: "Tiparele privesc tot istoricul disponibil. Repetarea nu dovedește o înțelegere: piețe mici, specializarea sau asocieri vechi o pot explica. Datele nu includ ofertele respinse.",
    };
  }
  const s = data.slice!;
  const supplier = <EntityName id={s.supplier.id} role="supplier">{cleanName(s.supplier.name)}</EntityName>;
  const days = daySpan(s.from, s.to);
  const kind = s.type === "da_ceiling_works" ? "lucrări" : "produse și servicii";
  const over = s.ceilingExact ? decimalDifference(s.sumExact, s.ceilingExact) : null;
  // The window's ceiling is the highest in it: its era is named only when it is the one in force on the first day.
  const era = s.era && s.ceilingExact && Number(s.ceilingExact) === s.era.value ? s.era : null;
  return {
    title: <>{countWords(s.n, "achiziție directă", "achiziții directe")} de la aceeași firmă, adunate, trec de plafon</>,
    parties: <>{institution} a cumpărat de la {supplier}{s.from && s.to && <> între {formatCalendarDate(s.from)} și {formatCalendarDate(s.to)}{days ? ` (${countWords(days, "zi", "zile")})` : ""}</>}</>,
    value: {
      amount: lei(s.sumExact), label: <>adunate, față de plafonul de {lei(s.ceilingExact)} <Term tip id="data-si-pragul" /></>,
      notes: [
        over && !over.startsWith("-") && <>Cu {lei(over)} peste plafon{s.ratio ? ` (${ratioNumber(s.ratio, s.ratio < 2 ? 2 : 1)}×)` : ""}</>,
        era ? <>Plafonul pentru {kind}, fără TVA, în vigoare {era.to ? `${formatCalendarDate(era.from)}–${formatCalendarDate(era.to)}` : `din ${formatCalendarDate(era.from)}`} ({era.law})</>
          : <>Plafonul pentru {kind}, fără TVA: cel mai mare aplicabil în interval</>,
      ],
    },
    meta: [
      <span className="record-kind" key="k">Achiziții directe adunate</span>,
      s.from && <span key="y">{yearsWords(s.from.slice(0, 4), s.to?.slice(0, 4) ?? null)}</span>,
      s.cpvClass && <span key="c">CPV {s.cpvClass}{s.cpvName ? ` · ${s.cpvName}` : ""}</span>,
      lead,
    ],
    caveat: "Achizițiile recurente pot fi legitime, iar o clasă CPV comună nu dovedește o nevoie unică. Obligația estimării e a instituției, nu a firmei. CPV-ul comun și depășirea adunată nu dovedesc singure fracționarea.",
  };
}

export default async function RadiografieSourcesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await ghostHold(); // development only: lets a check photograph surse/loading.tsx
  const [{ id }, search] = await Promise.all([params, searchParams]);
  await redirectCanonicalEntity(id, "/radiografie/surse", search);
  const selection = selectionOf(search);
  const page = pageOf(search.p);
  const data = selection ? await load(id, JSON.stringify(selection), page) : null;
  const back = <Link prefetch={false} href={`/entitati/${id}/radiografie`} className="back">← Radiografia instituției</Link>;
  if (!data || (!data.pattern && !data.slice)) return <RecordPage className="rx-sources-record">{back}
    <header className="record-head"><div className="record-title"><h1>Tiparul nu mai corespunde selecției</h1>
      <p className="record-parties">Datele au fost recalculate sau sursele nu mai sunt disponibile. Deschide Radiografia de acum și alege din nou tiparul.</p></div></header>
  </RecordPage>;
  const binding = data.evidence.context.sourceBinding as { fingerprint?: string } | undefined;
  const boundSelection = selection!.type === "pattern" ? { ...selection!, expectedFingerprint: binding?.fingerprint } : selection!;
  const query = new URLSearchParams(search.tip === "slicing" ? { tip: "slicing", furnizor: search.furnizor ?? "" } : { tip: "pattern", tipar: search.tipar ?? "" });
  if (binding?.fingerprint) query.set("fingerprint", binding.fingerprint);
  const head = headOf(data);
  const evidence = { ...data.evidence, warnings: radiografieWarnings(data.evidence.warnings) };
  return <RecordPage className="rx-sources-record">
    {back}
    <RecordHead title={head.title} parties={head.parties} value={head.value} meta={head.meta}
      actions={<ClipButton kind="radiografie" refId={id} spec={boundSelection} label={data.evidence.title} />} />
    <RecordSection id="inregistrari" title={data.pattern ? "Contractele tiparului" : "Achizițiile adunate"}>
      <SourceEvidenceView evidence={evidence} href={`/entitati/${id}/radiografie/surse?${query}`} page={page} kind="radiografie" refId={id} spec={boundSelection} heading={null} save={false} titles={data.titles} />
    </RecordSection>
    <details className="record-caveat"><summary>De ce nu e o dovadă</summary><p>{head.caveat}</p></details>
    <Sources sources={[
      { href: `/entitati/${id}/radiografie`, label: `Radiografia: ${cleanName(data.authority.name)}` },
      { href: "/metodologie#radiografie", label: "Cum se citește Radiografia" },
      { href: "/metodologie#citare", label: "Cum citez" },
    ]}><p>Calcul {data.pattern ? data.evidence.methodology : data.slice?.methodology || data.evidence.methodology}. Selecția urmează datele de acum și se poate schimba la recalculare.</p></Sources>
  </RecordPage>;
}
