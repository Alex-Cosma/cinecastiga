import { formatExactDecimal } from "./format";
import { countWords } from "./ask/answer-text";
import { privateMoment } from "./private-format";

/*
 * "Copiază citarea" (owner, 7 November 2026): one block of plain text a journalist can paste under a quote. It names
 * the saved item, its exact value (a recorded amount, not a payment), the moment and version of the capture, the
 * fingerprint that the export's manifest repeats for rows.csv, and the links. Since the UX audit (Z8-41) the public
 * links come right under the title, so a reader of the article can open something: the record's page and its SEAP
 * source, or a question's answer on the site, said to show today's data rather than the kept version; the private
 * sheet comes last, marked as private. Pure, so the dossier card and the sheet build the same text.
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
  /** The public link is a question's answer on the site (today's data), not a record's page. */
  publicIsAnswer?: boolean;
  sourceUrl?: string | null;
  sheetUrl: string;
}

export function citationText(c: CitationInput): string {
  const lines = [`„${c.title.trim()}” (${c.kind.toLowerCase()})`];
  if (c.publicUrl) lines.push(c.publicIsAnswer ? `Răspunsul pe site (datele de azi, nu versiunea păstrată): ${c.publicUrl}` : `Pagina: ${c.publicUrl}`);
  if (c.sourceUrl) lines.push(`Sursa SEAP: ${c.sourceUrl}`);
  // A selection's value is its records' total, said on the next line: once.
  if (c.value && !(c.value.exact === c.totalExact && c.value.label.startsWith("totalul"))) lines.push(`${capitalize(c.value.label)}: ${formatExactDecimal(c.value.exact)} ${c.value.unit} (valoare înregistrată, nu plată).`);
  const total = c.totalExact === null ? "total necunoscut" : `${formatExactDecimal(c.totalExact)} lei`;
  lines.push(`Păstrat: ${c.rowCount === null ? "înregistrări" : countWords(c.rowCount, "înregistrare", "înregistrări")} · ${total} · ${privateMoment(c.capturedAt, "moment necunoscut")} (ora României) · versiunea ${c.version}.`);
  // Said once, under the figures a reader pastes (owner rule: contracted, not paid).
  lines.push("Valori înregistrate în SEAP/SICAP, nu plăți. Prelucrare: cinecâștigă?.");
  if (c.fingerprint) lines.push(`Amprentă SHA-256 (rows.csv din export): ${c.fingerprint}`);
  lines.push(`Fișa de probă (privată, doar pentru tine și colaboratori): ${c.sheetUrl}`);
  return lines.join("\n");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
