/**
 * Spec permalinks: base64(UTF-8 JSON) in the `spec` query param. Works in both
 * runtimes so server components (e.g. entity-page dig-down links) can build
 * the same URLs the client panel produces. `&drill=1` auto-opens the rows.
 */
export function encodeSpec(spec: unknown): string {
  const json = JSON.stringify(spec);
  if (typeof window === "undefined") return Buffer.from(json, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSpec(s: string): unknown | null {
  try {
    if (typeof window === "undefined") {
      // As strict as the browser's atob + decodeURIComponent below: the server's reading of a link (link-hint.ts,
      // /urmariri/noua) must agree with the panel's, so no base64url or stray characters, and no invalid UTF-8.
      const b64 = s.replace(/[\t\n\f\r ]/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) return null;
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(b64, "base64")));
    }
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch {
    return null;
  }
}
