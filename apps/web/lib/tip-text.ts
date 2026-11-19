/**
 * An explanation with points (owner, 19 November 2026: a dense paragraph of rules reads better as a short lead and a
 * list). A glossary text stays a plain string; a line break starts a new line of it and a line that begins with „– ”
 * is a point. A text without line breaks is one paragraph, as before.
 */
export interface TipLine { point: boolean; text: string }

export function tipLines(text: string): TipLine[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean)
    .map((line) => line.startsWith("– ") ? { point: true, text: line.slice(2).trim() } : { point: false, text: line });
}
