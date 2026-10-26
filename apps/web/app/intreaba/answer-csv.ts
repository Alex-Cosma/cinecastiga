import { fileSlug } from "../../lib/ask/answer-text";
import type { BlockData } from "../../lib/ask/compile";
import { isHistoricalProfile } from "../../lib/ask/population";
import type { AskSpec } from "../../lib/ask/spec";
import { shownTrendList, trendRowView } from "./trend-answer";
import { breakdownShown } from "./breakdown-answer";
import { networkCsvRows } from "./network-answer";
import { sankeyCsvRows } from "./sankey-answer";

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

const csvAny = (value: unknown): string => csvQ(value === undefined || value === null ? "" : String(value));

/** B − A of two amounts in lei, to the ban: a float subtraction leaves noise (1130000000.12 − 481712345.67 = 648287654.4499998). */
export const leiDifference = (a: number, b: number): number => Math.round((b - a) * 100) / 100;

/** The rows of the shown result, as before F1b. */
function rowsOf(data: BlockData, spec: AskSpec): string[] {
  switch (data.block) {
    case "table":
      return ["nume,judet,valoare_lei,achizitii,populatie", ...data.rows.map((r) => `${csvQ(r.name)},${csvQ(r.county)},${r.value},${r.count},${r.population ?? ""}`)];
    case "timeseries": {
      // F3: a month's column on a series month by month, a value per part of a split (its parts' labels as columns).
      const month = data.grain === "month", parts = data.parts ?? [];
      return [
        `an,${month ? "luna," : ""}valoare_lei,achizitii${parts.map((p) => `,${csvQ(`valoare_${p.label}`)}`).join("")}`,
        ...data.series.map((p) => `${p.year},${month ? `${p.month ?? ""},` : ""}${p.value},${p.count}${parts.map((part) => `,${p.parts?.[part.key]?.value ?? 0}`).join("")}`),
      ];
    }
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
    case "breakdown": {
      // F3: the groups as the legend shows them (by records when it is ordered so), every group with `base`.
      const shown = breakdownShown(data.slices, data.other, data.base, spec.measure === "count" && Boolean(data.base), true);
      return ["categorie,cod,valoare_lei,achizitii", ...shown.groups.map((s) => `${csvQ(s.name)},${s.code},${s.value},${s.count}`),
        ...(shown.rest.count > 0 || !data.base ? [`"alte domenii",,${shown.rest.value},${shown.rest.count}`] : [])];
    }
    case "scatter":
      return ["nume,judet,valoare_lei,cri,semnale", ...data.points.map((p) => `${csvQ(p.name)},${csvQ(p.county)},${p.value},${p.cri},${p.nFlags}`)];
    // F4: the flows on screen, the partners past „Arată” folded (sankey-2); the partners of the list on screen, in its order and length (network-2).
    case "sankey":
      return sankeyCsvRows(data, spec, csvAny);
    case "network":
      return networkCsvRows(data, spec, csvAny);
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
      // The list on screen with its columns: the name as shown, the place beside it (an institution's county, a firm's
      // seat or a foreign firm's country, F4 owner-seat-switch; none on a county), its labels and partner line.
      const { list, rows } = shownTrendList(data, spec);
      const place = spec.dim === "county" ? null : spec.dim === "supplier" ? "sediu" : "judet";
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
  // A strip column the rows already carry (the network's „grupa”, with its year) names the file only: one column per name (S4 tests).
  const own = new Set(header!.split(","));
  const columns = bandColumns(band).filter(([name]) => !own.has(name));
  const lines = columns.length
    ? [`${header},${columns.map(([name]) => name).join(",")}`, ...rows.map((row) => `${row},${columns.map(([, value]) => csvQ(value)).join(",")}`)]
    : [header!, ...rows];
  const suffix = bandColumns(band).map(([name, value]) => name === "grupa" ? band.groupFile ?? fileSlug(value, "") : name === "fir" || name === "luni" ? fileSlug(value, "") : value).filter(Boolean).join("-");
  return { text: "﻿" + lines.join("\r\n") + "\r\n", filename: `${fileSlug(title)}${suffix ? `-${suffix}` : ""}.csv` };
}
