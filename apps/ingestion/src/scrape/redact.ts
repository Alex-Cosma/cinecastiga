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

// r2: the r1 contact-token pattern was anchored (`^(email|phone|fax|mobile)$`),
// so it only caught keys named EXACTLY "email" etc. and missed compound keys
// like `assignedUserEmail` nested in DA `directAcquisitionItems[]` — a real
// leak found in the archive. r2 matches the token as a substring of the key,
// failing safe toward removal (losing a non-PII field is cheaper than
// retaining a personal email).
export const REDACTION_VERSION = "r2";

/** Keys removed wherever they appear (deep), case-sensitive exact matches. */
const EXACT_DENYLIST = new Set(["assignedCAUser", "assignedSupplierUser"]);

/**
 * Key patterns removed wherever they appear (deep). Contact tokens match as a
 * SUBSTRING of the key name, so `assignedUserEmail`, `contactPhone`,
 * `supplierMobile`, etc. are all caught.
 */
const PATTERN_DENYLIST = [/^contact(person)?$/i, /email/i, /phone/i, /fax/i, /mobile/i];

/**
 * Email addresses also appear inside free-text values (e.g. a DA
 * `directAcquisitionDescription` telling bidders where to send offers). Those
 * fields are legitimate content we must keep, so we scrub the address out of
 * the string rather than dropping the field. Strict form (`local@host.tld`)
 * avoids mangling non-email `@` tokens such as the company name
 * "S.C. ALL@GIS MEHEDINȚI S.R.L." (no dot-TLD after the `@`).
 */
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_PLACEHOLDER = "[email redactat]";

function isDenylisted(key: string): boolean {
  if (EXACT_DENYLIST.has(key)) return true;
  return PATTERN_DENYLIST.some((re) => re.test(key));
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL_IN_TEXT, EMAIL_PLACEHOLDER);
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
