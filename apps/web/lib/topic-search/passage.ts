/*
 * The passage a document result shows on /cauta, the words marked in it and its pages (owner, 17 November 2026,
 * „varianta A”: a result of `/cauta?q=Cluj` was over 1,000 px tall, opened with the scanner's misread stamp and with
 * our own conversion heading, marked „cluj” inside „www.ubbcluj.ro” and listed 14 page buttons for one file). Pure.
 */
import { fold } from './shared';
import { titleTerms } from './words';

/**
 * Where the searched words stand in `text`, as [start, end) pairs in order, overlaps joined. The search matches whole
 * words (a 'simple' text query: words.ts `titleTsquery`), so a word is marked only where a word starts, never inside
 * another („cluj” is not marked in „ubbcluj”); a longer word is marked to its end, as its forms are searched.
 */
export function markRanges(text: string, query: string): [number, number][] {
  const normal = fold(text), ranges: [number, number][] = [];
  // folding keeps the length of composed text; text that folds to another length is left unmarked rather than mis-marked
  if (normal.length !== text.length) return [];
  const letter = (i: number) => i >= 0 && i < normal.length && /[a-z0-9]/.test(normal[i]!);
  for (const { word, prefix } of titleTerms(query).flat()) {
    for (let at = normal.indexOf(word); at >= 0; at = normal.indexOf(word, at + 1)) {
      if (letter(at - 1)) continue;
      let end = at + word.length;
      if (prefix) while (letter(end)) end++;
      else if (letter(end)) continue;
      ranges.push([at, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * What our own conversion writes on the reading copy of a Word or Excel file (scripts/documents/convert.py): the
 * heading of every page and the name of the part of the file. Not the document's words.
 */
const CONVERSION = /Text rearanjat pentru lectură · verifică formatarea în original|\[(?:word|xl)\/[^\]\s]*\]/g;

/**
 * A page's text as a short passage around the first searched word: one flowing paragraph (the line breaks of a scan
 * are not the document's), cut at whole words, without the conversion's own lines.
 */
export function passage(text: string, query: string, max = 240): string {
  const flat = text.normalize('NFC').replace(CONVERSION, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const [at, to] = markRanges(flat, query)[0] ?? [0, 0];
  let start = Math.max(0, at - Math.round(max / 3));
  if (start > 0) { const space = flat.indexOf(' ', start); start = space >= 0 && space < at ? space + 1 : at; }
  let end = Math.min(flat.length, start + max);
  if (end < flat.length) { const space = flat.lastIndexOf(' ', end); if (space >= to && space > start) end = space; }
  return `${start > 0 ? '… ' : ''}${flat.slice(start, end)}${end < flat.length ? ' …' : ''}`;
}

/** Pages in order as runs of consecutive pages: 85, 86, …, 98 → [85, 98]; a page alone → [1, 1]. */
export function pageRuns(pages: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const p of [...new Set(pages)].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  return runs;
}

/** What the text was read from, by the file's name: a Word or Excel file is read through our reading copy, not as a PDF. */
export function textSource(filename: string, method: string): string {
  if (method === 'ocr') return 'Text OCR';
  if (/\.(?:docx?|rtf|odt)(?:\.|$)/i.test(filename)) return 'Text extras din Word';
  if (/\.(?:xlsx?|ods)(?:\.|$)/i.test(filename)) return 'Text extras din Excel';
  return 'Text extras din PDF';
}
