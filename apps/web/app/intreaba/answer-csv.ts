import { fileSlug } from "../../lib/ask/answer-text";
import type { BlockData, DistributionDataV1 } from "../../lib/ask/compile";
import { OUTSIDE_WHY, type FactOutsideRow, type FactSample } from "../../lib/ask/fact-check-shared";
import { isHistoricalProfile } from "../../lib/ask/population";
import type { AskSpec } from "../../lib/ask/spec";
import { shownTrendList, trendRowView } from "./trend-answer";

/*
 * "Rezultatul afișat · CSV" (plan §2.3, §2.8): exactly the rows and columns
 * the answer shows, with the state of the strip beside it in the header and
 * in the file name, so "Doar ce vezi acum" stays true after a switch. F1b's
 * strip: the data stream (breakdown, compare, network, sankey), the map's
 * lens and the breakdown's thread ("fir"); F2's trend its group and months
 * (`grupa`, `luni`). Later stages add their own (`semnal`).
 */

/** What the strip beside the answer shows now. */
export interface BandState {
  /** The data stream chosen in the strip (where the strip has it). */
  stream?: "all" | "da" | "contracts";
  /** The map's lens: value or records. */
  lens?: "value" | "count";
  /** The breakdown's thread, root to the current level ("toate › Construcții"). */
  thread?: string;
  /** A trend's group chosen in the answer, by its part's name as the drawer and the watch say it ("Noi față de 2024"). */
  group?: string;
  /** Its short name in the file name ("noi", "nu-mai-apar"; TREND_LIST_CSV). */
  groupFile?: string;
  /** A trend's months, when both years count only some ("ian.–mai"). */
  months?: string;
}

const STREAM_WORD: Record<NonNullable<BandState["stream"]>, string> = { all: "toate", da: "directe", contracts: "proceduri" };
const LENS_WORD: Record<NonNullable<BandState["lens"]>, string> = { value: "valoare", count: "inregistrari" };

