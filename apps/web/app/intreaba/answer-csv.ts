import { countyName } from "../../lib/counties";
import { fileSlug } from "../../lib/ask/answer-text";
import type { BlockData, DistributionDataV1, DistributionMember } from "../../lib/ask/compile";
import { CRITERION_LABEL } from "../../lib/ask/peer-groups-shared";
import { OUTSIDE_WHY, type FactOutsideRow, type FactSample } from "../../lib/ask/fact-check-shared";
import { employeesWords } from "../../lib/ask/filters/words";
import { isHistoricalProfile } from "../../lib/ask/population";
import { placeShare, podiumRest, riskBandWord, riskPlaces } from "../../lib/ask/entity-card-shared";
import type { AskSpec } from "../../lib/ask/spec";
import { shownTrendList, trendRowView } from "./trend-answer";
import { breakdownShown } from "./breakdown-answer";
import { networkCsvRows } from "./network-answer";
import { keptScatterFacts, scatterCsv } from "./scatter-answer";
import { sankeyCsvRows } from "./sankey-answer";
import { mapCsvRows } from "./map-answer";
import type { MapLensValue } from "../../lib/ask/map-lens";
import type { MapFacts } from "../../lib/ask/map-facts";

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
  /** The map's lens (F5: also per inhabitant, the firms of the county, the firm's share). */
  lens?: MapLensValue;
  /** The breakdown's thread, root to the current level ("toate › Construcții"). */
  thread?: string;
  /** A trend's group chosen in the answer, by its part's name as the drawer and the watch say it ("Noi față de 2024"). */
  group?: string;
  /** Its short name in the file name ("noi", "nu-mai-apar"; TREND_LIST_CSV). */
  groupFile?: string;
  /** A trend's months, when both years count only some ("ian.–mai"). */
  months?: string;
  /** The risk cloud's order ("semnale", "valoare") and its signal ("Posibilă fracționare"), chosen in the strip (F6b). */
  rank?: string;
  signal?: string;
  signalFile?: string;
}

/** What the answer read after it was drawn (F5: a map's county facts). */
export interface CsvExtra { mapFacts?: MapFacts | null }

const STREAM_WORD: Record<NonNullable<BandState["stream"]>, string> = { all: "toate", da: "directe", contracts: "proceduri" };
const LENS_WORD: Record<NonNullable<BandState["lens"]>, string> = {
  value: "valoare", count: "inregistrari", value_per_capita: "pe-locuitor", seat: "firme-din-judet", share: "cota-firmei",
};

