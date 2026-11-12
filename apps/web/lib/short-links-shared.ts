import { createHash } from "node:crypto";

/*
 * Short links (owner, 9 November 2026): cinecastiga.ro/l/k7Qm2xPa opens a long address of the site, such as a question
 * of „Întreabă” (180–700 characters with its spec in base64). The code is derived from the address, so the same
 * address always gets the same link and copying it again writes nothing. Pure: the API, the /l/ page and the tests
 * share it.
 */

export const SHORT_LINK_PATH = "/l/";
/** 8 characters (owner's pick); a collision with another address takes one more, up to 12. */
export const SHORT_CODE_LENGTH = 8;
export const SHORT_CODE_MAX = 12;
export const SHORT_CODE = /^[0-9A-Za-z]{8,12}$/;
export const SHORT_TARGET_MAX = 4096;

/** The public sections whose addresses may be shortened: never the private space, the admin, the API or a link itself. */
const PUBLIC_SECTIONS = new Set(["", "intreaba", "entitati", "cauta", "domenii", "harta", "semnale", "supra-prag", "contracte", "anunturi", "achizitii", "metodologie"]);
const BASE = "https://cinecastiga.invalid";

/**
 * The address a short link may open, in one spelling: a path of the site (never another host), its query as the browser
 * reads it, without the fragment. Anything else is refused, never repaired.
 */
export function shortLinkTarget(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > SHORT_TARGET_MAX || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let url: URL;
  try { url = new URL(raw, BASE); } catch { return null; }
  if (url.origin !== BASE || !PUBLIC_SECTIONS.has(url.pathname.split("/")[1] ?? "")) return null;
  // The address is judged as it is stored and opened (launch audit, 12 November 2026): `/.//evil.example` passed the
  // tests above and normalized to `//evil.example`, which a browser reads as another host.
  if (url.pathname.startsWith("//")) return null;
  const query = url.searchParams.toString();
  const target = `${url.pathname}${query ? `?${query}` : ""}`;
  return target.length <= SHORT_TARGET_MAX ? target : null;
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** The codes of an address, shortest first: base62 of its SHA-256, each one the previous with one more character. */
export function shortLinkCodes(target: string): string[] {
  let n = BigInt(`0x${createHash("sha256").update(target).digest("hex")}`);
  let digits = "";
  for (let i = 0; i < SHORT_CODE_MAX; i++) { digits += ALPHABET[Number(n % 62n)]; n /= 62n; }
  return Array.from({ length: SHORT_CODE_MAX - SHORT_CODE_LENGTH + 1 }, (_, i) => digits.slice(0, SHORT_CODE_LENGTH + i));
}
