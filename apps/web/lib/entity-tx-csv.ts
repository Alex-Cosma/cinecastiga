import { evidenceCsvText } from "./ask/evidence";
import { awardUrl, daUrl } from "./elicitatie";
import type { DaTx } from "./marts";

/*
 * The entity page's records table as a CSV (UX audit Z5-12, 16 November 2026: „built to be cited”): the selection its
 * funnels show, in its order, with exact values and the official and site links of every row. Excel-safe text cells and
 * a BOM, as Întreabă's exports.
 */

/** The most rows one export carries; the file name says when there were more. */
export const ENTITY_CSV_MAX = 20_000;

// The last column (owner, 26 November 2026): „eroare_probabila” on a contract held out of the totals by the value
// review, so that a sum over the file can leave it out as the site's totals do; empty on every other row.
const HEADER = "data,tip,partener,id_partener,cod_cpv,domeniu_cpv,titlu,valoare_ron,numar_castigatori,valoare_contract_integral,semnale,numar,link_seap,link_site,in_afara_totalurilor";

/** `origin`: the site's address as the request reached it, for the rows' own pages. */
export function entityTxCsv(rows: readonly DaTx[], origin: string): string {
  const lines = rows.map((t) => {
    const site = t.src === "da" ? `/achizitii/${t.sicapDaId}` : t.natId ? `/contracte/${t.natId}` : "";
    const seap = t.src === "da" ? daUrl(t.sicapDaId) : t.caNoticeId ? awardUrl(t.caNoticeId) : "";
    return [
      evidenceCsvText(t.finalizationDate?.slice(0, 10) ?? ""), t.src === "da" ? "achizitie_directa" : "contract",
      evidenceCsvText(t.partnerName), evidenceCsvText(t.partnerId), evidenceCsvText(t.cpvCode), evidenceCsvText(t.cpvName),
      evidenceCsvText(t.title ?? ""), t.closingValueExact ?? (t.closingValue ?? ""), t.nWinners ?? "", t.contractValueFull ?? "",
      evidenceCsvText([...t.daFlags, ...(t.singleBidder ? ["un_ofertant"] : [])].join(" ")), evidenceCsvText(t.daCode?.trim() ?? ""),
      evidenceCsvText(seap), evidenceCsvText(site ? `${origin}${site}` : ""), t.valueHeld ? "eroare_probabila" : "",
    ].join(",");
  });
  return "﻿" + [HEADER, ...lines].join("\r\n") + "\r\n";
}

/** „inregistrari-2146445.csv”, or „inregistrari-2146445-primele-20000-din-31234.csv” when cut. */
export const entityCsvName = (id: string, shown: number, total: number) =>
  total > shown ? `inregistrari-${id}-primele-${shown}-din-${total}.csv` : `inregistrari-${id}.csv`;