function csvQ(s: string | null | undefined): string {
  const text = s ?? "";
  const safe = /^[\s﻿]*[=+@-]/.test(text) ? "'" + text : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

const csvAny = (value: unknown): string => csvQ(value === undefined || value === null ? "" : String(value));

/** B − A of two amounts in lei, to the ban: a float subtraction leaves noise (1130000000.12 − 481712345.67 = 648287654.4499998). */
export const leiDifference = (a: number, b: number): number => Math.round((b - a) * 100) / 100;

/** The rows of the shown result, as before F1b; the map's with its county facts (F5) where they are read. */
function rowsOf(data: BlockData, spec: AskSpec, extra: CsvExtra = {}): string[] {
  switch (data.block) {
    case "table": {
      // A firm's place is its seat (F4 owner-seat-switch), `sediu` as on the trend (S4t-firm-csv-column); the band of
      // CÂȘTIGĂTORII the list is narrowed to, on every row (S4t-band-csv: the title and the chips say it, the file too).
      const firms = spec.dim === "supplier";
      const band = firms ? employeesWords(spec.filters.minEmployees, spec.filters.maxEmployees)?.replace(/^cu /, "") ?? null : null;
      return [`nume,${firms ? "sediu" : "judet"},valoare_lei,achizitii,populatie${band ? ",angajati" : ""}`,
        ...data.rows.map((r) => `${csvQ(r.entityId ? r.name : countyName(r.name))},${csvQ(countyName(r.county))},${r.value},${r.count},${r.population ?? ""}${band ? `,${csvQ(band)}` : ""}`)];
    }
    case "timeseries": {
      // F3: a month's column on a series month by month, a value per part of a split (its parts' labels as columns).
      const month = data.grain === "month", parts = data.parts ?? [];
      return [
        `an,${month ? "luna," : ""}valoare_lei,achizitii${parts.map((p) => `,${csvQ(`valoare_${p.label}`)}`).join("")}`,
        ...data.series.map((p) => `${p.year},${month ? `${p.month ?? ""},` : ""}${p.value},${p.count}${parts.map((part) => `,${p.parts?.[part.key]?.value ?? 0}`).join("")}`),
      ];
    }
    case "map":
      // F5 (map final §4 „Surse și CSV”): `inregistrari`, per inhabitant, the card's columns, the seat or the share.
      return mapCsvRows(data, spec, extra.mapFacts ?? null, csvQ);
    case "stat":
      return ["valoare_lei,achizitii", `${data.stat.value},${data.stat.count}`];
    case "compare":
      // Selection totals by stream; the risk columns are the historical profile.
      return [
        "nume,judet,valoare_lei,inregistrari,valoare_proceduri_lei,contracte_proceduri,o_singura_oferta,oferte_cunoscute,valoare_directe_lei,achizitii_directe,parteneri,cri_istoric,semnale_istorice,flags",
        ...data.entities.map((e) => [csvQ(e.name), csvQ(countyName(e.county)), e.value, e.count, e.streams?.contracts.value ?? "", e.streams?.contracts.count ?? "",
          e.streams?.contracts.singleBid ?? "", e.streams?.contracts.bidsKnown ?? "", e.streams?.da.value ?? "", e.streams?.da.count ?? "",
          e.partners ?? "", e.cri ?? "", e.hasProfile === false ? "" : e.nFlags, csvQ(e.flags.join("|"))].join(",")),
      ];
    case "distribution": {
      // distribution-2 (final §7.7 "criterii,entitati + criterii + membri"): one table, by `sectiune`: the group's others by
      // number of criteria (the chart), each criterion among them and in the country, the entity, then the list on screen (≤ 50).
      const d = data.distribution, f = d.focal, max = d.criteria.length;
      if (d.version !== 2) return ["cri_de,cri_pana,entitati", ...(d as unknown as DistributionDataV1).buckets.map((b) => `${b.from},${b.to},${b.n}`)];
      const row = (cells: (string | number)[]) => cells.join(",");
      const member = (part: string, m: DistributionMember, own: string) =>
        row([csvQ(part), m.nFlags, m.nFlags / max, "", csvQ(m.name), csvQ(countyName(m.county)), m.population ?? "", csvQ(m.flags.join("|")), m.nDas, "", "", own]);
      return [
        "sectiune,criterii,indice_de_risc,criteriu,nume,judet,populatie,semnale,achizitii_directe,din_grup,din_tara,entitatea",
        ...(d.hist ?? []).map((h) => row([csvQ("criterii"), h.k, h.k / max, "", "", "", "", "", "", h.n, "", h.k === Math.min(f.nFlags, max) ? "da" : ""])),
        ...(d.perCriterion ?? []).map((c) => row([csvQ("criteriu"), "", "", csvQ(`${CRITERION_LABEL[c.code] ?? c.code} (${c.code})`), "", "", "", "", "", c.others, c.country,
          f.flags.includes(c.code) ? "da" : "nu"])),
        member("entitatea", f, "da"),
        ...(d.members ?? []).map((m) => member("grup", m, "")),
      ];
    }
    case "breakdown": {
      // F3: the groups as the legend shows them (by records when it is ordered so), every group with `base`.
      const shown = breakdownShown(data.slices, data.other, data.base, spec.measure === "count" && Boolean(data.base), true);
      return ["categorie,cod,valoare_lei,achizitii", ...shown.groups.map((s) => `${csvQ(s.name)},${s.code},${s.value},${s.count}`),
        ...(shown.rest.count > 0 || !data.base ? [`"alte domenii",,${shown.rest.value},${shown.rest.count}`] : [])];
    }
    case "scatter":
      // scatter-2: the list on screen — the 50 profiles of the strip's order and signal, with their signals' years or shares
      // (the rates' shares come after the answer: AskPanel completes them before the export, ensureScatterFacts);
      // an answer stored before it keeps its sample of points.
      if ("scatter" in data) return scatterCsv(data.scatter, csvAny, keptScatterFacts(spec));
      return ["nume,judet,valoare_lei,cri,semnale", ...data.points.map((p) => `${csvQ(p.name)},${csvQ(countyName(p.county))},${p.value},${p.cri},${p.nFlags}`)];
    // F4: the flows on screen, the partners past „Arată” folded (sankey-2); the partners of the list on screen, in its order and length (network-2).
    case "sankey":
      return sankeyCsvRows(data, spec, csvAny);
    case "network":
      return networkCsvRows(data, spec, csvAny);
    case "entity_card": {
      const c = data.card, profile = isHistoricalProfile(spec);
      // entity_card-2 (F6c): the podium's places with their share of the total and the rest.
      if (data.podium) {
        const { places, total, selection } = data.podium, rest = podiumRest(data.podium);
        // Under a band of CÂȘTIGĂTORII the share is of the category (the firms in the band), the selection's total a row of its own.
        return [
          `loc,nume,judet,valoare_lei,${selection ? "procent_din_categorie" : "procent_din_total"},inregistrari`,
          ...places.map((place, i) => [i + 1, csvQ(place.name), csvQ(countyName(place.county)), place.value, placeShare(place, total)?.toFixed(4) ?? "", place.count].join(",")),
          ...(rest && total ? [["", csvQ(`celelalte ${rest.entities}${selection ? " din categorie" : ""}`), "", rest.value, rest.share.toFixed(4), Math.max(0, total.count - places.reduce((n, place) => n + place.count, 0))].join(",")] : []),
          ...(selection && total ? [["", csvQ(`toată selecția: ${selection.entities}`), "", selection.value, "", selection.count].join(",")] : []),
        ];
      }
      // entity_card-3: the listed profiles of the ranking by the risk score (the sources' cohort), with their place (the same
      // for the same score), the score over 100, its band and their patterns' codes.
      if (data.ranking) {
        const places = riskPlaces(data.ranking.rows);
        return [
          `loc,nume,${spec.dim === "supplier" ? "sediu" : "judet"},valoare_lei,achizitii,risc_pct,banda,tipare`,
          ...data.ranking.rows.map((row, i) => [places[i], csvQ(row.name), csvQ(countyName(row.county)), row.value, row.count, row.score,
            csvQ(riskBandWord(row.score)), csvQ(row.flags.join("|"))].join(",")),
        ];
      }
      // An answer stored as entity_card-2: the group at the top of the old index, as it was exported.
      if (data.ties) return [
        "nume,judet,valoare_lei,achizitii,cri,semnale,flags",
        ...data.ties.rows.map((row) => [csvQ(row.name), csvQ(countyName(row.county)), row.value, row.count, data.ties!.level, row.nFlags, csvQ(row.flags.join("|"))].join(",")),
      ];
      return [
        profile ? "nume,judet,valoare_lei,achizitii,cri,semnale,flags" : "nume,judet,valoare_lei,inregistrari",
        `${csvQ(c.name)},${csvQ(countyName(c.county))},${c.value},${c.count}${profile ? `,${c.cri ?? ""},${c.nFlags},${csvQ(c.flags.join("|"))}` : ""}`,
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
    ...(band.rank ? [["primele_dupa", band.rank] as [string, string]] : []),
    ...(band.signal ? [["semnal", band.signal] as [string, string]] : []),
  ];
}

/**
 * The shown result as CSV text (UTF-8 BOM, CRLF, as the source export) and its
 * file name: the title's slug, then the strip's values ("…-directe.csv").
 */
export function answerCsv(data: BlockData, spec: AskSpec, title: string, band: BandState = {}, extra: CsvExtra = {}): { text: string; filename: string } {
  const [header, ...rows] = rowsOf(data, spec, extra);
  // A strip column the rows already carry (the network's „grupa”, with its year) names the file only: one column per name (S4 tests).
  const own = new Set(header!.split(","));
  const columns = bandColumns(band).filter(([name]) => !own.has(name));
  const lines = columns.length
    ? [`${header},${columns.map(([name]) => name).join(",")}`, ...rows.map((row) => `${row},${columns.map(([, value]) => csvQ(value)).join(",")}`)]
    : [header!, ...rows];
  const suffix = bandColumns(band).map(([name, value]) => name === "grupa" ? band.groupFile ?? fileSlug(value, "") : name === "fir" || name === "luni" ? fileSlug(value, "") : name === "semnal" ? band.signalFile ?? fileSlug(value, "") : name === "primele_dupa" ? (value === "valoare" ? "dupa-valoare" : "") : value).filter(Boolean).join("-");
  return { text: "﻿" + lines.join("\r\n") + "\r\n", filename: `${fileSlug(title)}${suffix ? `-${suffix}` : ""}.csv` };
}
