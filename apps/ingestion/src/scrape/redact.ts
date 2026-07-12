/**
 * PII redaction at the bronze boundary (task DEC-006).
 *
 * SICAP detail payloads carry contact-person data (names, emails, phones)
 * for assigned CA/supplier users. GDPR: re-publication/aggregation is our
 * own processing act — the transparency purpose needs organizations and
 * roles, not private contact details. Denylisted fields are REMOVED (not
 * masked) before the payload is hashed or archived; retention is the harm.
 *
 * The denylist is versioned so the archive can state exactly which rule
 * set produced any given row (endpoint_version encodes the era).
 */

export const REDACTION_VERSION = "r1";

/** Keys removed wherever they appear (deep), case-sensitive exact matches. */
const EXACT_DENYLIST = new Set(["assignedCAUser", "assignedSupplierUser"]);

/** Key patterns removed wherever they appear (deep). */
const PATTERN_DENYLIST = [/^contact(Person|Email|Phone|Fax)?$/i, /^(email|phone|fax|mobile)$/i];

function isDenylisted(key: string): boolean {
  if (EXACT_DENYLIST.has(key)) return true;
  return PATTERN_DENYLIST.some((re) => re.test(key));
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (isDenylisted(key)) continue;
      out[key] = walk(v);
    }
    return out;
  }
  return value;
}

/**
 * Returns a deep copy of the payload with denylisted keys removed.
 * Idempotent. `endpointVersion` reserved for future per-era rule sets —
 * the r1 denylist currently applies to every elicitatie endpoint.
 */
export function redactPayload<T>(payload: T, _endpointVersion: string): unknown {
  return walk(payload);
}
