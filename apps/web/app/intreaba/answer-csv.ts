import { fileSlug } from "../../lib/ask/answer-text";
import type { BlockData } from "../../lib/ask/compile";
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
  /** A trend's group chosen in the answer ("noi", "nu-mai-apar"). */
  group?: string;
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
    case "distribution":
      return ["cri_de,cri_pana,entitati", ...data.distribution.buckets.map((b) => `${b.from},${b.to},${b.n}`)];
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
    case "fact_check":
      return ["cod,data,ce,valoare_lei", ...data.fact.samples.map((s) => `${csvQ(s.daCode)},${csvQ(s.date)},${csvQ(s.cpvName)},${s.value}`)];
    case "trend": {
      // The list on screen with its columns: no county beside a firm (owner-seat-switch), its labels and partner line.
      const { list, rows } = shownTrendList(data, spec);
      const county = spec.dim !== "supplier";
      return [
        `nume,${county ? "judet," : ""}${data.yearA},${data.yearB},diferenta_lei,etichete,partener`,
        ...rows.map((r) => {
          const view = trendRowView(r, list, data, spec);
          return [csvQ(r.name), ...(county ? [csvQ(r.county)] : []), r.valueA, r.valueB, r.valueB - r.valueA,
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
  const suffix = columns.map(([name, value]) => name === "fir" || name === "luni" ? fileSlug(value, "") : value).filter(Boolean).join("-");
  return { text: "﻿" + lines.join("\r\n") + "\r\n", filename: `${fileSlug(title)}${suffix ? `-${suffix}` : ""}.csv` };
}
