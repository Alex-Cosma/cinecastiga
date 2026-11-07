/*
 * The login page is a door with a sign (owner, 7 November 2026): it says why the reader was sent there, where to ask
 * for access or a forgotten password (there is no e-mail password reset), and returns them to where they came from.
 * Pure helpers, shared by the server page, the client form and their tests.
 */

export const CONTACT_EMAIL = "contact@cinecastiga.ro";

/** The contact address as a mailto link with a ready subject. */
export function contactHref(subject = "Acces la cont"): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * The page to return to after login: only a path on this site. "//host", backslashes, control characters and spaces
 * are refused (a browser reads "/\host" or "//host" as another site).
 */
export function safeReturnPath(next: string | null | undefined): string | null {
  return next?.startsWith("/") && !next.startsWith("//") && !/[\\\u0000- \u007f]/.test(next) ? next : null;
}

export type LoginContext = "invitation" | "private" | null;

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);

/** Why the reader is asked to log in, read from the page they were sent from. */
export function loginContext(next: string | null | undefined): LoginContext {
  const path = safeReturnPath(next);
  if (!path) return null;
  if (path.startsWith("/anchete/invitatie/")) return "invitation";
  if (under(path, "/anchete") || under(path, "/urmariri")) return "private";
  return null;
}

export const LOGIN_CONTEXT_TEXT: Record<Exclude<LoginContext, null>, string> = {
  invitation: "Ai primit o invitație la un dosar privat. Intră cu adresa la care ai primit-o.",
  private: "Anchetele și urmăririle sunt private.",
};

/** The e-mailed code: only its digits, at most six, so a pasted "123 456" or "Cod: 123456" still works. */
export function codeDigits(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 6);
}

/** The minutes an e-mailed code stays valid: `otpOptions.period` in lib/auth.ts (better-auth reads it in minutes). */
export const CODE_VALID_MINUTES = 3;

/** Seconds before another code can be asked for. */
export const RESEND_COOLDOWN_SECONDS = 30;
