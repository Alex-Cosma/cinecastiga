import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound mail for auth codes. SMTP config via env (SMTP_HOST/PORT/SECURE/
 * USER/PASS/FROM). When SMTP_HOST is unset, a local server logs the code to
 * its console instead: next dev, or a local production preview whose
 * BETTER_AUTH_URL is loopback (docs/handover/03-development.md). Anywhere else
 * a production server refuses to send and never logs the code (audit S1F4,
 * 5 Nov 2026): a code in the server log is a second factor anyone with the
 * logs can read.
 */
const g = globalThis as unknown as { __seapMailer?: Transporter | null };

function transporter(): Transporter | null {
  if (g.__seapMailer) return g.__seapMailer;
  // Not cached when unset: next dev hot-reloads .env.local, so SMTP can be
  // configured without restarting the server.
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  g.__seapMailer = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return g.__seapMailer;
}

/** Without SMTP, may this server print the code to its console? Only a development or a loopback server. */
export function codesToConsole(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.BETTER_AUTH_URL ?? "").hostname);
  } catch {
    return false;
  }
}

export async function sendAuthCode(to: string, code: string): Promise<void> {
  const t = transporter();
  if (!t) {
    if (!codesToConsole()) {
      console.error("[auth] SMTP_HOST nu este configurat: codul 2FA nu a fost trimis.");
      throw new Error("SMTP_HOST is not configured; the sign-in code was not sent.");
    }
    console.log(`[auth] SMTP neconfigurat — cod 2FA pentru ${to}: ${code}`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: `${code} — codul tău de autentificare cinecâștigă?`,
    text: `Codul tău de autentificare este: ${code}\n\nCodul expiră în câteva minute. Dacă nu ai încercat să te autentifici, ignoră acest mesaj.`,
  });
}
