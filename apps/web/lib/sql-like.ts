/**
 * Visitor text inside a LIKE pattern (audit S2F1, 5 Nov 2026). `%` and `_` in a typed query were wildcards: "____"
 * matched every name and defeated the trigram index. Escaped, they match themselves. Backslash is PostgreSQL's default
 * LIKE escape, which is the only one `like any/all(array)` can use; a scalar `like` also says `escape '\'`.
 */
export function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/** `%text%`, the text escaped. */
export function likeContains(text: string): string {
  return `%${likeEscape(text)}%`;
}

/** How many letters and digits the text has (a pattern the trigram index can use needs three). */
export function alnumCount(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}