function csvQ(s: string | null | undefined): string {
  const text = s ?? "";
  const safe = /^[\s﻿]*[=+@-]/.test(text) ? "'" + text : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** B − A of two amounts in lei, to the ban: a float subtraction leaves noise (1130000000.12 − 481712345.67 = 648287654.4499998). */
export const leiDifference = (a: number, b: number): number => Math.round((b - a) * 100) / 100;

/** The rows of the shown result, as before F1b. */
function rowsOf(data: BlockData, spec: AskSpec): string[] {
  switch (data.block) {
    case "table":
      return ["nume,judet,valoare_lei,achizitii,populatie", ...data.rows.map((r) => `${csvQ(r.name)},${csvQ(r.county)},${r.value},${r.count},${r.population ?? ""}`)];
    case "timeseries":
      return ["an,valoare_lei,achizitii", ...data.series.map((p) => `${p.year},${p.value},${p.count}`)];
    case "map":
      return [
        "judet,valoare_lei,achizitii",
        ...data.counties.map((c) => `${csvQ(c.county)},${c.value},${c.count}`),
        ...(data.unknown.count > 0 ? [`${csvQ("Județ necunoscut")},${data.unknown.value},${data.unknown.count}`] : []),
      ];
    case "stat":
      return ["valoare_lei,achizitii", `${data.stat.value},${data.stat.count}`];
    case "compare":
      // Selection totals by stream; the risk columns are the historical profile.
      return [
        "nume,judet,valoare_lei,inregistrari,valoare_proceduri_lei,contracte_proceduri,o_singura_oferta,oferte_cunoscute,valoare_directe_lei,achizitii_directe,parteneri,cri_istoric,semnale_istorice,flags",
        ...data.entities.map((e) => [csvQ(e.name), csvQ(e.county), e.value, e.count, e.streams?.contracts.value ?? "", e.streams?.contracts.count ?? "",
          e.streams?.contracts.singleBid ?? "", e.streams?.contracts.bidsKnown ?? "", e.streams?.da.value ?? "", e.streams?.da.count ?? "",
          e.partners ?? "", e.cri ?? "", e.hasProfile === false ? "" : e.nFlags, csvQ(e.flags.join("|"))].join(",")),
      ];
    case "distribution": {
      // distribution-2: the list on screen (the entity, then its group up to 50), else the chart's bars.
      const d = data.distribution, f = d.focal;
      if (d.version !== 2) return ["cri_de,cri_pana,entitati", ...(d as unknown as DistributionDataV1).buckets.map((b) => `${b.from},${b.to},${b.n}`)];
      if (d.members) return [
        "rol,nume,judet,populatie,criterii,semnale,achizitii_directe",
        `"entitatea",${csvQ(f.name)},${csvQ(f.county)},${f.population ?? ""},${f.nFlags},${csvQ(f.flags.join("|"))},${f.nDas}`,
        ...d.members.map((m) => `"grup",${csvQ(m.name)},${csvQ(m.county)},${m.population ?? ""},${m.nFlags},${csvQ(m.flags.join("|"))},${m.nDas}`),
      ];
      return ["criterii,indice_de_risc,entitati_din_grup,aici", ...(d.hist ?? []).map((h) => `${h.k},${h.k / d.criteria.length},${h.n},${h.k === f.nFlags ? "da" : ""}`)];
    }
    case "breakdown":
      return ["categorie,cod,valoare_lei,achizitii", ...data.slices.map((s) => `${csvQ(s.name)},${s.code},${s.value},${s.count}`), `"alte domenii",,${data.other.value},${data.other.count}`];
    case "scatter":
      return ["nume,judet,valoare_lei,cri,semnale", ...data.points.map((p) => `${csvQ(p.name)},${csvQ(p.county)},${p.value},${p.cri},${p.nFlags}`)];
    case "sankey":
      return ["partener,categorie,valoare_lei", ...data.flows.map((f) => `${csvQ(f.partner)},${csvQ(f.category)},${f.value}`)];
    case "network":
      return ["partener,valoare_lei,achizitii", ...data.nodes.map((n) => `${csvQ(n.name)},${n.value},${n.count}`)];
    case "entity_card": {
      const c = data.card, profile = isHistoricalProfile(spec);
      return [
        profile ? "nume,judet,valoare_lei,achizitii,cri,semnale,flags" : "nume,judet,valoare_lei,inregistrari",
        `${csvQ(c.name)},${csvQ(c.county)},${c.value},${c.count}${profile ? `,${c.cri ?? ""},${c.nFlags},${csvQ(c.flags.join("|"))}` : ""}`,
      ];
    }
    case "fact_check": {
      // fact_check-2: the list on screen (the five largest and the most recent), then the rows outside the sums it names
      // (framework ceilings, excluded rows), each with whether it is in the sums.
      const f = data.fact;
      if (f.version !== 2) return ["cod,data,ce,valoare_lei", ...f.samples.map((s) => `${csvQ(s.daCode)},${csvQ(s.date)},${csvQ(s.cpvName)},${s.value}`)];
      const sample = (s: FactSample) => [csvQ(s.recent ? "cea mai recentă" : "cele mai mari"), csvQ(s.daCode), csvQ(s.date), csvQ(s.cpvName),
        s.src === "da" ? "achizitie_directa" : "contract", csvQ(s.procedure ?? ""), s.nWinners ?? "", s.fullValue ?? "", s.bids ?? "",
        s.kind === "framework" ? "da (plafon)" : "da", s.value].join(",");
      const outside = (r: FactOutsideRow) => [csvQ(r.category === "framework" ? "acord-cadru" : `exclus: ${OUTSIDE_WHY[r.category]}`), csvQ(r.code), csvQ(r.date),
        csvQ(r.what), r.src === "da" ? "achizitie_directa" : "contract", csvQ(r.procedure ?? ""), "", "", "", "nu", r.value ?? ""].join(",");
      return [
        "categorie,cod,data,ce,sursa,procedura,castigatori,valoare_contract_integral,oferte,in_sume,valoare_lei",
        ...f.samples.map(sample), ...(f.frameworks?.rows ?? []).map(outside), ...(f.excluded?.rows ?? []).map(outside),
      ];
    }
    case "trend": {
      // The list on screen with its columns: the name as shown, the place beside it (an institution's county, a foreign
      // firm's country; no county beside a firm, owner-seat-switch; none on a county), its labels and partner line.
      const { list, rows } = shownTrendList(data, spec);
      const place = spec.dim === "county" ? null : spec.dim === "supplier" ? "tara" : "judet";
      return [
        `nume,${place ? `${place},` : ""}${data.yearA},${data.yearB},diferenta_lei,etichete,partener`,
        ...rows.map((r) => {
          const view = trendRowView(r, list, data, spec);
          return [csvQ(view.name), ...(place ? [csvQ(view.place)] : []), r.valueA, r.valueB, leiDifference(r.valueA, r.valueB),
            csvQ(view.facts.map((f) => f.text).join("; ")), csvQ(view.partner)].join(",");
        }),
      ];
    }
  }
}

/** The strip's columns, in a fixed order: their name and the value on every row. */
function bandColumns(band: BandState): [string, string][] {
  return [
    ...(band.stream ? [["canal", STREAM_WORD[band.stream]] as [string, string]] : []),
    ...(band.lens ? [["harta_arata", LENS_WORD[band.lens]] as [string, string]] : []),
    ...(band.thread ? [["fir", band.thread] as [string, string]] : []),
    ...(band.group ? [["grupa", band.group] as [string, string]] : []),
    ...(band.months ? [["luni", band.months] as [string, string]] : []),
  ];
}

/**
 * The shown result as CSV text (UTF-8 BOM, CRLF, as the source export) and its
 * file name: the title's slug, then the strip's values ("…-directe.csv").
 */
export function answerCsv(data: BlockData, spec: AskSpec, title: string, band: BandState = {}): { text: string; filename: string } {
  const [header, ...rows] = rowsOf(data, spec);
  const columns = bandColumns(band);
  const lines = columns.length
    ? [`${header},${columns.map(([name]) => name).join(",")}`, ...rows.map((row) => `${row},${columns.map(([, value]) => csvQ(value)).join(",")}`)]
    : [header!, ...rows];
  const suffix = columns.map(([name, value]) => name === "grupa" ? band.groupFile ?? fileSlug(value, "") : name === "fir" || name === "luni" ? fileSlug(value, "") : value).filter(Boolean).join("-");
  return { text: "﻿" + lines.join("\r\n") + "\r\n", filename: `${fileSlug(title)}${suffix ? `-${suffix}` : ""}.csv` };
}
