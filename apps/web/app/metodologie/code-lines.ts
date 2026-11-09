/*
 * A TypeScript file as numbered lines of coloured pieces, for the score's code on /metodologie. Only comments,
 * strings, numbers and keywords get a colour; everything else stays plain text. Joining the pieces gives back the
 * file exactly (minus a final newline), so a copy from the page is the code.
 */

export type CodeKind = "comment" | "string" | "number" | "keyword";
export type CodePiece = { text: string; kind: CodeKind | null };

const KEYWORDS = [
  "as", "async", "await", "break", "case", "catch", "const", "default", "else", "export", "false", "for", "from",
  "function", "if", "import", "in", "interface", "keyof", "let", "new", "null", "of", "readonly", "return", "switch",
  "this", "throw", "true", "try", "type", "typeof", "undefined", "while",
];
const TOKEN = new RegExp(
  [
    String.raw`\/\*[\s\S]*?\*\/`, // block comment
    String.raw`\/\/[^\n]*`, // line comment
    String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60`, // template literal (SQL spans lines)
    String.raw`'(?:\\.|[^'\\\n])*'`,
    String.raw`"(?:\\.|[^"\\\n])*"`,
    String.raw`\b\d[\d_]*(?:\.\d+)?\b`,
    String.raw`\b(?:${KEYWORDS.join("|")})\b`,
  ].join("|"),
  "g",
);

function kindOf(token: string): CodeKind {
  if (token.startsWith("//") || token.startsWith("/*")) return "comment";
  if (/^['"`]/.test(token)) return "string";
  if (/^\d/.test(token)) return "number";
  return "keyword";
}

export function codeLines(source: string): CodePiece[][] {
  const text = source.replace(/\n$/, "");
  const pieces: CodePiece[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) pieces.push({ text: text.slice(at, m.index), kind: null });
    pieces.push({ text: m[0], kind: kindOf(m[0]) });
    at = m.index + m[0].length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), kind: null });

  // A comment or a template literal can span lines: each line gets its own part of it, with the same colour.
  const lines: CodePiece[][] = [[]];
  for (const piece of pieces) {
    piece.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, kind: piece.kind });
    });
  }
  return lines;
}
