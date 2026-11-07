import { formatExactDecimal } from "./format";
import { countWords } from "./ask/answer-text";
import { privateMoment } from "./private-format";

/*
 * "Copiază citarea" (owner, 7 November 2026): one block of plain text a journalist can paste under a quote. It names
 * the saved item, its exact value (a recorded amount, not a payment), the moment and version of the capture, the
 * fingerprint that the export's manifest repeats for rows.csv, and the links: the public page, the SEAP source and
 * the private evidence sheet. Pure, so the dossier card and the sheet build the same text.
 */
export interface CitationInput {
  title: string;
  kind: string;
  value?: { exact: string; label: string; unit: string } | null;
  rowCount: number | null;
  totalExact: string | null;
  capturedAt: string | null;
  version: number;
  fingerprint: string | null;
  publicUrl?: string | null;
  sourceUrl?: string | null;
  sheetUrl: string;
}

export function citationText(c: CitationInput): string {
  const lines = [`„${c.title.trim()}” (${c.kind.toLowerCase()})`];
  // A selection's value is its records' total, said on the next line: once.
  if (c.value && !(c.value.exact === c.totalExact && c.value.label.startsWith("totalul"))) lines.push(`${capitalize(c.value.label)}: ${formatExactDecimal(c.value.exact)} ${c.value.unit} (valoare înregistrată, nu plată).`);
  const total = c.totalExact === null ? "total necunoscut" : `${formatExactDecimal(c.totalExact)} lei`;
  lines.push(`Păstrat: ${c.rowCount === null ? "înregistrări" : countWords(c.rowCount, "înregistrare", "înregistrări")} · ${total} · ${privateMoment(c.capturedAt, "moment necunoscut")} (ora României) · versiunea ${c.version}.`);
  // Said once, under the figures a reader pastes (owner rule: contracted, not paid).
  lines.push("Valori înregistrate în SEAP/SICAP, nu plăți. Prelucrare: cinecâștigă?.");
  if (c.fingerprint) lines.push(`Amprentă SHA-256 (rows.csv din export): ${c.fingerprint}`);
  if (c.publicUrl) lines.push(`Pagina: ${c.publicUrl}`);
  if (c.sourceUrl) lines.push(`Sursa SEAP: ${c.sourceUrl}`);
  lines.push(`Fișa de probă (privată): ${c.sheetUrl}`);
  return lines.join("\n");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
