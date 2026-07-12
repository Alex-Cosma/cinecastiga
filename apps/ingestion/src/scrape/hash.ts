import { createHash } from "node:crypto";

/**
 * Deterministic stringify: object keys recursively sorted, arrays in order.
 * Postgres jsonb discards key order/whitespace, so idempotency requires
 * hashing the payload as it will be stored, not the raw response bytes.
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 hex of the canonical form. Compute on the POST-redaction payload. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}
