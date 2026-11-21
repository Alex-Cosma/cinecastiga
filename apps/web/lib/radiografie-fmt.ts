/** Pure helpers shared by the radiografie server lib and its client charts (no db import). */
import { tidyName } from "./tidy-name";

/** A firm's name without its legal form, for a chart's label or a tight line; display only, so it reads tidied. */
export function shortName(n: string): string {
  return tidyName(n
    .replace(/ S\.?R\.?L\.?$/i, "")
    .replace(/^S\.?C\.?\s+/i, "")
    .replace(/ S\.R\.L\./g, "")
    .replace(/ S\.A\.$/i, "")
    .replace(/ sp\. z\. o\. o\.?$/i, "")
    .trim());
}

export function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1);
}
