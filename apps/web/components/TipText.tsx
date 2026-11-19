import { tipLines } from "../lib/tip-text";

/**
 * A glossary text as its explanation shows it (lib/tip-text.ts): one paragraph as it always was, or a lead and its
 * points when the text has lines. Spans only, so it can sit in a floating explanation (a span) and in a list's <dd>.
 */
export default function TipText({ text }: { text: string }) {
  if (!text.includes("\n")) return <>{text}</>;
  return <>{tipLines(text).map((line, i) => <span key={i} className={line.point ? "tip-li" : "tip-p"}>{line.text}</span>)}</>;
}
