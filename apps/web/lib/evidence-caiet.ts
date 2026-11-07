import { formatExactDecimal } from "./format";
import { countWords } from "./ask/answer-text";
import { privateDay, privateMoment, privatePeriod } from "./private-format";
import { clipHref, clipKindLabel, clipSourceUrl, clipTitle, clipValue, type ClipLike } from "./evidence-clip";
import type { WorkspaceEntry, WorkspaceLink } from "./investigation-workspace";

/*
 * caiet.md (owner, 7 November 2026): the dossier as a reader would read it, in one Markdown file of the export —
 * the questions with the evidence linked to them, each piece of evidence with its exact value and links, the
 * timeline (written by people and read from the saved records), and what is still to check. The JSON and CSV files
 * beside it remain the complete record; this file only reads them aloud. Pure, so it is tested without a database.
 */

export interface CaietClip extends ClipLike { captureId: string | null; rowCount: number | null; totalExact: string | null; capturedAt: string | null; version: number | null }
export interface CaietEvent { date: string; title: string; label: string; href: string; valueExact: string | null; unit: string }
export interface CaietInput {
  title: string;
  description: string | null;
  exportedAt: string;
  base: string;
  investigationId: string;
  clips: CaietClip[];
  entries: WorkspaceEntry[];
  links: WorkspaceLink[];
  records: { count: number; totalExact: string | null; unknownValues: number; dateFrom: string | null; dateTo: string | null; savedRows?: number; capped?: boolean };
  sourceEvents: CaietEvent[];
}

