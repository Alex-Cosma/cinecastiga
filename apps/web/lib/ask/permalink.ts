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
      return JSON.parse(Buffer.from(s, "base64").toString("utf8"));
    }
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch {
    return null;
  }
}
