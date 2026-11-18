import { createCipheriv, createDecipheriv, createHmac, hkdfSync } from "node:crypto";
import { canonicalPersonKey } from "@seap/db";

/*
 * The ONRC person key is "folded name|birth date|birth locality" (reference.company_reps.person_key). It identifies
 * a person inside the database and must not leave the server: a link, a search suggestion or an API answer would
 * carry a full birth date (legal audit, 18 November 2026).
 *
 * What leaves the server is a token: the key encrypted with a server secret. The same key always gives the same
 * token, so links, saved questions and comparisons between two specs keep working. `sealPersonKey` is applied where
 * a key is read from SQL for a reader; `openPersonKey` where a value from a reader goes into SQL. Everything between
 * the two carries the token.
 *
 * A plain key (a link or a clip saved before this change) is still accepted by `openPersonKey`.
 *
 * Server only: never import this file from a client component.
 */

const PREFIX = "p1.";
const TOKEN = /^p1\.[A-Za-z0-9_-]{38,}$/;
const IV_BYTES = 12, TAG_BYTES = 16;
// Tests and local tools without any secret; a production process must have one.
const UNSET_SECRET = "cinecastiga person key, no secret configured";

interface Keys { enc: Buffer; mac: Buffer }
const derived = new Map<string, Keys>();

function keysOf(secret: string): Keys {
  let keys = derived.get(secret);
  if (!keys) {
    const derive = (info: string) => Buffer.from(hkdfSync("sha256", secret, "", info, 32));
    derived.set(secret, (keys = { enc: derive("person key v1 enc"), mac: derive("person key v1 mac") }));
  }
  return keys;
}

/**
 * The secrets, the one that seals first. PERSON_KEY_SECRET when set, otherwise the site's BETTER_AUTH_SECRET; the
 * others only open (a token made before PERSON_KEY_SECRET was set, or before a rotation, listed comma-separated in
 * PERSON_KEY_SECRET_PREVIOUS).
 */
function secrets(): string[] {
  if (process.env.NODE_ENV === "test") return [UNSET_SECRET];
  const own = process.env.PERSON_KEY_SECRET?.trim();
  const site = process.env.BETTER_AUTH_SECRET?.trim();
  const previous = (process.env.PERSON_KEY_SECRET_PREVIOUS ?? "").split(",").map((s) => s.trim());
  const all = [own, site, ...previous].filter((s): s is string => Boolean(s));
  if (all.length === 0) {
    if (process.env.NODE_ENV === "production") throw new Error("PERSON_KEY_SECRET or BETTER_AUTH_SECRET is required to link ONRC persons.");
    return [UNSET_SECRET];
  }
  return [...new Set(all)];
}

export function isPersonToken(value: string): boolean {
  return TOKEN.test(value);
}

/** The token of a person key read from the database. A value that is already a token stays as it is. */
export function sealPersonKey(key: string): string {
  if (isPersonToken(key)) return key;
  const { enc, mac } = keysOf(secrets()[0]!);
  const plain = Buffer.from(key, "utf8");
  // The nonce comes from the key itself, so one key has one token.
  const iv = createHmac("sha256", mac).update(plain).digest().subarray(0, IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", enc, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

export function sealPersonKeyOrNull(key: string | null | undefined): string | null {
  return key ? sealPersonKey(key) : null;
}

/**
 * The database key behind a value that came from a reader: a token, or a plain key from before the tokens. A token
 * that no secret opens gives the empty string, which matches no person.
 */
export function openPersonKey(value: string): string {
  if (!isPersonToken(value)) return canonicalPersonKey(value);
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) return "";
  const iv = raw.subarray(0, IV_BYTES), tag = raw.subarray(raw.length - TAG_BYTES), body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  for (const secret of secrets()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", keysOf(secret).enc, iv);
      decipher.setAuthTag(tag);
      return canonicalPersonKey(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
    } catch { /* another secret, or not ours */ }
  }
  return "";
}