const stanceWords = { supports: "susține", contradicts: "contrazice", check: "de verificat" } as const;
const questionStatus = { open: "deschisă", checking: "în verificare", done: "documentată" } as const;
const taskStatus = { open: "de verificat", checking: "în lucru", done: "verificată" } as const;
/** Markdown special characters in text from the sources or from people, escaped. */
const md = (value: unknown) => String(value ?? "").replace(/[\\`*_{}[\]<>#|]/g, "\\$&");
const absolute = (base: string, href: string) => /^https?:\/\//.test(href) ? href : `${base}${href}`;

export function caietMarkdown(c: CaietInput): string {
  const clipById = new Map(c.clips.map((clip) => [clip.id, clip]));
  const questions = c.entries.filter((e) => e.kind === "question"), notes = c.entries.filter((e) => e.kind === "note");
  const tasks = c.entries.filter((e) => e.kind === "task"), events = c.entries.filter((e) => e.kind === "event");
  const questionNumber = new Map(questions.map((q, i) => [q.id, i + 1]));
  const valueText = (clip: CaietClip) => { const v = clipValue(clip); return v ? `${formatExactDecimal(v.exact)} ${v.unit} (${v.label})` : null; };
  const lines: string[] = [`# ${md(c.title)}`, ""];
  if (c.description) lines.push(md(c.description), "");
  lines.push(`Exportat la ${privateMoment(c.exportedAt)} (ora României).`, "",
    "> Valori înregistrate în surse, nu plăți. Semnalele sunt piste de verificare, nu dovezi de nereguli.", "");

  lines.push("## Pe scurt", "");
  const r = c.records;
  if (r.capped) lines.push(`- ${countWords(r.savedRows ?? 0, "înregistrare salvată", "înregistrări salvate")} în dovezi (cu repetările dintre ele); totalul fiecărei dovezi e mai jos.`);
  else lines.push(`- ${countWords(r.count, "înregistrare distinctă", "înregistrări distincte")} în dovezile păstrate${r.totalExact !== null ? `: ${formatExactDecimal(r.totalExact)} lei` : ""}${r.unknownValues ? ` (${countWords(r.unknownValues, "înregistrare fără valoare publicată", "înregistrări fără valoare publicată")})` : ""}. O înregistrare salvată în mai multe dovezi se numără o dată.`);
  const period = privatePeriod(r.dateFrom, r.dateTo);
  if (period) lines.push(`- Perioada înregistrărilor: ${period}.`);
  lines.push(`- ${countWords(questions.length, "întrebare", "întrebări")}, ${countWords(c.clips.length + notes.length, "dovadă", "dovezi")}, ${countWords(tasks.filter((t) => t.status !== "done").length, "verificare deschisă", "verificări deschise")}.`, "");

  lines.push("## Întrebări", "");
  if (!questions.length) lines.push("Nicio întrebare formulată.", "");
  for (const q of questions) {
    lines.push(`### ${questionNumber.get(q.id)}. ${md(q.title)}`, "", `Stare: ${questionStatus[q.status]}.`, "");
    if (q.body) lines.push(md(q.body), "");
    if (q.alternative) lines.push(`O altă explicație posibilă: ${md(q.alternative)}`, "");
    const linked = c.links.filter((l) => l.questionId === q.id);
    if (!linked.length) lines.push("Nicio dovadă legată.", "");
    else {
      lines.push("Dovezi:", "");
      for (const link of linked) {
        const clip = clipById.get(link.clipId);
        const value = clip ? valueText(clip) : null;
        lines.push(`- ${stanceWords[link.stance]}: ${clip ? md(clipTitle(clip)) : "dovadă eliminată"}${value ? ` · ${value}` : ""}${link.note ? ` — ${md(link.note)}` : ""}`);
      }
      lines.push("");
    }
  }

  lines.push("## Dovezi", "");
  if (!c.clips.length && !notes.length) lines.push("Nicio dovadă păstrată.", "");
  for (const clip of c.clips) {
    lines.push(`### ${md(clipTitle(clip))}`, "", `${clipKindLabel[clip.kind] ?? "Dovadă"} · salvată la ${privateDay(clip.createdAt ?? null)}.`, "");
    // A selection's value is its records' total, said on the "Păstrat" line: once.
    const value = clipValue(clip)?.label.startsWith("totalul") ? null : valueText(clip);
    if (value) lines.push(`Valoare: ${value}.`, "");
    if (clip.captureId) lines.push(`Păstrat: ${clip.rowCount === null ? "înregistrări" : countWords(clip.rowCount, "înregistrare", "înregistrări")} · ${clip.totalExact === null ? "total necunoscut" : `${formatExactDecimal(clip.totalExact)} lei`} · versiunea ${clip.version} din ${privateMoment(clip.capturedAt, "moment necunoscut")}. Rândurile: captures/${clip.captureId}/rows.csv.`, "");
    else if (clip.kind !== "note" && clip.kind !== "document_quote") lines.push("Fără versiune completă păstrată: nu este o listă înghețată de surse.", "");
    const href = clipHref(clip), source = clipSourceUrl(clip);
    const links = [href ? `[Pagina](${absolute(c.base, href)})` : null, source ? `[SEAP](${source})` : null,
      clip.captureId ? `[Fișa de probă, privată](${c.base}/anchete/${c.investigationId}/dovezi/${clip.captureId})` : null].filter(Boolean);
    if (links.length) lines.push(links.join(" · "), "");
    if (clip.note) lines.push(`Notă: ${md(clip.note)}`, "");
    const supports = c.links.filter((l) => l.clipId === clip.id);
    if (supports.length) lines.push(`Legată de: ${supports.map((l) => `întrebarea ${questionNumber.get(l.questionId) ?? "?"} (${stanceWords[l.stance]})`).join(", ")}.`, "");
  }
  for (const note of notes) {
    lines.push(`### Notă: ${md(note.title)}`, "");
    if (note.body) lines.push(md(note.body), "");
    if (note.alternative) lines.push(`Explicație alternativă: ${md(note.alternative)}`, "");
  }

  lines.push("## Cronologie", "");
  const timeline = [
    ...events.map((e) => ({ date: e.occurredOn ?? "", text: `${md(e.title)}${e.body ? ` — ${md(e.body)}` : ""} (scris în dosar)` })),
    ...c.sourceEvents.map((e) => ({ date: e.date, text: `${md(e.label)}: [${md(e.title)}](${absolute(c.base, e.href)})${e.valueExact ? ` · ${formatExactDecimal(e.valueExact)} ${e.unit}` : ""} (din surse)` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!timeline.length) lines.push("Niciun eveniment datat.", "");
  for (const item of timeline) lines.push(`- ${item.date ? privateDay(item.date) : "Dată necunoscută"} · ${item.text}`);
  if (timeline.length) lines.push("");

  lines.push("## De verificat", "");
  if (!tasks.length) lines.push("Nicio verificare.", "");
  for (const t of tasks) lines.push(`- [${t.status === "done" ? "x" : " "}] ${md(t.title)} (${taskStatus[t.status]}${t.occurredOn ? `, termen ${privateDay(t.occurredOn)}` : ""})${t.body ? ` — ${md(t.body)}` : ""}`);
  if (tasks.length) lines.push("");
  return lines.join("\n");
}
